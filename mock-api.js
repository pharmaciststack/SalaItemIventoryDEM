// =====================================================
// Mock backend สำหรับทดสอบบนเครื่อง (localhost) เท่านั้น
// จำลองการทำงานของ apps-script/Code.gs ทุกคำสั่ง — ข้อมูลเก็บใน localStorage ของเบราว์เซอร์
// ใช้ข้อมูลสมมติ ไม่เชื่อมต่อ Google Sheet จริง
// =====================================================
(function () {
  const DB_KEY = 'inv_mock_db_v2';

  const CATS = {
    PC: 'คอมพิวเตอร์', PT: 'ปริ้นเตอร์/เครื่องพิมพ์ฉลาก', PH: 'โทรศัพท์/แทปเลต',
    EP: 'อุปกรณ์พ่วงคอมพิวเตอร์อื่นๆ', EE: 'อุปกรณ์อิเลคทรอนิกส์อื่นๆ', CA: 'กล้องวงจรปิด',
  };
  const STATUSES = ['ใช้งาน', 'สำรอง', 'ส่งซ่อม', 'ชำรุด', 'จำหน่ายแล้ว'];
  const DISPOSED = 'จำหน่ายแล้ว';
  const CHECK_RESULTS = ['ปกติ', 'ชำรุด', 'ไม่พบ'];
  const DISPOSE_METHODS = ['ขาย', 'ทิ้ง/ทำลาย', 'ส่งคืนผู้ขาย/บริษัท', 'บริจาค', 'สูญหาย', 'อื่นๆ'];
  const STAFF_FIELDS = ['spec', 'note'];
  const ADMIN_FIELDS = ['name', 'category', 'machineNo', 'warranty', 'spec', 'note', 'code'];

  const MODELS = {
    PC: ['Lenovo ThinkCentre Neo 30a Gen 4', 'ACER-C24-1750 series', 'Dell-Latitude-5450', 'HP ProDesk 400 G9'],
    PT: ['EPSON L3210 Series', 'TSC TTP-244 Pro', 'TSC-TTP-244-Pro', 'EPSON-L3110-Series-ปริ้นเตอร์'],
    PH: ['SM-A155F/DSN', 'iPad 10th Gen'],
    EP: ['APC BACK-UPS BX950U-MS 950VA/480W เครื่องสำรองไฟ', 'Honeywell-Barcode-Scanner-MS7120',
         'Honeywell-Orbit-MS7120', 'Logitech-K270-M185', 'CDG-SmartCard-Reader-FEITIAN-R301-C11'],
    EE: ['เครื่องปรับอากาศ-Mitsubishi', 'Mitsubishi-Electric-Air-Condition', 'เตาไมโครเวฟ-Sharp-R-220', 'เครื่องสแกนลายนิ้วมือ-ZKTECO'],
    CA: ['VStarcam-IP-Camera-C24S', 'VSTARCAM', 'Hikvision DS-2CD1023G0E'],
  };

  const USERS = {
    admin:    { email: 'admin@test.local',    name: 'แอดมิน ทดสอบ',      branch: '16 ออฟฟิศ',       status: 'approved', admin: true },
    staff:    { email: 'staff@test.local',    name: 'พนักงาน เขาไร่ยา',   branch: '06 เขาไร่ยา',      status: 'approved', admin: false },
    staff2:   { email: 'staff2@test.local',   name: 'พนักงาน ตลาดเจริญสุข', branch: '10 ตลาดเจริญสุข', status: 'approved', admin: false },
    pending:  { email: 'pending@test.local',  name: 'รออนุมัติ ทดสอบ',    branch: '10 ตลาดเจริญสุข', status: 'pending',  admin: false },
    newuser:  { email: 'new@test.local',      name: 'ผู้ใช้ใหม่ ทดสอบ',    branch: '',                status: '',         admin: false },
  };

  const PLACEHOLDER_PHOTO = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#e5e7eb"/>' +
    '<text x="320" y="250" font-size="32" text-anchor="middle" fill="#6b7280" font-family="sans-serif">รูปตัวอย่าง (Mock)</text></svg>');

  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const ymdhm = d => `${ymd(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const now = () => ymdhm(new Date());
  const branchCode = b => { const m = /^\s*(\d{1,2})(?!\d)/.exec(String(b || '')); return m ? m[1].padStart(2, '0') : ''; };

  // ── Seed data ─────────────────────────────────────
  function seed() {
    let s = 20260913;
    const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
    const pick = arr => arr[Math.floor(rnd() * arr.length)];
    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1, 9);

    const items = [];
    const counters = {};
    const prefixes = ['EP', 'EP', 'EP', 'EE', 'EE', 'CA', 'CA', 'PC', 'PC', 'PT', 'PH'];
    (window.BRANCH_LIST || []).forEach(branch => {
      const bc = branch.slice(0, 2);
      const n = 3 + Math.floor(rnd() * 7);
      for (let i = 0; i < n; i++) {
        const p = pick(prefixes);
        const key = p + bc;
        counters[key] = (counters[key] || 0) + 1;
        const d = new Date(2026, Math.floor(rnd() * 8), 1 + Math.floor(rnd() * 27), 9 + Math.floor(rnd() * 8), Math.floor(rnd() * 60));
        const dateStr = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
        let warranty = '';
        if (rnd() < 0.3) warranty = ymd(new Date(today.getTime() + (Math.floor(rnd() * 460) - 60) * 86400000));
        const r = rnd();
        const status = r < 0.86 ? 'ใช้งาน' : r < 0.91 ? 'ส่งซ่อม' : r < 0.95 ? 'ชำรุด' : 'สำรอง';
        // ตรวจนับ: ~45% ตรวจแล้วเดือนนี้, ~20% ตรวจเดือนก่อน
        const c = rnd();
        let lastCheckAt = '', lastCheckResult = '', lastCheckBy = '';
        if (c < 0.65) {
          const cd = c < 0.45 ? new Date(monthStart.getTime() + Math.floor(rnd() * Math.max(1, today.getDate() - 1)) * 86400000 + Math.floor(rnd() * 8) * 3600000)
                              : new Date(monthStart.getTime() - (3 + Math.floor(rnd() * 20)) * 86400000);
          const cr = rnd();
          lastCheckAt = ymdhm(cd); lastCheckBy = 'staff@test.local';
          lastCheckResult = cr < 0.9 ? 'ปกติ' : cr < 0.96 ? 'ชำรุด' : 'ไม่พบ';
        }
        items.push({
          code: `${p}${bc}${dateStr}${pad(counters[key])}`, name: pick(MODELS[p]), category: CATS[p],
          machineNo: String(counters[key]), warranty, branch,
          spec: rnd() < 0.3 ? 'S/N ' + Math.floor(rnd() * 1e8).toString(36).toUpperCase() : '',
          note: rnd() < 0.2 ? pick(['ใช้ที่เคาน์เตอร์', 'หน้าร้าน', 'ห้องยา', 'ซ่อมครั้งที่ 1']) : '',
          status, createdAt: ymdhm(d), createdBy: 'staff@test.local', updatedAt: '', updatedBy: '',
          lastCheckAt, lastCheckBy, lastCheckResult, disposalId: '',
        });
      }
    });
    // ตัวอย่างข้อมูลที่ต้องตรวจสอบ: รหัสซ้ำ + ไม่ระบุสาขา
    if (items.length > 10) {
      items.push({ ...items[5], name: items[5].name + ' (เครื่องที่ 2)' });
      items.push({ ...items[8], code: 'EE00' + items[8].code.slice(4), branch: '0' });
    }
    items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    // ตัวอย่างรายงานจำหน่าย 1 รายการในสาขา 06
    const reports = [];
    const victim = items.find(it => branchCode(it.branch) === '06' && it.status === 'ชำรุด') || items.find(it => branchCode(it.branch) === '06');
    if (victim) {
      const id = `DSP-${String(today.getFullYear()).slice(2)}${pad(today.getMonth() + 1)}-0001`;
      reports.push({
        id, createdAt: ymdhm(new Date(monthStart.getTime() + 86400000)), date: ymd(new Date(monthStart.getTime() + 86400000)),
        code: victim.code, name: victim.name, category: victim.category, branch: victim.branch, machineNo: victim.machineNo,
        method: 'ทิ้ง/ทำลาย', reason: 'ชำรุด ซ่อมไม่คุ้มค่า (ตัวอย่าง)', disposer: 'สมชาย ใจดี', reportedBy: 'staff@test.local',
        photos: [{ id: 'mock1', url: PLACEHOLDER_PHOTO, view: PLACEHOLDER_PHOTO }], prevStatus: victim.status,
        state: 'active', voidedBy: '', voidedAt: '', voidReason: '',
      });
      Object.assign(victim, { status: DISPOSED, disposalId: id, lastCheckAt: '', lastCheckResult: '' });
    }
    return {
      items, history: [], reports,
      users: Object.fromEntries(Object.values(USERS).filter(u => u.status).map(u => [u.email, { branch: u.branch, status: u.status }])),
      sessions: {},
    };
  }

  function load() {
    try { const raw = localStorage.getItem(DB_KEY); if (raw) return JSON.parse(raw); } catch (e) {}
    const db = seed();
    save(db);
    return db;
  }
  function save(db) {
    try { localStorage.setItem(DB_KEY, JSON.stringify(db)); }
    catch (e) { console.warn('Mock DB เต็ม (localStorage) — รีเซ็ตข้อมูลทดสอบถ้าจำเป็น', e); }
  }

  // ── Helpers (เหมือน Code.gs) ─────────────────────────
  function fail(code, message, extra) { return Object.assign({ ok: false, error: code, message }, extra || {}); }
  const item = (db, idx) => ({ ...db.items[idx], row: idx + 2 });
  function locate(db, row, code) {
    const idx = Number(row) - 2;
    if (db.items[idx] && db.items[idx].code === code) return idx;
    const hits = db.items.map((it, i) => (it.code === code ? i : -1)).filter(i => i >= 0);
    if (hits.length === 1) return hits[0];
    if (!hits.length) throw fail('not_found', 'ไม่พบรหัส ' + code + ' (อาจถูกลบไปแล้ว)');
    throw fail('conflict', 'ข้อมูลมีการเปลี่ยนแปลง กรุณารีเฟรชแล้วลองใหม่');
  }
  function nextFreeCode(code, codes) {
    const m = /^([A-Z]{2}\d{10})(\d{2})$/.exec(code);
    if (m) for (let n = Number(m[2]) + 1; n <= 99; n++) { const c = m[1] + pad(n); if (!codes.includes(c)) return { code: c, machineNo: String(n) }; }
    for (let n = 2; n < 1000; n++) if (!codes.includes(code + '-' + n)) return { code: code + '-' + n, machineNo: '' };
    return null;
  }
  function log(db, code, name, action, field, from, to, by, note) {
    db.history.push({ at: now(), code, name, action, field, from: String(from ?? ''), to: String(to ?? ''), by, note: note || '' });
  }
  function userInfo(db, email) {
    const base = Object.values(USERS).find(u => u.email === email);
    const reg = db.users[email];
    return {
      email, name: base.name, picture: '',
      registered: !!reg, status: reg && reg.status === 'approved' ? 'approved' : 'pending',
      branch: reg ? reg.branch : '', role: base.admin ? 'admin' : 'staff', isSuper: base.admin,
    };
  }
  function withItems(db, res, include) {
    const u = res.user;
    if (include && u.registered && u.status === 'approved') res.items = db.items.map((it, i) => ({ ...it, row: i + 2 })).filter(it => inScope(u, it.branch));
    return res;
  }
  const scopeOf = me => (me.role === 'admin' ? null : branchCode(me.branch));
  const inScope = (me, branch) => { const s = scopeOf(me); return s === null || (!!s && branchCode(branch) === s); };
  function requireScope(me, branch) { if (!inScope(me, branch)) throw fail('forbidden', 'ทำรายการได้เฉพาะอุปกรณ์ในสาขาของคุณ'); }

  // ── Router ────────────────────────────────────────
  function route(db, body) {
    const a = body.action;
    if (a === 'ping') return { ok: true, version: 'mock' };
    if (a === 'login') {
      const u = USERS[body.mockRole];
      if (!u) return fail('unauthorized', 'Invalid mock role');
      const session = 'mock-' + Math.random().toString(36).slice(2);
      db.sessions[session] = u.email;
      return withItems(db, { ok: true, session, expiresAt: Date.now() + 6 * 3600e3, user: userInfo(db, u.email) }, body.withItems);
    }
    const email = db.sessions[body.session];
    if (!email) return fail('unauthorized', 'หมดเวลาการเข้าสู่ระบบ');
    if (a === 'logout') { delete db.sessions[body.session]; return { ok: true }; }
    const me = userInfo(db, email);
    if (a === 'me') return withItems(db, { ok: true, user: me }, body.withItems);
    if (a === 'registerUser') {
      if (!body.branch) return fail('invalid', 'กรุณาระบุสาขา');
      if (!db.users[email]) db.users[email] = { branch: body.branch, status: 'pending' };
      return { ok: true, user: userInfo(db, email) };
    }
    if (me.status !== 'approved') return fail('not_approved', 'บัญชียังไม่ได้รับการอนุมัติ');
    const admin = me.role === 'admin';
    if (['setStatus', 'transfer', 'delete', 'bulkRename', 'voidDisposal'].includes(a) && !admin) return fail('forbidden', 'เฉพาะแอดมินเท่านั้น');

    switch (a) {
      case 'list':
        return { ok: true, items: db.items.map((it, i) => ({ ...it, row: i + 2 })).filter(it => inScope(me, it.branch)), scope: scopeOf(me), serverTime: Date.now() };

      case 'history': {
        const max = Math.min(Number(body.limit) || 50, 200);
        const allowed = admin ? null : new Set(db.items.filter(it => inScope(me, it.branch)).map(it => it.code));
        const list = db.history.filter(h => (!body.code || h.code === body.code) && (!allowed || allowed.has(h.code))).slice(-max).reverse();
        return { ok: true, history: list };
      }

      case 'create': {
        const it = body.item || {};
        const code = String(it.code || '').trim().toUpperCase();
        if (!String(it.name || '').trim()) return fail('invalid', 'กรุณาระบุชื่ออุปกรณ์');
        if (!it.branch) return fail('invalid', 'กรุณาเลือกสาขา');
        if (!Object.values(CATS).includes(it.category)) return fail('invalid', 'หมวดหมู่ไม่ถูกต้อง');
        if (!/^[A-Z0-9_-]{3,40}$/.test(code)) return fail('invalid', 'รหัสอุปกรณ์ต้องเป็น A-Z, 0-9 เท่านั้น');
        requireScope(me, it.branch);
        const codes = db.items.map(x => x.code);
        if (codes.includes(code)) return fail('duplicate', 'รหัส ' + code + ' มีอยู่ในระบบแล้ว', { suggestion: nextFreeCode(code, codes) });
        db.items.push({
          code, name: String(it.name).trim(), category: it.category, machineNo: String(it.machineNo || '').trim(),
          warranty: it.warranty || '', branch: it.branch, spec: String(it.spec || '').trim(), note: String(it.note || '').trim(),
          status: 'ใช้งาน', createdAt: now(), createdBy: email, updatedAt: '', updatedBy: '',
          lastCheckAt: '', lastCheckBy: '', lastCheckResult: '', disposalId: '',
        });
        log(db, code, it.name, 'create', '', '', it.branch, email, '');
        return { ok: true, item: item(db, db.items.length - 1) };
      }

      case 'update': {
        const fields = body.fields || {};
        const allowed = admin ? ADMIN_FIELDS : STAFF_FIELDS;
        const bad = Object.keys(fields).find(k => !allowed.includes(k));
        if (bad) return fail('forbidden', 'ไม่มีสิทธิ์แก้ไขช่อง ' + bad);
        const idx = locate(db, body.row, body.code);
        const cur = db.items[idx];
        requireScope(me, cur.branch);
        if ('code' in fields) {
          fields.code = String(fields.code).trim().toUpperCase();
          if (!/^[A-Z0-9_-]{3,40}$/.test(fields.code)) return fail('invalid', 'รหัสอุปกรณ์ไม่ถูกต้อง');
          if (fields.code !== cur.code && db.items.some(x => x.code === fields.code)) return fail('duplicate', 'รหัส ' + fields.code + ' มีอยู่ในระบบแล้ว');
        }
        if ('name' in fields && !String(fields.name).trim()) return fail('invalid', 'กรุณาระบุชื่ออุปกรณ์');
        const changed = [];
        Object.keys(fields).forEach(k => {
          const v = String(fields[k] ?? '').trim();
          if (v !== String(cur[k] ?? '')) {
            log(db, fields.code || cur.code, fields.name || cur.name, 'update', k, cur[k], v, email, '');
            cur[k] = v;
            changed.push(k);
          }
        });
        if (changed.length) { cur.updatedAt = now(); cur.updatedBy = email; }
        return { ok: true, changed, item: item(db, idx) };
      }

      case 'check': {
        if (!CHECK_RESULTS.includes(body.result)) return fail('invalid', 'ผลการตรวจไม่ถูกต้อง');
        const note = String(body.note || '').trim();
        if (body.result !== 'ปกติ' && !note) return fail('invalid', 'กรุณาระบุหมายเหตุเมื่อพบปัญหา');
        const idx = locate(db, body.row, body.code);
        const cur = db.items[idx];
        requireScope(me, cur.branch);
        if (cur.status === DISPOSED) return fail('invalid', 'อุปกรณ์นี้จำหน่ายแล้ว ไม่ต้องตรวจนับ');
        log(db, cur.code, cur.name, 'check', 'check', cur.lastCheckResult, body.result, email, note);
        Object.assign(cur, { lastCheckAt: now(), lastCheckBy: email, lastCheckResult: body.result });
        return { ok: true, item: item(db, idx) };
      }

      case 'dispose': {
        const photos = Array.isArray(body.photos) ? body.photos : [];
        const reason = String(body.reason || '').trim(), disposer = String(body.disposer || '').trim();
        if (!DISPOSE_METHODS.includes(body.method)) return fail('invalid', 'กรุณาเลือกวิธีการจำหน่าย');
        if (!reason) return fail('invalid', 'กรุณาระบุหมายเหตุ/เหตุผลการจำหน่าย');
        if (!disposer) return fail('invalid', 'กรุณาระบุชื่อผู้จำหน่ายสินค้าออก');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date || '')) return fail('invalid', 'กรุณาระบุวันที่จำหน่าย');
        if (!photos.length) return fail('invalid', 'ต้องแนบรูปถ่ายรายงานอย่างน้อย 1 รูป');
        if (photos.length > 3) return fail('invalid', 'แนบรูปได้สูงสุด 3 รูป');
        if (photos.some(p => !/^data:image\/(jpeg|png|webp);base64,/.test(p))) return fail('invalid', 'ไฟล์รูปภาพไม่ถูกต้อง');
        const idx = locate(db, body.row, body.code);
        const cur = db.items[idx];
        requireScope(me, cur.branch);
        if (cur.status === DISPOSED) return fail('invalid', 'อุปกรณ์นี้จำหน่ายไปแล้ว');
        const d = new Date();
        const prefix = `DSP-${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}-`;
        const id = prefix + pad(db.reports.filter(r => r.id.startsWith(prefix)).length + 1, 4);
        const report = {
          id, createdAt: now(), date: body.date, code: cur.code, name: cur.name, category: cur.category, branch: cur.branch,
          machineNo: cur.machineNo, method: body.method, reason, disposer, reportedBy: email,
          photos: photos.map((p, i) => ({ id: id + '-' + (i + 1), url: p, view: p })),
          prevStatus: cur.status, state: 'active', voidedBy: '', voidedAt: '', voidReason: '',
        };
        db.reports.push(report);
        log(db, cur.code, cur.name, 'dispose', 'status', cur.status, DISPOSED, email, `${id} · ${body.method} · ผู้จำหน่าย: ${disposer} · ${reason}`);
        Object.assign(cur, { status: DISPOSED, disposalId: id, updatedAt: now(), updatedBy: email });
        return { ok: true, report, item: item(db, idx) };
      }

      case 'disposals':
        return { ok: true, reports: db.reports.filter(r => inScope(me, r.branch)).slice().reverse() };

      case 'voidDisposal': {
        const reason = String(body.reason || '').trim();
        if (!reason) return fail('invalid', 'กรุณาระบุเหตุผลการยกเลิก');
        const rep = db.reports.find(r => r.id === body.id);
        if (!rep) return fail('not_found', 'ไม่พบรายงาน ' + body.id);
        if (rep.state === 'voided') return fail('invalid', 'รายงานนี้ถูกยกเลิกไปแล้ว');
        Object.assign(rep, { state: 'voided', voidedBy: email, voidedAt: now(), voidReason: reason });
        const idx = db.items.findIndex(it => it.disposalId === rep.id);
        let restored = null;
        if (idx >= 0) {
          const cur = db.items[idx];
          const restore = rep.prevStatus && rep.prevStatus !== DISPOSED ? rep.prevStatus : 'ใช้งาน';
          log(db, cur.code, cur.name, 'void', 'status', DISPOSED, restore, email, rep.id + ' · ' + reason);
          Object.assign(cur, { status: restore, disposalId: '', updatedAt: now(), updatedBy: email });
          restored = item(db, idx);
        }
        return { ok: true, report: rep, item: restored };
      }

      case 'setStatus': {
        if (!STATUSES.includes(body.status)) return fail('invalid', 'สถานะไม่ถูกต้อง');
        if (body.status === DISPOSED) return fail('invalid', 'การจำหน่ายต้องทำผ่าน "แจ้งจำหน่าย" เพื่อออกรายงาน');
        const idx = locate(db, body.row, body.code);
        const cur = db.items[idx];
        if (cur.status === body.status) return { ok: true, changed: [], item: item(db, idx) };
        if (cur.status === DISPOSED && cur.disposalId) return fail('invalid', 'อุปกรณ์นี้มีรายงานจำหน่าย ' + cur.disposalId + ' — ยกเลิกรายงานก่อนเปลี่ยนสถานะ');
        log(db, cur.code, cur.name, 'status', 'status', cur.status, body.status, email, body.note);
        Object.assign(cur, { status: body.status, updatedAt: now(), updatedBy: email });
        return { ok: true, changed: ['status'], item: item(db, idx) };
      }

      case 'transfer': {
        if (!body.branch) return fail('invalid', 'กรุณาเลือกสาขาปลายทาง');
        const idx = locate(db, body.row, body.code);
        const cur = db.items[idx];
        if (cur.branch === body.branch) return { ok: true, changed: [], item: item(db, idx) };
        log(db, cur.code, cur.name, 'transfer', 'branch', cur.branch, body.branch, email, body.note);
        Object.assign(cur, { branch: body.branch, updatedAt: now(), updatedBy: email });
        return { ok: true, changed: ['branch'], item: item(db, idx) };
      }

      case 'delete': {
        if (!String(body.reason || '').trim()) return fail('invalid', 'กรุณาระบุเหตุผลการลบ');
        const idx = locate(db, body.row, body.code);
        const cur = db.items[idx];
        log(db, cur.code, cur.name, 'delete', '', JSON.stringify(cur), '', email, body.reason);
        db.items.splice(idx, 1);
        return { ok: true };
      }

      case 'bulkRename': {
        const to = String(body.to || '').trim();
        const from = (body.from || []).filter(x => x && x !== to);
        if (!to || !from.length) return fail('invalid', 'ข้อมูลไม่ครบ');
        let count = 0;
        db.items.forEach(it => {
          if (!from.includes(it.name)) return;
          log(db, it.code, to, 'update', 'name', it.name, to, email, 'รวมชื่อ');
          Object.assign(it, { name: to, updatedAt: now(), updatedBy: email });
          count++;
        });
        return { ok: true, count };
      }
    }
    return fail('unknown_action', 'ไม่รู้จักคำสั่ง: ' + a);
  }

  window.MockAPI = {
    roles: USERS,
    async call(body) {
      await new Promise(r => setTimeout(r, 200 + Math.random() * 250));   // จำลองความหน่วงของเครือข่าย
      const db = load();
      let res;
      try { res = route(db, JSON.parse(JSON.stringify(body))); }
      catch (e) { res = e && e.error ? e : fail('server_error', String(e)); }
      save(db);
      return res;
    },
    approve(email) { const db = load(); if (db.users[email]) db.users[email].status = 'approved'; save(db); },
    reset() { try { localStorage.removeItem(DB_KEY); localStorage.removeItem('inv_mock_db_v1'); } catch (e) {} },
  };
})();
