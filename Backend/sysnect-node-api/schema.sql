-- ============================================================
-- SYSNECT Dashboard — Delta Sync Schema (PostgreSQL)
-- ============================================================
-- ตารางเก็บ Ticket ถาวร (Incremental Sync ปลายทาง)
-- db.js จะรัน initSchema() สร้างให้อัตโนมัติตอนบูต
-- ไฟล์นี้เก็บไว้อ้างอิง / รันมือผ่าน psql ได้เช่นกัน
-- ============================================================

CREATE TABLE IF NOT EXISTS tickets (
    uid            TEXT PRIMARY KEY,          -- กุญแจหลักแบบ stable (numeric id ถ้ามี ไม่งั้นใช้ id ดิบ)
    glpi_id        BIGINT,                    -- เลข Ticket ในระบบ GLPI (สำหรับ Deep Link)
    ticket_number  TEXT,                      -- เลข/รหัสที่ใช้แสดงผล (เช่น C25-00123)
    title          TEXT,                      -- หัวข้อ Ticket
    status         TEXT NOT NULL DEFAULT 'new', -- new | assigned | pending | solved | closed
    status_id      INTEGER,                   -- GLPI status code 1-6
    priority       TEXT,                      -- ข้อความระดับความสำคัญ (ปานกลาง/สูง/...)
    priority_id    INTEGER,                   -- GLPI priority code 1-6
    project        TEXT,                      -- ชื่อโครงการ
    detail         TEXT,                      -- รายละเอียด/เนื้อหา
    location       TEXT,                      -- สถานที่/Entity
    category       TEXT,                      -- หมวดหมู่
    date_open      TIMESTAMPTZ,               -- วันที่เปิด (date_creation)
    date_close     TIMESTAMPTZ,               -- วันที่ปิด (closedate)
    date_mod       TIMESTAMPTZ,               -- วันที่แก้ไขล่าสุด (date_mod) ← ใช้ทำ Delta
    raw            JSONB,                     -- ข้อมูลดิบจากต้นทาง เผื่อ debug/ขยายในอนาคต
    synced_at      TIMESTAMPTZ NOT NULL DEFAULT now() -- เวลาที่ sync แถวนี้ล่าสุด
);

-- Index ช่วยให้ดึง/จัดกลุ่มเร็ว
CREATE INDEX IF NOT EXISTS idx_tickets_status   ON tickets (status);
CREATE INDEX IF NOT EXISTS idx_tickets_date_mod ON tickets (date_mod DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_date_open ON tickets (date_open DESC);

-- ============================================================
-- ตารางเก็บสถานะการ sync (มีแถวเดียว id=1)
-- ============================================================
CREATE TABLE IF NOT EXISTS sync_state (
    id           INTEGER PRIMARY KEY DEFAULT 1,
    last_sync    TIMESTAMPTZ,               -- จุดเวลา date_mod ล่าสุดที่ sync ไปแล้ว (cursor ของ Delta)
    last_run_at  TIMESTAMPTZ,              -- เวลาที่รัน sync รอบล่าสุด
    last_source  TEXT,                     -- n8n | glpi_direct
    last_count   INTEGER DEFAULT 0,        -- จำนวน ticket ที่ upsert รอบล่าสุด
    last_error   TEXT,                     -- ข้อความ error รอบล่าสุด (ถ้ามี)
    CONSTRAINT sync_state_singleton CHECK (id = 1)
);

INSERT INTO sync_state (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;
