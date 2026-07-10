// ============================================================
// sync.js — ตัวควบคุม Incremental Sync (Delta) ลง PostgreSQL
//   ลำดับ: n8n → UPSERT → อัปเดตสถานะ sync
//   + ตั้งเวลา sync อัตโนมัติทุก SYNC_INTERVAL_MS
// ============================================================
const https = require('https');
const http = require('http');
const db = require('./db');
const {
    STATUS_KEYS, normalizeStatusKey, priorityFromId,
    toNumericId, parseGlpiDate, cleanHtml,
} = require('./util');

// ---------- CONFIG ----------
const N8N_WEBHOOK = process.env.N8N_WEBHOOK || '';
const N8N_TIMEOUT = parseInt(process.env.N8N_TIMEOUT || '45000', 10);
const SYNC_INTERVAL_MS = parseInt(process.env.SYNC_INTERVAL_MS || '300000', 10); // 5 นาที

let running = false;          // กันรัน sync ซ้อนกัน
let timer = null;
let lastResult = null;        // เก็บผลรอบล่าสุดไว้โชว์ใน /api/health

// ============================================================
// HTTP GET (รองรับทั้ง http/https) — ใช้ดึง n8n webhook
// ============================================================
function httpGet(url, timeoutMs) {
    return new Promise((resolve, reject) => {
        const lib = url.startsWith('https') ? https : http;
        const req = lib.get(url, {
            headers: { 'User-Agent': 'Sysnect-Sync/1.0', 'Accept': 'application/json' },
        }, (res) => {
            let data = '';
            res.on('data', (c) => data += c);
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    return reject(new Error(`n8n returned status ${res.statusCode}`));
                }
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(new Error('n8n ส่งข้อมูลไม่ใช่ JSON')); }
            });
        });
        req.on('error', reject);
        req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error(`n8n timeout after ${timeoutMs}ms`)); });
    });
}

// ============================================================
// แกะ wrapper ของ n8n ให้เหลือ grouped object { new:[], ... }
// ============================================================
function unwrapN8n(data) {
    if (Array.isArray(data) && data.length > 0) {
        if (data[0] && data[0].json) data = data[0].json;
        else if (data[0] && data[0].new) data = data[0];
    }
    if (!data || typeof data !== 'object' || !Array.isArray(data['new'])) {
        throw new Error('n8n ส่งข้อมูลมาผิดรูปแบบ (ไม่มี key "new")');
    }
    return data;
}

// ============================================================
// แปลง ticket จาก n8n (named หรือ numbered keys) → canonical row
// ============================================================
function normalizeN8nTicket(t, statusKey) {
    const numericId = toNumericId(
        t.ticket_number, t.glpi_id, t.id, t['2'], t['1'], t.title
    );
    const idRaw = t.id || t.title || t.name || numericId;
    const uid = numericId || `n8n:${String(idRaw).slice(0, 60)}`;

    const status = normalizeStatusKey(t.status || statusKey, statusKey);

    // priority: n8n มักส่งเป็นข้อความไทยอยู่แล้ว; ถ้าเป็นเลขให้แปลง
    let priority = t.priority != null ? String(t.priority) : 'ปานกลาง';
    let priorityId = null;
    if (/^[1-6]$/.test(priority.trim())) {
        priorityId = parseInt(priority.trim(), 10);
        priority = priorityFromId(priorityId);
    }

    const dateOpen = parseGlpiDate(t.date_open || t.date || t.date_creation || t['15']);
    const dateClose = parseGlpiDate(t.date_close || t.closedate || t['16']);
    const dateMod = parseGlpiDate(t.date_mod || t['19']) || dateOpen;

    let detail = t.detail || t.description || t['21'] || '-';
    if (/[<&]/.test(detail)) detail = cleanHtml(detail) || '-';

    return {
        uid,
        glpi_id: numericId ? parseInt(numericId, 10) : null,
        ticket_number: numericId || (t.ticket_number ? String(t.ticket_number) : null),
        title: t.name || t.title || (t.id != null ? String(t.id) : '-'),
        status,
        status_id: null,
        priority,
        priority_id: priorityId,
        project: t.project || t.project_name || '-',
        detail,
        location: t.location || t.location_name || '-',
        category: t.category || '-',
        date_open: dateOpen,
        date_close: dateClose,
        date_mod: dateMod,
        raw: t,
    };
}

// แปลง grouped object ทั้งก้อน → array ของ canonical row (กรองซ้ำด้วย uid)
function normalizeN8nPayload(grouped) {
    const seen = new Set();
    const rows = [];
    for (const key of STATUS_KEYS) {
        const arr = Array.isArray(grouped[key]) ? grouped[key] : [];
        for (const t of arr) {
            const row = normalizeN8nTicket(t, key);
            if (seen.has(row.uid)) continue;
            seen.add(row.uid);
            rows.push(row);
        }
    }
    return rows;
}

// ============================================================
// ช่องทางที่ 1: sync ผ่าน n8n
// ============================================================
async function syncViaN8n() {
    if (!N8N_WEBHOOK) {
        throw new Error('ยังไม่ได้ตั้งค่า N8N_WEBHOOK');
    }
    const query = 'source=autoRefresh&months=4';
    const url = N8N_WEBHOOK.includes('?') ? `${N8N_WEBHOOK}&${query}` : `${N8N_WEBHOOK}?${query}`;
    const raw = await httpGet(url, N8N_TIMEOUT);
    const grouped = unwrapN8n(raw);
    const rows = normalizeN8nPayload(grouped);
    const result = await db.replaceTicketsSnapshot(rows);
    return { source: 'n8n', count: result.written, fetched: rows.length, pruned: result.pruned, cursor: null };
}

// ============================================================
// runSync — รัน 1 รอบ (จัดการเลือกช่องทาง + อัปเดต cursor)
// ============================================================
async function runSync(trigger = 'interval') {
    if (running) {
        console.log(`[SYNC] ⏭️ ข้ามรอบนี้ (รอบก่อนยังทำงานอยู่) trigger=${trigger}`);
        return { skipped: true };
    }
    running = true;
    const startedAt = new Date();
    console.log(`\n[SYNC] 🔄 เริ่ม sync (trigger=${trigger}) ${startedAt.toISOString()}`);

    try {
        const result = await syncViaN8n();

        // n8n เป็นแหล่ง sync เดียว ส่วน PostgreSQL เป็นฐานข้อมูลสำรองสำหรับอ่านตอน n8n ล่ม
        await db.setSyncState({
            last_sync: null,
            last_source: result.source,
            last_count: result.count,
            last_error: null,
        });

        const elapsed = Date.now() - startedAt.getTime();
        lastResult = {
            ok: true, source: result.source, written: result.count,
            fetched: result.fetched, pruned: result.pruned || 0,
            elapsed_ms: elapsed, at: new Date().toISOString(), trigger,
        };
        console.log(`[SYNC] ✅ สำเร็จ [${result.source}] mirror ${result.count}/${result.fetched} ตั๋ว, prune ${result.pruned || 0} (${elapsed}ms)`);
        return lastResult;

    } catch (err) {
        console.error(`[SYNC] ❌ ล้มเหลวทุกช่องทาง: ${err.message}`);
        try { await db.setSyncState({ last_error: err.message, last_count: 0 }); } catch (e) { /* ignore */ }
        lastResult = { ok: false, error: err.message, at: new Date().toISOString(), trigger };
        return lastResult;
    } finally {
        running = false;
    }
}

// ============================================================
// startScheduler — ตั้งเวลา sync อัตโนมัติ
// ============================================================
function startScheduler() {
    if (timer) return;
    console.log(`[SYNC] ⏱️ ตั้งเวลา sync อัตโนมัติทุก ${Math.round(SYNC_INTERVAL_MS / 1000)} วินาที`);
    timer = setInterval(() => { runSync('interval'); }, SYNC_INTERVAL_MS);
}

// ============================================================
// upsertFromN8nGrouped — เขียน grouped data ที่ "ดึงจาก n8n มาแล้ว" ลง PostgreSQL
//   ใช้โดย /api/tickets ตอนเสิร์ฟ n8n ให้เว็บ (จะได้ไม่ต้องดึง n8n ซ้ำ)
//   เรียกแบบ fire-and-forget ได้ — ไม่ throw ออกไปบล็อกการตอบเว็บ
// ============================================================
async function upsertFromN8nGrouped(grouped) {
    const rows = normalizeN8nPayload(grouped);
    const result = await db.replaceTicketsSnapshot(rows);
    await db.setSyncState({
        last_source: 'n8n',
        last_count: result.written,
        last_error: null,
    });
    lastResult = {
        ok: true, source: 'n8n', written: result.written, fetched: rows.length, pruned: result.pruned || 0,
        at: new Date().toISOString(), trigger: 'web',
    };
    return { written: result.written, fetched: rows.length, pruned: result.pruned || 0 };
}

function getLastResult() { return lastResult; }
function isRunning() { return running; }

module.exports = { runSync, startScheduler, getLastResult, isRunning, upsertFromN8nGrouped, SYNC_INTERVAL_MS };
