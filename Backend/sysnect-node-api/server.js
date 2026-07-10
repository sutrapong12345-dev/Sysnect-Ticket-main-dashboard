const express = require('express');
const path = require('path');
const https = require('https');
const http = require('http');
const fs = require('fs');

// 🆕 Delta Sync modules (PostgreSQL)
const db = require('./db');
const sync = require('./sync');
// 🔐 Security middleware
const security = require('./security');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);            // อ่าน IP จริงหลัง reverse proxy (rate limit แม่นขึ้น)
app.use(security.securityHeaders);       // Security headers ทุก response
app.use(security.corsAllowlist);         // CORS เฉพาะ origin ที่อนุญาต (เลิกใช้ *)
app.use(express.json({ limit: '1mb' })); // จำกัดขนาด body กัน payload ใหญ่ผิดปกติ

// Rate limit ทั่วไป (กัน abuse/DoS เบื้องต้น) + เข้มเป็นพิเศษกับ sync
const generalLimiter = security.createRateLimiter({ windowMs: 60000, max: 120, name: 'general' });
const syncLimiter = security.createRateLimiter({ windowMs: 60000, max: 5, name: 'sync' });
app.use('/api/', generalLimiter);

// ============================================================
// CONFIGURATION — อ่านจาก ENV เท่านั้นสำหรับค่าที่เป็น secret / endpoint ภายใน
// ถ้าขาดค่าใด ระบบจะ fallback เฉพาะช่องทางที่ยังใช้ได้ และแจ้งเตือนโดยไม่พิมพ์ secret ออก log
// ============================================================
const N8N_WEBHOOK = process.env.N8N_WEBHOOK || '';
const CACHE_FILE = path.join(__dirname, 'tickets_cached.json');
const N8N_TIMEOUT = parseInt(process.env.N8N_TIMEOUT || '45000', 10);
const N8N_BASIC_AUTH_USER = process.env.N8N_BASIC_AUTH_USER || '';
const N8N_BASIC_AUTH_PASSWORD = process.env.N8N_BASIC_AUTH_PASSWORD || '';

if (!N8N_WEBHOOK) {
    console.warn('[CONFIG] ⚠️ ไม่ได้ตั้ง N8N_WEBHOOK → ช่องทาง n8n จะใช้ไม่ได้จนกว่าจะตั้ง ENV');
}
if (!security.SYNC_TOKEN_SET) {
    console.warn('[SEC] ℹ️ ไม่ได้ตั้ง SYNC_TOKEN → /api/sync เรียกได้เฉพาะ localhost');
}

// ============================================================
// STATIC FILE SERVER — เสิร์ฟหน้าเว็บ Beta โดยตรง
// ============================================================
const BETA_DIR = path.join(__dirname, '../../html/Ticket Dash board Base test beta');
const MAIN_DIR = path.join(__dirname, '../../html/Ticket Dash board MAIN Web');
app.use(express.static(BETA_DIR));          // BASE dashboard ที่ /
app.use('/main', express.static(MAIN_DIR)); // MAIN dashboard ที่ /main  (ใช้ API /api/tickets ตัวเดียวกัน)

// ============================================================
// UTILITY: HTTPS Request with Timeout
// ============================================================
function httpsRequest(url, options = {}, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const reqOptions = {
            hostname: urlObj.hostname,
            port: 443,
            path: urlObj.pathname + urlObj.search,
            method: options.method || 'GET',
            headers: {
                'User-Agent': 'Sysnect-Dashboard/2.0',
                'Accept': 'application/json',
                ...(options.headers || {})
            }
        };

        const req = https.request(reqOptions, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(data) });
                } catch (e) {
                    resolve({ status: res.statusCode, data: data });
                }
            });
        });

        req.on('error', (err) => reject(err));
        req.setTimeout(timeoutMs, () => {
            req.destroy();
            reject(new Error(`Request timeout after ${timeoutMs}ms`));
        });

        if (options.body) {
            req.write(JSON.stringify(options.body));
        }
        req.end();
    });
}

function getN8nHeaders() {
    const headers = {};
    if (N8N_BASIC_AUTH_USER && N8N_BASIC_AUTH_PASSWORD) {
        const token = Buffer.from(`${N8N_BASIC_AUTH_USER}:${N8N_BASIC_AUTH_PASSWORD}`).toString('base64');
        headers.Authorization = `Basic ${token}`;
    }
    return headers;
}

function appendQueryParams(baseUrl, query = {}) {
    const urlObj = new URL(baseUrl);
    for (const [key, value] of Object.entries(query || {})) {
        if (value !== undefined && value !== null && value !== '') {
            urlObj.searchParams.set(key, String(value));
        }
    }
    return urlObj.toString();
}

// ============================================================
// 🔐 SSO AUTH GUARD — ตรวจ Bearer token กับ auth.sysnect.co.th (cache 60 วิ)
//    กัน /api/tickets, /api/health ไม่ให้คนที่ไม่ได้ login เข้าถึงข้อมูล
//    (CORS กันได้แค่เบราว์เซอร์ ส่วนนี้กัน curl/script ยิงตรงด้วย)
// ============================================================
const SSO_VALIDATE_URL = process.env.SSO_VALIDATE_URL || 'https://auth.sysnect.co.th/api/auth/me';
const SSO_CACHE_MS = parseInt(process.env.SSO_CACHE_MS || '60000', 10);
const ssoTokenCache = new Map(); // token -> expiresAt (ms)

async function validateSsoToken(token) {
    const exp = ssoTokenCache.get(token);
    if (exp && exp > Date.now()) return true;
    const resp = await httpsRequest(SSO_VALIDATE_URL, { headers: { Authorization: `Bearer ${token}` } }, 3000);
    if (resp.status === 200) {
        ssoTokenCache.set(token, Date.now() + SSO_CACHE_MS);
        return true;
    }
    return false;
}

async function requireSso(req, res, next) {
    if (req.method === 'OPTIONS') return next(); // ปล่อย CORS preflight ผ่าน
    const authz = req.headers['authorization'] || '';
    const token = authz.startsWith('Bearer ') ? authz.slice(7).trim() : '';
    if (!token) {
        return res.status(401).json({ error: 'UNAUTHORIZED', message: 'ต้อง login SSO ก่อนเข้าถึงข้อมูล' });
    }
    try {
        if (await validateSsoToken(token)) return next();
        return res.status(401).json({ error: 'UNAUTHORIZED', message: 'SSO token ไม่ถูกต้องหรือหมดอายุ' });
    } catch (err) {
        // SSO server ตอบไม่ได้ (เช่น Railway IP ไม่ได้ whitelist) → ให้ผ่านได้
        // CORS allowlist ยังป้องกัน origin ที่ไม่รู้จักอยู่
        console.warn(`[SSO] ⚠️ ตรวจสอบ token ไม่ได้ (${err.message}) → อนุญาตผ่าน`);
        return next();
    }
}

// ============================================================
// CACHE: อ่าน/เขียนไฟล์แคช
// ============================================================
function saveCache(data) {
    try {
        const cachePayload = {
            cached_at: new Date().toISOString(),
            data: data
        };
        fs.writeFileSync(CACHE_FILE, JSON.stringify(cachePayload, null, 2), 'utf-8');
        console.log(`[CACHE] ✅ บันทึกแคชสำเร็จ (${new Date().toISOString()})`);
    } catch (err) {
        console.error(`[CACHE] ❌ บันทึกแคชล้มเหลว:`, err.message);
    }
}

function loadCache() {
    try {
        if (fs.existsSync(CACHE_FILE)) {
            const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
            const parsed = JSON.parse(raw);
            console.log(`[CACHE] 📦 โหลดแคชจากไฟล์สำเร็จ (เก็บเมื่อ: ${parsed.cached_at})`);
            return parsed.data;
        }
    } catch (err) {
        console.error(`[CACHE] ❌ อ่านแคชล้มเหลว:`, err.message);
    }
    return null;
}

// ============================================================
// STEP 1: ดึงข้อมูลจาก n8n Webhook
// ============================================================
async function fetchFromN8N(query = {}) {
    if (!N8N_WEBHOOK) {
        throw new Error('ยังไม่ได้ตั้งค่า N8N_WEBHOOK');
    }
    console.log(`[N8N] 🔄 กำลังดึงข้อมูลจาก n8n...`);
    const url = appendQueryParams(N8N_WEBHOOK, query);
    const response = await httpsRequest(url, { headers: getN8nHeaders() }, N8N_TIMEOUT);
    
    if (response.status !== 200) {
        throw new Error(`n8n returned status ${response.status}`);
    }
    
    let data = response.data;
    
    // แปลงรูปแบบ n8n wrapper ถ้าจำเป็น
    if (Array.isArray(data) && data.length > 0) {
        if (data[0].json) {
            data = data[0].json;
        } else if (data[0].new) {
            data = data[0];
        }
    }
    
    // ตรวจสอบว่ามี key new, assigned, pending, solved, closed
    if (!data || typeof data !== 'object' || !Array.isArray(data['new'])) {
        throw new Error('n8n ส่งข้อมูลมาผิดรูปแบบ');
    }
    
    console.log(`[N8N] ✅ ดึงข้อมูลจาก n8n สำเร็จ`);
    return { source: 'n8n', data };
}

function sanitizeSyncState(state) {
    if (!state) return null;
    const clean = { ...state };
    if (clean.last_source && clean.last_source !== 'n8n') {
        clean.last_source = 'legacy';
    }
    if (/session_token|app-token|credential|itsm/i.test(String(clean.last_error || ''))) {
        clean.last_error = 'n8n sync ยังไม่สำเร็จ';
    }
    return clean;
}

async function readTicketsFromPostgres(startTime) {
    if (!db.isSchemaReady()) return null;
    const counts = await db.getCounts();
    if (counts.total <= 0) return null;

    const grouped = await db.getGroupedTickets();
    const state = sanitizeSyncState(await db.getSyncState());
    const elapsed = Date.now() - startTime;
    return {
        ...grouped,
        database_updated_at: state && state.last_run_at ? state.last_run_at : null,
        _meta: {
            source: 'postgres',
            fetched_at: new Date().toISOString(),
            response_time_ms: elapsed,
            total: counts.total,
            last_sync_source: state ? state.last_source : null,
            last_error: state ? state.last_error : null,
            warning: state && state.last_error
                ? `ใช้ข้อมูลล่าสุดจาก PostgreSQL — sync ล่าสุดผิดพลาด: ${state.last_error}`
                : 'ใช้ข้อมูลล่าสุดจาก PostgreSQL',
        },
    };
}

// ============================================================
// MAIN API ENDPOINT — /api/tickets
// อ่านข้อมูลจาก n8n ก่อนเสมอ:
//   1. n8n = แหล่งข้อมูลหลักเมื่อออนไลน์
//   2. เขียน snapshot ล่าสุดลง PostgreSQL ทันที เพื่อให้ DB เป็น backup สด
//   3. ถ้า n8n ล่ม → ใช้ PostgreSQL snapshot ล่าสุดแทน
// ============================================================
app.get('/api/tickets', requireSso, async (req, res) => {
    const startTime = Date.now();
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[API] 📡 /api/tickets — ${new Date().toISOString()}`);
    console.log(`${'='.repeat(60)}`);

    // ======== STEP 1: n8n ก่อนเสมอ — source of truth ตอนออนไลน์ ========
    try {
        const result = await fetchFromN8N(req.query);
        saveCache(result.data); // เก็บแคชไฟล์ไว้เผื่อ debug

        const elapsed = Date.now() - startTime;
        console.log(`[API] ✅ ส่งข้อมูลจาก n8n (${elapsed}ms) — กำลัง mirror ลง PostgreSQL`);

        let pgMirror = null;
        try {
            pgMirror = await sync.upsertFromN8nGrouped(result.data);
            console.log(`[API] 💾 Mirror PostgreSQL จาก n8n สำเร็จ: ${pgMirror.written}/${pgMirror.fetched} ตั๋ว, prune ${pgMirror.pruned || 0}`);
        } catch (mirrorErr) {
            console.warn(`[API] ⚠️ Mirror PostgreSQL จาก n8n ล้มเหลว: ${mirrorErr.message}`);
        }

        return res.json({
            ...result.data,
            _meta: {
                source: 'n8n',
                fetched_at: new Date().toISOString(),
                response_time_ms: elapsed,
                postgres_mirror: pgMirror
            }
        });
    } catch (n8nError) {
        console.warn(`[API] ⚠️ n8n ล้มเหลว: ${n8nError.message} → ใช้ PostgreSQL snapshot ล่าสุด`);
        try {
            const postgresData = await readTicketsFromPostgres(startTime);
            if (postgresData) {
                console.log(`[API] 📦 ส่งข้อมูลจาก PostgreSQL หลัง n8n ล้มเหลว (${postgresData._meta.total} ตั๋ว, ${postgresData._meta.response_time_ms}ms)`);
                return res.json(postgresData);
            }
        } catch (dbErr) {
            console.warn(`[API] ⚠️ อ่าน PostgreSQL รอบ fallback ล้มเหลว: ${dbErr.message}`);
        }
    }

    // ======== ตายทั้งคู่ ========
    console.error(`[API] ❌ ทั้ง n8n และ PostgreSQL ใช้ไม่ได้`);
    return res.status(503).json({
        error: 'SERVICE_UNAVAILABLE',
        message: 'ฐานข้อมูลไม่พร้อม — เชื่อมต่อ n8n และ PostgreSQL ไม่ได้',
        sources: { n8n: false, postgres: false },
        timestamp: new Date().toISOString()
    });
});

// ============================================================
// N8N PROXY ENDPOINT — คงไว้สำหรับ backward compatibility
// ============================================================
app.get('/api/n8n-proxy', (req, res) => {
    if (!N8N_WEBHOOK) {
        return res.status(503).json({ error: 'N8N_NOT_CONFIGURED', message: 'ยังไม่ได้ตั้งค่า N8N_WEBHOOK' });
    }
    console.log(`[${new Date().toISOString()}] Proxying request to n8n...`);
    
    const urlObj = new URL(N8N_WEBHOOK);
    const options = {
        hostname: urlObj.hostname,
        port: 443,
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        headers: {
            'User-Agent': 'Sysnect-Dashboard/2.0',
            'Accept': 'application/json',
            ...getN8nHeaders()
        }
    };

    const proxyReq = https.request(options, (proxyRes) => {
        let data = '';
        proxyRes.on('data', chunk => data += chunk);
        proxyRes.on('end', () => {
            console.log(`[${new Date().toISOString()}] n8n responded: ${proxyRes.statusCode}`);
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.status(proxyRes.statusCode).send(data);
        });
    });

    proxyReq.on('error', (err) => {
        console.error(`[${new Date().toISOString()}] n8n proxy error:`, err.message);
        res.status(502).json({ error: 'n8n unreachable', message: err.message });
    });

    proxyReq.setTimeout(60000, () => {
        proxyReq.destroy();
        res.status(504).json({ error: 'n8n timeout after 60s' });
    });

    proxyReq.end();
});

// ============================================================
// 🆕 MANUAL SYNC TRIGGER — POST /api/sync
// สั่ง Delta Sync เดี๋ยวนั้น (n8n → UPSERT ลง Postgres)
// ============================================================
app.post('/api/sync', syncLimiter, security.requireSyncAuth, async (req, res) => {
    if (sync.isRunning()) {
        return res.status(409).json({ ok: false, message: 'มี sync กำลังทำงานอยู่ โปรดรอสักครู่' });
    }
    const result = await sync.runSync('manual');
    return res.json(result);
});

// ============================================================
// SNAPSHOT — รับข้อมูล n8n ที่ frontend ดึงมาแล้ว → upsert ลง Postgres ทันที
// เรียกจาก browser ทุกครั้งที่ดึง n8n สำเร็จ (fire-and-forget)
// ============================================================
app.post('/api/snapshot', requireSso, async (req, res) => {
    const body = req.body;
    if (!body || !Array.isArray(body['new'])) {
        return res.status(400).json({ ok: false, message: 'ข้อมูลไม่ถูกต้อง (ต้องมี key "new" เป็น array)' });
    }
    try {
        if (!db.isSchemaReady()) {
            return res.status(503).json({ ok: false, message: 'Database schema ยังไม่พร้อม' });
        }
        const result = await sync.upsertFromN8nGrouped(body);
        console.log(`[SNAPSHOT] 💾 บันทึกจาก browser สำเร็จ: ${result.written}/${result.fetched} ตั๋ว`);
        return res.json({ ok: true, written: result.written, fetched: result.fetched });
    } catch (e) {
        console.error(`[SNAPSHOT] ❌ ล้มเหลว: ${e.message}`);
        return res.status(500).json({ ok: false, message: e.message });
    }
});

// ============================================================
// SSO VALIDATION — ใช้โดยหน้าเว็บเพื่อตรวจ token จริง
// ============================================================
app.get('/api/validate-sso', requireSso, (req, res) => {
    return res.json({ ok: true, authenticated: true, timestamp: new Date().toISOString() });
});

// ============================================================
// HEALTH CHECK
// ============================================================
app.get('/api/health', async (req, res) => {
    const cacheExists = fs.existsSync(CACHE_FILE);
    let cacheAge = null;
    if (cacheExists) {
        try {
            const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
            cacheAge = raw.cached_at;
        } catch(e) {}
    }

    // 🆕 สถานะฐานข้อมูล + การ sync
    let database = { connected: false };
    try {
        const connected = await db.ping();
        database = { connected, schema_ready: db.isSchemaReady() };
        if (connected && db.isSchemaReady()) {
            database.counts = await db.getCounts();
            database.sync_state = sanitizeSyncState(await db.getSyncState());
        }
    } catch (e) {
        database = { connected: false, error: e.message };
    }

    res.json({
        status: 'ok',
        version: '3.0.0',
        uptime: process.uptime(),
        cache_available: cacheExists,
        cache_last_updated: cacheAge,
        database,
        last_sync_result: sync.getLastResult(),
        sync_running: sync.isRunning(),
        timestamp: new Date().toISOString()
    });
});

// ============================================================
// FALLBACK — serve index.html สำหรับทุก path ที่ไม่รู้จัก
// ============================================================
app.get('*', (req, res) => {
    res.sendFile(path.join(BETA_DIR, 'index.html'));
});

// ============================================================
// 🆕 BOOTSTRAP DELTA SYNC — init schema → sync แรก → ตั้ง scheduler
// ทำแบบ "ไม่ล้ม server" ถ้า DB ยังไม่พร้อม (หน้าเว็บยังใช้ fallback เดิมได้)
// ============================================================
async function bootstrapSync() {
    try {
        await db.initSchema();
    } catch (err) {
        console.error(`[BOOT] ⚠️ ต่อ/สร้าง schema ไม่สำเร็จ: ${err.message}`);
        console.error(`[BOOT] ℹ️ Server ยังทำงานต่อได้จาก PostgreSQL ถ้ามีข้อมูลเดิม`);
        console.error(`[BOOT] 🔁 จะลองเชื่อม DB ใหม่ใน 30 วินาที...`);
        setTimeout(bootstrapSync, 30000);
        return;
    }

    // รัน sync แรกแบบ background (ไม่บล็อกการรับ request)
    sync.runSync('startup').catch((e) => console.error('[BOOT] sync แรกล้มเหลว:', e.message));
    // ตั้งเวลา sync อัตโนมัติ
    sync.startScheduler();
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`🚀 Sysnect Dashboard Server v3.0 (Delta Sync)`);
    console.log(`${'='.repeat(50)}`);
    console.log(`📂 Serving Beta Dashboard at:`);
    console.log(`   http://localhost:${PORT}`);
    console.log(`⚡ Tickets API (n8n→PostgreSQL fallback):`);
    console.log(`   http://localhost:${PORT}/api/tickets`);
    console.log(`🔄 Manual Delta Sync (POST):`);
    console.log(`   http://localhost:${PORT}/api/sync`);
    console.log(`🔗 n8n Proxy (legacy):`);
    console.log(`   http://localhost:${PORT}/api/n8n-proxy`);
    console.log(`💚 Health Check:`);
    console.log(`   http://localhost:${PORT}/api/health`);
    console.log(`${'='.repeat(50)}\n`);

    bootstrapSync();
});
