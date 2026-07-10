# SYSNECT Dashboard — n8n + PostgreSQL Backup Flow

ระบบนี้ใช้ **n8n** เป็นแหล่ง sync ข้อมูล และใช้ **PostgreSQL** เป็นฐานข้อมูลสำรองถาวรสำหรับหน้า Dashboard

## Architecture

```text
[n8n webhook] -> sync.js -> PostgreSQL tickets
                         -> server.js /api/tickets
                         -> Dashboard
```

## Behavior

- `GET /api/tickets` อ่านจาก **PostgreSQL ก่อนเสมอ** ถ้ามีข้อมูลอยู่ใน DB
- ถ้า PostgreSQL ยังว่าง ระบบจึงลองดึงจาก `N8N_WEBHOOK` แล้ว upsert ลง PostgreSQL
- ถ้า n8n ล่ม แต่ PostgreSQL มีข้อมูล หน้าเว็บยังเปิดดู ticket ล่าสุดจาก PostgreSQL ได้
- ถ้าทั้ง n8n และ PostgreSQL ใช้ไม่ได้ ระบบจะตอบ `503`

## Files

| File | Purpose |
|------|---------|
| `schema.sql` | PostgreSQL schema for `tickets` and `sync_state` |
| `db.js` | Database pool, schema init, upsert, grouped reads, counts |
| `sync.js` | Scheduled n8n -> PostgreSQL sync |
| `server.js` | API, SSO guard, PostgreSQL-first ticket reads, health |
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
