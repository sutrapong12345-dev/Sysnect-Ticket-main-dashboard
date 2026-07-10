# SYSNECT Dashboard — n8n + PostgreSQL Backup Flow

ระบบนี้ใช้ **n8n** เป็นแหล่ง sync ข้อมูล และใช้ **PostgreSQL** เป็นฐานข้อมูลสำรองถาวรสำหรับหน้า Dashboard

## Architecture

```text
[n8n webhook] -> server.js /api/tickets -> Dashboard
              -> sync.js / mirror      -> PostgreSQL tickets
                                         -> fallback when n8n is down
```

## Behavior

- `GET /api/tickets` อ่านจาก **n8n ก่อนเสมอ** เมื่อ n8n ออนไลน์
- เมื่อดึง n8n สำเร็จ ระบบจะ mirror snapshot ล่าสุดลง PostgreSQL ทันที
- scheduled sync จะดึง n8n ทุก `SYNC_INTERVAL_MS` แล้ว mirror ลง PostgreSQL เช่นกัน
- ถ้า n8n ล่ม แต่ PostgreSQL มีข้อมูล หน้าเว็บยังเปิดดู ticket ล่าสุดจาก PostgreSQL ได้
- ถ้าทั้ง n8n และ PostgreSQL ใช้ไม่ได้ ระบบจะตอบ `503`

## Files

| File | Purpose |
|------|---------|
| `schema.sql` | PostgreSQL schema for `tickets` and `sync_state` |
| `db.js` | Database pool, schema init, mirror/upsert, grouped reads, counts |
| `sync.js` | Scheduled n8n -> PostgreSQL sync |
| `server.js` | API, SSO guard, n8n-first ticket reads, PostgreSQL fallback, health |
| `security.js` | Security headers, CORS allowlist, rate limit, sync auth |

## Required Environment

```env
DB_PASSWORD=__CHANGE_ME__strong_db_password
N8N_WEBHOOK=https://n8n.example.com/webhook/__CHANGE_ME__webhook_id
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=__CHANGE_ME__strong_n8n_password
```

Do not commit real `.env` values.

## Security Notes

- Direct ITSM fallback has been removed.
- No external ITSM credential or API endpoint is required by the backend.
- `/api/tickets` and `/api/snapshot` require SSO bearer auth.
- `/api/sync` requires `X-Sync-Token` when `SYNC_TOKEN` is configured; otherwise it is localhost-only.
