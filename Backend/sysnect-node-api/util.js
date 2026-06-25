// ============================================================
// util.js — ฟังก์ชันแปลง/ทำความสะอาดข้อมูล ใช้ร่วมกันทั้ง n8n และ GLPI
// ============================================================

// แปลง GLPI status code (1-6) → key ที่หน้าเว็บใช้
// อิงตามตรรกะใน n8n workflow: 2,3 = assigned / 4 = pending
function statusFromId(code) {
    switch (String(code == null ? '' : code).trim()) {
        case '1': return 'new';
        case '2':
        case '3': return 'assigned';
        case '4': return 'pending';
        case '5': return 'solved';
        case '6': return 'closed';
        default:  return 'new';
    }
}

const STATUS_KEYS = ['new', 'assigned', 'pending', 'solved', 'closed'];

// normalize ข้อความสถานะที่อาจมาเป็นคำ (จาก n8n grouped) ให้เป็น key มาตรฐาน
function normalizeStatusKey(value, fallback = 'new') {
    const s = String(value || '').toLowerCase().trim();
    if (STATUS_KEYS.includes(s)) return s;
    if (/^[1-6]$/.test(s)) return statusFromId(s);
    if (s.includes('close') || s.includes('ปิด')) return 'closed';
    if (s.includes('solve') || s.includes('เสร็จ') || s.includes('แก้ไขแล้ว')) return 'solved';
    if (s.includes('pending') || s.includes('รอ')) return 'pending';
    if (s.includes('assign') || s.includes('จ่ายงาน') || s.includes('กำลัง')) return 'assigned';
    if (s.includes('new') || s.includes('ใหม่')) return 'new';
    return fallback;
}

// แปลง GLPI priority code (1-6) → ข้อความไทย
function priorityFromId(code) {
    switch (String(code == null ? '' : code).trim()) {
        case '1': return 'ต่ำมาก';
        case '2': return 'ต่ำ';
        case '3': return 'ปานกลาง';
        case '4': return 'สูง';
        case '5': return 'สูงมาก';
        case '6': return 'เร่งด่วนที่สุด';
        default:  return 'ปานกลาง';
    }
}

// ดึงเลขล้วน (numeric id) จากค่าหลายๆ แบบ
function toNumericId(...candidates) {
    for (const c of candidates) {
        if (c == null) continue;
        const s = String(c).trim();
        if (/^\d+$/.test(s)) return s;
    }
    // เผื่อกรณีรหัสฝังอยู่ในข้อความ เช่น "Ticket #12345"
    for (const c of candidates) {
        if (c == null) continue;
        const m = String(c).match(/(\d{4,})/);
        if (m) return m[1];
    }
    return null;
}

// แปลง date string ของ GLPI ("YYYY-MM-DD HH:mm:ss") → ISO หรือ null
function parseGlpiDate(value) {
    if (!value || value === '-' || value === 'null') return null;
    const s = String(value).replace(' ', 'T');
    const d = new Date(s);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
}

// ทำความสะอาด HTML → ข้อความล้วน (decode 2 รอบกัน double-encoded)
function cleanHtml(input) {
    let s = input;
    if (typeof s !== 'string' || !s) return '';
    for (let i = 0; i < 2; i++) {
        s = s.replace(/&nbsp;/gi, ' ')
             .replace(/&amp;/gi, '&')
             .replace(/&quot;/gi, '"')
             .replace(/&#0?39;/g, "'")
             .replace(/&lt;/gi, '<')
             .replace(/&gt;/gi, '>')
             .replace(/&#60;/g, '<')
             .replace(/&#62;/g, '>');
    }
    s = s.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
         .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
         .replace(/<[^>]*>/g, ' ')
         .replace(/&#[0-9]+;/g, ' ')
         .replace(/&[a-zA-Z0-9#]+;/g, ' ')
         .replace(/\s+/g, ' ')
         .trim();
    return s;
}

module.exports = {
    STATUS_KEYS,
    statusFromId,
    normalizeStatusKey,
    priorityFromId,
    toNumericId,
    parseGlpiDate,
    cleanHtml,
};
