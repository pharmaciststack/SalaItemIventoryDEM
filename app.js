/* =====================================================
   ระบบลงทะเบียนอุปกรณ์ (Sala-Inventory) — ส่วนการทำงานของหน้าเว็บ
   โหลดหลัง config.js · ไอคอนมาจาก SVG sprite ใน index.html (สร้างด้วย npm run build)
   ===================================================== */

// ==================== Constants ====================
const IS_LOCAL = ['localhost', '127.0.0.1', ''].includes(location.hostname);
const DEMO = !!window.DEMO_MODE;   // หน้า demo.html — ข้อมูลสมมติ ไม่ต้องเข้าสู่ระบบ
const MOCK = DEMO || (IS_LOCAL && (new URLSearchParams(location.search).has('mock') || !/^https:\/\//.test(APPS_SCRIPT_URL)));
const SESSION_KEY = MOCK ? 'inv_session_mock' : 'inv_session';

const CATS = [
  { p: 'PC', v: 'คอมพิวเตอร์', icon: 'monitor' },
  { p: 'PT', v: 'ปริ้นเตอร์/เครื่องพิมพ์ฉลาก', icon: 'printer' },
  { p: 'PH', v: 'โทรศัพท์/แทปเลต', icon: 'smartphone' },
  { p: 'EP', v: 'อุปกรณ์พ่วงคอมพิวเตอร์อื่นๆ', icon: 'mouse' },
  { p: 'EE', v: 'อุปกรณ์อิเลคทรอนิกส์อื่นๆ', icon: 'plug' },
  { p: 'CA', v: 'กล้องวงจรปิด', icon: 'video' },
];
const STATUS = {
  'ใช้งาน':      { cls: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', icon: 'check-circle-2', bar: '#16b35d' },
  'สำรอง':       { cls: 'bg-sky-50 text-sky-700 ring-sky-600/20',             icon: 'archive',        bar: '#0ea5e9' },
  'ส่งซ่อม':      { cls: 'bg-amber-50 text-amber-800 ring-amber-600/25',       icon: 'wrench',         bar: '#f59e0b' },
  'ชำรุด':       { cls: 'bg-red-50 text-red-700 ring-red-600/20',             icon: 'alert-triangle', bar: '#ef4444' },
  'จำหน่ายแล้ว':  { cls: 'bg-slate-100 text-slate-600 ring-slate-500/20',      icon: 'package-x',      bar: '#94a3b8' },
};
const PROBLEM_STATUSES = ['ส่งซ่อม', 'ชำรุด'];
const DISPOSED = 'จำหน่ายแล้ว';
const ACTION_LABEL = { create: 'ลงทะเบียน', update: 'แก้ไข', status: 'เปลี่ยนสถานะ', transfer: 'ย้ายสาขา', delete: 'ลบรายการ',
                       check: 'ตรวจนับ', dispose: 'แจ้งจำหน่าย', void: 'ยกเลิกรายงานจำหน่าย' };
const ACTION_ICON  = { create: 'plus-circle', update: 'pencil', status: 'refresh-cw', transfer: 'arrow-left-right', delete: 'trash-2',
                       check: 'clipboard-check', dispose: 'file-minus', void: 'undo-2' };
const FIELD_LABEL  = { name: 'ชื่อ', category: 'หมวดหมู่', machineNo: 'เครื่องที่', warranty: 'วันหมดประกัน', spec: 'สเปค',
                       note: 'หมายเหตุ', code: 'รหัส', status: 'สถานะ', branch: 'สาขา', check: 'ผลตรวจ' };
const CHECK = {
  'ปกติ':  { cls: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', icon: 'check-circle-2', text: 'text-emerald-700', btn: 'ring-2 ring-emerald-500 bg-emerald-50 text-emerald-800' },
  'ชำรุด': { cls: 'bg-amber-50 text-amber-800 ring-amber-600/25',       icon: 'alert-triangle', text: 'text-amber-700',   btn: 'ring-2 ring-amber-500 bg-amber-50 text-amber-800' },
  'ไม่พบ': { cls: 'bg-red-50 text-red-700 ring-red-600/20',             icon: 'search-x',       text: 'text-red-700',     btn: 'ring-2 ring-red-500 bg-red-50 text-red-800' },
};
const DISPOSE_METHODS = ['ขาย', 'ทิ้ง/ทำลาย', 'ส่งคืนผู้ขาย/บริษัท', 'บริจาค', 'สูญหาย', 'อื่นๆ'];
const MAX_PHOTOS = 3;

// เมนูหลัก (เรียงตามลำดับที่แสดง) — แท็บแรกคือหน้าแรกหลังเข้าสู่ระบบ
const TABS = [
  { id: 'register',  label: 'ลงทะเบียน',        short: 'ลงทะเบียน', icon: 'plus-circle' },
  { id: 'console',   label: 'เช็คสต็อกสาขา',   short: 'สาขาฉัน',  icon: 'clipboard-check' },
  { id: 'dashboard', label: 'แดชบอร์ด',        short: 'ภาพรวม',   icon: 'layout-dashboard', admin: true },
  { id: 'search',    label: 'ค้นหา/แก้ไข',      short: 'ค้นหา',    icon: 'search' },
  { id: 'disposals', label: 'รายงานจำหน่าย',    short: 'จำหน่าย',  icon: 'file-minus' },
  { id: 'print',     label: 'พิมพ์ QR / ส่งออก', short: 'พิมพ์',    icon: 'printer' },
];

// ==================== State ====================
const S = {
  session: null, user: null, items: [], loaded: false, tab: null,
  codeManual: false, lastCreated: null, detailRow: null,
  limit: 60, printSel: new Set(), activity: null, activityAt: 0, scanner: null,
  reports: null, consoleFilter: 'todo', consoleBranch: '', scanMode: null, photos: [],
};

// ==================== Utils ====================
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ic = (name, cls = 'w-4 h-4') => `<svg class="ico ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const pad2 = n => String(n).padStart(2, '0');
const isAdmin = () => S.user && S.user.role === 'admin';
const catOf = v => CATS.find(c => c.v === v) || { p: '??', v: v || '-', icon: 'box' };

function branchCode(b) {
  const m = /^\s*(\d{1,2})(?!\d)/.exec(String(b || ''));
  return m ? m[1].padStart(2, '0') : '';
}
const BRANCH_BY_CODE = Object.fromEntries(BRANCH_LIST.map(b => [branchCode(b), b]));
const isKnownBranch = b => !!BRANCH_BY_CODE[branchCode(b)];
const branchLabel = b => BRANCH_BY_CODE[branchCode(b)] || (String(b || '').trim() ? `ไม่รู้จักสาขา (${String(b).trim()})` : 'ไม่ระบุสาขา');

function todayStart() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function warrantyInfo(w) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(w || '')) return null;
  const d = new Date(w + 'T00:00:00');
  return { date: d, days: Math.round((d - todayStart()) / 86400000) };
}
function thaiDate(w) {
  const d = typeof w === 'string' ? new Date(w.length <= 10 ? w + 'T00:00:00' : w.replace(' ', 'T')) : w;
  if (isNaN(d)) return w || '-';
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
}
function thaiDateTime(s) {
  if (!s) return '-';
  const d = new Date(String(s).replace(' ', 'T'));
  if (isNaN(d)) return s;
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) + ' ' + d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}
function normKey(name) {
  const s = String(name || '').toLowerCase();
  const latin = s.replace(/[^a-z0-9]/g, '');
  // ชื่อที่ไม่มีตัวอักษรอังกฤษพอ (เช่นภาษาไทยล้วน) ใช้การตัดเว้นวรรคและเครื่องหมายออกแทน
  return latin.length >= 5 ? latin : s.replace(/[\s\-_.,/()[\]{}'"!?+*&%$#@:;|\\<>=~`^]/g, '');
}
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('โหลดไม่สำเร็จ: ' + src));
    document.head.appendChild(s);
  });
}
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
let loadingCount = 0;
function setLoading(on) {
  loadingCount = Math.max(0, loadingCount + (on ? 1 : -1));
  $('loading-bar').classList.toggle('hidden', !loadingCount);
}

function showToast(msg, type = 'success') {
  const cfg = {
    success: ['bg-emerald-500', 'check'], error: ['bg-red-500', 'x'],
    warn: ['bg-amber-500', 'alert-triangle'], info: ['bg-sky-500', 'info'],
  }[type] || ['bg-sky-500', 'info'];
  const inner = $('toast-inner');
  inner.classList.remove('animate-toast-in'); void inner.offsetWidth; inner.classList.add('animate-toast-in');
  $('toast-icon').className = `w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-white ${cfg[0]}`;
  $('toast-icon').innerHTML = ic(cfg[1], 'w-4 h-4 stroke-[2.5]');
  $('toast-msg').textContent = msg;
  $('toast').classList.remove('hidden');
  clearTimeout(showToast.t);
  showToast.t = setTimeout(() => $('toast').classList.add('hidden'), type === 'error' ? 5000 : 2600);
}

const SPINNER = '<svg class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path></svg>';
async function busy(btn, fn) {
  if (btn && btn.disabled) return;
  const html = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = SPINNER + ' กำลังบันทึก...';
  }
  try { return await fn(); }
  finally { if (btn) { btn.disabled = false; btn.innerHTML = html; } }
}

// ==================== QR ====================
function qrSvg(text) {
  const qr = qrcode(0, 'M');
  qr.addData(String(text));
  qr.make();
  const n = qr.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c},${r}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 ${n + 2} ${n + 2}" shape-rendering="crispEdges"><rect x="-1" y="-1" width="${n + 2}" height="${n + 2}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
function stickerHTML(it, cm = 3) {
  return `<div class="stk" style="--w:${cm}cm"><div class="stk-name">${esc(it.name)}</div><div class="stk-qr">${qrSvg(it.code)}</div><div class="stk-code">${esc(it.code)}</div></div>`;
}
function printItems(items, cm = 3) {
  items = items.filter(Boolean);
  if (!items.length) { showToast('ยังไม่ได้เลือกรายการที่จะพิมพ์', 'warn'); return; }
  printHTML(`<div class="stk-sheet">${items.map(it => stickerHTML(it, cm)).join('')}</div>`);
}

// พิมพ์เนื้อหาใดๆ ผ่าน #print-area (รอรูปโหลดเสร็จก่อนสั่งพิมพ์)
async function printHTML(html) {
  const area = $('print-area');
  area.innerHTML = html;
  const imgs = [...area.querySelectorAll('img')];
  await Promise.race([
    Promise.all(imgs.map(img => img.complete ? null : new Promise(r => { img.onload = img.onerror = r; }))),
    new Promise(r => setTimeout(r, 6000)),
  ]);
  document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); area.innerHTML = ''; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => window.print(), 50);
}

function reportHead(title, right) {
  return `<div class="rpt-head"><img src="logo.png" alt=""><div class="rpt-title"><h1>บริษัท ศาลาโอสถรีเทล จำกัด</h1><p>${title}</p></div><div class="rpt-no">${right}</div></div>`;
}
function signBlocks(labels) {
  return `<div class="rpt-signs">${labels.map(l => `<div><div class="line"></div><p>(.......................................................)</p><p>${l}</p><p>วันที่ ......../......../........</p></div>`).join('')}</div>`;
}

function printDisposalReport() {
  const r = S.currentReport;
  if (!r) return;
  const tr = (k, v) => `<tr><th>${k}</th><td>${v}</td></tr>`;
  printHTML(`<div class="rpt">
    ${r.state === 'voided' ? '<div class="rpt-void">ยกเลิกแล้ว</div>' : ''}
    ${reportHead('รายงานการจำหน่ายอุปกรณ์', `เลขที่ <b>${esc(r.id)}</b><br>วันที่บันทึก ${esc(thaiDateTime(r.createdAt))}`)}
    <table class="rpt-table">
      ${tr('ชื่ออุปกรณ์', `<b>${esc(r.name)}</b>`)}${tr('รหัสอุปกรณ์', esc(r.code))}${tr('หมวดหมู่', esc(r.category))}
      ${tr('สาขา', esc(branchLabel(r.branch)))}${tr('เครื่องที่', esc(r.machineNo || '-'))}${tr('สถานะก่อนจำหน่าย', esc(r.prevStatus || '-'))}
      ${tr('วิธีการจำหน่าย', `<b>${esc(r.method)}</b>`)}${tr('วันที่จำหน่าย', esc(thaiDate(r.date)))}
      ${tr('ผู้จำหน่ายสินค้าออก', `<b>${esc(r.disposer)}</b>`)}${tr('ผู้บันทึกรายงาน', esc(r.reportedBy))}
      ${tr('หมายเหตุ / เหตุผล', esc(r.reason).replace(/\n/g, '<br>'))}
      ${r.state === 'voided' ? tr('ยกเลิกรายงาน', `${esc(r.voidedBy)} · ${esc(thaiDateTime(r.voidedAt))} · ${esc(r.voidReason)}`) : ''}
    </table>
    <p class="rpt-sub">รูปถ่ายประกอบรายงาน</p>
    <div class="rpt-photos">${r.photos.map(p => `<img src="${esc(p.url)}" referrerpolicy="no-referrer" alt="">`).join('')}</div>
    ${signBlocks(['ผู้จำหน่ายสินค้าออก', 'ผู้จัดการสาขา / ผู้ตรวจสอบ', 'ผู้อนุมัติ'])}
  </div>`);
}

function printCheckReport() {
  const all = consoleItems().filter(it => it.status !== DISPOSED).sort(byCategoryMachine);
  if (!all.length) { showToast('ไม่มีรายการในสาขานี้', 'warn'); return; }
  const done = all.filter(checkedThisRound);
  const cnt = r => done.filter(it => it.lastCheckResult === r).length;
  printHTML(`<div class="rpt">
    ${reportHead('ใบรายงานการตรวจนับอุปกรณ์ประจำเดือน', `สาขา <b>${esc(branchLabel(S.consoleBranch))}</b><br>รอบ ${esc(roundLabel())} · พิมพ์ ${esc(thaiDateTime(new Date().toISOString()))}`)}
    <p class="rpt-sum">ทั้งหมด ${all.length} เครื่อง · ตรวจแล้ว ${done.length} · ปกติ ${cnt('ปกติ')} · ชำรุด ${cnt('ชำรุด')} · ไม่พบ ${cnt('ไม่พบ')} · ยังไม่ตรวจ ${all.length - done.length}</p>
    <table class="rpt-list">
      <thead><tr><th>#</th><th>รหัส</th><th>ชื่ออุปกรณ์</th><th>เครื่องที่</th><th>สถานะ</th><th>ผลตรวจ</th><th>วันที่ตรวจ</th><th>หมายเหตุ</th></tr></thead>
      <tbody>${all.map((it, i) => { const d = checkedThisRound(it); return `<tr><td>${i + 1}</td><td class="mono">${esc(it.code)}</td><td>${esc(it.name)}</td>
        <td>${esc(it.machineNo || '-')}</td><td>${esc(it.status)}</td><td>${d ? esc(it.lastCheckResult) : '☐ ปกติ ☐ ชำรุด ☐ ไม่พบ'}</td>
        <td>${d ? esc(thaiDate(it.lastCheckAt.slice(0, 10))) : ''}</td><td></td></tr>`; }).join('')}</tbody>
    </table>
    ${signBlocks(['ผู้ตรวจนับ', 'ผู้จัดการสาขา', 'ฝ่าย IT'])}
  </div>`);
}

// ==================== API ====================
async function api(action, payload = {}) {
  const body = { action, session: S.session, ...payload };
  let res;
  try {
    if (MOCK) {
      res = await MockAPI.call(body);
    } else {
      const r = await fetch(APPS_SCRIPT_URL, {
        method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body), redirect: 'follow',
      });
      res = await r.json();
    }
  } catch (e) {
    console.error(e);
    res = { ok: false, error: 'network', message: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ต' };
  }
  if (!res.ok && res.error === 'unauthorized' && action !== 'login') {
    clearSession();
    showLogin('หมดเวลาการเข้าสู่ระบบ กรุณาเข้าสู่ระบบอีกครั้ง');
  }
  return res;
}
const errMsg = res => res.message || ({ forbidden: 'ไม่มีสิทธิ์ทำรายการนี้', network: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้' }[res.error]) || res.error || 'เกิดข้อผิดพลาด';

// ==================== Session & Auth ====================
function saveSession(token, exp) {
  S.session = token;
  try { localStorage.setItem(SESSION_KEY, JSON.stringify({ token, exp })); } catch (e) {}
}
function loadSession() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if (s && s.exp > Date.now() + 60000) { S.session = s.token; return true; }
  } catch (e) {}
  return false;
}
function clearSession() {
  S.session = null;
  try { localStorage.removeItem(SESSION_KEY); localStorage.removeItem(BOOT_KEY); } catch (e) {}
}

// แคชข้อมูลผู้ใช้ + รายการอุปกรณ์ไว้ในเครื่อง → เปิดแอปครั้งถัดไปแสดงผลได้ทันที แล้วค่อยซิงก์กับเซิร์ฟเวอร์เบื้องหลัง
const BOOT_KEY = MOCK ? 'inv_boot_mock' : 'inv_boot';
function loadBootCache() {
  try {
    const c = JSON.parse(localStorage.getItem(BOOT_KEY) || 'null');
    if (c && c.token === S.session && c.user && Array.isArray(c.items)) return c;
  } catch (e) {}
  return null;
}
const saveBootCache = debounce(() => {
  if (!S.session || !S.user || !S.loaded) return;
  try { localStorage.setItem(BOOT_KEY, JSON.stringify({ token: S.session, user: S.user, items: S.items, savedAt: Date.now() })); } catch (e) {}
}, 600);

function showOnly(screen) {
  ['register-screen', 'pending-screen'].forEach(id => {
    $(id).classList.toggle('hidden', id !== screen);
    $(id).classList.toggle('flex', id === screen);
  });
}
function showLogin(message) {
  const ls = $('login-screen');
  ls.style.display = '';
  ls.classList.remove('hiding');
  $('login-checking').classList.add('hidden');
  $('login-message').textContent = message || '';
  $('login-message').classList.toggle('hidden', !message);
  if (!MOCK) initGoogle();
}
function hideLogin() {
  const ls = $('login-screen');
  ls.classList.add('hiding');
  setTimeout(() => { if (ls.classList.contains('hiding')) ls.style.display = 'none'; }, 300);
}

// โหลด Google Sign-In เฉพาะตอนต้องแสดงหน้าเข้าสู่ระบบ (ผู้ใช้ที่ล็อกอินค้างไว้ไม่ต้องโหลด)
let googleReady = null;
function initGoogle() {
  if (googleReady) return googleReady;
  googleReady = loadScript('https://accounts.google.com/gsi/client').then(() => {
    google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: onGoogleCredential, auto_select: true, cancel_on_tap_outside: true });
    google.accounts.id.renderButton($('g-btn'), { theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill', locale: 'th', width: 280 });
  }).catch(() => { googleReady = null; $('g-error').classList.remove('hidden'); });
  return googleReady;
}

async function onGoogleCredential(resp) {
  $('login-checking').classList.remove('hidden');
  $('login-message').classList.add('hidden');
  const res = await api('login', { idToken: resp.credential, withItems: true });
  if (!res.ok) { showLogin('เข้าสู่ระบบไม่สำเร็จ: ' + errMsg(res)); return; }
  saveSession(res.session, res.expiresAt);
  afterAuth(res.user, res.items);
}

async function mockLogin(role) {
  $('login-checking').classList.remove('hidden');
  const res = await api('login', { mockRole: role, withItems: true });
  if (!res.ok) { showLogin(errMsg(res)); return; }
  saveSession(res.session, res.expiresAt);
  afterAuth(res.user, res.items);
}

function afterAuth(user, items) {
  S.user = user;
  hideLogin();
  if (!user.registered) {
    $('reg-email').textContent = user.email;
    $('reg-branch').innerHTML = branchOptions(user.branch, '-- เลือกสาขา --');
    showOnly('register-screen');
  } else if (user.status !== 'approved') {
    $('pending-email').textContent = user.email;
    $('mock-approve').classList.toggle('hidden', !MOCK);
    showOnly('pending-screen');
  } else {
    showOnly(null);
    enterApp(items);
  }
}

async function submitUserRegistration(btn) {
  const branch = $('reg-branch').value;
  if (!branch) { $('reg-error').textContent = 'กรุณาเลือกสาขา'; $('reg-error').classList.remove('hidden'); return; }
  $('reg-error').classList.add('hidden');
  await busy(btn, async () => {
    const res = await api('registerUser', { branch });
    if (!res.ok) { $('reg-error').textContent = 'ลงทะเบียนไม่สำเร็จ: ' + errMsg(res); $('reg-error').classList.remove('hidden'); return; }
    afterAuth(res.user);
  });
}

async function recheckApproval(btn) {
  await busy(btn, async () => {
    const res = await api('me', { withItems: true });
    if (res.ok) {
      if (res.user.status === 'approved') showToast('ได้รับการอนุมัติแล้ว ยินดีต้อนรับ!');
      else showToast('ยังไม่ได้รับการอนุมัติ', 'warn');
      afterAuth(res.user, res.items);
    }
  });
}

function signOut(skipConfirm) {
  if (DEMO) { if (confirm('เริ่มดูตัวอย่างใหม่ (ล้างข้อมูลสมมติ)?')) mockReset(); return; }
  if (!skipConfirm && !confirm('ต้องการออกจากระบบ?')) return;
  api('logout');
  clearSession();
  try { google.accounts.id.disableAutoSelect(); } catch (e) {}
  location.reload();
}

function mockApproveMe() { MockAPI.approve(S.user.email); recheckApproval(); }
function mockReset() {
  if (!confirm('รีเซ็ตข้อมูลทดสอบทั้งหมดกลับเป็นค่าเริ่มต้น?')) return;
  MockAPI.reset();
  try { localStorage.removeItem(BOOT_KEY); } catch (e) {}
  location.reload();
}

// ==================== App ====================
function enterApp(items) {
  $('app').classList.remove('hidden');
  $('app').classList.add('flex');
  renderUserHeader();
  $('mock-banner').classList.toggle('hidden', !MOCK);
  if (DEMO) $('mock-banner').innerHTML = 'ตัวอย่างระบบ (Demo) — ข้อมูลสมมติทั้งหมด ไม่ใช่ข้อมูลจริงของบริษัท ' +
    '<button onclick="mockReset()" class="underline underline-offset-2 ml-1 font-semibold">เริ่มใหม่</button>';
  applyRoleUI();
  renderNav();
  if (!S.tab) switchTab(new URLSearchParams(location.search).get('tab') || visibleTabs()[0].id);
  if (items) setItems(items, true); else loadItems();
  if (!isAdmin() && !S.myBranch) showToast('บัญชีนี้ยังไม่ได้ระบุสาขาที่ถูกต้อง กรุณาติดต่อแอดมิน', 'error');

  const deepCode = new URLSearchParams(location.search).get('code');
  if (deepCode && S.loaded) openByCode(deepCode);
}

function renderUserHeader() {
  // โหมด demo ไม่มีการเข้าสู่ระบบ จึงไม่แสดงชื่อผู้ใช้/ปุ่มออกจากระบบ
  $('user-chip').classList.toggle('hidden', DEMO);
  if (DEMO) return;
  const u = S.user;
  const initial = esc((u.name || u.email || '?').trim().charAt(0).toUpperCase());
  $('user-avatar').innerHTML = u.picture
    ? `<img src="${esc(u.picture)}" alt="" referrerpolicy="no-referrer" class="w-full h-full object-cover">` : initial;
  $('user-name').textContent = u.name || '';
  $('user-email').textContent = (isAdmin() ? 'แอดมิน · ' : '') + u.email;
}

// ซิงก์กับเซิร์ฟเวอร์เบื้องหลัง (หลังแสดงผลจากแคชแล้ว)
async function revalidate() {
  setLoading(true);
  const res = await api('me', { withItems: true });
  setLoading(false);
  if (!res.ok) return;
  const before = JSON.stringify([S.user.role, S.user.branch, S.user.status]);
  if (res.user.status !== 'approved' || !res.user.registered) { afterAuth(res.user); return; }
  S.user = res.user;
  if (JSON.stringify([S.user.role, S.user.branch, S.user.status]) !== before) {
    renderUserHeader(); applyRoleUI(); renderNav(); switchTab(S.tab);
  }
  if (res.items) setItems(res.items);
}

// พนักงานผูกกับสาขาที่ลงทะเบียนไว้ — ล็อกตัวเลือกสาขาทุกหน้า (เซิร์ฟเวอร์ก็กรองข้อมูลให้อีกชั้น)
function applyRoleUI() {
  const admin = isAdmin();
  S.myBranch = BRANCH_BY_CODE[branchCode(S.user.branch)] || '';
  const bb = $('branch-badge');
  bb.innerHTML = ic('store', 'w-3.5 h-3.5') + esc(S.myBranch || 'ไม่ระบุสาขา');
  bb.classList.toggle('hidden', admin);
  bb.classList.toggle('inline-flex', !admin);
  ['s-branch', 'p-branch', 'r-branch'].forEach(id => $(id).classList.toggle('hidden', !admin));
  const fb = $('f-branch');
  if (!admin) { fb.innerHTML = branchOptions(S.myBranch, S.myBranch ? undefined : '-- ไม่มีสาขา --'); fb.disabled = true; }
  else if (fb.disabled) { fb.disabled = false; fb.innerHTML = branchOptions('', '-- เลือกสาขา --'); }
  $('c-branch').classList.toggle('hidden', !admin);
  if (!admin || !S.consoleBranch) S.consoleBranch = S.myBranch || '';   // พนักงานล็อกสาขาตัวเองเสมอ
}

const DEMO_HIDDEN_TABS = ['console', 'disposals'];   // demo ยังไม่โชว์ เช็คสต็อก/จำหน่าย
function visibleTabs() {
  return TABS.filter(t => (!t.admin || isAdmin()) && !(DEMO && DEMO_HIDDEN_TABS.includes(t.id)));
}

function renderNav() {
  // มือถือใช้ชื่อสั้น เพื่อให้เห็นแท็บได้มากขึ้นโดยไม่ต้องเลื่อน
  $('top-nav').innerHTML = visibleTabs().map(t => `<button onclick="switchTab('${t.id}')" data-tab="${t.id}" class="tab">
      ${ic(t.icon)}<span class="sm:hidden">${t.id === 'console' && isAdmin() ? 'เช็คสต็อก' : t.short}</span><span class="hidden sm:inline">${t.label}</span></button>`).join('');
}

function setItems(items, fresh) {
  S.items = items;
  S.loaded = true;
  S.loadedAt = new Date();
  S.activity = null;
  $('record-count-badge').textContent = S.items.length.toLocaleString() + ' รายการ';
  saveBootCache();
  renderCurrent();
  if (fresh) { suggestMachine(); regenCode(); }
}

async function loadItems(silent) {
  setLoading(true);
  const res = await api('list');
  setLoading(false);
  if (!res.ok) {
    if (res.error !== 'unauthorized') showToast('โหลดข้อมูลไม่สำเร็จ: ' + errMsg(res), 'error');
    return false;
  }
  setItems(res.items, !silent);
  return true;
}

async function refreshData() {
  if (await loadItems(true)) showToast('อัปเดตข้อมูลล่าสุดแล้ว');
}

function renderCurrent() {
  if (S.tab === 'console') renderConsole();
  if (S.tab === 'register') renderRegisterSide();
  if (S.tab === 'search') renderSearch();
  if (S.tab === 'dashboard') renderDashboard();
  if (S.tab === 'disposals') renderDisposals();
  if (S.tab === 'print') renderPrint();
  if (S.detailRow && !$('detail-modal').classList.contains('hidden')) {
    if (currentDetail()) renderDetail(); else closeDetail();
  }
}

function switchTab(tab) {
  if (!visibleTabs().some(t => t.id === tab)) tab = visibleTabs()[0].id;
  const changed = S.tab !== tab;
  S.tab = tab;
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('hidden', v.id !== 'view-' + tab));
  document.querySelectorAll('#top-nav .tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  // มือถือ: เลื่อนแถบให้เห็นแท็บที่เลือกอยู่
  const active = document.querySelector(`#top-nav [data-tab="${tab}"]`);
  if (active) active.scrollIntoView({ block: 'nearest', inline: 'center' });
  stopScanner();
  renderCurrent();
  if (changed) window.scrollTo({ top: 0 });
}

function branchOptions(selected, placeholder) {
  return (placeholder !== undefined ? `<option value="">${esc(placeholder)}</option>` : '') +
    BRANCH_LIST.map(b => `<option value="${esc(b)}" ${b === selected ? 'selected' : ''}>${esc(b)}</option>`).join('');
}
function categoryOptions(selected, placeholder) {
  return (placeholder !== undefined ? `<option value="">${esc(placeholder)}</option>` : '') +
    CATS.map(c => `<option value="${esc(c.v)}" ${c.v === selected ? 'selected' : ''}>${c.p} - ${esc(c.v)}</option>`).join('');
}
function statusOptions(selected, placeholder, exclude = []) {
  return (placeholder !== undefined ? `<option value="">${esc(placeholder)}</option>` : '') +
    Object.keys(STATUS).filter(s => !exclude.includes(s)).map(s => `<option value="${esc(s)}" ${s === selected ? 'selected' : ''}>${esc(s)}</option>`).join('');
}
function statusBadge(status) {
  const st = STATUS[status] || STATUS['ใช้งาน'];
  return `<span class="badge ${st.cls}">${ic(st.icon)}${esc(status)}</span>`;
}
function warrantyChip(w, long) {
  const wi = warrantyInfo(w);
  if (!wi) return long ? '<span class="text-slate-400">ไม่ระบุ</span>' : '';
  if (wi.days < 0) return `<span class="badge bg-red-50 text-red-700 ring-red-600/20">${ic('shield-off')}หมดประกัน${long ? ' ' + thaiDate(w) : ''}</span>`;
  if (wi.days <= 90) return `<span class="badge bg-amber-50 text-amber-800 ring-amber-600/25">${ic('shield-alert')}ประกันเหลือ ${wi.days} วัน${long ? ' (' + thaiDate(w) + ')' : ''}</span>`;
  return long ? `<span class="inline-flex items-center gap-1 text-sm text-slate-700">${ic('shield-check', 'w-3.5 h-3.5 text-emerald-600')}ถึง ${thaiDate(w)}</span>` : '';
}
function catTile(it, size = 'w-11 h-11') {
  return `<span class="${size} shrink-0 rounded-xl bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100 flex items-center justify-center">${ic(catOf(it.category).icon, 'w-5 h-5')}</span>`;
}
function itemCard(it, extraLine = '') {
  return `<button type="button" data-open="${it.row}" class="row-card">
    ${catTile(it)}
    <span class="flex-1 min-w-0">
      <span class="flex items-center gap-2 flex-wrap"><span class="font-semibold text-slate-900 text-[15px] leading-snug break-words">${esc(it.name) || '-'}</span>${it.status !== 'ใช้งาน' ? statusBadge(it.status) : ''}</span>
      <span class="block text-xs text-slate-500 font-mono mt-0.5">${esc(it.code)}</span>
      <span class="flex items-center gap-x-2 gap-y-1 flex-wrap text-xs text-slate-500 mt-1.5">
        <span class="inline-flex items-center gap-1">${ic('store', 'w-3.5 h-3.5 text-slate-400')}${esc(branchLabel(it.branch))}</span>
        <span class="inline-flex items-center gap-1">${ic('hash', 'w-3.5 h-3.5 text-slate-400')}${esc(it.machineNo || '-')}</span>${warrantyChip(it.warranty)}
      </span>${extraLine ? `<span class="block text-[11px] text-slate-400 mt-1">${extraLine}</span>` : ''}
    </span>
    ${ic('chevron-right', 'w-4 h-4 text-slate-300')}
  </button>`;
}
function skeletonCards(n = 4) {
  return Array.from({ length: n }, () => `<div class="card p-3.5 flex items-center gap-3">
    <div class="skeleton w-11 h-11 rounded-xl"></div><div class="flex-1 space-y-2"><div class="skeleton h-4 w-2/3"></div><div class="skeleton h-3 w-1/3"></div></div></div>`).join('');
}
function emptyState(icon, text) {
  return `<div class="empty md:col-span-2">${ic(icon)}<p class="text-sm">${text}</p></div>`;
}
// เปิดรายละเอียดเมื่อคลิกการ์ดใดๆ ที่มี data-open
document.addEventListener('click', e => {
  const el = e.target.closest('[data-open]');
  if (el) openDetail(Number(el.dataset.open));
});

// ==================== Register ====================
function initRegisterForm() {
  $('guide-link').href = GUIDE_URL;
  $('f-category').innerHTML = categoryOptions(CATS[0].v);
  $('f-branch').innerHTML = branchOptions('', '-- เลือกสาขา --');
  const refreshSide = debounce(renderRegisterSide, 120);
  $('f-category').addEventListener('change', () => { suggestMachine(); regenCode(); renderRegisterSide(); });
  $('f-branch').addEventListener('change', () => { suggestMachine(); regenCode(); renderRegisterSide(); });
  $('f-machine').addEventListener('input', () => regenCode());
  $('f-code').addEventListener('input', () => {
    S.codeManual = true;
    $('f-code').value = $('f-code').value.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    checkDuplicateCode();
  });
  $('reg-form').addEventListener('submit', e => { e.preventDefault(); submitItem(); });

  const nameInput = $('f-name');
  nameInput.addEventListener('input', () => { renderNameSuggest(); $('name-hint').classList.add('hidden'); refreshSide(); });
  nameInput.addEventListener('focus', renderNameSuggest);
  nameInput.addEventListener('blur', () => setTimeout(() => { $('name-suggest').classList.add('hidden'); checkSimilarName(); }, 150));
  $('name-suggest').addEventListener('mousedown', e => {
    const b = e.target.closest('[data-name]');
    if (!b) return;
    e.preventDefault();
    nameInput.value = b.dataset.name;
    $('name-suggest').classList.add('hidden');
    $('name-hint').classList.add('hidden');
    renderRegisterSide();
  });
  renderCodePreview();
}

function nameCounts() {
  const m = new Map();
  S.items.forEach(it => { if (it.name) m.set(it.name, (m.get(it.name) || 0) + 1); });
  return m;
}

function renderNameSuggest() {
  const q = $('f-name').value.trim().toLowerCase();
  const box = $('name-suggest');
  if (!q) { box.classList.add('hidden'); return; }
  const qk = normKey(q);
  const cat = $('f-category').value;
  const catNames = new Set(S.items.filter(it => it.category === cat).map(it => it.name));
  const matches = [...nameCounts().entries()]
    .filter(([n]) => n.toLowerCase().includes(q) || (qk.length >= 3 && normKey(n).includes(qk)))
    .sort((a, b) => (catNames.has(b[0]) - catNames.has(a[0])) || b[1] - a[1])
    .slice(0, 8);
  if (!matches.length || (matches.length === 1 && matches[0][0] === $('f-name').value)) { box.classList.add('hidden'); return; }
  box.innerHTML = matches.map(([n, c]) =>
    `<button type="button" data-name="${esc(n)}" class="w-full text-left px-3 py-2.5 rounded-lg hover:bg-brand-50 flex items-center justify-between gap-3 text-sm">
      <span class="text-slate-800 break-words">${esc(n)}</span><span class="badge bg-slate-100 text-slate-600 ring-slate-200 tabular-nums">${c} เครื่อง</span></button>`).join('');
  box.classList.remove('hidden');
}

// เตือนเมื่อพิมพ์ชื่อที่คล้ายชื่อเดิมแต่สะกดต่าง (เช่น TSC-TTP-244-Pro กับ TSC TTP-244 Pro)
function checkSimilarName() {
  const name = $('f-name').value.trim();
  const hint = $('name-hint');
  if (!name) { hint.classList.add('hidden'); return; }
  const counts = nameCounts();
  if (counts.has(name)) { hint.classList.add('hidden'); return; }
  const k = normKey(name);
  const similar = [...counts.entries()].filter(([n]) => normKey(n) === k).sort((a, b) => b[1] - a[1])[0];
  if (!similar) { hint.classList.add('hidden'); return; }
  hint.innerHTML = `มีชื่อที่คล้ายกันอยู่แล้ว: <b>${esc(similar[0])}</b> (${similar[1]} เครื่อง)
    <button type="button" id="use-similar" class="ml-1 underline font-semibold text-amber-900">ใช้ชื่อนี้</button> เพื่อให้นับจำนวนได้ถูกต้อง`;
  hint.classList.remove('hidden');
  $('use-similar').onclick = () => { $('f-name').value = similar[0]; hint.classList.add('hidden'); renderRegisterSide(); };
}

function suggestMachine() {
  const cat = $('f-category').value, branch = $('f-branch').value;
  const hint = $('machine-hint');
  if (!branch) { hint.classList.add('hidden'); return; }
  const bc = branchCode(branch);
  const same = S.items.filter(it => it.category === cat && branchCode(it.branch) === bc);
  const max = same.reduce((m, it) => Math.max(m, parseInt(it.machineNo, 10) || 0), 0);
  $('f-machine').value = max + 1;
  hint.innerHTML = same.length
    ? `สาขานี้มี <b>${esc(catOf(cat).v)}</b> แล้ว ${same.length} เครื่อง (สูงสุดเครื่องที่ ${max}) → แนะนำเครื่องที่ <b class="text-brand-700">${max + 1}</b>`
    : `ยังไม่มี <b>${esc(catOf(cat).v)}</b> ในสาขานี้ → เครื่องที่ <b class="text-brand-700">1</b>`;
  hint.classList.remove('hidden');
}

function stepMachine(d) {
  const inp = $('f-machine');
  inp.value = Math.min(99, Math.max(1, (parseInt(inp.value, 10) || 0) + d));
  regenCode();
}

function toggleCodeEdit() {
  const inp = $('f-code');
  const show = inp.classList.contains('hidden');
  inp.classList.toggle('hidden', !show);
  if (show) inp.focus();
}

function buildCode() {
  const branch = $('f-branch').value;
  if (!branch) return '';
  const d = new Date();
  const no = Math.max(1, parseInt($('f-machine').value, 10) || 1);
  return `${catOf($('f-category').value).p}${branchCode(branch)}${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}${pad2(no)}`;
}

function regenCode(force) {
  if (force) {
    if (!$('f-branch').value) { showToast('กรุณาเลือกสาขาก่อนสร้างรหัส', 'warn'); $('f-branch').focus(); return; }
    S.codeManual = false;
    $('f-code').classList.add('hidden');
  }
  if (!S.codeManual) $('f-code').value = buildCode();
  checkDuplicateCode();
}

// แสดงรหัสแยกเป็นส่วนๆ: หมวดหมู่ | สาขา | วันที่ | เครื่องที่
function renderCodePreview(dup) {
  const code = $('f-code').value.trim();
  const box = $('code-preview');
  box.className = `rounded-xl border-2 border-dashed px-3 py-3 transition-colors ${dup ? 'border-red-300 bg-red-50/60' : code ? 'border-brand-300 bg-brand-50/60' : 'border-slate-200 bg-slate-50'}`;
  const m = /^([A-Z]{2})(\d{2})(\d{8})(\d{2,})$/.exec(code);
  if (m) {
    const seg = (v, label, cls) => `<div class="flex flex-col items-center"><span class="font-mono text-lg sm:text-xl font-bold tracking-wider ${cls}">${v}</span><span class="text-[10px] text-slate-500 mt-0.5">${label}</span></div>`;
    box.innerHTML = `<div class="flex items-start justify-center gap-1.5 sm:gap-2.5">
      ${seg(m[1], 'หมวดหมู่', 'text-brand-700')}<span class="text-slate-300 font-mono text-lg sm:text-xl">·</span>
      ${seg(m[2], 'สาขา', 'text-sky-700')}<span class="text-slate-300 font-mono text-lg sm:text-xl">·</span>
      ${seg(m[3], 'วันที่ลงทะเบียน', 'text-slate-700')}<span class="text-slate-300 font-mono text-lg sm:text-xl">·</span>
      ${seg(m[4], 'เครื่องที่', 'text-amber-700')}</div>`;
  } else if (code) {
    box.innerHTML = `<p class="text-center font-mono text-lg font-bold tracking-wider text-slate-800">${esc(code)}</p>`;
  } else {
    box.innerHTML = `<p class="text-center text-sm text-slate-400 py-1">เลือกสาขาเพื่อสร้างรหัสอัตโนมัติ</p>`;
  }
}

function checkDuplicateCode() {
  const code = $('f-code').value.trim();
  const dup = code && S.items.find(it => it.code.toUpperCase() === code);
  $('code-dup').classList.toggle('hidden', !dup);
  $('code-dup').classList.toggle('flex', !!dup);
  $('f-code').classList.toggle('error', !!dup);
  $('reg-submit').disabled = !!dup;
  if (dup) $('code-dup').querySelector('span').textContent = `รหัสนี้ใช้แล้วกับ "${dup.name}" (${branchLabel(dup.branch)}) — เปลี่ยนเลขเครื่องที่`;
  renderCodePreview(!!dup);
}

async function submitItem() {
  const item = {
    category: $('f-category').value, branch: $('f-branch').value, machineNo: $('f-machine').value.trim(),
    code: $('f-code').value.trim(), name: $('f-name').value.trim(), warranty: $('f-warranty').value,
    spec: $('f-spec').value.trim(), note: $('f-note').value.trim(),
  };
  if (!item.branch) { showToast('กรุณาเลือกสาขา', 'warn'); $('f-branch').focus(); return; }
  if (!item.code)   { showToast('กรุณาสร้างรหัสอุปกรณ์', 'warn'); return; }
  if (!item.name)   { showToast('กรุณาระบุชื่ออุปกรณ์', 'warn'); $('f-name').focus(); return; }

  await busy($('reg-submit'), async () => {
    const res = await api('create', { item });
    if (!res.ok) {
      if (res.error === 'duplicate' && res.suggestion) {
        // มีคนลงทะเบียนรหัสเดียวกันไปก่อน — ใช้รหัสถัดไปที่ว่างแทน
        $('f-code').value = res.suggestion.code;
        if (res.suggestion.machineNo) $('f-machine').value = res.suggestion.machineNo;
        S.codeManual = true;
        loadItems(true);
        showToast(`รหัสซ้ำกับที่มีอยู่ เปลี่ยนเป็น ${res.suggestion.code} ให้แล้ว กรุณากดบันทึกอีกครั้ง`, 'warn');
      } else {
        showToast('บันทึกไม่สำเร็จ: ' + errMsg(res), 'error');
      }
      return;
    }
    S.items.push(res.item);
    S.lastCreated = res.item;
    S.activity = null;
    $('record-count-badge').textContent = S.items.length.toLocaleString() + ' รายการ';
    saveBootCache();
    showRegResult(res.item);
    showToast('บันทึกสำเร็จ!');
    // ล้างฟอร์ม เก็บหมวดหมู่ สาขา และชื่อรุ่นไว้ดูรายการรุ่นเดียวกัน
    ['f-name', 'f-warranty', 'f-spec', 'f-note'].forEach(id => { $(id).value = ''; });
    $('name-hint').classList.add('hidden');
    S.codeManual = false;
    suggestMachine();
    regenCode();
    S.sideName = res.item.name;   // แสดงรายการรุ่นที่เพิ่งบันทึกต่อ
    renderRegisterSide();
  });
}

function showRegResult(it) {
  $('reg-result-sticker').innerHTML = stickerHTML(it, 3.2);
  $('reg-result-name').textContent = it.name;
  $('reg-result-meta').innerHTML = `<span class="font-mono">${esc(it.code)}</span> · ${esc(branchLabel(it.branch))} · เครื่องที่ ${esc(it.machineNo || '-')}`;
  $('reg-result').classList.remove('hidden');
  if (window.innerWidth < 1024) $('reg-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function registerNextSame() {
  const it = S.lastCreated;
  if (!it) return;
  $('f-category').value = it.category;
  if (isAdmin()) $('f-branch').value = BRANCH_BY_CODE[branchCode(it.branch)] || '';
  suggestMachine();
  S.codeManual = false;
  regenCode();
  $('f-name').value = it.name;
  $('f-spec').value = '';
  $('f-note').value = '';
  renderRegisterSide();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  $('f-spec').focus({ preventScroll: true });
  showToast('เตรียมข้อมูลเครื่องถัดไปแล้ว ตรวจสอบแล้วกดบันทึก', 'info');
}

// ── แผงด้านข้าง: อุปกรณ์รุ่นเดียวกัน / หมวดเดียวกันในสาขา / ลงทะเบียนล่าสุด ──
function renderRegisterSide() {
  const typed = $('f-name').value.trim();
  if (typed) S.sideName = '';
  const name = typed || S.sideName || '';
  const branch = $('f-branch').value, bc = branchCode(branch), cat = $('f-category').value;
  const byBranchThenNo = (a, b) => ((branchCode(b.branch) === bc) - (branchCode(a.branch) === bc)) ||
    branchCode(a.branch).localeCompare(branchCode(b.branch)) || (parseInt(a.machineNo, 10) || 0) - (parseInt(b.machineNo, 10) || 0);

  let mode = 'recent', list = [], title = 'ลงทะเบียนล่าสุด', sub = '', icon = 'history', tone = 'bg-sky-50 text-sky-600';
  if (name) {
    const key = normKey(name), q = name.toLowerCase();
    list = S.items.filter(it => it.name === name || (key.length >= 3 && normKey(it.name) === key));
    if (list.length) { mode = 'model'; title = 'อุปกรณ์รุ่นเดียวกันในระบบ'; }
    else if (q.length >= 2) {
      list = S.items.filter(it => it.name.toLowerCase().includes(q));
      mode = 'similar'; title = 'ชื่อใกล้เคียงในระบบ';
    }
    sub = `ค้นจากชื่อ “${esc(name)}”`;
    icon = 'boxes'; tone = 'bg-brand-50 text-brand-700';
    list.sort(byBranchThenNo);
  }
  if (!name || (mode !== 'model' && !list.length)) {
    if (bc) {
      mode = 'branch';
      list = S.items.filter(it => it.category === cat && branchCode(it.branch) === bc).sort(byBranchThenNo);
      title = `${catOf(cat).v} ในสาขานี้`; sub = esc(branchLabel(branch)) + ' · ใช้ดูเลขเครื่องที่ที่มีอยู่แล้ว';
      icon = 'store'; tone = 'bg-amber-50 text-amber-600';
    } else if (!name) {
      mode = 'recent';
      list = [...S.items].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      title = 'ลงทะเบียนล่าสุด'; sub = S.loaded ? `ทั้งหมด ${S.items.length.toLocaleString()} รายการ` : ''; icon = 'history'; tone = 'bg-sky-50 text-sky-600';
    }
  }

  $('side-icon').className = `icon-tile ${tone}`;
  $('side-icon').innerHTML = ic(icon);
  $('side-title').textContent = title;
  $('side-sub').innerHTML = sub;
  $('side-count').textContent = mode === 'recent' ? '' : `${list.length.toLocaleString()} เครื่อง`;
  $('side-count').classList.toggle('hidden', mode === 'recent');

  // สรุปรุ่นเดียวกัน
  const summary = $('side-summary');
  const inline = $('name-inline');
  if (mode === 'model' || mode === 'similar') {
    const here = bc ? list.filter(it => branchCode(it.branch) === bc).length : 0;
    const branches = new Set(list.map(it => branchCode(it.branch))).size;
    const names = [...list.reduce((m, it) => m.set(it.name, (m.get(it.name) || 0) + 1), new Map()).entries()].sort((a, b) => b[1] - a[1]);
    const pill = (text, cls) => `<span class="badge ${cls}">${text}</span>`;
    summary.innerHTML = pill(`ทั้งหมด ${list.length} เครื่อง`, 'bg-slate-100 text-slate-700 ring-slate-200') +
      (bc ? pill(`${ic('store')}สาขานี้ ${here} เครื่อง`, here ? 'bg-brand-50 text-brand-700 ring-brand-200' : 'bg-white text-slate-500 ring-slate-200') : '') +
      pill(`${branches} สาขา`, 'bg-white text-slate-600 ring-slate-200') +
      (mode === 'model' && names.length > 1 ? `<span class="w-full text-xs text-amber-800 bg-amber-50 ring-1 ring-amber-200 rounded-lg px-2.5 py-1.5">สะกดชื่อไว้ ${names.length} แบบ: ${names.map(([n, c]) => `<b>${esc(n)}</b> (${c})`).join(', ')}</span>` : '');
    summary.classList.remove('hidden');
    inline.innerHTML = `${ic('boxes', 'w-4 h-4 text-brand-600')}<span class="flex-1">${mode === 'model' ? 'มีรุ่นนี้ในระบบแล้ว' : 'ชื่อใกล้เคียง'} <b>${list.length}</b> เครื่อง${bc ? ` · สาขานี้ <b>${here}</b>` : ''}</span><span class="font-semibold">ดูรายการ ↓</span>`;
    inline.classList.toggle('hidden', !list.length);
    inline.classList.toggle('flex', !!list.length);
  } else {
    summary.classList.add('hidden');
    inline.classList.add('hidden');
    inline.classList.remove('flex');
  }

  const LIMIT = 40;
  const row = it => {
    const here = bc && branchCode(it.branch) === bc;
    return `<button type="button" data-open="${it.row}" class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition hover:bg-slate-50 ${here && mode !== 'branch' ? 'bg-brand-50/70 hover:bg-brand-50' : ''}">
      <span class="w-10 h-10 shrink-0 rounded-lg bg-white ring-1 ring-inset ring-slate-200 flex flex-col items-center justify-center leading-none">
        <span class="text-[9px] text-slate-400">เครื่อง</span><span class="text-sm font-bold text-slate-700 tabular-nums">${esc(it.machineNo || '-')}</span></span>
      <span class="min-w-0 flex-1">
        <span class="flex items-center gap-1.5 flex-wrap"><span class="font-mono text-[13px] font-semibold text-slate-800">${esc(it.code)}</span>
          ${here && mode !== 'branch' ? '<span class="badge bg-brand-600 text-white ring-brand-600">สาขานี้</span>' : ''}</span>
        <span class="block text-xs text-slate-500 truncate">${mode === 'recent' || mode === 'similar' || it.name !== name ? `<b class="font-medium text-slate-700">${esc(it.name)}</b> · ` : ''}${esc(branchLabel(it.branch))}${mode === 'recent' ? ' · ' + esc(thaiDateTime(it.createdAt)) : ''}</span>
      </span>
      ${it.status !== 'ใช้งาน' ? statusBadge(it.status) : ''}
    </button>`;
  };
  const shown = list.slice(0, mode === 'recent' ? 8 : LIMIT);
  $('side-list').innerHTML = !S.loaded ? `<div class="p-3 space-y-3">${skeletonCards(3)}</div>`
    : shown.length ? shown.map(row).join('')
    : `<div class="empty !py-10">${ic(mode === 'branch' ? 'package-open' : 'search-x')}<p class="text-sm">${mode === 'branch' ? 'ยังไม่มีอุปกรณ์หมวดนี้ในสาขา' : name ? 'ยังไม่มีรุ่นนี้ในระบบ — จะเป็นเครื่องแรก' : 'ยังไม่มีข้อมูล'}</p></div>`;
  const more = $('side-more');
  if (list.length > shown.length && mode !== 'recent') {
    more.innerHTML = `<button type="button" class="btn btn-sm btn-ghost text-brand-700" onclick="goSearch({ q: ${esc(JSON.stringify(mode === 'branch' ? '' : name))}${mode === 'branch' ? `, branch: ${esc(JSON.stringify(branch))}, category: ${esc(JSON.stringify(cat))}` : ''} })">ดูทั้งหมด ${list.length} เครื่องในหน้าค้นหา →</button>`;
    more.classList.remove('hidden');
  } else more.classList.add('hidden');
}

// ==================== Search ====================
function initSearch() {
  $('s-branch').innerHTML = branchOptions('', 'ทุกสาขา');
  $('s-category').innerHTML = categoryOptions('', 'ทุกหมวดหมู่');
  $('s-status').innerHTML = `<option value="">ทุกสถานะ</option><option value="problem">ส่งซ่อม + ชำรุด</option>` + statusOptions('');
  const rerender = () => { S.limit = 60; renderSearch(); };
  $('s-q').addEventListener('input', debounce(rerender, 150));
  ['s-branch', 's-category', 's-status', 's-warranty'].forEach(id => $(id).addEventListener('change', rerender));
}

function matchStatus(it, f) {
  if (!f) return true;
  if (f === 'problem') return PROBLEM_STATUSES.includes(it.status);
  return it.status === f;
}
function matchWarranty(it, f) {
  if (!f) return true;
  const wi = warrantyInfo(it.warranty);
  if (f === 'none') return !wi;
  if (!wi) return false;
  return f === 'expired' ? wi.days < 0 : wi.days >= 0 && wi.days <= 90;
}

function renderSearch() {
  const q = $('s-q').value.trim().toLowerCase();
  const fb = $('s-branch').value, fc = $('s-category').value, fs = $('s-status').value, fw = $('s-warranty').value;
  const bc = fb ? branchCode(fb) : '';
  let list = S.items.filter(it =>
    (!bc || branchCode(it.branch) === bc) && (!fc || it.category === fc) && matchStatus(it, fs) && matchWarranty(it, fw) &&
    (!q || [it.code, it.name, it.spec, it.note, it.branch].some(v => String(v || '').toLowerCase().includes(q))));
  if (q) {
    const score = it => it.code.toLowerCase() === q ? 0 : it.code.toLowerCase().startsWith(q) ? 1 : it.name.toLowerCase().includes(q) ? 2 : 3;
    list.sort((a, b) => score(a) - score(b));
  } else {
    list.sort((a, b) => branchCode(a.branch).localeCompare(branchCode(b.branch)) || a.category.localeCompare(b.category, 'th') ||
      (parseInt(a.machineNo, 10) || 0) - (parseInt(b.machineNo, 10) || 0));
  }
  $('s-count').innerHTML = `พบ <b class="text-slate-900">${list.length.toLocaleString()}</b> รายการ` + (list.length > S.limit ? ` · แสดง ${S.limit}` : '');
  $('s-status-line').textContent = S.loadedAt ? 'อัปเดต ' + S.loadedAt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '';
  $('s-results').innerHTML = list.length
    ? list.slice(0, S.limit).map(it => itemCard(it)).join('')
    : S.loaded ? emptyState('package-search', 'ไม่พบอุปกรณ์ที่ตรงกับเงื่อนไข') : skeletonCards(6);
  $('s-more').classList.toggle('hidden', list.length <= S.limit);
}

function clearSearchFilters() {
  ['s-q', 's-branch', 's-category', 's-status', 's-warranty'].forEach(id => { $(id).value = ''; });
  S.limit = 60;
  renderSearch();
}

function goSearch(filters) {
  clearSearchFilters();
  Object.entries(filters).forEach(([k, v]) => { $('s-' + k).value = v; });
  switchTab('search');
  window.scrollTo({ top: 0 });
}

function openByCode(code) {
  code = String(code || '').trim().toUpperCase();
  const hits = S.items.filter(it => it.code.toUpperCase() === code);
  if (hits.length === 1) { openDetail(hits[0].row); return true; }
  goSearch({ q: code });
  if (!hits.length) showToast('ไม่พบรหัส ' + code + (isAdmin() ? '' : ' ในสาขาของคุณ'), 'warn');
  return false;
}

// กล้องสแกน QR — ใช้ร่วมกันระหว่างหน้าค้นหาและหน้าเช็คสต็อก (เปิดได้ทีละตัว)
async function openScanner(boxId, readerId, onScan) {
  stopScanner();
  $(boxId).classList.remove('hidden');
  try {
    if (!window.Html5Qrcode) await loadScript('https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js');
    const sc = new Html5Qrcode(readerId);
    S.scanner = sc;
    await sc.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 220, height: 220 } },
      text => { stopScanner(); onScan(scannedCode(text)); }, () => {});
    if (S.scanner === sc) S.scannerOn = true; else sc.stop().catch(() => {});
  } catch (e) {
    console.error(e);
    showToast('ไม่สามารถเปิดกล้องได้ กรุณาอนุญาตการใช้กล้อง', 'error');
    stopScanner();
  }
}
function stopScanner() {
  ['scanner', 'c-scanner'].forEach(id => $(id).classList.add('hidden'));
  const sc = S.scanner;
  S.scanner = null;
  if (sc && S.scannerOn) { S.scannerOn = false; sc.stop().then(() => sc.clear()).catch(() => {}); }
}
function scannedCode(text) {
  let code = String(text).trim();
  try { const u = new URL(code); code = u.searchParams.get('code') || code; } catch (e) {}
  return code.toUpperCase();
}
function startScanner() { openScanner('scanner', 'reader', onScanned); }
function onScanned(code) {
  if (openByCode(code)) showToast('สแกนสำเร็จ: ' + code);
}

// ==================== Sheet modal ====================
function openSheet(html) {
  $('sheet-body').innerHTML = html;
  const m = $('sheet-modal');
  m.classList.remove('hidden'); m.classList.add('flex');
  m.firstElementChild.scrollTop = 0;
  document.body.style.overflow = 'hidden';
}
function closeSheet() {
  const m = $('sheet-modal');
  m.classList.add('hidden'); m.classList.remove('flex');
  if ($('detail-modal').classList.contains('hidden')) document.body.style.overflow = '';
  S.photos = [];
  S.sheetRow = null;
}
const sheetOpen = () => !$('sheet-modal').classList.contains('hidden');

function sheetHeader(title, sub, icon = 'package', tone = 'bg-brand-50 text-brand-700') {
  return `<div class="sheet-head">
    <span class="icon-tile w-11 h-11 ${tone}">${ic(icon, 'w-5 h-5')}</span>
    <div class="flex-1 min-w-0"><h2 class="text-lg font-bold text-slate-900 leading-tight break-words">${title}</h2>${sub ? `<div class="text-sm text-slate-500 mt-0.5">${sub}</div>` : ''}</div>
    <button onclick="closeSheet()" class="btn btn-ghost btn-sm btn-icon -mr-1" aria-label="ปิด">${ic('x', 'w-5 h-5')}</button>
  </div>`;
}
function itemSummaryHTML(it) {
  return `<dl class="kv bg-slate-50 ring-1 ring-inset ring-slate-100 rounded-2xl px-4 py-3">
    <dt>รหัส</dt><dd class="font-mono">${esc(it.code)}</dd>
    <dt>สาขา</dt><dd>${esc(branchLabel(it.branch))}</dd>
    <dt>หมวด / เครื่องที่</dt><dd>${esc(catOf(it.category).p)} · เครื่องที่ ${esc(it.machineNo || '-')}</dd>
    <dt>สถานะ</dt><dd>${statusBadge(it.status)}</dd>
  </dl>`;
}

// ==================== Branch Console (เช็คสต็อก) ====================
// รอบตรวจนับ = เดือนปฏิทินปัจจุบัน — เครื่องที่ตรวจตั้งแต่วันที่ 1 ของเดือนนี้ถือว่า "ตรวจแล้ว"
function roundStart() { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`; }
function roundLabel() { return new Date().toLocaleDateString('th-TH', { month: 'long', year: 'numeric' }); }
function nowStamp() { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
const checkedThisRound = it => !!it.lastCheckAt && it.lastCheckAt >= roundStart();
const byCategoryMachine = (a, b) => a.category.localeCompare(b.category, 'th') || (parseInt(a.machineNo, 10) || 0) - (parseInt(b.machineNo, 10) || 0);
function consoleItems() {
  const bc = branchCode(S.consoleBranch);
  return bc ? S.items.filter(it => branchCode(it.branch) === bc) : [];
}
function checkChip(it) {
  if (checkedThisRound(it)) {
    const c = CHECK[it.lastCheckResult] || CHECK['ปกติ'];
    return `<span class="badge ${c.cls}">${ic(c.icon)}${esc(it.lastCheckResult)} · ${esc(thaiDateTime(it.lastCheckAt))}</span>`;
  }
  return `<span class="badge bg-slate-50 text-slate-500 ring-slate-200">${ic('clock')}ยังไม่ตรวจเดือนนี้</span>`;
}

function initConsole() {
  $('c-branch').innerHTML = branchOptions('', '-- เลือกสาขา --');
  $('c-branch').addEventListener('change', () => { S.consoleBranch = $('c-branch').value; renderConsole(); });
  $('c-q').addEventListener('input', debounce(renderConsole, 150));
  $('c-filters').addEventListener('click', e => {
    const b = e.target.closest('[data-cf]');
    if (b) { S.consoleFilter = b.dataset.cf; renderConsole(); }
  });
  $('c-list').addEventListener('click', e => {
    const q = e.target.closest('[data-quick]');
    if (q) { quickCheck(Number(q.dataset.quick)); return; }
    const c = e.target.closest('[data-check]');
    if (c) openCheckSheet(Number(c.dataset.check));
  });
}

function consoleCard(it) {
  const done = checkedThisRound(it);
  const accent = !done ? '' : it.lastCheckResult === 'ปกติ' ? 'ring-emerald-200' : 'ring-amber-300 bg-amber-50/30';
  return `<div class="card ${accent} p-3 flex items-center gap-2 transition">
    <button type="button" data-check="${it.row}" class="flex-1 min-w-0 text-left flex items-center gap-3 rounded-xl">
      ${catTile(it)}
      <span class="min-w-0">
        <span class="block font-semibold text-slate-900 text-[15px] leading-snug break-words">${esc(it.name) || '-'}</span>
        <span class="block text-xs text-slate-500 mt-0.5"><span class="font-mono">${esc(it.code)}</span> · เครื่องที่ ${esc(it.machineNo || '-')}</span>
        <span class="flex flex-wrap gap-1 mt-1.5">${it.status !== 'ใช้งาน' ? statusBadge(it.status) : ''}${checkChip(it)}</span>
      </span>
    </button>
    ${done
      ? `<button type="button" data-check="${it.row}" class="btn btn-secondary btn-icon shrink-0" title="แก้ไขผลตรวจ" aria-label="แก้ไขผลตรวจ">${ic('pencil')}</button>`
      : `<button type="button" data-quick="${it.row}" class="shrink-0 w-[3.75rem] h-12 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95 shadow-sm shadow-emerald-800/20 flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold transition" title="ตรวจแล้ว ปกติ">${ic('check', 'w-4 h-4 stroke-[3]')}ปกติ</button>`}
  </div>`;
}

function renderConsole() {
  const admin = isAdmin();
  if (admin) $('c-branch').value = BRANCH_BY_CODE[branchCode(S.consoleBranch)] || '';
  $('c-branch-title').textContent = S.consoleBranch ? branchLabel(S.consoleBranch) : (admin ? 'เลือกสาขาที่ต้องการดู' : 'ไม่ได้ระบุสาขา');
  $('c-round').textContent = roundLabel();

  const all = consoleItems();
  const active = all.filter(it => it.status !== DISPOSED);
  const disposed = all.filter(it => it.status === DISPOSED);
  const done = active.filter(checkedThisRound);
  const cnt = r => done.filter(it => it.lastCheckResult === r).length;
  const pct = active.length ? Math.round(done.length / active.length * 100) : 0;
  $('c-done').textContent = done.length;
  $('c-total').textContent = active.length;
  $('c-pct').textContent = pct + '%';
  $('c-ring').setAttribute('stroke-dasharray', `${pct} 100`);
  const stat = (label, n, cls, icon) => `<div class="py-3 text-center">
    <p class="text-xl font-bold tabular-nums leading-tight ${n ? cls : 'text-slate-300'}">${n}</p>
    <p class="text-[11px] text-slate-500 flex items-center justify-center gap-1 mt-0.5">${ic(icon, `w-3 h-3 ${cls}`)}${label}</p></div>`;
  $('c-stats').innerHTML = stat('ปกติ', cnt('ปกติ'), 'text-emerald-600', 'check-circle-2') +
    stat('ชำรุด', cnt('ชำรุด'), 'text-amber-600', 'alert-triangle') +
    stat('ไม่พบ', cnt('ไม่พบ'), 'text-red-600', 'search-x') +
    stat('ยังไม่ตรวจ', active.length - done.length, 'text-slate-700', 'clock');

  const issues = cnt('ชำรุด') + cnt('ไม่พบ');
  const filters = [['todo', 'ยังไม่ตรวจ', active.length - done.length], ['done', 'ตรวจแล้ว', done.length], ['issue', 'มีปัญหา', issues], ['all', 'ทั้งหมด', active.length]];
  $('c-filters').innerHTML = filters.map(([k, l, n]) =>
    `<button data-cf="${k}" class="chip ${S.consoleFilter === k ? 'active' : ''}">${l} <span class="count">${n}</span></button>`).join('');

  const q = $('c-q').value.trim().toLowerCase();
  const list = active.filter(it => {
    const d = checkedThisRound(it);
    if (S.consoleFilter === 'todo' && d) return false;
    if (S.consoleFilter === 'done' && !d) return false;
    if (S.consoleFilter === 'issue' && !(d && it.lastCheckResult !== 'ปกติ')) return false;
    return !q || [it.code, it.name, it.note, it.spec].some(v => String(v || '').toLowerCase().includes(q));
  }).sort(byCategoryMachine);

  let empty = ['clipboard-list', 'ไม่พบรายการ'];
  if (!S.consoleBranch) empty = ['store', admin ? 'เลือกสาขาด้านบนเพื่อดูสต็อก' : 'บัญชีนี้ยังไม่ได้ระบุสาขา กรุณาติดต่อแอดมิน'];
  else if (!active.length) empty = ['package-open', 'ยังไม่มีอุปกรณ์ในสาขานี้'];
  else if (S.consoleFilter === 'todo' && !q) empty = ['party-popper', 'ตรวจนับครบทุกเครื่องแล้วสำหรับเดือนนี้'];
  $('c-list').innerHTML = !S.loaded ? skeletonCards(6) : list.length ? list.map(consoleCard).join('') : emptyState(...empty);

  $('c-disposed-wrap').classList.toggle('hidden', !disposed.length);
  $('c-disposed-count').textContent = disposed.length;
  $('c-disposed').innerHTML = disposed.map(it => `<button type="button" onclick="openDetail(${it.row})" class="text-left rounded-xl px-3 py-2 ring-1 ring-inset ring-slate-100 hover:bg-slate-50">
      <span class="block text-sm text-slate-700 truncate">${esc(it.name)}</span>
      <span class="block text-xs text-slate-400"><span class="font-mono">${esc(it.code)}</span>${it.disposalId ? ' · ' + esc(it.disposalId) : ''}</span></button>`).join('');
}

// บันทึก "ปกติ" แบบทันที: อัปเดตหน้าจอก่อน แล้วส่งไปเซิร์ฟเวอร์เบื้องหลัง (ถ้าไม่สำเร็จจะย้อนกลับ)
async function quickCheck(row) {
  const it = S.items.find(x => x.row === row);
  if (!it) return;
  const prev = { ...it };
  applyItemUpdate({ ...it, lastCheckAt: nowStamp(), lastCheckBy: S.user.email, lastCheckResult: 'ปกติ' });
  renderCurrent();
  showToast('ตรวจแล้ว: ' + it.name);
  const res = await api('check', { row: it.row, code: it.code, result: 'ปกติ' });
  if (!res.ok) {
    applyItemUpdate(prev);
    renderCurrent();
    showToast('บันทึกผลตรวจไม่สำเร็จ: ' + errMsg(res), 'error');
    return;
  }
  applyItemUpdate(res.item);
}

function openConsoleFor(branch) {
  S.consoleBranch = branch;
  S.consoleFilter = 'todo';
  $('c-q').value = '';
  switchTab('console');
}

function startCheckScanner() {
  if (!S.consoleBranch) { showToast(isAdmin() ? 'กรุณาเลือกสาขาก่อน' : 'บัญชีนี้ยังไม่ได้ระบุสาขา', 'warn'); return; }
  openScanner('c-scanner', 'c-reader', onCheckScanned);
}
function onCheckScanned(code) {
  const hits = S.items.filter(it => it.code.toUpperCase() === code);
  const inBranch = hits.filter(it => branchCode(it.branch) === branchCode(S.consoleBranch));
  if (inBranch.length === 1) { openCheckSheet(inBranch[0].row, true); return; }
  if (hits.length === 1 && isAdmin()) {   // แอดมินสแกนเครื่องของสาขาอื่น → สลับไปสาขานั้น
    S.consoleBranch = hits[0].branch;
    renderConsole();
    openCheckSheet(hits[0].row, true);
    showToast('อุปกรณ์นี้อยู่สาขา ' + branchLabel(hits[0].branch), 'info');
    return;
  }
  showToast(hits.length > 1 ? 'รหัส ' + code + ' ซ้ำหลายรายการ กรุณาเลือกจากรายการ' : 'ไม่พบรหัส ' + code + (isAdmin() ? '' : ' ในสาขาของคุณ'), 'warn');
  $('c-q').value = code;
  S.consoleFilter = 'all';
  renderConsole();
}

function checkOptionClass(k) {
  return `chk-opt rounded-2xl py-3.5 flex flex-col items-center gap-1.5 text-sm font-semibold transition ${k === S.chkResult ? CHECK[k].btn : 'ring-1 ring-inset ring-slate-200 text-slate-500 hover:bg-slate-50'}`;
}

function openCheckSheet(row, fromScan) {
  const it = S.items.find(x => x.row === row);
  if (!it) return;
  S.sheetRow = row;
  S.chkResult = checkedThisRound(it) ? it.lastCheckResult : 'ปกติ';
  const disposed = it.status === DISPOSED;
  openSheet(sheetHeader(esc(it.name) || '-', `<span class="font-mono">${esc(it.code)}</span>`, catOf(it.category).icon) + `
    <div class="p-5 space-y-5">
      ${itemSummaryHTML(it)}
      ${disposed ? `<div class="rounded-2xl bg-slate-100 p-4 text-sm text-slate-700">อุปกรณ์นี้จำหน่ายแล้ว${it.disposalId ? ` — <button onclick="openReport('${esc(it.disposalId)}')" class="underline text-brand-700 font-semibold">ดูรายงาน ${esc(it.disposalId)}</button>` : ''}</div>` : `
      <div>
        <p class="label">${ic('clipboard-check')} ผลการตรวจนับ · ${esc(roundLabel())}</p>
        <div class="grid grid-cols-3 gap-2">
          ${Object.entries(CHECK).map(([k, c]) => `<button type="button" data-result="${k}" class="${checkOptionClass(k)}">${ic(c.icon, 'w-6 h-6')}${k}</button>`).join('')}
        </div>
        ${it.lastCheckAt ? `<p class="text-xs text-slate-400 mt-2">ตรวจล่าสุด ${esc(thaiDateTime(it.lastCheckAt))} · ${esc(it.lastCheckResult)} · ${esc(it.lastCheckBy)}</p>` : ''}
      </div>
      <div>
        <label class="label" for="chk-note">${ic('sticky-note')} หมายเหตุ <span id="chk-note-req" class="req ${S.chkResult === 'ปกติ' ? 'hidden' : ''}">* จำเป็น</span></label>
        <textarea id="chk-note" rows="2" class="field" placeholder="เช่น จอมีรอยแตก, ไม่พบที่เคาน์เตอร์ 2"></textarea>
      </div>
      <button onclick="submitCheck(this, ${!!fromScan})" class="btn btn-primary btn-lg w-full">${ic(fromScan ? 'scan-line' : 'save')} บันทึกผลตรวจ${fromScan ? ' & สแกนเครื่องถัดไป' : ''}</button>
      <div class="grid grid-cols-2 gap-2 pt-4 border-t border-slate-100">
        <button onclick="openDisposeSheet(${it.row})" class="btn btn-danger-soft">${ic('file-minus')} แจ้งจำหน่าย</button>
        <button onclick="closeSheet(); openDetail(${it.row})" class="btn btn-secondary">${ic('info')} รายละเอียด</button>
      </div>`}
    </div>`);
}
$('sheet-body').addEventListener('click', e => {
  const b = e.target.closest('[data-result]');
  if (!b) return;
  S.chkResult = b.dataset.result;
  document.querySelectorAll('.chk-opt').forEach(o => { o.className = checkOptionClass(o.dataset.result); });
  $('chk-note-req').classList.toggle('hidden', S.chkResult === 'ปกติ');
});

// บันทึกผลตรวจแบบทันที (ปิดหน้าต่างและสแกนต่อได้เลย ไม่ต้องรอเซิร์ฟเวอร์)
async function submitCheck(btn, fromScan) {
  const it = S.items.find(x => x.row === S.sheetRow);
  const note = $('chk-note').value.trim();
  const result = S.chkResult;
  if (result !== 'ปกติ' && !note) { showToast('กรุณาระบุหมายเหตุเมื่อพบปัญหา', 'warn'); $('chk-note').focus(); return; }
  const prev = { ...it };
  applyItemUpdate({ ...it, lastCheckAt: nowStamp(), lastCheckBy: S.user.email, lastCheckResult: result });
  closeSheet();
  renderCurrent();
  showToast(`บันทึกผลตรวจ "${result}" แล้ว: ${it.name}`);
  if (fromScan && S.tab === 'console') setTimeout(startCheckScanner, 300);
  const res = await api('check', { row: it.row, code: it.code, result, note });
  if (!res.ok) {
    applyItemUpdate(prev);
    renderCurrent();
    showToast('บันทึกผลตรวจไม่สำเร็จ: ' + errMsg(res), 'error');
    return;
  }
  applyItemUpdate(res.item);
  if (S.detailRow === it.row) loadItemHistory();
}

// ==================== Disposal (แจ้งจำหน่าย) ====================
function todayISO() { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }

function openDisposeSheet(row) {
  const it = S.items.find(x => x.row === row);
  if (!it) return;
  if (it.status === DISPOSED) { showToast('อุปกรณ์นี้จำหน่ายไปแล้ว', 'warn'); return; }
  S.sheetRow = row;
  S.photos = [];
  openSheet(sheetHeader('แจ้งจำหน่ายอุปกรณ์', esc(it.name), 'file-minus', 'bg-red-50 text-red-600') + `
    <div class="p-5 space-y-4">
      ${itemSummaryHTML(it)}
      <div class="rounded-2xl bg-red-50 ring-1 ring-inset ring-red-100 text-red-800 text-xs px-3.5 py-2.5 flex gap-2">
        ${ic('alert-triangle', 'w-4 h-4 mt-px')}
        <span>เมื่อบันทึก ระบบจะออก <b>รายงานจำหน่าย</b> และเปลี่ยนสถานะเป็น "จำหน่ายแล้ว" ทันที (ยกเลิกภายหลังได้โดยแอดมินเท่านั้น)</span>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="label" for="dp-method">${ic('list-checks')} วิธีจำหน่าย <span class="req">*</span></label>
          <select id="dp-method" class="field"><option value="">เลือก</option>${DISPOSE_METHODS.map(m => `<option>${m}</option>`).join('')}</select>
        </div>
        <div>
          <label class="label" for="dp-date">${ic('calendar')} วันที่จำหน่าย <span class="req">*</span></label>
          <input id="dp-date" type="date" class="field" value="${todayISO()}" max="${todayISO()}">
        </div>
      </div>
      <div>
        <label class="label" for="dp-disposer">${ic('user')} ผู้จำหน่ายสินค้าออก <span class="req">*</span></label>
        <input id="dp-disposer" class="field" value="${esc(S.user.name || '')}" placeholder="ชื่อ-นามสกุล ผู้นำอุปกรณ์ออก">
      </div>
      <div>
        <label class="label" for="dp-reason">${ic('sticky-note')} หมายเหตุ / เหตุผลการจำหน่าย <span class="req">*</span></label>
        <textarea id="dp-reason" rows="3" class="field" placeholder="เช่น ชำรุดซ่อมไม่คุ้มค่า, ขายให้ร้าน..., ผู้รับซื้อ/ผู้รับของ"></textarea>
      </div>
      <div>
        <p class="label">${ic('camera')} รูปถ่ายรายงาน <span class="req">*</span> <span class="font-normal text-slate-400">1–${MAX_PHOTOS} รูป เช่น ใบรายงาน/ตัวเครื่อง</span></p>
        <div id="dp-photos" class="grid grid-cols-3 gap-2"></div>
        <div id="dp-photo-btns" class="grid grid-cols-2 gap-2 mt-2">
          <button type="button" onclick="$('dp-cam').click()" class="h-20 rounded-2xl border-2 border-dashed border-slate-300 hover:border-brand-400 hover:bg-brand-50/60 text-sm text-slate-600 flex flex-col items-center justify-center gap-1 transition">
            ${ic('camera', 'w-6 h-6 text-brand-600')} ถ่ายรูป</button>
          <button type="button" onclick="$('dp-pick').click()" class="h-20 rounded-2xl border-2 border-dashed border-slate-300 hover:border-brand-400 hover:bg-brand-50/60 text-sm text-slate-600 flex flex-col items-center justify-center gap-1 transition">
            ${ic('image-plus', 'w-6 h-6 text-brand-600')} เลือกจากคลังภาพ</button>
        </div>
        <input id="dp-cam" type="file" accept="image/*" capture="environment" class="hidden" onchange="addPhotos(this)">
        <input id="dp-pick" type="file" accept="image/*" multiple class="hidden" onchange="addPhotos(this)">
      </div>
      <label class="flex items-start gap-2.5 text-sm text-slate-700 rounded-2xl bg-slate-50 ring-1 ring-inset ring-slate-100 px-3.5 py-3 cursor-pointer">
        <input id="dp-confirm" type="checkbox" class="w-4 h-4 mt-0.5 accent-red-600">
        <span>ข้าพเจ้ายืนยันว่าข้อมูลการจำหน่ายถูกต้อง และอุปกรณ์ได้ถูกนำออกจากสาขาแล้ว</span>
      </label>
      <button onclick="submitDispose(this)" class="btn btn-danger btn-lg w-full">${ic('file-check-2')} ยืนยันแจ้งจำหน่าย & ออกรายงาน</button>
    </div>`);
  renderPhotoPreview();
}

// ย่อรูปก่อนอัปโหลด (ด้านยาวสุด 1280px, JPEG 80%) — ประหยัดเน็ตมือถือและพื้นที่ Drive
function compressImage(file, max = 1280, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * s);
      c.height = Math.round(img.naturalHeight * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('อ่านไฟล์รูปไม่ได้')); };
    img.src = url;
  });
}

async function addPhotos(input) {
  const files = [...input.files].filter(f => f.type.startsWith('image/'));
  input.value = '';
  for (const f of files) {
    if (S.photos.length >= MAX_PHOTOS) { showToast(`แนบรูปได้สูงสุด ${MAX_PHOTOS} รูป`, 'warn'); break; }
    try { S.photos.push(await compressImage(f)); }
    catch (e) { showToast(e.message, 'error'); }
  }
  renderPhotoPreview();
}
function removePhoto(i) { S.photos.splice(i, 1); renderPhotoPreview(); }
function renderPhotoPreview() {
  const box = $('dp-photos');
  if (!box) return;
  box.innerHTML = S.photos.map((p, i) => `<div class="relative animate-fade-in"><img src="${p}" class="w-full h-24 object-cover rounded-xl ring-1 ring-slate-200" alt="">
    <button type="button" onclick="removePhoto(${i})" class="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-slate-900 text-white shadow-lg flex items-center justify-center" aria-label="ลบรูป">${ic('x', 'w-3.5 h-3.5')}</button></div>`).join('');
  $('dp-photo-btns').classList.toggle('hidden', S.photos.length >= MAX_PHOTOS);
}

async function submitDispose(btn) {
  const it = S.items.find(x => x.row === S.sheetRow);
  const body = { row: it.row, code: it.code, method: $('dp-method').value, date: $('dp-date').value,
                 disposer: $('dp-disposer').value.trim(), reason: $('dp-reason').value.trim(), photos: S.photos };
  const need = [[!body.method, 'กรุณาเลือกวิธีการจำหน่าย', 'dp-method'], [!body.date, 'กรุณาระบุวันที่จำหน่าย', 'dp-date'],
                [!body.disposer, 'กรุณาระบุชื่อผู้จำหน่ายสินค้าออก', 'dp-disposer'], [!body.reason, 'กรุณาระบุหมายเหตุ/เหตุผล', 'dp-reason'],
                [!body.photos.length, 'กรุณาถ่ายรูปรายงานอย่างน้อย 1 รูป'], [!$('dp-confirm').checked, 'กรุณาติ๊กยืนยันข้อมูล', 'dp-confirm']].find(x => x[0]);
  if (need) { showToast(need[1], 'warn'); if (need[2]) $(need[2]).focus(); return; }
  await busy(btn, async () => {
    const res = await api('dispose', body);
    if (!res.ok) { showToast('บันทึกไม่สำเร็จ: ' + errMsg(res), 'error'); return; }
    applyItemUpdate(res.item);
    if (S.reports) S.reports.unshift(res.report);
    closeSheet();
    closeDetail();
    showToast('ออกรายงาน ' + res.report.id + ' เรียบร้อย');
    renderCurrent();
    openReport(res.report.id, res.report);
  });
}

// ==================== Disposal reports ====================
function initDisposals() {
  $('r-branch').innerHTML = branchOptions('', 'ทุกสาขา');
  const d = new Date();
  const months = Array.from({ length: 12 }, (_, i) => new Date(d.getFullYear(), d.getMonth() - i, 1));
  $('r-month').innerHTML = '<option value="">ทุกเดือน</option>' + months.map(m =>
    `<option value="${m.getFullYear()}-${pad2(m.getMonth() + 1)}">${m.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}</option>`).join('');
  ['r-branch', 'r-month', 'r-state'].forEach(id => $(id).addEventListener('change', renderDisposals));
  $('r-q').addEventListener('input', debounce(renderDisposals, 150));
  $('r-list').addEventListener('click', e => { const b = e.target.closest('[data-report]'); if (b) openReport(b.dataset.report); });
}

async function loadReports(force) {
  if (S.reports && !force) return true;
  const res = await api('disposals');
  if (!res.ok) { showToast('โหลดรายงานไม่สำเร็จ: ' + errMsg(res), 'error'); return false; }
  S.reports = res.reports;
  return true;
}

const stateBadge = r => r.state === 'voided'
  ? `<span class="badge bg-slate-100 text-slate-600 ring-slate-300">${ic('ban')}ยกเลิกแล้ว</span>`
  : `<span class="badge bg-red-50 text-red-700 ring-red-600/20">${ic('file-check-2')}มีผล</span>`;

async function renderDisposals() {
  if (!S.reports) {
    $('r-list').innerHTML = skeletonCards(4);
    if (!(await loadReports()) || S.tab !== 'disposals') return;
  }
  const fb = $('r-branch').value, fm = $('r-month').value, fs = $('r-state').value, q = $('r-q').value.trim().toLowerCase();
  const list = S.reports.filter(r => (!fb || branchCode(r.branch) === branchCode(fb)) && (!fm || r.date.startsWith(fm)) &&
    (!fs || r.state === fs) && (!q || [r.id, r.code, r.name, r.disposer, r.reason].some(v => String(v || '').toLowerCase().includes(q))));
  $('r-count').innerHTML = `พบ <b class="text-slate-900">${list.length}</b> รายงาน`;
  $('r-list').innerHTML = list.length ? list.map(r => `
    <button type="button" data-report="${esc(r.id)}" class="row-card items-stretch ${r.state === 'voided' ? 'opacity-70' : ''}">
      ${r.photos[0] ? `<img src="${esc(r.photos[0].url)}" referrerpolicy="no-referrer" loading="lazy" class="w-20 h-20 shrink-0 object-cover rounded-xl bg-slate-100" alt="">`
                    : `<span class="w-20 h-20 shrink-0 rounded-xl bg-slate-100 flex items-center justify-center text-slate-300">${ic('image', 'w-6 h-6')}</span>`}
      <span class="min-w-0 flex-1">
        <span class="flex items-center gap-2 flex-wrap"><span class="font-mono text-xs font-bold text-red-700">${esc(r.id)}</span>${r.state === 'voided' ? stateBadge(r) : ''}</span>
        <span class="block font-semibold text-slate-900 text-[15px] leading-snug break-words mt-0.5">${esc(r.name)}</span>
        <span class="block text-xs text-slate-500 mt-0.5"><span class="font-mono">${esc(r.code)}</span> · ${esc(branchLabel(r.branch))}</span>
        <span class="block text-xs text-slate-500 mt-1">${esc(r.method)} · ${esc(thaiDate(r.date))} · ${esc(r.disposer)}</span>
      </span>
    </button>`).join('')
    : emptyState('file-minus', 'ไม่มีรายงานจำหน่าย');
}

async function openReport(id, known) {
  let r = known || (S.reports || []).find(x => x.id === id);
  if (!r) { await loadReports(true); r = (S.reports || []).find(x => x.id === id); }
  if (!r) { showToast('ไม่พบรายงาน ' + id, 'error'); return; }
  S.reportId = r.id;
  S.currentReport = r;
  openSheet(sheetHeader('รายงานจำหน่าย ' + esc(r.id), stateBadge(r), 'file-minus', 'bg-red-50 text-red-600') + `
    <div class="p-5 space-y-5">
      <dl class="kv bg-slate-50 ring-1 ring-inset ring-slate-100 rounded-2xl px-4 py-3.5">
        <dt>อุปกรณ์</dt><dd class="font-semibold">${esc(r.name)}</dd>
        <dt>รหัส</dt><dd class="font-mono">${esc(r.code)}</dd>
        <dt>สาขา</dt><dd>${esc(branchLabel(r.branch))}</dd>
        <dt>หมวด / เครื่องที่</dt><dd>${esc(catOf(r.category).v)} · ${esc(r.machineNo || '-')}</dd>
        <dt>สถานะก่อนจำหน่าย</dt><dd>${esc(r.prevStatus || '-')}</dd>
        <dt>วิธีการจำหน่าย</dt><dd class="font-semibold">${esc(r.method)}</dd>
        <dt>วันที่จำหน่าย</dt><dd>${esc(thaiDate(r.date))}</dd>
        <dt>ผู้จำหน่ายสินค้าออก</dt><dd class="font-semibold">${esc(r.disposer)}</dd>
        <dt>ผู้บันทึกรายงาน</dt><dd>${esc(r.reportedBy)}<span class="block text-xs text-slate-400">${esc(thaiDateTime(r.createdAt))}</span></dd>
      </dl>
      <div><p class="label">${ic('sticky-note')} หมายเหตุ / เหตุผล</p>
        <p class="text-sm text-slate-800 bg-amber-50/70 ring-1 ring-inset ring-amber-100 rounded-2xl px-3.5 py-2.5 whitespace-pre-wrap">${esc(r.reason)}</p></div>
      <div><p class="label">${ic('camera')} รูปถ่ายรายงาน (${r.photos.length})</p>
        <div class="grid grid-cols-3 gap-2">${r.photos.map(p => `<a href="${esc(p.view)}" target="_blank" rel="noopener" class="block rounded-xl overflow-hidden ring-1 ring-slate-200 hover:ring-brand-400 transition"><img src="${esc(p.url)}" referrerpolicy="no-referrer" class="w-full h-28 object-cover bg-slate-100" alt="รูปรายงาน"></a>`).join('')}</div></div>
      ${r.state === 'voided' ? `<div class="rounded-2xl bg-slate-100 p-3.5 text-sm text-slate-700">ยกเลิกโดย ${esc(r.voidedBy)} · ${esc(thaiDateTime(r.voidedAt))}<br>เหตุผล: ${esc(r.voidReason)}</div>` : ''}
      <button onclick="printDisposalReport()" class="btn btn-dark btn-lg w-full">${ic('printer')} พิมพ์รายงาน (A4)</button>
      ${isAdmin() && r.state !== 'voided' ? `
      <details class="rounded-2xl ring-1 ring-inset ring-slate-200">
        <summary class="px-4 py-3 text-sm font-semibold text-red-600 flex items-center gap-2">${ic('undo-2')} ยกเลิกรายงาน (แอดมิน)
          ${ic('chevron-right', 'chev w-4 h-4 ml-auto text-slate-400 transition-transform')}</summary>
        <div class="px-4 pb-4 space-y-2">
          <p class="text-xs text-slate-500">ใช้เมื่อแจ้งผิดเครื่อง/ข้อมูลผิด — สถานะอุปกรณ์จะกลับเป็น "${esc(r.prevStatus || 'ใช้งาน')}"</p>
          <input id="void-reason" class="field field-sm" placeholder="เหตุผลการยกเลิก (จำเป็น)">
          <button onclick="doVoidReport(this)" class="btn btn-danger w-full">ยืนยันยกเลิกรายงาน</button>
        </div>
      </details>` : ''}
    </div>`);
}

async function doVoidReport(btn) {
  const reason = $('void-reason').value.trim();
  if (!reason) { showToast('กรุณาระบุเหตุผลการยกเลิก', 'warn'); return; }
  if (!confirm('ยกเลิกรายงาน ' + S.reportId + '?')) return;
  await busy(btn, async () => {
    const res = await api('voidDisposal', { id: S.reportId, reason });
    if (!res.ok) { showToast(errMsg(res), 'error'); return; }
    if (res.item) applyItemUpdate(res.item);
    const i = (S.reports || []).findIndex(x => x.id === res.report.id);
    if (i >= 0) S.reports[i] = res.report;
    showToast('ยกเลิกรายงานแล้ว สถานะอุปกรณ์ถูกคืนค่า');
    renderCurrent();
    openReport(res.report.id, res.report);
  });
}

// ==================== Detail ====================
const currentDetail = () => S.items.find(it => it.row === S.detailRow);

function openDetail(row) {
  if (!S.items.some(it => it.row === row)) return;
  S.detailRow = row;
  renderDetail();
  const m = $('detail-modal');
  m.classList.remove('hidden'); m.classList.add('flex');
  document.body.style.overflow = 'hidden';
  loadItemHistory();
}
function closeDetail() {
  const m = $('detail-modal');
  m.classList.add('hidden'); m.classList.remove('flex');
  if (!sheetOpen()) document.body.style.overflow = '';
  S.detailRow = null;
}
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (sheetOpen()) closeSheet(); else if (S.detailRow) closeDetail();
});

function infoCell(label, html, cls = '') {
  return `<div class="${cls}"><p class="text-xs text-slate-500 mb-0.5">${label}</p><div class="text-sm font-medium text-slate-800 break-words">${html}</div></div>`;
}

function renderDetail() {
  const it = currentDetail();
  if (!it) return;
  const cat = catOf(it.category);
  const admin = isAdmin();
  const sameCode = S.items.filter(x => x.code === it.code).length;
  const sub = (a, b) => `${a}${b ? `<span class="block text-xs text-slate-400 font-normal">${esc(b)}</span>` : ''}`;
  $('detail-body').innerHTML = `
  <div class="sheet-head">
    ${catTile(it)}
    <div class="flex-1 min-w-0">
      <h2 class="text-lg font-bold text-slate-900 leading-tight break-words">${esc(it.name) || '-'}</h2>
      <p class="text-sm text-slate-500 font-mono mt-0.5">${esc(it.code)}</p>
      <div class="mt-2 flex gap-1.5 flex-wrap">${statusBadge(it.status)}${warrantyChip(it.warranty)}</div>
    </div>
    <button onclick="closeDetail()" class="btn btn-ghost btn-sm btn-icon -mr-1" aria-label="ปิด">${ic('x', 'w-5 h-5')}</button>
  </div>
  <div class="p-5 space-y-5">
    ${it.status === DISPOSED ? `<div class="rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-700 flex items-center gap-2 flex-wrap">
      ${ic('package-x')} อุปกรณ์นี้จำหน่ายแล้ว
      ${it.disposalId ? `<button onclick="openReport('${esc(it.disposalId)}')" class="ml-auto btn btn-sm btn-secondary">${ic('file-text')} ดูรายงาน ${esc(it.disposalId)}</button>` : ''}</div>`
    : DEMO ? '' : `<div class="grid grid-cols-2 gap-2">
      <button onclick="openCheckSheet(${it.row})" class="btn btn-primary">${ic('clipboard-check')} บันทึกผลตรวจ</button>
      <button onclick="openDisposeSheet(${it.row})" class="btn btn-danger-soft">${ic('file-minus')} แจ้งจำหน่าย</button>
    </div>`}
    ${sameCode > 1 ? `<div class="rounded-2xl bg-red-50 ring-1 ring-inset ring-red-100 text-red-800 text-xs px-3.5 py-2.5 flex gap-2">${ic('alert-triangle', 'w-4 h-4 mt-px')}<span>รหัสนี้ซ้ำกับอุปกรณ์อื่นอีก ${sameCode - 1} รายการ ${admin ? '— แก้ไขรหัสได้ที่ "แก้ไขข้อมูลหลัก" ด้านล่าง แล้วพิมพ์ QR ใหม่' : '— กรุณาแจ้งแอดมิน'}</span></div>` : ''}

    <div class="grid sm:grid-cols-[1fr_auto] gap-5 items-start">
      <div class="grid grid-cols-2 gap-x-4 gap-y-3.5">
        ${infoCell('หมวดหมู่', `${cat.p} · ${esc(cat.v)}`)}
        ${infoCell('สาขา', esc(branchLabel(it.branch)))}
        ${infoCell('เครื่องที่', `<span class="text-brand-700 text-xl font-bold tabular-nums">${esc(it.machineNo || '-')}</span>`)}
        ${infoCell('ประกัน', warrantyChip(it.warranty, true))}
        ${infoCell('ลงทะเบียน', sub(esc(thaiDateTime(it.createdAt)), it.createdBy))}
        ${infoCell('แก้ไขล่าสุด', it.updatedAt ? sub(esc(thaiDateTime(it.updatedAt)), it.updatedBy) : '<span class="text-slate-400">-</span>')}
        ${DEMO ? '' : infoCell('ตรวจนับล่าสุด', it.lastCheckAt
          ? sub(checkedThisRound(it) ? checkChip(it) : `${esc(it.lastCheckResult)} · ${esc(thaiDateTime(it.lastCheckAt))} <span class="text-xs text-slate-400">(รอบก่อน)</span>`, it.lastCheckBy)
          : '<span class="text-slate-400">ยังไม่เคยตรวจนับ</span>', 'col-span-2')}
      </div>
      <div class="flex sm:flex-col items-center gap-3 rounded-2xl bg-slate-50 ring-1 ring-inset ring-slate-100 p-3">
        ${stickerHTML(it, 3)}
        <button onclick="printItems([currentDetail()])" class="btn btn-sm btn-secondary">${ic('printer')} พิมพ์ QR</button>
      </div>
    </div>

    <div class="rounded-2xl bg-slate-50/80 ring-1 ring-inset ring-slate-100 p-4 space-y-3">
      <div>
        <label class="label" for="d-spec">${ic('cpu')} สเปค / รายละเอียด</label>
        <textarea id="d-spec" rows="2" class="field">${esc(it.spec)}</textarea>
      </div>
      <div>
        <label class="label" for="d-note">${ic('sticky-note')} หมายเหตุ</label>
        <textarea id="d-note" rows="3" class="field">${esc(it.note)}</textarea>
      </div>
      <button onclick="saveSpecNote(this)" class="btn btn-soft w-full">${ic('save')} บันทึกสเปค & หมายเหตุ</button>
    </div>

    ${DEMO ? '' : admin ? adminToolsHTML(it) : `<p class="text-xs text-slate-500 rounded-xl bg-slate-50 px-3.5 py-2.5 flex items-center gap-2">${ic('lock', 'w-3.5 h-3.5')} การเปลี่ยนสถานะ ย้ายสาขา หรือแก้ไขข้อมูลหลัก ทำได้โดยแอดมินเท่านั้น</p>`}

    <div>
      <p class="label">${ic('history')} ประวัติการเปลี่ยนแปลง</p>
      <div id="d-history" class="space-y-3 pt-1"><div class="skeleton h-10"></div><div class="skeleton h-10"></div></div>
    </div>
  </div>`;
}

function adminToolsHTML(it) {
  const section = (icon, title, body, color = 'text-slate-800') => `
    <details class="rounded-2xl ring-1 ring-inset ring-slate-200 open:bg-slate-50/50">
      <summary class="px-4 py-3 flex items-center gap-2 text-sm font-semibold ${color}">
        ${ic(icon)} ${title}
        ${ic('chevron-right', 'chev w-4 h-4 ml-auto text-slate-400 transition-transform')}
      </summary>
      <div class="px-4 pb-4 space-y-2">${body}</div>
    </details>`;
  const small = t => `<label class="block text-xs text-slate-500 mb-1">${t}</label>`;
  return `<div class="space-y-2">
    <p class="text-xs font-bold text-brand-700 flex items-center gap-1.5">${ic('shield-check', 'w-3.5 h-3.5')} เครื่องมือแอดมิน</p>
    ${it.status === DISPOSED && it.disposalId ? '' : section('refresh-cw', 'เปลี่ยนสถานะ', `
      <select id="d-status" class="field field-sm">${statusOptions(it.status === DISPOSED ? '' : it.status, it.status === DISPOSED ? '-- เลือกสถานะใหม่ --' : undefined, [DISPOSED])}</select>
      <input id="d-status-note" class="field field-sm" placeholder="หมายเหตุ เช่น ส่งซ่อมร้าน ABC, เลขใบแจ้งซ่อม">
      <p class="text-xs text-slate-400">การจำหน่ายให้ใช้ปุ่ม "แจ้งจำหน่าย" ด้านบน เพื่อออกรายงานพร้อมรูปถ่าย</p>
      <button onclick="doSetStatus(this)" class="btn btn-dark btn-sm w-full">บันทึกสถานะ</button>`)}
    ${section('arrow-left-right', 'ย้ายสาขา', `
      <select id="d-branch" class="field field-sm">${branchOptions(BRANCH_BY_CODE[branchCode(it.branch)] || '', '-- เลือกสาขาปลายทาง --')}</select>
      <input id="d-branch-note" class="field field-sm" placeholder="เหตุผล/หมายเหตุการย้าย">
      <p class="text-xs text-slate-400">รหัสและ QR เดิมใช้ต่อได้ ไม่ต้องพิมพ์สติกเกอร์ใหม่ · ประวัติการย้ายจะถูกบันทึกไว้</p>
      <button onclick="doTransfer(this)" class="btn btn-dark btn-sm w-full">ยืนยันการย้าย</button>`)}
    ${section('pencil', 'แก้ไขข้อมูลหลัก', `
      <div>${small('ชื่ออุปกรณ์')}<input id="e-name" class="field field-sm" value="${esc(it.name)}"></div>
      <div class="grid grid-cols-2 gap-2">
        <div>${small('หมวดหมู่')}<select id="e-category" class="field field-sm">${categoryOptions(it.category)}</select></div>
        <div>${small('เครื่องที่')}<input id="e-machine" class="field field-sm" value="${esc(it.machineNo)}"></div>
        <div>${small('วันหมดประกัน')}<input id="e-warranty" type="date" class="field field-sm" value="${esc(it.warranty)}"></div>
        <div>${small('รหัสอุปกรณ์')}<input id="e-code" class="field field-sm font-mono uppercase" value="${esc(it.code)}"></div>
      </div>
      <p class="text-xs text-amber-700 flex items-center gap-1">${ic('alert-triangle', 'w-3.5 h-3.5')} ถ้าเปลี่ยนรหัส ต้องพิมพ์ QR ใหม่ติดที่เครื่อง</p>
      <button onclick="saveCoreFields(this)" class="btn btn-dark btn-sm w-full">บันทึกข้อมูลหลัก</button>`)}
    ${section('trash-2', 'ลบรายการ', `
      <p class="text-xs text-slate-500">ใช้เมื่อบันทึกผิดหรือเป็นข้อมูลทดสอบ — ถ้าอุปกรณ์เลิกใช้งาน ให้ "แจ้งจำหน่าย" แทน เพื่อเก็บประวัติไว้</p>
      <input id="del-reason" class="field field-sm" placeholder="เหตุผลการลบ (จำเป็น)">
      <button onclick="doDelete(this)" class="btn btn-danger btn-sm w-full">ลบรายการนี้</button>`, 'text-red-600')}
  </div>`;
}

function applyItemUpdate(item) {
  const i = S.items.findIndex(x => x.row === item.row);
  if (i >= 0) S.items[i] = item; else S.items.push(item);
  S.activity = null;
  saveBootCache();
}

async function handleMutation(res, okMsg) {
  if (!res.ok) {
    showToast(errMsg(res), 'error');
    if (res.error === 'conflict' || res.error === 'not_found') { await loadItems(true); }
    return false;
  }
  if (res.item) applyItemUpdate(res.item);
  showToast(res.changed && !res.changed.length ? 'ไม่มีข้อมูลเปลี่ยนแปลง' : okMsg, res.changed && !res.changed.length ? 'info' : 'success');
  renderCurrent();
  loadItemHistory();
  return true;
}

async function saveSpecNote(btn) {
  const it = currentDetail();
  await busy(btn, async () => {
    const res = await api('update', { row: it.row, code: it.code, fields: { spec: $('d-spec').value, note: $('d-note').value } });
    await handleMutation(res, 'บันทึกสเปค & หมายเหตุแล้ว');
  });
}
async function doSetStatus(btn) {
  const it = currentDetail();
  await busy(btn, async () => {
    const res = await api('setStatus', { row: it.row, code: it.code, status: $('d-status').value, note: $('d-status-note').value.trim() });
    await handleMutation(res, 'เปลี่ยนสถานะแล้ว');
  });
}
async function doTransfer(btn) {
  const it = currentDetail();
  const branch = $('d-branch').value;
  if (!branch) { showToast('กรุณาเลือกสาขาปลายทาง', 'warn'); return; }
  if (!confirm(`ย้าย "${it.name}" จาก ${branchLabel(it.branch)} ไป ${branch}?`)) return;
  await busy(btn, async () => {
    const res = await api('transfer', { row: it.row, code: it.code, branch, note: $('d-branch-note').value.trim() });
    await handleMutation(res, 'ย้ายสาขาเรียบร้อย');
  });
}
async function saveCoreFields(btn) {
  const it = currentDetail();
  const fields = { name: $('e-name').value.trim(), category: $('e-category').value, machineNo: $('e-machine').value.trim(),
                   warranty: $('e-warranty').value, code: $('e-code').value.trim().toUpperCase() };
  Object.keys(fields).forEach(k => { if (String(fields[k]) === String(it[k] || '')) delete fields[k]; });
  if (!Object.keys(fields).length) { showToast('ไม่มีข้อมูลเปลี่ยนแปลง', 'info'); return; }
  if (fields.code && !confirm(`เปลี่ยนรหัสเป็น ${fields.code}?\nต้องพิมพ์ QR ใหม่ติดที่เครื่อง`)) return;
  await busy(btn, async () => {
    const res = await api('update', { row: it.row, code: it.code, fields });
    await handleMutation(res, 'บันทึกข้อมูลหลักแล้ว');
  });
}
async function doDelete(btn) {
  const it = currentDetail();
  const reason = $('del-reason').value.trim();
  if (!reason) { showToast('กรุณาระบุเหตุผลการลบ', 'warn'); $('del-reason').focus(); return; }
  if (!confirm(`ลบ "${it.name}" (${it.code}) ออกจากระบบ?\nข้อมูลเดิมจะถูกเก็บไว้ในชีต History`)) return;
  await busy(btn, async () => {
    const res = await api('delete', { row: it.row, code: it.code, reason });
    if (!res.ok) { showToast(errMsg(res), 'error'); return; }
    closeDetail();
    showToast('ลบรายการแล้ว');
    await loadItems(true);   // เลขแถวเปลี่ยน ต้องโหลดใหม่
  });
}

const ACTION_TONE = { create: 'bg-brand-50 text-brand-700', check: 'bg-emerald-50 text-emerald-700', dispose: 'bg-red-50 text-red-600',
                      void: 'bg-slate-100 text-slate-600', transfer: 'bg-sky-50 text-sky-700', status: 'bg-amber-50 text-amber-700', delete: 'bg-red-50 text-red-600' };
function historyEntryHTML(h, withItem) {
  const trunc = s => { s = String(s || ''); return s.length > 80 ? s.slice(0, 80) + '…' : s; };
  let detail = '';
  if (['update', 'status', 'transfer', 'dispose', 'void'].includes(h.action)) {
    const f = FIELD_LABEL[h.field] || h.field;
    detail = `${esc(f)}: <span class="text-slate-400 line-through">${esc(trunc(h.from)) || '(ว่าง)'}</span> → <span class="text-slate-800">${esc(trunc(h.to)) || '(ว่าง)'}</span>`;
  } else if (h.action === 'check') {
    const c = CHECK[h.to];
    detail = `ผลตรวจ: <span class="font-semibold ${c ? c.text : ''}">${esc(h.to)}</span>`;
  } else if (h.action === 'create') {
    detail = h.to ? `สาขา ${esc(h.to)}` : '';
  }
  return `<div class="flex gap-3 text-sm">
    <span class="w-8 h-8 shrink-0 rounded-full ${ACTION_TONE[h.action] || 'bg-slate-100 text-slate-600'} flex items-center justify-center">${ic(ACTION_ICON[h.action] || 'dot', 'w-3.5 h-3.5')}</span>
    <div class="min-w-0 flex-1">
      <p class="text-slate-800"><b class="font-semibold">${esc(ACTION_LABEL[h.action] || h.action)}</b>${withItem ? ` · <button data-code="${esc(h.code)}" class="font-mono text-brand-700 hover:underline">${esc(h.code)}</button> <span class="text-slate-500">${esc(trunc(h.name))}</span>` : ''}</p>
      ${detail ? `<p class="text-xs text-slate-600 break-words">${detail}</p>` : ''}
      ${h.note ? `<p class="text-xs text-slate-500 break-words">“${esc(h.note)}”</p>` : ''}
      <p class="text-[11px] text-slate-400 mt-0.5">${esc(thaiDateTime(h.at))} · ${esc(h.by)}</p>
    </div>
  </div>`;
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-code]');
  if (b) openByCode(b.dataset.code);
});

async function loadItemHistory() {
  const it = currentDetail();
  if (!it) return;
  const res = await api('history', { code: it.code, limit: 30 });
  if (!currentDetail() || currentDetail().code !== it.code || !$('d-history')) return;
  $('d-history').innerHTML = !res.ok ? '<p class="text-xs text-red-500">โหลดประวัติไม่สำเร็จ</p>'
    : res.history.length ? res.history.map(h => historyEntryHTML(h, false)).join('')
    : '<p class="text-xs text-slate-400">ยังไม่มีประวัติการเปลี่ยนแปลงในระบบใหม่</p>';
}

// ==================== Dashboard ====================
function barRow({ label, count, total, color, icon, onclick, extra = '' }) {
  const pct = total ? (count / total) * 100 : 0;
  return `<button type="button" onclick="${onclick}" title="${esc(label)}: ${count.toLocaleString()} เครื่อง (${pct.toFixed(1)}%)"
      class="w-full text-left grid grid-cols-[minmax(0,10.5rem)_1fr_auto] items-center gap-3 px-2 py-1.5 -mx-2 rounded-lg hover:bg-slate-50 transition-colors">
    <span class="text-sm text-slate-700 truncate flex items-center gap-1.5">${icon ? `<svg class="ico w-3.5 h-3.5" style="color:${color}" aria-hidden="true"><use href="#i-${icon}"/></svg>` : ''}${esc(label)}</span>
    <span class="h-2 bg-slate-100 rounded-full overflow-hidden"><span class="block h-full rounded-full" style="width:${Math.max(pct, count ? 1.5 : 0)}%;background:${color}"></span></span>
    <span class="text-sm tabular-nums text-slate-900 font-semibold min-w-[3.5rem] text-right">${count.toLocaleString()}${extra}</span>
  </button>`;
}

function dataQuality() {
  const byCode = new Map();
  S.items.forEach(it => { const k = it.code.toUpperCase(); if (!byCode.has(k)) byCode.set(k, []); byCode.get(k).push(it); });
  const dups = [...byCode.values()].filter(g => g.length > 1);
  const unknown = S.items.filter(it => !isKnownBranch(it.branch));
  const groups = new Map();
  S.items.forEach(it => {
    const k = normKey(it.name); if (!k) return;
    if (!groups.has(k)) groups.set(k, new Map());
    const g = groups.get(k); g.set(it.name, (g.get(it.name) || 0) + 1);
  });
  const variants = [...groups.values()].filter(g => g.size > 1).map(g => [...g.entries()].sort((a, b) => b[1] - a[1]))
    .sort((a, b) => b.reduce((s, x) => s + x[1], 0) - a.reduce((s, x) => s + x[1], 0));
  return { dups, unknown, variants };
}

function renderDashboard() {
  const items = S.items, total = items.length;
  if (!S.loaded) { $('dash-tiles').innerHTML = Array.from({ length: 5 }, () => '<div class="card h-[5.5rem] skeleton"></div>').join(''); return; }
  const byStatus = Object.fromEntries(Object.keys(STATUS).map(s => [s, 0]));
  const byCat = new Map(), byBranch = new Map();
  let soon = 0;
  items.forEach(it => {
    byStatus[it.status] = (byStatus[it.status] || 0) + 1;
    byCat.set(it.category, (byCat.get(it.category) || 0) + 1);
    const bc = branchCode(it.branch);
    if (!byBranch.has(bc)) byBranch.set(bc, []);
    byBranch.get(bc).push(it);
    const w = warrantyInfo(it.warranty);
    if (w && w.days >= 0 && w.days <= 90) soon++;
  });
  const problem = PROBLEM_STATUSES.reduce((s, k) => s + (byStatus[k] || 0), 0);
  const q = dataQuality();
  const qCount = q.dups.length + q.unknown.length + q.variants.length;

  const tile = (label, value, icon, tone, onclick, sub = '') => `
    <button type="button" onclick="${onclick}" class="card card-hover text-left p-4 flex items-start gap-3">
      <span class="icon-tile ${tone}">${ic(icon)}</span>
      <span class="min-w-0"><span class="block text-xs text-slate-500 truncate">${label}</span>
        <span class="block text-2xl font-bold text-slate-900 tabular-nums leading-tight mt-0.5">${value.toLocaleString()}</span>${sub ? `<span class="block text-[11px] text-slate-400">${sub}</span>` : ''}</span>
    </button>`;
  $('dash-tiles').innerHTML =
    tile('อุปกรณ์ทั้งหมด', total, 'package', 'bg-slate-100 text-slate-700', "goSearch({})") +
    tile('ใช้งานอยู่', byStatus['ใช้งาน'] || 0, 'check-circle-2', 'bg-emerald-50 text-emerald-600', "goSearch({status:'ใช้งาน'})") +
    tile('ส่งซ่อม / ชำรุด', problem, 'wrench', 'bg-amber-50 text-amber-600', "goSearch({status:'problem'})") +
    tile('ประกันใกล้หมด', soon, 'calendar-clock', 'bg-orange-50 text-orange-600', "goSearch({warranty:'soon'})", 'ภายใน 90 วัน') +
    tile('ข้อมูลต้องตรวจสอบ', qCount, 'shield-alert', 'bg-red-50 text-red-600', "$('dash-quality-wrap').scrollIntoView({behavior:'smooth'})", 'รหัสซ้ำ · สาขา · ชื่อ');

  $('dash-cats').innerHTML = CATS.map(c => ({ c, n: byCat.get(c.v) || 0 })).sort((a, b) => b.n - a.n)
    .map(({ c, n }) => barRow({ label: c.v, count: n, total, color: '#16b35d', icon: c.icon, onclick: `goSearch({category:'${c.v}'})` })).join('');

  $('dash-status').innerHTML = Object.entries(STATUS).map(([s, st]) =>
    barRow({ label: s, count: byStatus[s] || 0, total, color: st.bar, icon: st.icon, onclick: `goSearch({status:'${s}'})` })).join('');

  const branchMax = Math.max(1, ...BRANCH_LIST.map(b => (byBranch.get(branchCode(b)) || []).length));
  $('dash-branches').innerHTML = BRANCH_LIST.map(b => {
    const list = byBranch.get(branchCode(b)) || [];
    const prob = list.filter(it => PROBLEM_STATUSES.includes(it.status)).length;
    return barRow({ label: b, count: list.length, total: branchMax, color: '#16b35d', onclick: `goSearch({branch:'${b}'})`,
      extra: prob ? ` <span class="ml-1 text-xs font-semibold text-amber-600">${prob}</span>` : '' });
  }).join('');

  // ความคืบหน้าตรวจนับเดือนนี้ รายสาขา
  $('dash-check-section').classList.toggle('hidden', DEMO);
  if (DEMO) { renderQuality(q); renderActivity(); return; }
  $('dash-round').textContent = roundLabel();
  let sumDone = 0, sumActive = 0;
  $('dash-checks').innerHTML = BRANCH_LIST.map(b => {
    const active = (byBranch.get(branchCode(b)) || []).filter(it => it.status !== DISPOSED);
    const done = active.filter(checkedThisRound);
    const issues = done.filter(it => it.lastCheckResult !== 'ปกติ').length;
    sumDone += done.length; sumActive += active.length;
    return barRow({ label: b, count: done.length, total: active.length, color: done.length === active.length && active.length ? '#0b8541' : '#3fcf7c',
      onclick: `openConsoleFor('${b}')`,
      extra: `<span class="text-slate-400 font-normal">/${active.length}</span>${issues ? ` <span class="ml-1 text-xs font-semibold text-amber-600">⚠${issues}</span>` : ''}` });
  }).join('');
  $('dash-check-total').innerHTML = `รวม <b class="text-slate-900">${sumDone.toLocaleString()}</b> / ${sumActive.toLocaleString()} เครื่อง · <b class="text-brand-700">${sumActive ? Math.round(sumDone / sumActive * 100) : 0}%</b>`;

  const wlist = items.map(it => ({ it, w: warrantyInfo(it.warranty) })).filter(x => x.w && x.w.days <= 90 && x.w.days >= -30)
    .sort((a, b) => a.w.days - b.w.days);
  $('dash-warranty').innerHTML = wlist.length ? wlist.map(({ it }) => `
    <button type="button" data-open="${it.row}" class="w-full text-left flex items-center gap-3 rounded-xl px-3 py-2 ring-1 ring-inset ring-slate-100 hover:bg-slate-50 hover:ring-brand-200 transition">
      <span class="flex-1 min-w-0"><span class="block text-sm font-medium text-slate-800 truncate">${esc(it.name)}</span>
        <span class="block text-xs text-slate-400">${esc(branchLabel(it.branch))} · <span class="font-mono">${esc(it.code)}</span></span></span>
      ${warrantyChip(it.warranty)}
    </button>`).join('') : '<p class="text-sm text-slate-400 py-6 text-center">ไม่มีอุปกรณ์ที่ประกันใกล้หมด</p>';

  renderQuality(q);
  renderActivity();
}

function renderQuality(q) {
  const admin = isAdmin() && !DEMO;   // demo ไม่มีเครื่องมือแอดมิน (ปุ่มรวมชื่อ)
  const col = (title, count, body) => `<div><p class="text-sm font-bold text-slate-800 mb-2 flex items-center gap-2">${title}
      <span class="badge ${count ? 'bg-red-50 text-red-700 ring-red-600/20' : 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'}">${count}</span></p>
    <div class="space-y-2 max-h-80 overflow-y-auto scroll-thin pr-1">${count ? body : `<p class="text-xs text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2 flex items-center gap-1.5">${ic('check', 'w-3.5 h-3.5')} ไม่พบปัญหา</p>`}</div></div>`;
  const dupHTML = q.dups.map(g => `<div class="rounded-xl bg-red-50/60 ring-1 ring-inset ring-red-100 p-2.5">
      <p class="font-mono text-xs font-bold text-red-700 mb-1">${esc(g[0].code)}</p>
      ${g.map(it => `<button type="button" data-open="${it.row}" class="block w-full text-left text-xs text-slate-700 hover:text-brand-700 hover:underline truncate">• ${esc(it.name)} — ${esc(branchLabel(it.branch))}</button>`).join('')}
    </div>`).join('');
  const unkHTML = q.unknown.map(it => `<button type="button" data-open="${it.row}" class="block w-full text-left rounded-xl px-3 py-2 ring-1 ring-inset ring-slate-100 hover:bg-slate-50">
      <span class="block text-sm text-slate-800 truncate">${esc(it.name)}</span><span class="block text-xs text-slate-400"><span class="font-mono">${esc(it.code)}</span> · สาขา "${esc(it.branch || '(ว่าง)')}"</span></button>`).join('');
  const varHTML = q.variants.slice(0, 30).map((g, i) => `<div class="rounded-xl bg-amber-50/60 ring-1 ring-inset ring-amber-100 p-2.5">
      ${g.map(([n, c]) => `<p class="text-xs text-slate-700 break-words">• ${esc(n)} <span class="text-slate-400">(${c})</span></p>`).join('')}
      ${admin ? `<div class="flex gap-1.5 mt-2"><select id="merge-${i}" class="field field-sm !h-8 text-xs">${g.map(([n]) => `<option value="${esc(n)}">${esc(n)}</option>`).join('')}</select>
        <button onclick="mergeNames(${i}, this)" class="btn btn-sm !h-8 bg-amber-500 text-white hover:bg-amber-600">รวมชื่อ</button></div>` : ''}
    </div>`).join('');
  S.variantGroups = q.variants;
  $('dash-quality').innerHTML =
    col('รหัสซ้ำ', q.dups.length, dupHTML) +
    col('สาขาไม่ถูกต้อง', q.unknown.length, unkHTML) +
    col('ชื่อรุ่นเดียวกันแต่สะกดต่างกัน', q.variants.length, (admin || DEMO ? '' : '<p class="text-xs text-slate-400">แอดมินสามารถรวมชื่อได้</p>') + varHTML);
}

async function mergeNames(i, btn) {
  const group = S.variantGroups[i];
  const to = $('merge-' + i).value;
  const from = group.map(([n]) => n).filter(n => n !== to);
  const count = group.filter(([n]) => n !== to).reduce((s, [, c]) => s + c, 0);
  if (!confirm(`เปลี่ยนชื่อ ${count} รายการ เป็น "${to}"?`)) return;
  await busy(btn, async () => {
    const res = await api('bulkRename', { from, to });
    if (!res.ok) { showToast(errMsg(res), 'error'); return; }
    showToast(`รวมชื่อแล้ว ${res.count} รายการ`);
    await loadItems(true);
  });
}

async function renderActivity() {
  const box = $('dash-activity');
  if (S.activity && Date.now() - S.activityAt < 60000) {
    box.innerHTML = S.activity.length ? S.activity.map(h => historyEntryHTML(h, true)).join('') : '<p class="text-sm text-slate-400 py-6 text-center">ยังไม่มีความเคลื่อนไหว</p>';
    return;
  }
  if (!S.activityLoading) box.innerHTML = '<div class="skeleton h-10"></div><div class="skeleton h-10"></div><div class="skeleton h-10"></div>';
  if (S.activityLoading) return;
  S.activityLoading = true;
  const res = await api('history', { limit: 20 });
  S.activityLoading = false;
  if (!res.ok) { box.innerHTML = '<p class="text-xs text-red-500">โหลดไม่สำเร็จ</p>'; return; }
  S.activity = res.history; S.activityAt = Date.now();
  if (S.tab === 'dashboard') renderActivity();
}

// ==================== Print & Export ====================
function initPrint() {
  $('p-branch').innerHTML = branchOptions('', 'ทุกสาขา');
  $('p-category').innerHTML = categoryOptions('', 'ทุกหมวดหมู่');
  $('p-status').innerHTML = `<option value="">ทุกสถานะ</option>` + statusOptions('');
  const refilter = () => { S.printSel = new Set(printFiltered().map(it => it.row)); renderPrint(); };
  ['p-branch', 'p-category', 'p-status'].forEach(id => $(id).addEventListener('change', refilter));
  $('p-q').addEventListener('input', debounce(refilter, 200));
  $('p-size').addEventListener('change', renderPrintPreview);
  $('p-rows').addEventListener('change', e => {
    const cb = e.target.closest('input[data-row]');
    if (!cb) return;
    const row = Number(cb.dataset.row);
    cb.checked ? S.printSel.add(row) : S.printSel.delete(row);
    updatePrintCount();
    renderPrintPreview();
  });
}

function printFiltered() {
  const fb = $('p-branch').value, fc = $('p-category').value, fs = $('p-status').value, q = $('p-q').value.trim().toLowerCase();
  const bc = fb ? branchCode(fb) : '';
  return S.items.filter(it => (!bc || branchCode(it.branch) === bc) && (!fc || it.category === fc) && (!fs || it.status === fs) &&
    (!q || [it.code, it.name, it.note].some(v => String(v || '').toLowerCase().includes(q))))
    .sort((a, b) => branchCode(a.branch).localeCompare(branchCode(b.branch)) || a.category.localeCompare(b.category, 'th') ||
      (parseInt(a.machineNo, 10) || 0) - (parseInt(b.machineNo, 10) || 0));
}

function renderPrint() {
  const list = printFiltered();
  const shown = list.slice(0, 500);
  $('p-rows').innerHTML = shown.map(it => `<tr class="hover:bg-slate-50 ${S.printSel.has(it.row) ? 'bg-brand-50/40' : ''}">
      <td class="px-3 py-2.5"><input type="checkbox" data-row="${it.row}" class="w-4 h-4 accent-brand-600" ${S.printSel.has(it.row) ? 'checked' : ''}></td>
      <td class="px-2 py-2.5 font-mono text-xs whitespace-nowrap text-slate-700">${esc(it.code)}</td>
      <td class="px-2 py-2.5 text-slate-800">${esc(it.name)}</td>
      <td class="px-2 py-2.5 text-slate-500 text-xs hidden sm:table-cell whitespace-nowrap">${esc(branchLabel(it.branch))}</td>
      <td class="px-2 py-2 text-center">${esc(it.machineNo || '-')}</td>
      <td class="px-2 py-2 hidden md:table-cell">${statusBadge(it.status)}</td></tr>`).join('') +
    (list.length > shown.length ? `<tr><td colspan="6" class="px-3 py-3 text-xs text-slate-400 text-center">แสดง 500 จาก ${list.length} รายการ — ใช้ตัวกรองเพื่อจำกัดรายการ</td></tr>` : '') +
    (!list.length ? `<tr><td colspan="6" class="px-3 py-10 text-sm text-slate-400 text-center">${S.loaded ? 'ไม่พบรายการ' : 'กำลังโหลด...'}</td></tr>` : '');
  updatePrintCount();
  renderPrintPreview();
}

function selectedForPrint() { return printFiltered().filter(it => S.printSel.has(it.row)); }

function updatePrintCount() {
  const list = printFiltered();
  const n = selectedForPrint().length;
  $('p-count').innerHTML = `เลือกไว้ <b class="text-slate-900">${n.toLocaleString()}</b> ดวง จาก ${list.length.toLocaleString()} รายการ`;
  $('p-print-btn').querySelector('span').textContent = `พิมพ์ QR (${n})`;
  $('p-check-all').checked = list.length > 0 && n === list.length;
}

function renderPrintPreview() {
  const sel = selectedForPrint();
  const cm = Number($('p-size').value);
  $('p-preview').innerHTML = sel.length
    ? sel.slice(0, 12).map(it => stickerHTML(it, cm)).join('') + (sel.length > 12 ? `<p class="text-xs text-slate-400 self-center">+ อีก ${sel.length - 12} ดวง</p>` : '')
    : '<p class="text-xs text-slate-400 m-auto">เลือกรายการทางซ้ายเพื่อดูตัวอย่าง</p>';
}

function printSelectAll(on) {
  S.printSel = on ? new Set(printFiltered().map(it => it.row)) : new Set();
  renderPrint();
}
function printSelected() { printItems(selectedForPrint(), Number($('p-size').value)); }

function exportCSV() {
  const list = printFiltered();
  if (!list.length) { showToast('ไม่มีข้อมูลให้ส่งออก', 'warn'); return; }
  const cols = [['code', 'รหัสอุปกรณ์'], ['name', 'ชื่ออุปกรณ์'], ['category', 'หมวดหมู่'], ['branch', 'สาขา'], ['machineNo', 'เครื่องที่'],
    ['status', 'สถานะ'], ['warranty', 'วันหมดประกัน'], ['spec', 'สเปค'], ['note', 'หมายเหตุ'], ['createdAt', 'วันที่ลงทะเบียน'],
    ['createdBy', 'ลงทะเบียนโดย'], ['updatedAt', 'แก้ไขล่าสุด'], ['updatedBy', 'แก้ไขโดย']];
  const cell = v => {
    v = String(v ?? '');
    if (/^[=+@]|^-./.test(v)) v = "'" + v;   // กันสูตรใน Excel
    return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  };
  const csv = String.fromCharCode(0xFEFF) + [cols.map(c => c[1]).join(','), ...list.map(it => cols.map(c => cell(it[c[0]])).join(','))].join('\r\n');
  const d = new Date();
  const branch = $('p-branch').value ? branchCode($('p-branch').value) : 'all';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `sala-inventory-${branch}-${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  showToast(`ส่งออก ${list.length.toLocaleString()} รายการแล้ว`);
}

// ==================== Boot ====================
// ==================== PWA (ติดตั้งเป็นแอป) ====================
function initPWA() {
  if (DEMO) return;
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW register failed', e));
  }
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    S.installPrompt = e;
    $('install-btn').classList.remove('hidden');
    $('install-btn').classList.add('inline-flex');
  });
  window.addEventListener('appinstalled', () => {
    $('install-btn').classList.add('hidden');
    showToast('ติดตั้งแอปเรียบร้อย เปิดได้จากหน้าจอหลัก');
  });
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  let dismissed = false;
  try { dismissed = localStorage.getItem('inv_ios_tip') === '1'; } catch (e) {}
  if (isIOS && !standalone && !dismissed) setTimeout(() => $('ios-tip').classList.remove('hidden'), 4000);
}
async function installApp() {
  if (!S.installPrompt) return;
  S.installPrompt.prompt();
  await S.installPrompt.userChoice;
  S.installPrompt = null;
  $('install-btn').classList.add('hidden');
}
function dismissIosTip() {
  $('ios-tip').classList.add('hidden');
  try { localStorage.setItem('inv_ios_tip', '1'); } catch (e) {}
}

async function boot() {
  $('footer-version').textContent = 'v' + APP_VERSION + (DEMO ? ' (ตัวอย่าง)' : MOCK ? ' (Mock)' : '');
  initRegisterForm();
  initSearch();
  initPrint();
  initConsole();
  initDisposals();
  initPWA();
  if (MOCK) {
    await loadScript('mock-api.js?v=' + APP_VERSION);
    $('mock-login').classList.remove('hidden');
    $('g-btn').classList.add('hidden');
    if (DEMO) {
      $('demo-title').textContent = 'เลือกบทบาทเพื่อชมตัวอย่าง';
      $('demo-sub').textContent = 'หน้าตัวอย่าง ใช้ข้อมูลสมมติ ยังไม่ได้เชื่อมระบบเข้าสู่ระบบจริง';
      document.querySelectorAll('.login-only').forEach(el => el.classList.add('hidden'));
    }
  }
  if (DEMO) {
    $('login-screen').style.display = 'none';
    if (!loadSession() || !loadBootCache()) { await mockLogin('admin'); return; }
    afterAuth(loadBootCache().user, loadBootCache().items);
    return;
  }
  if (loadSession()) {
    // เปิดจากแคชทันที แล้วซิงก์ข้อมูลล่าสุดเบื้องหลัง
    const cached = loadBootCache();
    if (cached) {
      afterAuth(cached.user, cached.items);
      if (S.user.status === 'approved') revalidate();
      return;
    }
    $('login-checking').classList.remove('hidden');
    const res = await api('me', { withItems: true });
    if (res.ok) { afterAuth(res.user, res.items); return; }
  }
  showLogin();
}
boot();
