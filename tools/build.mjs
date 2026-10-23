// สร้างไฟล์สำหรับใช้งานจริง:  npm run build
//  1) รวมไอคอน Lucide เฉพาะที่ใช้ เป็น SVG sprite ฝังใน index.html
//  2) สร้าง app.css จาก src/styles.css (Tailwind — ไม่ต้องโหลดตัวคอมไพล์ในเบราว์เซอร์)
//  3) ใส่ ?v=<hash> ท้ายไฟล์ css/js และเปลี่ยนชื่อแคชใน sw.js ให้เบราว์เซอร์โหลดไฟล์ใหม่ทุกครั้งที่มีการแก้ไข
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const NL = String.fromCharCode(10);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = p => path.join(root, p);
const read = p => readFileSync(rel(p), 'utf8');
const hash = s => createHash('sha1').update(s).digest('hex').slice(0, 8);

// ── 1. Icon sprite ───────────────────────────────────
const iconDir = rel('node_modules/lucide-static/icons');
const available = new Set(readdirSync(iconDir).filter(f => f.endsWith('.svg')).map(f => f.slice(0, -4)));
let html = read('index.html');
const app = read('app.js');
const used = new Set();
for (const m of html.matchAll(/#i-([a-z0-9-]+)/g)) used.add(m[1]);
for (const m of app.matchAll(/'([a-z0-9-]+)'/g)) if (available.has(m[1])) used.add(m[1]);
const missing = [...used].filter(n => !available.has(n) && !n.includes('$'));
if (missing.length) console.warn('⚠️  ไม่พบไอคอน:', missing.join(', '));

const symbols = [...used].filter(n => available.has(n)).sort().map(name => {
  const svg = readFileSync(path.join(iconDir, name + '.svg'), 'utf8');
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/\s*\n\s*/g, '');
  return `<symbol id="i-${name}" viewBox="0 0 24 24">${inner}</symbol>`;
});
const sprite = `<svg xmlns="http://www.w3.org/2000/svg" style="display:none">${symbols.join('')}</svg>`;
html = html.replace(/<!-- ICON-SPRITE:START -->[\s\S]*?<!-- ICON-SPRITE:END -->/,
  `<!-- ICON-SPRITE:START -->\n${sprite}\n<!-- ICON-SPRITE:END -->`);

// ── 2. CSS ───────────────────────────────────────────
execFileSync(process.execPath, [rel('node_modules/tailwindcss/lib/cli.js'),
  '-c', rel('tailwind.config.js'), '-i', rel('src/styles.css'), '-o', rel('app.css'), '--minify'],
  { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] });

// ── 3. Version stamps ────────────────────────────────
const versions = {};
for (const f of ['app.css', 'app.js', 'config.js']) {
  versions[f] = hash(read(f));
  html = html.replace(new RegExp(`((?:href|src)=")${f.replace('.', '\\.')}(?:\\?v=[^"]*)?"`, 'g'), `$1${f}?v=${versions[f]}"`);
}
writeFileSync(rel('index.html'), html);

// ── 3b. demo.html (หน้าตัวอย่าง: ข้อมูลสมมติ ไม่ต้องเข้าสู่ระบบ ไม่ลง Service Worker) ──
const demo = html
  .replace('<title>ระบบลงทะเบียนอุปกรณ์ - บริษัท ศาลาโอสถรีเทล จำกัด</title>',
    '<title>ตัวอย่างระบบลงทะเบียนอุปกรณ์ (Demo) - บริษัท ศาลาโอสถรีเทล จำกัด</title>' + NL + '  <meta name="robots" content="noindex">')
  .replace('<link rel="manifest" href="manifest.webmanifest">', '')
  .replace('<script src="config.js', '<script>window.DEMO_MODE = true;</script>' + NL + '  <script src="config.js');
writeFileSync(rel('demo.html'), demo);

const cacheName = 'sala-inventory-' + hash(Object.values(versions).join('') + hash(html) + read('mock-api.js'));
const sw = read('sw.js').replace(/const CACHE = '[^']*';/, `const CACHE = '${cacheName}';`);
writeFileSync(rel('sw.js'), sw);

const kb = f => (Buffer.byteLength(read(f)) / 1024).toFixed(1) + ' KB';
console.log(`✅ icons: ${symbols.length} · demo.html ${kb('demo.html')} · app.css ${kb('app.css')} · app.js ${kb('app.js')} · index.html ${kb('index.html')} · cache ${cacheName}`);
