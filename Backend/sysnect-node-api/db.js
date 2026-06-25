// ============================================================
// db.js — เลเยอร์เชื่อมต่อ PostgreSQL สำหรับ Delta Sync
// ============================================================
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Railway inject DATABASE_URL → ใช้นั้น, fallback เป็น individual vars สำหรับ local Docker
const poolConfig = process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },  // Railway Postgres ต้องการ SSL
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 8000,
    }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        user: process.env.DB_USER || 'sysnect',
        password: process.env.DB_PASSWORD || 'sysnect_secret',
        database: process.env.DB_NAME || 'ticket_database',
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 8000,
    };

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
    console.error('[DB] ⚠️ Pool error (idle client):', err.message);
});

let schemaReady = false;

// ============================================================
// initSchema — สร้างตารางถ้ายังไม่มี (รันตอนบูต)
// ============================================================
async function initSchema() {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf-8');
    await pool.query(sql);
    schemaReady = true;
    console.log('[DB] ✅ Schema พร้อมใช้งาน (tickets + sync_state)');
}

// ============================================================
// ping — เช็คว่าต่อ DB ได้ไหม
// ============================================================
async function ping() {
    try {
        await pool.query('SELECT 1');
        return true;
    } catch (e) {
        return false;
    }
}

// ============================================================
// getSyncState / setSyncState — cursor ของ Delta Sync
// ============================================================
async function getSyncState() {
    const { rows } = await pool.query(
        'SELECT last_sync, last_run_at, last_source, last_count, last_error FROM sync_state WHERE id = 1'
    );
    return rows[0] || null;
}

async function setSyncState({ last_sync, last_source, last_count, last_error }) {
    // อัปเดตเฉพาะ field ที่ส่งมา (COALESCE เก็บค่าเดิมถ้าเป็น undefined)
    await pool.query(
        `UPDATE sync_state
            SET last_sync   = COALESCE($1, last_sync),
                last_run_at = now(),
                last_source = COALESCE($2, last_source),
                last_count  = COALESCE($3, last_count),
                last_error  = $4
          WHERE id = 1`,
        [
            last_sync || null,
            last_source || null,
            (typeof last_count === 'number') ? last_count : null,
            last_error || null,
        ]
    );
}

// ============================================================
// upsertTickets — เขียนตั๋วลง DB แบบ UPSERT (ON CONFLICT DO UPDATE)
// rows = array ของ canonical ticket (ดู normalizeTicket ใน sync.js)
// คืนค่า: จำนวนแถวที่เขียน
// ============================================================
async function upsertTickets(rows) {
    if (!rows || rows.length === 0) return 0;

    const client = await pool.connect();
    let written = 0;
    try {
        await client.query('BEGIN');

        const COLS = 16;          // จำนวนคอลัมน์ต่อ 1 ticket
        const BATCH = 200;        // upsert ทีละ 200 แถว กันคำสั่งยาวเกิน

        for (let i = 0; i < rows.length; i += BATCH) {
            const slice = rows.slice(i, i + BATCH);
            const values = [];
            const placeholders = slice.map((t, idx) => {
                const b = idx * COLS;
                values.push(
                    t.uid, t.glpi_id, t.ticket_number, t.title,
                    t.status, t.status_id, t.priority, t.priority_id,
                    t.project, t.detail, t.location, t.category,
                    t.date_open, t.date_close, t.date_mod,
                    t.raw ? JSON.stringify(t.raw) : null
                );
                const ph = [];
                for (let c = 1; c <= COLS; c++) ph.push(`$${b + c}`);
                return `(${ph.join(',')})`;
            });

            const sql = `
                INSERT INTO tickets
                    (uid, glpi_id, ticket_number, title,
                     status, status_id, priority, priority_id,
                     project, detail, location, category,
                     date_open, date_close, date_mod, raw)
                VALUES ${placeholders.join(',')}
                ON CONFLICT (uid) DO UPDATE SET
                    glpi_id       = EXCLUDED.glpi_id,
                    ticket_number = EXCLUDED.ticket_number,
                    title         = EXCLUDED.title,
                    status        = EXCLUDED.status,
                    status_id     = EXCLUDED.status_id,
                    priority      = EXCLUDED.priority,
                    priority_id   = EXCLUDED.priority_id,
                    project       = EXCLUDED.project,
                    detail        = EXCLUDED.detail,
                    location      = EXCLUDED.location,
                    category      = EXCLUDED.category,
                    date_open     = EXCLUDED.date_open,
                    date_close    = EXCLUDED.date_close,
                    date_mod      = EXCLUDED.date_mod,
                    raw           = EXCLUDED.raw,
                    synced_at     = now()
            `;
            const res = await client.query(sql, values);
            written += res.rowCount || slice.length;
        }

        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
    return written;
}

// ============================================================
// getGroupedTickets — อ่านตั๋วทั้งหมดจาก DB แล้วจัดกลุ่มตามสถานะ
// คืนรูปแบบที่หน้าเว็บ (app.js) ต้องการ: { new:[], assigned:[], ... }
// ============================================================
const STATUS_KEYS = ['new', 'assigned', 'pending', 'solved', 'closed'];

async function getGroupedTickets() {
    const { rows } = await pool.query(
        `SELECT uid, glpi_id, ticket_number, title, status, priority, project,
                detail, location, category, date_open, date_close, date_mod
           FROM tickets
          ORDER BY date_open DESC NULLS LAST`
    );

    const grouped = { new: [], assigned: [], pending: [], solved: [], closed: [] };

    for (const r of rows) {
        const statusKey = STATUS_KEYS.includes(r.status) ? r.status : 'new';
        const toIso = (d) => (d ? new Date(d).toISOString() : '-');
        grouped[statusKey].push({
            id: r.title || (r.ticket_number || String(r.glpi_id || r.uid)),
            name: r.title || '-',
            project: r.project || '-',
            detail: r.detail || '-',
            location: r.location || '-',
            date: r.date_open ? new Date(r.date_open).toISOString() : '-',
            date_open: r.date_open ? toIso(r.date_open) : '-',
            date_close: r.date_close ? toIso(r.date_close) : '-',
            priority: r.priority || 'ปานกลาง',
            category: r.category || '-',
            ticket_number: r.glpi_id ? String(r.glpi_id) : (r.ticket_number || ''),
        });
    }

    return grouped;
}

// ============================================================
// getCounts — นับจำนวนตั๋วทั้งหมดในแต่ละสถานะ (สำหรับ health)
// ============================================================
async function getCounts() {
    const { rows } = await pool.query(
        `SELECT status, COUNT(*)::int AS c FROM tickets GROUP BY status`
    );
    const counts = { new: 0, assigned: 0, pending: 0, solved: 0, closed: 0, total: 0 };
    for (const r of rows) {
        if (counts[r.status] !== undefined) counts[r.status] = r.c;
        counts.total += r.c;
    }
    return counts;
}

module.exports = {
    pool,
    initSchema,
    ping,
    getSyncState,
    setSyncState,
    upsertTickets,
    getGroupedTickets,
    getCounts,
    isSchemaReady: () => schemaReady,
};
