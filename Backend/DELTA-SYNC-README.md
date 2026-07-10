# SYSNECT Dashboard — ระบบ Incremental / Delta Sync

ระบบสะสมตั๋ว (Ticket) ลง **PostgreSQL** แบบเก็บถาวร แล้วให้หน้าเว็บอ่านจาก DB โดยตรง
(เร็ว < 50ms) แทนการยิง GLPI/n8n ใหม่ทุกครั้ง

## สถาปัตยกรรม

```
[GLPI]  ──(date_mod > last_sync)──┐
                                  │  (ช่องทางสำรอง)
[n8n webhook]  ──(grouped JSON)───┤  (ช่องทางหลัก)
                                  ▼
                        sync.js (UPSERT ON CONFLICT)
                                  ▼
                         [PostgreSQL: tickets]
                                  ▼
        server.js  GET /api/tickets  (อ่าน + จัดกลุ่มตามสถานะ)
                                  ▼
                    [Dashboard หน้าเว็บ Beta]
```

ลำดับการอ่านของ `GET /api/tickets`: **Postgres → n8n → GLPI direct → file cache**
ลำดับการ sync ลง DB (`sync.js`): **n8n (หลัก) → GLPI direct (สำรอง)**

## ไฟล์ที่เพิ่ม/แก้

| ไฟล์ | หน้าที่ |
|------|---------|
| `schema.sql` | ตาราง `tickets` + `sync_state` |
| `db.js` | Pool, initSchema, **upsertTickets (ON CONFLICT)**, getGroupedTickets |
| `util.js` | แปลง status/priority code, clean HTML, parse date |
| `glpi.js` | ดึงตรง GLPI แบบ Delta (`criteria field=19 date_mod morethan`) + App-Token + แบ่งหน้า |
| `sync.js` | ออเคสเตรต n8n→GLPI, backfill 120 วัน, scheduler ทุก 5 นาที |
| `server.js` | เพิ่ม DB-first ใน `/api/tickets`, `POST /api/sync`, health, bootstrap |
| `../app.js` (frontend) | สลับให้ยิง Node API (Postgres) เป็นหลัก, n8n เป็นสำรอง |

## วิธีรัน

### ผ่าน Docker (แนะนำ)
```powershell
cd "Backend"
copy .env.example .env   # แล้วแก้ค่าจริงก่อนรัน
docker compose up -d --build
# เปิดหน้าเว็บ: http://localhost:3000
```

### รันแยกเฉพาะ Node (ต้องมี Postgres อยู่แล้ว)
```powershell
cd "Backend\sysnect-node-api"
copy .env.example .env   # แล้วแก้ค่าตามจริง (DB_HOST=localhost)
npm install
npm start
```

## ตรวจสอบ / สั่งงาน

```powershell
# ดูสถานะ DB + การ sync ล่าสุด
curl http://localhost:3000/api/health

# สั่ง sync เดี๋ยวนั้น (ไม่ต้องรอครบ 5 นาที)
curl -X Method POST http://localhost:3000/api/sync
```

`/api/health` จะบอก `database.counts`, `database.sync_state.last_sync`,
`last_sync_result` (ช่องทาง + จำนวนที่ upsert + เวลา)

## พฤติกรรมสำคัญ
- **Backfill** ทำครั้งเดียวตอน DB ว่าง (ดึงย้อนหลัง `BACKFILL_DAYS` วันผ่าน GLPI direct
  เพราะ n8n ปกติส่งเฉพาะช่วงล่าสุด)
- รอบปกติใช้ **n8n เป็นหลัก** แล้ว UPSERT (idempotent — ตั๋วเดิมอัปเดต, ตั๋วใหม่เพิ่ม)
- ถ้า n8n ล่ม → ใช้ **GLPI direct** ดึงเฉพาะ `date_mod` หลัง `last_sync`
- เซิร์ฟเวอร์ **ไม่ล้ม** ถ้า DB ยังไม่พร้อม (retry ทุก 30 วิ) — หน้าเว็บยังใช้ช่องทางสำรองเดิมได้

## 🔐 ความปลอดภัย (Security Hardening)

ไฟล์ `security.js` รวมมิดเดิลแวร์ความปลอดภัย (ไม่ต้องลง dependency เพิ่ม) — เปิดใช้ใน `server.js` แล้ว:

| ด้าน | สิ่งที่ทำ |
|------|-----------|
| **Security Headers** | `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`, ลบ `X-Powered-By` |
| **CORS** | เลิกใช้ `*` → allowlist จาก `ALLOWED_ORIGINS` (preflight ที่ origin ไม่อยู่ในลิสต์ตอบ 403) |
| **Rate Limiting** | ทั่วไป 120 req/นาที/IP, `/api/sync` 5 req/นาที/IP (กัน DoS/abuse) |
| **`/api/sync` auth** | ต้องมี `X-Sync-Token` (เมื่อตั้ง `SYNC_TOKEN`) ไม่งั้นเรียกได้เฉพาะ localhost |
| **Secrets** | GLPI/n8n อ่านจาก ENV ก่อนเสมอ + เตือนเมื่อใช้ค่า default จากซอร์ส |
| **Body limit** | จำกัด JSON body 1MB |

ฝั่งหน้าเว็บ (ทั้ง Beta + MAIN): เพิ่ม `escapeHtml()` กับฟิลด์ดิบ (project, location, id, หัวข้อ)
ที่นำไปแทรกใน HTML/attribute เป็น defense-in-depth ป้องกัน Stored XSS (รายละเอียดยังผ่าน DOMPurify เหมือนเดิม)

### ⚠️ สิ่งที่ผู้ดูแลระบบควรทำต่อ (สำคัญ)
1. **Rotate รหัส GLPI + App-Token** — รหัสเดิมเคยถูก commit ลงซอร์สโค้ด/`docker-compose.yml` ถือว่า "หลุด" แล้ว
2. ตั้งค่าจริงผ่าน `.env` (ดู `.env.example`) แล้ว **อย่า commit `.env`** (เพิ่มใน `.gitignore`)
3. ตั้ง `SYNC_TOKEN` เป็นค่าสุ่มยาวๆ ถ้าต้องสั่ง `/api/sync` จากภายนอก
4. แก้ `N8N_BASIC_AUTH_PASSWORD=password` และ `POSTGRES_PASSWORD` ใน `docker-compose.yml` ให้เป็นรหัสแข็งแรง
5. เสิร์ฟผ่าน **HTTPS + reverse proxy** (เช่น Nginx/Caddy) เพื่อให้ HSTS มีผลจริง

> หมายเหตุ: CSP ของหน้าเว็บยังมี `'unsafe-inline'` ใน `script-src` เพราะโค้ดใช้ inline handler จำนวนมาก
> การถอดออกต้อง refactor event handler ทั้งหมด (งานใหญ่แยกต่างหาก) — ปัจจุบันยังกัน XSS ด้วย escape + DOMPurify

## ⚠️ จุดที่ควรยืนยันกับ GLPI จริง
GLPI search field id อาจต่างกันได้ในแต่ละ instance — ปรับได้ที่ object `F` ใน `glpi.js`
(`name:1, id:2, status:12, date_creation:15, closedate:16, date_mod:19, content:21, project_link:83`)
ถ้า project/วันที่/สถานะเพี้ยน ให้เช็ค field id เหล่านี้ก่อนเป็นอันดับแรก
