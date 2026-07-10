/* SYSNECT Ticket Dashboard — Service Worker
 * กลยุทธ์: network-first สำหรับไฟล์ same-origin (กัน CSS/JS ค้าง cache เก่า)
 *          + fallback เป็น cache ตอน offline เท่านั้น
 *          ปล่อย cross-origin (n8n / auth SSO / CDN) ผ่านตรงๆ ไม่แตะ
 * ⚠️ bump CACHE version ทุกครั้งที่แก้ asset หลัก เพื่อล้าง cache เก่า
 */
const CACHE = 'sysnect-v6';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './sysnect-logo.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(APP_SHELL).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (_) { return; }

  // ปล่อย cross-origin ผ่านตรงๆ — ไม่ cache API/auth/CDN (กัน SSO/ข้อมูลพัง)
  if (url.origin !== self.location.origin) return;

  // network-first: ลองโหลดสดก่อนเสมอ → cache สำเนาล่าสุด → offline ค่อย fallback cache
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then((cached) => {
        if (cached) return cached;
        // fallback เป็น index.html เฉพาะตอนเปิดหน้า (navigation) — ไม่ใช่ asset อื่น กัน MIME เพี้ยน
        if (req.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      }))
  );
});
