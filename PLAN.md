# SYSNECT MAIN Dashboard — Redesign Plan
**วันที่วางแผน:** 2026-06-25  
**Status ปัจจุบัน:** ✅ DEPLOYED — commit 044f1cd pushed 2026-06-25

---

## 🎯 เป้าหมาย

Redesign MAIN Web Dashboard ให้เป็น **Command Center Dark** — ดูเหมือน NOC/SOC ระดับองค์กร  
โครงสร้างข้อมูลเหมือนเดิมทุกอย่าง แต่ **visual ใหม่ทั้งหมด**

---

## 🆚 เปรียบเทียบ BASE vs MAIN ใหม่

| | BASE (v2.1.0) | MAIN ใหม่ (v2.2.0) |
|---|---|---|
| Theme default | Light glassmorphism | **Dark Command Center** |
| Background | Blob gradients + bg-tech.jpg | Dot grid + indigo/blue radial |
| KPI cards | อยู่ใน chart card | **Stat Bar แถวเต็ม** บน dashboard |
| Quick filter | Chips ใน filter bar | Select dropdown (ในกราฟ) |
| User pill | ✅ navbar | ✅ navbar |
| Accent color | #1a365d navy | **#6366f1 indigo** |
| Layout | Split 50/50 | Split 40/60 (chart เล็ก ticket ใหญ่) |
| Center button | Pulse blue → red | Pulse **indigo** → red |
| Loader bg | Light (#f8fafc) | **Dark (#020817)** |
| Loader blobs | Blue pastel | **Indigo/blue/green dark** |

---

## 📋 ไฟล์ที่ต้องแก้

### 1. `style.css` (rewrite ใหม่ทั้งหมด) ✅ DONE 2026-06-25
- [x] CSS variables — dark default, light override
- [x] Body + dot grid background
- [x] Loader — dark theme
- [x] Navbar — rgba(2,8,23,0.92) + indigo border-bottom
- [x] **Stat Bar** — 6 cards แถวเต็ม, glow per status (NEW)
- [x] Dashboard layout 40/60
- [x] Chart card — transparent dark
- [x] Legend rows cl-row — dark
- [x] Ticket items — dark + left colored border + translateX hover
- [x] Filter bar — dark
- [x] Custom dropdowns — dark
- [x] Export modal — dark
- [x] Settings drawer — dark
- [x] Responsive

### 2. `index.html` ✅ DONE 2026-06-25
- [x] `<html data-theme="dark">` (ค่าเริ่มต้นเป็น dark)
- [x] เพิ่ม `.stat-bar` ระหว่าง navbar และ dashboard-wrapper (6 stat-card: total/new/assigned/pending/solved/closed)
- [x] เพิ่ม `.user-pill` ใน nav-right (id="userPill" + id="userPillName")
- [x] bump `style.css?v=10`, `app.js?v=4`
- [x] เอา `<style>` block inline ออก (ย้ายเข้า style.css แล้ว)
- [x] เปลี่ยน version-badge ใน settings card เป็น v2.2.0-MAIN
- [x] เพิ่ม JetBrains Mono font link

### 3. `app.js` ✅ DONE 2026-06-25
- [x] default theme เปลี่ยนจาก `'light'` → `'dark'` (settings default, localStorage fallback, currentTheme)
- [x] เพิ่ม `updateStatBar(values, labels, total)` — update ตัวเลขใน stat bar (6 slots)
- [x] เพิ่ม `updateStatBarActive(status)` — toggle `.active` บน stat card
- [x] เพิ่ม `renderUserPill()` — อ่าน JWT payload → แสดงชื่อ user
- [x] เรียก `updateStatBar()` ใน `initChart()` หลัง renderChartLegend()
- [x] เรียก `updateStatBarActive()` ทุกที่ที่ `updateChartLegendActive()` ถูกเรียก (2 จุด)
- [x] เรียก `renderUserPill()` ใน DOMContentLoaded
- [x] stat card click → handleLegendClick() ผ่าน inline onclick ใน HTML

---

## 🎨 Design Tokens (Command Center Dark)

```
--bg-base:       #020817      (ultra dark navy)
--bg-surface:    rgba(15,23,42,0.85)
--bg-card:       rgba(15,23,42,0.6)
--bg-input:      rgba(30,41,59,0.8)
--border:        rgba(148,163,184,0.1)
--border-mid:    rgba(148,163,184,0.18)
--border-accent: rgba(99,102,241,0.4)
--primary:       #6366f1  (indigo)
--accent:        #2563eb  (blue)
--text-main:     #e2e8f0
--text-muted:    #94a3b8
--text-dim:      #475569

Status:
  --s-new:      #3b82f6
  --s-assigned: #f59e0b
  --s-pending:  #ef4444
  --s-solved:   #10b981
  --s-closed:   #64748b
```

---

## 🗺️ Layout Wireframe

```
┌─────────────────────────────────────────────────────────┐
│  NAVBAR: Logo v2.2-MAIN │ [🔍 Search] │ [⚙] [☾] [User] │
├───────┬───────┬─────────┬─────────┬─────────┬───────────┤
│ TOTAL │  NEW  │ ASSIGNED│ PENDING │  SOLVED │  CLOSED   │ ← STAT BAR
│  450  │  12●  │   34    │   8●red │   380   │    16     │
├───────┴───────┴─────────┼─────────┴─────────┴───────────┤
│   LEFT 40% (Chart)      │  RIGHT 60% (Tickets)           │
│                         │                                 │
│  Donut chart 500px      │  Status: NEW●  [Select All]    │
│  [  450 Total  ]        │  ┌──────────────────────────┐  │
│                         │  │ Filter bar (Project/     │  │
│  Legend rows (dark)     │  │ Priority/Date)           │  │
│  ■ NEW      12   3%    │  └──────────────────────────┘  │
│  ■ ASSIGNED 34   8%    │                                 │
│  ■ PENDING   8   2%    │  Ticket cards scrollable        │
│  ■ SOLVED  380  84%    │  dark bg + left color border   │
│  ■ CLOSED   16   4%    │                                 │
│                         │                                 │
│  [n8n●] [PG●]          │                                 │
│  Last update: xx:xx     │                                 │
└─────────────────────────┴─────────────────────────────────┘
```

---

## ✅ งานที่เสร็จแล้ว (BASE v2.1.0 — push แล้ว 16:55)

| งาน | Commit |
|---|---|
| KPI row (5 cards click-to-filter) | b934e54 |
| Quick chips (ทั้งหมด/วันนี้/7d/month/ปี) | b934e54 |
| User pill JWT | b934e54 |
| Accent navbar border-bottom | b934e54 |
| Dark mode #080f1e | b934e54 |
| Hover opacity 0.75 | b934e54 |

---

## 🐛 Bug Fixes Log

| วันที่ | บัค | แก้อย่างไร | Commit |
|---|---|---|---|
| 2026-06-25 | Dropdown ถูก ticket list บดบัง | ลบ `overflow:hidden` จาก `.ticket-list-card`, เพิ่ม `position:relative` ให้ `.ticket-header-sticky`, เพิ่ม `overflow:visible` ให้ `.right-panel` ตอน split-active | bdcda01 |

---

## ⏳ งานที่รอทำ (หลัง redesign MAIN เสร็จ)

1. SLA Indicator badge บน Ticket card (BASE) — รอรู้ threshold
2. MAIN: Method 3 notification (ลบ setInterval + toast แทน)
3. CSP: รัดให้ tight กว่านี้
4. Sync design token ไป MAIN ด้วย (done ตามแผน redesign นี้)

---

## 🔗 References

- **Railway URL (live):** https://sysnect-ticket-main-dashboard-production.up.railway.app
- **BASE local:** `d:\SYSNECT WORK SPACE\Sysnect Project Ticket\Sysnect html\html\Ticket Dash board Base test beta`
- **MAIN local:** `d:\SYSNECT WORK SPACE\Sysnect Project Ticket\Sysnect html\html\Ticket Dash board MAIN Web`
- **Railway repo:** `d:\SYSNECT WORK SPACE\Sysnect Project Ticket\Sysnect html\Railway`
- **Git push → Railway auto-deploy**
