// ============================================================
// glpi.js — ดึงข้อมูลตรงจาก GLPI REST API แบบ Delta (date_mod)
// ใช้เป็น "ช่องทางสำรอง" เมื่อ n8n ใช้งานไม่ได้
// ============================================================
const https = require('https');
const {
    statusFromId, priorityFromId, toNumericId, parseGlpiDate, cleanHtml,
} = require('./util');

// ---------- CONFIG (อ่านจาก ENV ได้, มี default ตามระบบจริง) ----------
const GLPI_BASE_URL = process.env.GLPI_BASE_URL || 'https://itservicedesk.sysnect.co.th/apirest.php';
const GLPI_AUTH = process.env.GLPI_AUTH
    || Buffer.from(`${process.env.GLPI_USER || 'admin_sysnect'}:${process.env.GLPI_PASS || '!P@ssw0rd##'}`).toString('base64');
// App-Token ดึงมาจาก n8n workflow (จำเป็นถ้า GLPI เปิดใช้ App-Token)
const GLPI_APP_TOKEN = process.env.GLPI_APP_TOKEN || 'Cxhq0afuuU5qsChRdAqpZHWOEQowqXYr6Cz8nl81';
const GLPI_TIMEOUT = parseInt(process.env.GLPI_TIMEOUT || '30000', 10);
const PAGE_SIZE = parseInt(process.env.GLPI_PAGE_SIZE || '1000', 10);

// GLPI Ticket search field IDs
const F = {
    name: 1, id: 2, priority: 3, requester: 5, category: 7,
    status: 12, date_creation: 15, closedate: 16, date_mod: 19,
    content: 21, entity: 80, project_link: 83,
};

// ---------- HTTPS helper พร้อม timeout ----------
function httpsRequest(url, options = {}, timeoutMs = GLPI_TIMEOUT) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const req = https.request({
            hostname: u.hostname,
            port: 443,
            path: u.pathname + u.search,
            method: options.method || 'GET',
            headers: {
                'User-Agent': 'Sysnect-Dashboard/2.0',
                'Accept': 'application/json',
                ...(options.headers || {}),
            },
        }, (res) => {
            let data = '';
            res.on('data', (c) => data += c);
            res.on('end', () => {
                let parsed = data;
                try { parsed = JSON.parse(data); } catch (e) { /* keep raw */ }
                resolve({ status: res.statusCode, headers: res.headers, data: parsed });
            });
        });
        req.on('error', reject);
        req.setTimeout(timeoutMs, () => {
            req.destroy();
            reject(new Error(`GLPI request timeout after ${timeoutMs}ms`));
        });
        if (options.body) req.write(JSON.stringify(options.body));
        req.end();
    });
}

function glpiDateString(date) {
    // → "YYYY-MM-DD HH:mm:ss" (เวลาท้องถิ่นของเซิร์ฟเวอร์)
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
         + `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// ---------- login / logout ----------
async function login() {
    const res = await httpsRequest(`${GLPI_BASE_URL}/initSession`, {
        headers: {
            'Authorization': `Basic ${GLPI_AUTH}`,
            'App-Token': GLPI_APP_TOKEN,
            'Content-Type': 'application/json',
        },
    });
    if (!res.data || !res.data.session_token) {
        throw new Error('GLPI initSession ล้มเหลว: ไม่ได้รับ session_token');
    }
    return res.data.session_token;
}

async function logout(sessionToken) {
    try {
        await httpsRequest(`${GLPI_BASE_URL}/killSession`, {
            headers: { 'Session-Token': sessionToken, 'App-Token': GLPI_APP_TOKEN },
        }, 5000);
    } catch (e) { /* ไม่สำคัญ */ }
}

// ---------- ดึงรายชื่อโครงการ → map { id: name } ----------
async function fetchProjectMap(headers) {
    const map = {};
    try {
        const res = await httpsRequest(`${GLPI_BASE_URL}/Project?range=0-10000`, { headers });
        if (Array.isArray(res.data)) {
            res.data.forEach((p) => { if (p && p.id != null) map[String(p.id)] = p.name || 'ไม่ระบุ'; });
        }
    } catch (e) {
        console.warn('[GLPI] ⚠️ ดึง Project map ล้มเหลว:', e.message);
    }
    return map;
}

// ---------- แปลง raw ticket (numbered keys) → canonical row ----------
function toCanonical(t, projectMap) {
    const numericId = toNumericId(t[F.id], t[F.name]);
    const uid = numericId || `glpi:${t[F.name] || JSON.stringify(t).slice(0, 40)}`;

    // หาชื่อโครงการ: project_link (83) → category (7) → projectMap → ค่าดิบ
    const f83 = t[F.project_link] != null ? String(t[F.project_link]).trim() : '';
    const f7 = t[F.category] != null ? String(t[F.category]).trim() : '';
    let project = '-';
    if (projectMap[f83]) project = projectMap[f83];
    else if (projectMap[f7]) project = projectMap[f7];
    else if (f83 && f83 !== 'null' && f83 !== 'undefined') project = f83;
    else if (f7 && f7 !== 'null' && f7 !== 'undefined') project = f7;

    const statusId = parseInt(t[F.status], 10) || 1;
    const priorityId = parseInt(t[F.priority], 10) || 3;

    return {
        uid,
        glpi_id: numericId ? parseInt(numericId, 10) : null,
        ticket_number: numericId || null,
        title: t[F.name] != null ? String(t[F.name]) : (numericId ? `Ticket #${numericId}` : '-'),
        status: statusFromId(statusId),
        status_id: statusId,
        priority: priorityFromId(priorityId),
        priority_id: priorityId,
        project,
        detail: cleanHtml(t[F.content]) || '-',
        location: t[F.entity] != null ? String(t[F.entity]) : '-',
        category: f7 || '-',
        date_open: parseGlpiDate(t[F.date_creation]),
        date_close: parseGlpiDate(t[F.closedate]),
        date_mod: parseGlpiDate(t[F.date_mod]) || parseGlpiDate(t[F.date_creation]),
        raw: t,
    };
}

// ============================================================
// fetchDelta(since) — ดึงเฉพาะตั๋วที่ date_mod > since (Delta)
//   since = Date | null  (null = backfill ครบทุกตัวที่หาได้)
// คืน { source, rows, maxDateMod }
// ============================================================
async function fetchDelta(since) {
    const sessionToken = await login();
    const headers = {
        'Session-Token': sessionToken,
        'App-Token': GLPI_APP_TOKEN,
        'Content-Type': 'application/json',
    };

    try {
        const projectMap = await fetchProjectMap(headers);

        const baseCriteria = since
            ? {
                'criteria[0][field]': String(F.date_mod),   // 19 = date_mod → จับทั้งตั๋วใหม่และที่แก้ไข
                'criteria[0][searchtype]': 'morethan',
                'criteria[0][value]': glpiDateString(since),
              }
            : {};

        const forced = {};
        [F.name, F.id, F.priority, F.category, F.status, F.date_creation,
         F.closedate, F.date_mod, F.content, F.entity, F.project_link]
            .forEach((f, i) => { forced[`forcedisplay[${i}]`] = String(f); });

        const rows = [];
        let start = 0;
        let maxDateMod = since ? since.toISOString() : null;

        // วนดึงทีละหน้า จนกว่าจะครบ
        // (ปกติ Delta จะมีไม่กี่ตัว แต่รองรับ backfill 120 วันด้วย)
        // จำกัดไม่เกิน 50 หน้า กันลูปไม่รู้จบ
        for (let page = 0; page < 50; page++) {
            const params = new URLSearchParams({
                ...baseCriteria,
                ...forced,
                'range': `${start}-${start + PAGE_SIZE - 1}`,
                'sort': String(F.date_mod),
                'order': 'DESC',
            });

            const res = await httpsRequest(
                `${GLPI_BASE_URL}/search/Ticket?${params.toString()}`,
                { headers },
            );

            const body = res.data || {};
            const items = Array.isArray(body.data) ? body.data : [];
            if (items.length === 0) break;

            for (const t of items) {
                const row = toCanonical(t, projectMap);
                rows.push(row);
                if (row.date_mod && (!maxDateMod || row.date_mod > maxDateMod)) {
                    maxDateMod = row.date_mod;
                }
            }

            const total = parseInt(body.totalcount, 10) || items.length;
            start += items.length;
            if (start >= total || items.length < PAGE_SIZE) break;
        }

        console.log(`[GLPI] ✅ Delta fetch: ${rows.length} ticket (since=${since ? since.toISOString() : 'ALL'})`);
        return { source: 'glpi_direct', rows, maxDateMod };
    } finally {
        await logout(sessionToken);
    }
}

module.exports = { fetchDelta };
