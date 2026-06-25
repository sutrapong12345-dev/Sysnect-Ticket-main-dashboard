// ============================================================
// security.js — มิดเดิลแวร์ความปลอดภัย (ไม่พึ่ง dependency เพิ่ม)
//   - Security Headers (Defense in Depth)
//   - CORS allowlist (เลิกใช้ *)
//   - Rate Limiting (in-memory, ต่อ IP)
//   - ตัวช่วยยืนยันตัวตนสำหรับ endpoint ที่อันตราย
// ============================================================

// ---------- 1) Security Headers ----------
function securityHeaders(req, res, next) {
    res.setHeader('X-Content-Type-Options', 'nosniff');         // กัน MIME-sniffing
    res.setHeader('X-Frame-Options', 'DENY');                   // กัน Clickjacking
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    // HSTS มีผลเมื่อเสิร์ฟผ่าน HTTPS เท่านั้น (ส่งไว้ไม่เป็นอันตราย)
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.removeHeader('X-Powered-By');                           // ซ่อนว่าใช้ Express
    next();
}

// ---------- 2) CORS allowlist ----------
// อ่านรายชื่อ origin ที่อนุญาตจาก ENV (คั่นด้วย ,) มี default ตามระบบจริง
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ||
    'https://sutrapong12345-dev.github.io,http://localhost:3000,http://127.0.0.1:3000,null'
).split(',').map(s => s.trim()).filter(Boolean);

function corsAllowlist(req, res, next) {
    const origin = req.headers.origin;
    
    // อนุญาต origin ใน allowlist หรือโดเมนของ Cloudflare Pages/Workers
    const isAllowed = origin && (
        ALLOWED_ORIGINS.includes(origin) || 
        origin.endsWith('.workers.dev') || 
        origin.endsWith('.pages.dev')
    );
    
    // อนุญาตเฉพาะ origin ใน allowlist (คำขอ same-origin / server-to-server ไม่มี header origin → ผ่าน)
    if (isAllowed) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Sync-Token');
        res.setHeader('Access-Control-Max-Age', '600');
        // Chrome Private Network Access: อนุญาตให้หน้าเว็บ public (เช่น github.io) เรียก backend ที่ localhost/วงในได้
        res.setHeader('Access-Control-Allow-Private-Network', 'true');
    }
    if (req.method === 'OPTIONS') {
        return res.sendStatus(isAllowed ? 204 : 403);
    }
    next();
}

// ---------- 3) Rate Limiting (in-memory, fixed window ต่อ IP) ----------
function createRateLimiter({ windowMs, max, name }) {
    const hits = new Map(); // ip -> { count, reset }
    // เก็บกวาด entry หมดอายุเป็นระยะ กัน memory โต
    const sweep = setInterval(() => {
        const now = Date.now();
        for (const [ip, rec] of hits) if (rec.reset <= now) hits.delete(ip);
    }, windowMs);
    if (sweep.unref) sweep.unref();

    return function rateLimit(req, res, next) {
        const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
            || req.socket.remoteAddress || 'unknown';
        const now = Date.now();
        let rec = hits.get(ip);
        if (!rec || rec.reset <= now) {
            rec = { count: 0, reset: now + windowMs };
            hits.set(ip, rec);
        }
        rec.count++;
        const remaining = Math.max(0, max - rec.count);
        res.setHeader('X-RateLimit-Limit', String(max));
        res.setHeader('X-RateLimit-Remaining', String(remaining));
        if (rec.count > max) {
            const retry = Math.ceil((rec.reset - now) / 1000);
            res.setHeader('Retry-After', String(retry));
            console.warn(`[RATE] ⛔ ${ip} เกินลิมิต (${name}) — บล็อก ${retry}s`);
            return res.status(429).json({
                error: 'TOO_MANY_REQUESTS',
                message: `เรียกถี่เกินไป โปรดลองใหม่ใน ${retry} วินาที`,
            });
        }
        next();
    };
}

// ---------- 4) ตัวช่วยยืนยันตัวตนสำหรับ endpoint อันตราย (เช่น /api/sync) ----------
const SYNC_TOKEN = process.env.SYNC_TOKEN || '';

function isLocalRequest(req) {
    const ip = req.socket.remoteAddress || '';
    return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

// ผ่านได้ถ้า: ส่ง token ถูก (เมื่อมีการตั้ง SYNC_TOKEN) หรือมาจาก localhost (เมื่อไม่ได้ตั้ง token)
function requireSyncAuth(req, res, next) {
    if (SYNC_TOKEN) {
        const token = req.headers['x-sync-token'] || '';
        if (token === SYNC_TOKEN) return next();
        return res.status(401).json({ error: 'UNAUTHORIZED', message: 'ต้องใช้ X-Sync-Token ที่ถูกต้อง' });
    }
    // ไม่ได้ตั้ง SYNC_TOKEN → อนุญาตเฉพาะ localhost (กันคนภายนอกสั่ง sync ถล่ม GLPI)
    if (isLocalRequest(req)) return next();
    return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'endpoint นี้เรียกได้เฉพาะ localhost หรือกำหนด SYNC_TOKEN ก่อน',
    });
}

module.exports = {
    securityHeaders,
    corsAllowlist,
    createRateLimiter,
    requireSyncAuth,
    ALLOWED_ORIGINS,
    SYNC_TOKEN_SET: !!SYNC_TOKEN,
};
