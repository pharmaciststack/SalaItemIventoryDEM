// =====================================================
// ระบบลงทะเบียนอุปกรณ์ (Sala-Inventory) — Google Apps Script Backend v2.2.0
// วางโค้ดทั้งหมดนี้ใน Extensions > Apps Script ของ Google Sheet ข้อมูลอุปกรณ์
// Deploy > New deployment > Web app
//   Execute as: Me | Who has access: Anyone
// (สร้าง "New deployment" ใหม่ — deployment เดิมจะยังทำงานกับหน้าเว็บเก่าได้ตามปกติ)
// =====================================================

const APP_VERSION = '2.2.0';

// ── ตั้งค่า ───────────────────────────────────────────
const ITEM_SHEET     = 'Sheet1';     // ชีตข้อมูลอุปกรณ์ (ห้ามเปลี่ยนชื่อ)
const HISTORY_SHEET  = 'History';    // ประวัติการเปลี่ยนแปลง + การตรวจนับ (สร้างให้อัตโนมัติ)
const DISPOSAL_SHEET = 'Disposals';  // รายงานจำหน่ายอุปกรณ์ (สร้างให้อัตโนมัติ)
const PHOTO_FOLDER   = 'SalaInventory_DisposalPhotos';   // โฟลเดอร์ Google Drive เก็บรูปรายงานจำหน่าย
const MAX_PHOTOS     = 3;
const HISTORY_SCAN_ROWS = 5000;   // จำนวนแถวท้ายของชีต History ที่อ่านเพื่อแสดงประวัติ

// ใช้ Client ID เดียวกับระบบแจ้งซ่อม — อย่าลืมเพิ่ม origin ของเว็บนี้ใน Google Cloud Console
const GOOGLE_CLIENT_ID   = '854838901494-cuhmkrl29oj80i12apt7no01k763r3o2.apps.googleusercontent.com';
const SUPER_ADMIN_EMAILS = ['pharmacist@salaosot.com', 'goodyearzph@gmail.com'];

// ID ของ Google Sheet "ระบบแจ้งซ่อม" เพื่อใช้รายชื่อผู้ใช้ (Users) และแอดมิน (AdminEmails) ร่วมกัน
// ดูได้จาก URL: https://docs.google.com/spreadsheets/d/<<ID ตรงนี้>>/edit
// เว้นว่าง = ใช้ชีต Users / AdminEmails ในไฟล์นี้แทน
const AUTH_SHEET_ID = '';

const SESSION_SECONDS = 6 * 60 * 60;   // อายุการเข้าสู่ระบบ (สูงสุด 6 ชม. ตามข้อจำกัด CacheService)
const USER_CACHE_SECONDS = 120;        // แคชสิทธิ์ผู้ใช้ — อนุมัติ/ถอดสิทธิ์มีผลภายใน 2 นาที

const COL = {
  createdAt: 'Timestamp',
  name:      'Item Name',
  code:      'Item Code',
  category:  'Category',
  machineNo: 'MachineNo',
  warranty:  'WarrantyDate',
  branch:    'Branch',
  spec:      'Spec',
  note:      'Note',
  status:    'Status',
  updatedAt: 'UpdatedAt',
  updatedBy: 'UpdatedBy',
  createdBy: 'CreatedBy',
  lastCheckAt:     'LastCheckAt',
  lastCheckBy:     'LastCheckBy',
  lastCheckResult: 'LastCheckResult',
  disposalId:      'DisposalID',
};
const HISTORY_HEADERS  = ['Timestamp', 'Item Code', 'Item Name', 'Action', 'Field', 'From', 'To', 'By', 'Note'];
const DISPOSAL_HEADERS = ['ReportID', 'Timestamp', 'DisposeDate', 'Item Code', 'Item Name', 'Category', 'Branch', 'MachineNo',
                          'Method', 'Reason', 'Disposer', 'ReportedBy', 'Photos', 'PrevStatus', 'State', 'VoidedBy', 'VoidedAt', 'VoidReason'];

const CATEGORIES = ['คอมพิวเตอร์', 'ปริ้นเตอร์/เครื่องพิมพ์ฉลาก', 'โทรศัพท์/แทปเลต',
                    'อุปกรณ์พ่วงคอมพิวเตอร์อื่นๆ', 'อุปกรณ์อิเลคทรอนิกส์อื่นๆ', 'กล้องวงจรปิด'];
const STATUSES = ['ใช้งาน', 'สำรอง', 'ส่งซ่อม', 'ชำรุด', 'จำหน่ายแล้ว'];
const DEFAULT_STATUS = 'ใช้งาน';
const DISPOSED_STATUS = 'จำหน่ายแล้ว';
const CHECK_RESULTS = ['ปกติ', 'ชำรุด', 'ไม่พบ'];
const DISPOSE_METHODS = ['ขาย', 'ทิ้ง/ทำลาย', 'ส่งคืนผู้ขาย/บริษัท', 'บริจาค', 'สูญหาย', 'อื่นๆ'];

// ฟิลด์ที่แก้ไขได้ตามสิทธิ์
const STAFF_FIELDS = ['spec', 'note'];
const ADMIN_FIELDS = ['name', 'category', 'machineNo', 'warranty', 'spec', 'note', 'code'];
const FIELD_LIMITS = { name: 200, code: 40, spec: 2000, note: 2000, branch: 80, machineNo: 10 };

// ── Entry points ──────────────────────────────────────
function doGet(e) {
  // เปิด URL นี้ในเบราว์เซอร์เพื่อตรวจว่า deploy เวอร์ชันล่าสุดแล้ว
  return json({ ok: true, app: 'sala-inventory', version: APP_VERSION, time: new Date().toISOString() });
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json({ ok: false, error: 'bad_request' });
  }
  try {
    return json(route(body));
  } catch (err) {
    if (err && err.code) return json({ ok: false, error: err.code, message: err.message, suggestion: err.suggestion });
    console.error(err);
    return json({ ok: false, error: 'server_error', message: String(err && err.message || err) });
  }
}

function route(body) {
  const action = body.action;
  if (action === 'ping')  return { ok: true, version: APP_VERSION };
  if (action === 'login') return login(body.idToken, body.withItems);

  const session = requireSession(body.session);
  if (action === 'logout') {
    CacheService.getScriptCache().remove('s:' + body.session);
    return { ok: true };
  }

  const info = getUserInfo(session.email);
  if (action === 'me')           return withItems({ ok: true, user: publicUser(session, info) }, info, body.withItems);
  if (action === 'registerUser') return registerUser(session, info, body.branch);

  if (!info.isSuper && (!info.registered || info.status !== 'approved')) throw fail('not_approved', 'บัญชียังไม่ได้รับการอนุมัติ');

  switch (action) {
    case 'list':         return listItems(info);
    case 'history':      return getHistory(info, body.code, body.limit);
    case 'create':       return createItem(session, info, body.item || {});
    case 'update':       return updateItem(session, info, body);
    case 'check':        return checkItem(session, info, body);
    case 'dispose':      return disposeItem(session, info, body);
    case 'disposals':    return listDisposals(info);
    case 'voidDisposal': requireAdmin(info); return voidDisposal(session, body);
    case 'setStatus':    requireAdmin(info); return setStatus(session, body);
    case 'transfer':     requireAdmin(info); return transferItem(session, body);
    case 'delete':       requireAdmin(info); return deleteItem(session, body);
    case 'bulkRename':   requireAdmin(info); return bulkRename(session, body);
  }
  throw fail('unknown_action', 'ไม่รู้จักคำสั่ง: ' + action);
}

// ── ขอบเขตสาขา ────────────────────────────────────────
// แอดมินเห็นทุกสาขา · พนักงานเห็นเฉพาะสาขาที่ลงทะเบียนไว้ในชีต Users (เทียบจากเลขสาขา 2 หลัก)
function branchCode(b) {
  const m = /^\s*(\d{1,2})(?!\d)/.exec(String(b || ''));
  return m ? ('0' + m[1]).slice(-2) : '';
}

function scopeOf(info) {
  return info.isAdmin ? null : branchCode(info.branch);   // null = ทุกสาขา, '' = ไม่มีสาขา (เห็นอะไรไม่ได้)
}

function inScope(info, branch) {
  const s = scopeOf(info);
  return s === null || (!!s && branchCode(branch) === s);
}

function requireScope(info, branch) {
  if (!inScope(info, branch)) throw fail('forbidden', 'ทำรายการได้เฉพาะอุปกรณ์ในสาขาของคุณ');
}

// ── Auth ──────────────────────────────────────────────
// ตรวจ Google ID token กับเซิร์ฟเวอร์ Google (ตรวจลายเซ็นจริง ปลอม token ไม่ได้)
function verifyGoogleToken(idToken) {
  if (!idToken) throw fail('unauthorized', 'Missing token');
  const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken),
    { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw fail('unauthorized', 'Invalid token');
  const p = JSON.parse(res.getContentText());
  if (p.aud !== GOOGLE_CLIENT_ID) throw fail('unauthorized', 'Wrong audience');
  if (p.iss !== 'accounts.google.com' && p.iss !== 'https://accounts.google.com') throw fail('unauthorized', 'Wrong issuer');
  if (String(p.email_verified) !== 'true') throw fail('unauthorized', 'Email not verified');
  if (Number(p.exp) * 1000 < Date.now()) throw fail('unauthorized', 'Token expired');
  return { email: String(p.email).toLowerCase(), name: p.name || p.email, picture: p.picture || '' };
}

function login(idToken, includeItems) {
  const profile = verifyGoogleToken(idToken);
  const session = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
  CacheService.getScriptCache().put('s:' + session, JSON.stringify(profile), SESSION_SECONDS);
  const info = getUserInfo(profile.email);
  return withItems({ ok: true, session, expiresAt: Date.now() + SESSION_SECONDS * 1000, user: publicUser(profile, info) }, info, includeItems);
}

// แนบรายการอุปกรณ์ไปกับคำตอบ login/me — หน้าเว็บเปิดแอปได้ในการเรียกครั้งเดียว
function withItems(res, info, include) {
  if (include && (info.isSuper || (info.registered && info.status === 'approved'))) res.items = listItems(info).items;
  return res;
}

function requireSession(session) {
  if (!session) throw fail('unauthorized', 'กรุณาเข้าสู่ระบบ');
  const raw = CacheService.getScriptCache().get('s:' + session);
  if (!raw) throw fail('unauthorized', 'หมดเวลาการเข้าสู่ระบบ');
  return JSON.parse(raw);
}

function requireAdmin(info) {
  if (!info.isAdmin) throw fail('forbidden', 'เฉพาะแอดมินเท่านั้น');
}

function isSuperAdmin(email) {
  return SUPER_ADMIN_EMAILS.map(lower).indexOf(lower(email)) !== -1;
}

function getUserInfo(email) {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('u:' + email);
  if (hit) return JSON.parse(hit);

  const ss = authSpreadsheet();
  const isSuper = isSuperAdmin(email);
  const userRow = getOrCreateSheet(ss, 'Users', ['email', 'branch', 'registeredAt', 'role', 'status'])
    .getDataRange().getValues().slice(1)
    .find(r => lower(r[0]) === email);
  const inAdminList = getOrCreateSheet(ss, 'AdminEmails', ['email', 'addedAt'])
    .getDataRange().getValues().slice(1)
    .some(r => lower(r[0]) === email);

  const info = {
    registered: !!userRow || isSuper,
    // เหมือนระบบแจ้งซ่อม: ช่อง status ว่าง = รออนุมัติ
    status: isSuper || (userRow && String(userRow[4]).trim() === 'approved') ? 'approved' : 'pending',
    branch: userRow ? String(userRow[1] || '') : '',
    isAdmin: isSuper || inAdminList,
    isSuper,
  };
  cache.put('u:' + email, JSON.stringify(info), USER_CACHE_SECONDS);
  return info;
}

function publicUser(profile, info) {
  return {
    email: profile.email, name: profile.name, picture: profile.picture,
    registered: info.registered, status: info.status, branch: info.branch,
    role: info.isAdmin ? 'admin' : 'staff', isSuper: info.isSuper,
  };
}

function registerUser(session, info, branch) {
  branch = cleanText(branch, FIELD_LIMITS.branch);
  if (!branch) throw fail('invalid', 'กรุณาระบุสาขา');
  if (!info.registered) {
    const sh = getOrCreateSheet(authSpreadsheet(), 'Users', ['email', 'branch', 'registeredAt', 'role', 'status']);
    sh.appendRow([session.email, branch, new Date().toISOString(), 'user', isSuperAdmin(session.email) ? 'approved' : 'pending']);
    CacheService.getScriptCache().remove('u:' + session.email);
  }
  return { ok: true, user: publicUser(session, getUserInfo(session.email)) };
}

// ── Items ─────────────────────────────────────────────
function listItems(info) {
  const ctx = itemContext();
  const values = ctx.sheet.getDataRange().getValues();
  const items = [];
  for (let i = 1; i < values.length; i++) {
    if (!String(values[i][ctx.map[COL.code]] || '').trim()) continue;   // ข้ามแถวว่าง
    if (!inScope(info, values[i][ctx.map[COL.branch]])) continue;       // พนักงานเห็นเฉพาะสาขาตัวเอง
    items.push(rowToItem(values[i], i + 1, ctx));
  }
  return { ok: true, items, scope: scopeOf(info), serverTime: Date.now() };
}

function createItem(session, info, item) {
  const name     = cleanText(item.name, FIELD_LIMITS.name);
  const code     = cleanText(item.code, FIELD_LIMITS.code).toUpperCase();
  const category = String(item.category || '');
  const branch   = cleanText(item.branch, FIELD_LIMITS.branch);
  if (!name)   throw fail('invalid', 'กรุณาระบุชื่ออุปกรณ์');
  if (!branch) throw fail('invalid', 'กรุณาเลือกสาขา');
  if (CATEGORIES.indexOf(category) === -1) throw fail('invalid', 'หมวดหมู่ไม่ถูกต้อง');
  if (!/^[A-Z0-9_-]{3,40}$/.test(code)) throw fail('invalid', 'รหัสอุปกรณ์ต้องเป็น A-Z, 0-9 เท่านั้น');
  requireScope(info, branch);

  return withLock(() => {
    const ctx = itemContext();
    const codes = readCodes(ctx);
    if (codes.indexOf(code) !== -1) {
      const err = fail('duplicate', 'รหัส ' + code + ' มีอยู่ในระบบแล้ว');
      err.suggestion = nextFreeCode(code, codes);
      throw err;
    }
    const row = new Array(ctx.width).fill('');
    const set = (key, val) => { row[ctx.map[COL[key]]] = val; };
    set('createdAt', new Date());
    set('name', asText(name));
    set('code', asText(code));
    set('category', category);
    set('machineNo', toMachineNo(item.machineNo));
    set('warranty', toSheetDate(item.warranty, ctx.tz));
    set('branch', branch);
    set('spec', asText(cleanText(item.spec, FIELD_LIMITS.spec)));
    set('note', asText(cleanText(item.note, FIELD_LIMITS.note)));
    set('status', DEFAULT_STATUS);
    set('createdBy', session.email);
    ctx.sheet.appendRow(row);
    const rowNum = ctx.sheet.getLastRow();
    logHistory(code, name, 'create', '', '', branch, session.email, '');
    return { ok: true, item: readItem(ctx, rowNum) };
  });
}

function updateItem(session, info, body) {
  const fields = body.fields || {};
  const allowed = info.isAdmin ? ADMIN_FIELDS : STAFF_FIELDS;
  const keys = Object.keys(fields);
  if (!keys.length) throw fail('invalid', 'ไม่มีข้อมูลที่ต้องแก้ไข');
  keys.forEach(k => { if (allowed.indexOf(k) === -1) throw fail('forbidden', 'ไม่มีสิทธิ์แก้ไขช่อง ' + k); });

  return withLock(() => {
    const ctx = itemContext();
    const rowNum = locateRow(ctx, body.row, body.code);
    const current = readItem(ctx, rowNum);
    requireScope(info, current.branch);
    const next = {};
    keys.forEach(k => {
      let v = fields[k];
      if (k === 'code') {
        v = cleanText(v, FIELD_LIMITS.code).toUpperCase();
        if (!/^[A-Z0-9_-]{3,40}$/.test(v)) throw fail('invalid', 'รหัสอุปกรณ์ไม่ถูกต้อง');
        if (v !== current.code && readCodes(ctx).indexOf(v) !== -1) throw fail('duplicate', 'รหัส ' + v + ' มีอยู่ในระบบแล้ว');
      } else if (k === 'category') {
        if (CATEGORIES.indexOf(v) === -1) throw fail('invalid', 'หมวดหมู่ไม่ถูกต้อง');
      } else if (k === 'name') {
        v = cleanText(v, FIELD_LIMITS.name);
        if (!v) throw fail('invalid', 'กรุณาระบุชื่ออุปกรณ์');
      } else if (k === 'warranty') {
        v = v ? String(v).slice(0, 10) : '';
      } else if (k === 'machineNo') {
        v = String(toMachineNo(v));
      } else {
        v = cleanText(v, FIELD_LIMITS[k] || 2000);
      }
      if (String(v) !== String(current[k] == null ? '' : current[k])) next[k] = v;
    });

    const changed = Object.keys(next);
    changed.forEach(k => {
      const cell = ctx.sheet.getRange(rowNum, ctx.map[COL[k]] + 1);
      if (k === 'warranty')       cell.setValue(toSheetDate(next[k], ctx.tz));
      else if (k === 'machineNo') cell.setValue(toMachineNo(next[k]));
      else if (k === 'category')  cell.setValue(next[k]);
      else                        cell.setValue(asText(next[k]));
      logHistory(next.code || current.code, next.name || current.name, 'update', k, current[k], next[k], session.email, '');
    });
    if (changed.length) touch(ctx, rowNum, session.email);
    return { ok: true, changed, item: readItem(ctx, rowNum) };
  });
}

function setStatus(session, body) {
  const status = String(body.status || '');
  if (STATUSES.indexOf(status) === -1) throw fail('invalid', 'สถานะไม่ถูกต้อง');
  if (status === DISPOSED_STATUS) throw fail('invalid', 'การจำหน่ายต้องทำผ่าน "แจ้งจำหน่าย" เพื่อออกรายงาน');
  const note = cleanText(body.note, 500);
  return withLock(() => {
    const ctx = itemContext();
    const rowNum = locateRow(ctx, body.row, body.code);
    const current = readItem(ctx, rowNum);
    if (current.status === status) return { ok: true, changed: [], item: current };
    if (current.status === DISPOSED_STATUS && current.disposalId) {
      throw fail('invalid', 'อุปกรณ์นี้มีรายงานจำหน่าย ' + current.disposalId + ' — ยกเลิกรายงานก่อนเปลี่ยนสถานะ');
    }
    ctx.sheet.getRange(rowNum, ctx.map[COL.status] + 1).setValue(status);
    touch(ctx, rowNum, session.email);
    logHistory(current.code, current.name, 'status', 'status', current.status, status, session.email, note);
    return { ok: true, changed: ['status'], item: readItem(ctx, rowNum) };
  });
}

function transferItem(session, body) {
  const branch = cleanText(body.branch, FIELD_LIMITS.branch);
  if (!branch) throw fail('invalid', 'กรุณาเลือกสาขาปลายทาง');
  const note = cleanText(body.note, 500);
  return withLock(() => {
    const ctx = itemContext();
    const rowNum = locateRow(ctx, body.row, body.code);
    const current = readItem(ctx, rowNum);
    if (current.branch === branch) return { ok: true, changed: [], item: current };
    ctx.sheet.getRange(rowNum, ctx.map[COL.branch] + 1).setValue(branch);
    touch(ctx, rowNum, session.email);
    logHistory(current.code, current.name, 'transfer', 'branch', current.branch, branch, session.email, note);
    return { ok: true, changed: ['branch'], item: readItem(ctx, rowNum) };
  });
}

function deleteItem(session, body) {
  const reason = cleanText(body.reason, 500);
  if (!reason) throw fail('invalid', 'กรุณาระบุเหตุผลการลบ');
  return withLock(() => {
    const ctx = itemContext();
    const rowNum = locateRow(ctx, body.row, body.code);
    const current = readItem(ctx, rowNum);
    // เก็บข้อมูลทั้งแถวไว้ในประวัติ เผื่อต้องกู้คืน
    logHistory(current.code, current.name, 'delete', '', JSON.stringify(current), '', session.email, reason);
    ctx.sheet.deleteRow(rowNum);
    return { ok: true };
  });
}

// รวมชื่ออุปกรณ์ที่สะกดต่างกัน เช่น "TSC-TTP-244-Pro" → "TSC TTP-244 Pro"
function bulkRename(session, body) {
  const to = cleanText(body.to, FIELD_LIMITS.name);
  const from = (body.from || []).map(s => String(s)).filter(s => s && s !== to);
  if (!to || !from.length) throw fail('invalid', 'ข้อมูลไม่ครบ');
  return withLock(() => {
    const ctx = itemContext();
    const values = ctx.sheet.getDataRange().getValues();
    const nameCol = ctx.map[COL.name];
    let count = 0;
    for (let i = 1; i < values.length; i++) {
      const name = String(values[i][nameCol]);
      if (from.indexOf(name) === -1) continue;
      ctx.sheet.getRange(i + 1, nameCol + 1).setValue(asText(to));
      touch(ctx, i + 1, session.email);
      logHistory(String(values[i][ctx.map[COL.code]]), to, 'update', 'name', name, to, session.email, 'รวมชื่อ');
      count++;
    }
    return { ok: true, count };
  });
}

function getHistory(info, code, limit) {
  const sh = getOrCreateSheet(SpreadsheetApp.getActiveSpreadsheet(), HISTORY_SHEET, HISTORY_HEADERS);
  const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  // อ่านเฉพาะแถวท้ายสุด (ประวัติล่าสุด) — ชีตโตขึ้นเรื่อยๆ ไม่ต้องอ่านทั้งหมด
  const last = sh.getLastRow();
  const from = Math.max(2, last - HISTORY_SCAN_ROWS + 1);
  const values = last < 2 ? [] : sh.getRange(from, 1, last - from + 1, HISTORY_HEADERS.length).getValues();
  const max = Math.min(Number(limit) || 50, 200);
  // พนักงาน: เห็นเฉพาะประวัติของอุปกรณ์ที่อยู่ในสาขาตัวเอง (อ่านแค่คอลัมน์รหัส+สาขา)
  let allowed = null;
  if (scopeOf(info) !== null) {
    allowed = {};
    const ctx = itemContext();
    const n = ctx.sheet.getLastRow() - 1;
    if (n > 0) {
      const codes = ctx.sheet.getRange(2, ctx.map[COL.code] + 1, n, 1).getValues();
      const branches = ctx.sheet.getRange(2, ctx.map[COL.branch] + 1, n, 1).getValues();
      codes.forEach((r, i) => { if (inScope(info, branches[i][0])) allowed[String(r[0]).trim()] = true; });
    }
  }
  const out = [];
  for (let i = values.length - 1; i >= 0 && out.length < max; i--) {
    const r = values[i];
    if (code && String(r[1]) !== String(code)) continue;
    if (allowed && !allowed[String(r[1])]) continue;
    out.push({
      at: fmt(r[0], tz, 'yyyy-MM-dd HH:mm'), code: String(r[1]), name: String(r[2]), action: String(r[3]),
      field: String(r[4]), from: String(r[5]), to: String(r[6]), by: String(r[7]), note: String(r[8] || ''),
    });
  }
  return { ok: true, history: out };
}

// ── ตรวจนับสต็อก ──────────────────────────────────────
function checkItem(session, info, body) {
  const result = String(body.result || '');
  if (CHECK_RESULTS.indexOf(result) === -1) throw fail('invalid', 'ผลการตรวจไม่ถูกต้อง');
  const note = cleanText(body.note, 500);
  if (result !== 'ปกติ' && !note) throw fail('invalid', 'กรุณาระบุหมายเหตุเมื่อพบปัญหา');
  return withLock(() => {
    const ctx = itemContext();
    const rowNum = locateRow(ctx, body.row, body.code);
    const current = readItem(ctx, rowNum);
    requireScope(info, current.branch);
    if (current.status === DISPOSED_STATUS) throw fail('invalid', 'อุปกรณ์นี้จำหน่ายแล้ว ไม่ต้องตรวจนับ');
    ctx.sheet.getRange(rowNum, ctx.map[COL.lastCheckAt] + 1).setValue(new Date());
    ctx.sheet.getRange(rowNum, ctx.map[COL.lastCheckBy] + 1).setValue(session.email);
    ctx.sheet.getRange(rowNum, ctx.map[COL.lastCheckResult] + 1).setValue(result);
    logHistory(current.code, current.name, 'check', 'check', current.lastCheckResult, result, session.email, note);
    return { ok: true, item: readItem(ctx, rowNum) };
  });
}

// ── รายงานจำหน่าย ─────────────────────────────────────
function disposeItem(session, info, body) {
  const method   = String(body.method || '');
  const reason   = cleanText(body.reason, 1000);
  const disposer = cleanText(body.disposer, 120);
  const date     = /^\d{4}-\d{2}-\d{2}$/.test(String(body.date || '')) ? String(body.date) : '';
  const photos   = Array.isArray(body.photos) ? body.photos : [];
  if (DISPOSE_METHODS.indexOf(method) === -1) throw fail('invalid', 'กรุณาเลือกวิธีการจำหน่าย');
  if (!reason)   throw fail('invalid', 'กรุณาระบุหมายเหตุ/เหตุผลการจำหน่าย');
  if (!disposer) throw fail('invalid', 'กรุณาระบุชื่อผู้จำหน่ายสินค้าออก');
  if (!date)     throw fail('invalid', 'กรุณาระบุวันที่จำหน่าย');
  if (!photos.length) throw fail('invalid', 'ต้องแนบรูปถ่ายรายงานอย่างน้อย 1 รูป');
  if (photos.length > MAX_PHOTOS) throw fail('invalid', 'แนบรูปได้สูงสุด ' + MAX_PHOTOS + ' รูป');

  // ตรวจสิทธิ์ก่อนอัปโหลดรูป
  const pre = itemContext();
  const preItem = readItem(pre, locateRow(pre, body.row, body.code));
  requireScope(info, preItem.branch);
  if (preItem.status === DISPOSED_STATUS) throw fail('invalid', 'อุปกรณ์นี้จำหน่ายไปแล้ว');

  const stamp = Utilities.formatDate(new Date(), pre.tz, 'yyyyMMdd-HHmmss');
  const saved = savePhotos(photos, preItem.code + '_' + stamp);

  return withLock(() => {
    const ctx = itemContext();
    const rowNum = locateRow(ctx, body.row, body.code);
    const current = readItem(ctx, rowNum);
    if (current.status === DISPOSED_STATUS) throw fail('invalid', 'อุปกรณ์นี้จำหน่ายไปแล้ว');

    const dsh = getOrCreateSheet(SpreadsheetApp.getActiveSpreadsheet(), DISPOSAL_SHEET, DISPOSAL_HEADERS);
    const prefix = 'DSP-' + Utilities.formatDate(new Date(), ctx.tz, 'yyMM') + '-';
    const seq = dsh.getDataRange().getValues().slice(1).filter(r => String(r[0]).indexOf(prefix) === 0).length + 1;
    const id = prefix + ('000' + seq).slice(-4);

    dsh.appendRow([id, new Date(), toSheetDate(date, ctx.tz), asText(current.code), asText(current.name), current.category,
      current.branch, current.machineNo, method, asText(reason), asText(disposer), session.email, JSON.stringify(saved),
      current.status, 'active', '', '', '']);
    ctx.sheet.getRange(rowNum, ctx.map[COL.status] + 1).setValue(DISPOSED_STATUS);
    ctx.sheet.getRange(rowNum, ctx.map[COL.disposalId] + 1).setValue(id);
    touch(ctx, rowNum, session.email);
    logHistory(current.code, current.name, 'dispose', 'status', current.status, DISPOSED_STATUS, session.email,
      id + ' · ' + method + ' · ผู้จำหน่าย: ' + disposer + ' · ' + reason);
    return { ok: true, report: readDisposal(dsh.getLastRow()), item: readItem(ctx, rowNum) };
  });
}

function listDisposals(info) {
  const sh = getOrCreateSheet(SpreadsheetApp.getActiveSpreadsheet(), DISPOSAL_SHEET, DISPOSAL_HEADERS);
  const last = sh.getLastRow();
  const out = [];
  for (let r = last; r >= 2; r--) {
    const d = readDisposal(r, sh);
    if (d.id && inScope(info, d.branch)) out.push(d);
  }
  return { ok: true, reports: out };
}

function voidDisposal(session, body) {
  const reason = cleanText(body.reason, 500);
  if (!reason) throw fail('invalid', 'กรุณาระบุเหตุผลการยกเลิก');
  return withLock(() => {
    const sh = getOrCreateSheet(SpreadsheetApp.getActiveSpreadsheet(), DISPOSAL_SHEET, DISPOSAL_HEADERS);
    const ids = sh.getRange(1, 1, sh.getLastRow(), 1).getValues().map(r => String(r[0]));
    const r = ids.indexOf(String(body.id)) + 1;
    if (r < 2) throw fail('not_found', 'ไม่พบรายงาน ' + body.id);
    const rep = readDisposal(r, sh);
    if (rep.state === 'voided') throw fail('invalid', 'รายงานนี้ถูกยกเลิกไปแล้ว');
    sh.getRange(r, 15, 1, 4).setValues([['voided', session.email, new Date(), asText(reason)]]);

    // คืนสถานะอุปกรณ์ (ถ้ายังผูกกับรายงานนี้อยู่)
    const ctx = itemContext();
    const values = ctx.sheet.getDataRange().getValues();
    let item = null;
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][ctx.map[COL.disposalId]]) !== rep.id) continue;
      const restore = rep.prevStatus && rep.prevStatus !== DISPOSED_STATUS ? rep.prevStatus : DEFAULT_STATUS;
      ctx.sheet.getRange(i + 1, ctx.map[COL.status] + 1).setValue(restore);
      ctx.sheet.getRange(i + 1, ctx.map[COL.disposalId] + 1).setValue('');
      touch(ctx, i + 1, session.email);
      logHistory(rep.code, rep.name, 'void', 'status', DISPOSED_STATUS, restore, session.email, rep.id + ' · ' + reason);
      item = readItem(ctx, i + 1);
      break;
    }
    return { ok: true, report: readDisposal(r, sh), item };
  });
}

function readDisposal(rowNum, sh) {
  sh = sh || SpreadsheetApp.getActiveSpreadsheet().getSheetByName(DISPOSAL_SHEET);
  const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  const r = sh.getRange(rowNum, 1, 1, DISPOSAL_HEADERS.length).getValues()[0];
  let photos = [];
  try { photos = JSON.parse(String(r[12] || '[]')); } catch (e) {}
  return {
    id: String(r[0]), createdAt: fmt(r[1], tz, 'yyyy-MM-dd HH:mm'), date: fmt(r[2], tz, 'yyyy-MM-dd'),
    code: String(r[3]), name: String(r[4]), category: String(r[5]), branch: String(r[6]), machineNo: String(r[7]),
    method: String(r[8]), reason: String(r[9]), disposer: String(r[10]), reportedBy: String(r[11]), photos,
    prevStatus: String(r[13]), state: String(r[14] || 'active'), voidedBy: String(r[15]),
    voidedAt: fmt(r[16], tz, 'yyyy-MM-dd HH:mm'), voidReason: String(r[17] || ''),
  };
}

// บันทึกรูป (data URL จากหน้าเว็บ ย่อขนาดแล้ว) ลง Google Drive
function savePhotos(photos, prefix) {
  const folders = DriveApp.getFoldersByName(PHOTO_FOLDER);
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(PHOTO_FOLDER);
  return photos.map((p, i) => {
    const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(p));
    if (!m) throw fail('invalid', 'ไฟล์รูปภาพไม่ถูกต้อง');
    if (m[2].length > 8 * 1024 * 1024) throw fail('invalid', 'รูปภาพมีขนาดใหญ่เกินไป');
    const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
    const file = folder.createFile(Utilities.newBlob(Utilities.base64Decode(m[2]), 'image/' + m[1], prefix + '_' + (i + 1) + '.' + ext));
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}   // บาง Workspace ไม่อนุญาต
    const id = file.getId();
    return { id, url: 'https://drive.google.com/thumbnail?id=' + id + '&sz=w1600', view: 'https://drive.google.com/file/d/' + id + '/view' };
  });
}

// ── Sheet helpers ─────────────────────────────────────
let ITEM_CTX = null;   // ใช้ซ้ำภายในคำขอเดียว (ลดการอ่านหัวตาราง)
function itemContext() {
  if (ITEM_CTX) return ITEM_CTX;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(ITEM_SHEET);
  if (!sheet) throw fail('sheet_missing', 'ไม่พบชีต ' + ITEM_SHEET);
  let headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0].map(h => String(h).trim());
  // เพิ่มคอลัมน์ใหม่ (Status, UpdatedAt, ...) ต่อท้ายถ้ายังไม่มี — ไม่แตะคอลัมน์เดิม
  const missing = Object.keys(COL).map(k => COL[k]).filter(h => headers.indexOf(h) === -1);
  if (missing.length) {
    sheet.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
    headers = headers.concat(missing);
  }
  const map = {};
  headers.forEach((h, i) => { if (!(h in map)) map[h] = i; });
  ITEM_CTX = { sheet, map, width: headers.length, tz: ss.getSpreadsheetTimeZone() };
  return ITEM_CTX;
}

function rowToItem(r, rowNum, ctx) {
  const get = key => r[ctx.map[COL[key]]];
  const str = key => String(get(key) == null ? '' : get(key)).trim();
  return {
    row: rowNum,
    code: str('code'),
    name: str('name'),
    category: str('category'),
    machineNo: str('machineNo'),
    warranty: fmt(get('warranty'), ctx.tz, 'yyyy-MM-dd'),
    branch: str('branch'),
    spec: str('spec'),
    note: str('note'),
    status: str('status') || DEFAULT_STATUS,
    createdAt: fmt(get('createdAt'), ctx.tz, 'yyyy-MM-dd HH:mm'),
    createdBy: str('createdBy'),
    updatedAt: fmt(get('updatedAt'), ctx.tz, 'yyyy-MM-dd HH:mm'),
    updatedBy: str('updatedBy'),
    lastCheckAt: fmt(get('lastCheckAt'), ctx.tz, 'yyyy-MM-dd HH:mm'),
    lastCheckBy: str('lastCheckBy'),
    lastCheckResult: str('lastCheckResult'),
    disposalId: str('disposalId'),
  };
}

function readItem(ctx, rowNum) {
  return rowToItem(ctx.sheet.getRange(rowNum, 1, 1, ctx.width).getValues()[0], rowNum, ctx);
}

function readCodes(ctx) {
  const last = ctx.sheet.getLastRow();
  if (last < 2) return [];
  return ctx.sheet.getRange(2, ctx.map[COL.code] + 1, last - 1, 1).getValues()
    .map(r => String(r[0]).trim().toUpperCase()).filter(Boolean);
}

// หาแถวจากเลขแถว + รหัส (รองรับกรณีรหัสซ้ำ) ถ้าแถวเลื่อนไปแล้วให้ค้นจากรหัสแทน
function locateRow(ctx, row, code) {
  code = String(code || '').trim();
  const last = ctx.sheet.getLastRow();
  row = Number(row);
  if (row >= 2 && row <= last) {
    const at = String(ctx.sheet.getRange(row, ctx.map[COL.code] + 1).getValue()).trim();
    if (at === code) return row;
  }
  const codes = last < 2 ? [] : ctx.sheet.getRange(2, ctx.map[COL.code] + 1, last - 1, 1).getValues().map(r => String(r[0]).trim());
  const hits = [];
  codes.forEach((c, i) => { if (c === code) hits.push(i + 2); });
  if (hits.length === 1) return hits[0];
  if (!hits.length) throw fail('not_found', 'ไม่พบรหัส ' + code + ' (อาจถูกลบไปแล้ว)');
  throw fail('conflict', 'ข้อมูลมีการเปลี่ยนแปลง กรุณารีเฟรชแล้วลองใหม่');
}

function touch(ctx, rowNum, email) {
  ctx.sheet.getRange(rowNum, ctx.map[COL.updatedAt] + 1).setValue(new Date());
  ctx.sheet.getRange(rowNum, ctx.map[COL.updatedBy] + 1).setValue(email);
}

function logHistory(code, name, action, field, from, to, by, note) {
  const sh = getOrCreateSheet(SpreadsheetApp.getActiveSpreadsheet(), HISTORY_SHEET, HISTORY_HEADERS);
  sh.appendRow([new Date(), asText(code), asText(name), action, field,
                asText(String(from == null ? '' : from)), asText(String(to == null ? '' : to)), by, asText(note || '')]);
}

// รหัสรูปแบบ XX + สาขา 2 หลัก + วันที่ 8 หลัก + เครื่องที่ 2 หลัก → เพิ่มเลขเครื่องจนกว่าจะไม่ซ้ำ
function nextFreeCode(code, codes) {
  const m = /^([A-Z]{2}\d{10})(\d{2})$/.exec(code);
  if (m) {
    for (let n = Number(m[2]) + 1; n <= 99; n++) {
      const c = m[1] + ('0' + n).slice(-2);
      if (codes.indexOf(c) === -1) return { code: c, machineNo: String(n) };
    }
  }
  for (let n = 2; n < 1000; n++) {
    const c = code + '-' + n;
    if (codes.indexOf(c) === -1) return { code: c, machineNo: '' };
  }
  return null;
}

function getOrCreateSheet(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.setFrozenRows(1);
  }
  return sh;
}

function authSpreadsheet() {
  return AUTH_SHEET_ID ? SpreadsheetApp.openById(AUTH_SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
}

function withLock(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw fail('busy', 'ระบบกำลังบันทึกข้อมูลอื่นอยู่ กรุณาลองใหม่');
  try { return fn(); } finally { lock.releaseLock(); }
}

// ── Value helpers ─────────────────────────────────────
function fmt(v, tz, pattern) {
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v)) return Utilities.formatDate(v, tz, pattern);
  return String(v == null ? '' : v).trim();
}

function toSheetDate(s, tz) {
  s = String(s || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
  return Utilities.parseDate(s, tz, 'yyyy-MM-dd');
}

function toMachineNo(v) {
  const s = String(v == null ? '' : v).trim().slice(0, FIELD_LIMITS.machineNo);
  return /^\d+$/.test(s) ? Number(s) : s;
}

function cleanText(v, max) {
  return String(v == null ? '' : v).trim().slice(0, max);
}

// ใส่ ' นำหน้าเพื่อให้ Sheets เก็บเป็นข้อความเสมอ (กันสูตร =... และกัน "1/2" กลายเป็นวันที่)
function asText(v) {
  v = String(v == null ? '' : v);
  return v ? "'" + v : '';
}

function lower(v) { return String(v || '').toLowerCase().trim(); }

function fail(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

function json(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
