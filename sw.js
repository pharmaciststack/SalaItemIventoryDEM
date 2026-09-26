// Service Worker — ติดตั้งเป็นแอปได้ และเปิดหน้าแอปได้เร็ว
// - หน้า HTML: ใช้จากเน็ตก่อน (รอไม่เกิน 3 วินาที) ถ้าช้า/ออฟไลน์ใช้ของที่แคชไว้
// - ไฟล์ที่มี ?v=<hash> (app.css, app.js, config.js): ชื่อไฟล์เปลี่ยนเมื่อแก้ไข → ใช้จากแคชได้ทันที
// - ไลบรารีจาก CDN (ระบุเวอร์ชันแน่นอน) และฟอนต์: ใช้จากแคชก่อน
// - ไม่แคช API (Apps Script), Google Sign-In และรูปจาก Google Drive
// ชื่อแคชด้านล่างถูกเปลี่ยนอัตโนมัติโดย `npm run build`
const CACHE = 'sala-inventory-e7e52346';
const SHELL = ['./', './index.html', './logo.png', './icon-192.png', './icon-512.png', './manifest.webmanifest'];
const CDN_HOSTS = ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('sala-inventory-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const put = (req, res) => { if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; };

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (url.searchParams.has('v')) {                       // ไฟล์มีเวอร์ชัน → แคชก่อน
      e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => put(req, res))));
      return;
    }
    const network = fetch(req).then(res => put(req, res));
    const fallback = () => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('./index.html'));
    const timeout = new Promise(resolve => setTimeout(resolve, 3000));
    e.respondWith(Promise.race([network, timeout]).then(res => res || fallback()).catch(fallback));
    return;
  }

  if (CDN_HOSTS.includes(url.hostname)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => put(req, res))));
  }
  // อย่างอื่น (script.google.com, accounts.google.com, drive.google.com) ปล่อยผ่านตามปกติ
});
