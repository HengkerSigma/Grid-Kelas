'use strict';
/*
 * Server Grid Kelas: menyajikan halaman, menyimpan data kelas, dan memeriksa login di sisi server.
 * Tanpa paket tambahan. Jalankan: node server.js
 *
 * Pengaturan lewat environment (semuanya opsional):
 *   PORT             port server (bawaan 3000)
 *   DATA_DIR         folder penyimpanan data (bawaan ./data)
 *   DEFAULT_PASSWORD password bawaan semua akun baru atau yang direset (bawaan 12345678)
 *   TRUST_PROXY=1    percayai header X-Forwarded-For dan X-Forwarded-Proto dari Nginx
 *   COOKIE_SECURE=1  paksa cookie sesi hanya lewat HTTPS
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const UPLOADS = path.join(DATA, 'uploads');
const DBFILE = path.join(DATA, 'db.json');
const SESSFILE = path.join(DATA, 'sessions.json');
const DEFAULT_PW = process.env.DEFAULT_PASSWORD || '12345678';
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const N = 32;
const PERT = 16;
const MAX_JSON = 300 * 1024;
const MAX_FILE = 20 * 1024 * 1024;
const SESSION_MS = 14 * 24 * 3600 * 1000;
const FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
const STATIC = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/db.js': ['db.js', 'text/javascript; charset=utf-8']
};
const CSP = "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

fs.mkdirSync(UPLOADS, { recursive: true });
const pad = (n) => String(n).padStart(2, '0');
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isStr = (v, max) => typeof v === 'string' && v.length <= max;
const clone = (v) => JSON.parse(JSON.stringify(v));

/* ---------- penyimpanan data ---------- */
const DOCS = new Map(); // "koleksi/id" -> data

function seed() {
  const courses = [
    ['ALP', 'Algoritma dan Pemrograman', 3, 'Senin', '08.00–10.30', 'R.301', '#e8002d', 'Budi Hartono'],
    ['BDT', 'Basis Data', 3, 'Senin', '13.00–15.30', 'Lab 2', '#0fa88f', 'Rina Kartika'],
    ['JAR', 'Jaringan Komputer', 3, 'Selasa', '08.00–10.30', 'Lab 1', '#3671c6', 'Hendra Gunawan'],
    ['MTD', 'Matematika Diskrit', 3, 'Selasa', '13.00–15.30', 'R.302', '#e06a00', 'Dian Prabowo'],
    ['STK', 'Statistika', 2, 'Rabu', '08.00–09.40', 'R.303', '#2e9e3e', 'Wahyu Nugraha'],
    ['SOP', 'Sistem Operasi', 3, 'Rabu', '13.00–15.30', 'Lab 3', '#c2417f', 'Yusuf Ramadhan'],
    ['RPL', 'Rekayasa Perangkat Lunak', 3, 'Kamis', '08.00–10.30', 'R.301', '#1f86c9', 'Fajar Siregar'],
    ['IMK', 'Interaksi Manusia dan Komputer', 2, 'Kamis', '13.00–14.40', 'R.304', '#5f6b7a', 'Citra Maheswari'],
    ['KEC', 'Kecerdasan Buatan', 3, 'Jumat', '08.00–10.30', 'Lab 2', '#7b4fd6', 'Andika Pratama']
  ];
  courses.forEach((c, i) => DOCS.set('courses/' + c[0], {
    k: c[0], urut: i + 1, nama: c[1], sks: c[2], hari: c[3], jam: c[4], ruang: c[5], warna: c[6], dosen: c[7]
  }));
  const names = [
    ['Adrian', 'Pratama', 'PRA'], ['Aisyah', 'Rahmawati', 'RAH'], ['Bagas', 'Saputra', 'SAP'], ['Bunga', 'Lestari', 'LES'],
    ['Cahya', 'Wijaya', 'WIJ'], ['Dimas', 'Anggara', 'ANG'], ['Dewi', 'Kusuma', 'KUS'], ['Eko', 'Prasetyo', 'PRS'],
    ['Farhan', 'Hakim', 'HAK'], ['Fitri', 'Handayani', 'HAN'], ['Galih', 'Nugroho', 'NUG'], ['Gita', 'Permata', 'PER'],
    ['Hadi', 'Santoso', 'SAN'], ['Indah', 'Maharani', 'MAH'], ['Irfan', 'Maulana', 'MAU'], ['Jihan', 'Azzahra', 'AZZ'],
    ['Kevin', 'Susanto', 'SUS'], ['Laras', 'Ayu', 'AYU'], ['Maulana', 'Yusuf', 'YUS'], ['Melati', 'Sari', 'SAR'],
    ['Naufal', 'Ramadhan', 'RAM'], ['Nadia', 'Putri', 'PUT'], ['Oktavian', 'Dwi', 'DWI'], ['Putri', 'Amelia', 'AME'],
    ['Rizky', 'Firmansyah', 'FIR'], ['Rina', 'Salsabila', 'SAL'], ['Satria', 'Wibowo', 'WIB'], ['Salma', 'Nabila', 'NAB'],
    ['Tegar', 'Mahendra', 'MHD'], ['Tiara', 'Anindya', 'ANI'], ['Yoga', 'Pangestu', 'PAN'], ['Zahra', 'Khairunnisa', 'KHA']
  ];
  names.forEach((n, i) => {
    const no = i + 1;
    DOCS.set('students/' + pad(no), { no: no, depan: n[0], belakang: n[1], kode: n[2] });
    DOCS.set('akun/' + pad(no), { no: no, nim: String(2026510000 + no), admin: no === 4, hash: null, salt: null, resetReq: null });
  });
  DOCS.set('pengumuman/p1', {
    judul: 'Selamat datang di kelas baru',
    isi: 'Pilih nama Anda lewat tombol Masuk / Daftar, lalu isi absen dan kumpulkan tugas dari tab Mata Kuliah.',
    k: '', at: Date.now()
  });
}
function load() {
  try {
    const obj = JSON.parse(fs.readFileSync(DBFILE, 'utf8'));
    Object.keys(obj).forEach((k) => DOCS.set(k, obj[k]));
  } catch (e) {
    seed();
    saveNow();
  }
}
let saveTimer = null;
function writeAtomic(file, text) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, text, { mode: 0o600 });
  fs.renameSync(tmp, file);
}
function saveNow() {
  const obj = {};
  DOCS.forEach((v, k) => { obj[k] = v; });
  writeAtomic(DBFILE, JSON.stringify(obj));
}
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { saveNow(); } catch (e) { console.error('Gagal menyimpan data:', e.message); } }, 200);
}
load();

/* ---------- sesi login ---------- */
const SESSIONS = new Map(); // token -> {no, exp}
try {
  const o = JSON.parse(fs.readFileSync(SESSFILE, 'utf8'));
  Object.keys(o).forEach((t) => { if (o[t].exp > Date.now()) SESSIONS.set(t, o[t]); });
} catch (e) { /* belum ada sesi */ }
let sessTimer = null;
function saveSessions() {
  clearTimeout(sessTimer);
  sessTimer = setTimeout(() => {
    const o = {};
    SESSIONS.forEach((v, k) => { o[k] = v; });
    try { writeAtomic(SESSFILE, JSON.stringify(o)); } catch (e) { console.error('Gagal menyimpan sesi:', e.message); }
  }, 300);
}
function dropSessions(no, exceptToken) {
  SESSIONS.forEach((v, k) => { if (v.no === no && k !== exceptToken) SESSIONS.delete(k); });
  saveSessions();
}
function cookies(req) {
  const o = {};
  String(req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) o[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  });
  return o;
}
function isAdminNo(no) {
  const a = DOCS.get('akun/' + pad(no));
  return !!(a && a.admin === true);
}
function getSession(req) {
  const t = cookies(req).gk_session;
  if (!t) return null;
  const s = SESSIONS.get(t);
  if (!s) return null;
  if (s.exp < Date.now()) { SESSIONS.delete(t); return null; }
  return { token: t, no: s.no, admin: isAdminNo(s.no) };
}
function setCookie(req, res, token, maxAgeSec) {
  const secure = process.env.COOKIE_SECURE === '1' ||
    (TRUST_PROXY && String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https');
  res.setHeader('Set-Cookie', 'gk_session=' + token + '; HttpOnly; SameSite=Lax; Path=/; Max-Age=' + maxAgeSec + (secure ? '; Secure' : ''));
}
setInterval(() => {
  const now = Date.now();
  SESSIONS.forEach((v, k) => { if (v.exp < now) SESSIONS.delete(k); });
}, 3600 * 1000).unref();

/* ---------- password ---------- */
function pbk(pw, salt) {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(pw, salt, 120000, 32, 'sha256', (e, k) => (e ? reject(e) : resolve(k.toString('hex'))));
  });
}
function safeEq(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}
async function checkPw(acc, pw) {
  if (acc.hash && acc.salt) return safeEq(await pbk(pw, acc.salt), acc.hash);
  return safeEq(pw, DEFAULT_PW);
}

/* ---------- pembatas ---------- */
const HITS = new Map();
function take(key, max, windowMs) {
  const now = Date.now();
  const a = (HITS.get(key) || []).filter((t) => now - t < windowMs);
  if (a.length >= max) { HITS.set(key, a); return false; }
  a.push(now);
  HITS.set(key, a);
  return true;
}
setInterval(() => { HITS.clear(); }, 3600 * 1000).unref();
const LOCKS = new Map(); // nomor absen -> {n, until}
function clientIp(req) {
  if (TRUST_PROXY) {
    const f = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (f) return f;
  }
  return req.socket.remoteAddress || 'x';
}

/* ---------- utilitas ---------- */
const SEG = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;
function parsePath(raw, kind) {
  let p;
  try { p = raw.split('/').map(decodeURIComponent); } catch (e) { return null; }
  if (!p.length || p.length > 16) return null;
  if (p.some((s) => !SEG.test(s) || s === '.' || s === '..')) return null;
  if (kind === 'doc' && p.length % 2 !== 0) return null;
  if (kind === 'col' && p.length % 2 !== 1) return null;
  return p.join('/');
}
function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function fail(res, code, errCode, message) { json(res, code, { code: errCode, message: message }); }
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('too_large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function readJson(req, res) {
  try {
    const buf = await readBody(req, MAX_JSON);
    const v = JSON.parse(buf.toString('utf8') || '{}');
    if (!isObj(v)) { fail(res, 400, 'invalid_argument', 'Isi harus berupa objek JSON.'); return null; }
    return v;
  } catch (e) {
    fail(res, e.message === 'too_large' ? 413 : 400, e.message === 'too_large' ? 'resource_exhausted' : 'invalid_argument', 'Data tidak valid atau terlalu besar.');
    return null;
  }
}
const clients = new Set();
function broadcast(p) {
  const msg = 'data: ' + JSON.stringify({ p: p }) + '\n\n';
  clients.forEach((res) => { try { res.write(msg); } catch (e) { clients.delete(res); } });
}
setInterval(() => { clients.forEach((res) => { try { res.write(': ping\n\n'); } catch (e) { clients.delete(res); } }); }, 25000).unref();

/* ---------- unggahan ---------- */
function readMeta(id) {
  try { return JSON.parse(fs.readFileSync(path.join(UPLOADS, id + '.json'), 'utf8')); } catch (e) { return null; }
}
// Mengembalikan objek berkas yang bersih, null bila kosong, atau undefined bila tidak sah.
function cleanFile(f, sess) {
  if (f === null || f === undefined) return null;
  if (!isObj(f) || !/^[0-9a-f]{32}$/.test(f.id || '')) return undefined;
  const meta = readMeta(f.id);
  if (!meta) return undefined;
  if (!sess.admin && meta.owner !== sess.no) return undefined;
  return { id: f.id, name: String(f.name || 'berkas').slice(0, 80), type: meta.type };
}

/* ---------- siapa melihat apa ---------- */
function pick(o, keys) {
  const r = {};
  if (!isObj(o)) return r;
  keys.forEach((k) => { if (o[k] !== undefined) r[k] = o[k]; });
  return r;
}
// Mengembalikan data yang boleh dilihat penerima, atau null bila disembunyikan.
function view(p, data, sess) {
  const parts = p.split('/'), root = parts[0];
  const me = sess ? String(sess.no) : null;
  const admin = !!(sess && sess.admin);
  if (root === 'students' || root === 'courses' || root === 'media' || root === 'pengumuman') return data;
  if (root === 'akun') {
    const out = { no: data.no, admin: data.admin === true };
    if (admin) { out.nim = data.nim; out.resetReq = data.resetReq || null; out.hash = !!data.hash; }
    else if (sess && sess.no === data.no) { out.nim = data.nim; out.hash = !!data.hash; }
    return out;
  }
  if (root === 'sessions') {
    const present = isObj(data.present) ? data.present : {};
    const rec = Object.keys(present).some((k) => !!present[k]);
    if (admin) return Object.assign({}, data, { rec: rec });
    const out = { k: data.k, n: data.n, tanggal: data.tanggal || '', topik: data.topik || '', rec: rec, present: {}, bukti: {} };
    if (me) {
      if (present[me]) out.present[me] = present[me];
      if (isObj(data.bukti) && data.bukti[me]) out.bukti[me] = data.bukti[me];
    }
    return out;
  }
  if (root === 'tugas') {
    if (admin) return data;
    const out = Object.assign({}, data, { subs: {} });
    if (me && isObj(data.subs) && data.subs[me]) out.subs[me] = data.subs[me];
    return out;
  }
  if (root === 'berkas') {
    if (admin || (sess && data.no === sess.no)) return data;
    return null;
  }
  return null;
}

/* ---------- siapa boleh mengubah apa ---------- */
const ERR_FORBID = { err: [403, 'invalid_argument', 'Anda tidak punya izin untuk perubahan ini.'] };
const ERR_NEED = { err: [401, 'unauthenticated', 'Masuk dulu untuk melanjutkan.'] };
const ERR_BAD = (m) => ({ err: [400, 'invalid_argument', m || 'Data tidak valid.'] });
const ERR_MISSING = { err: [404, 'invalid_argument', 'Dokumen belum ada.'] };
const onlyKeys = (o, keys) => Object.keys(o).every((k) => keys.indexOf(k) >= 0);

function cleanAnn(b, base) {
  const judul = String(b.judul === undefined && base ? base.judul : b.judul || '').trim();
  if (!judul || judul.length > 120) return null;
  const isi = String(b.isi === undefined && base ? base.isi : b.isi || '').trim();
  if (isi.length > 1000) return null;
  const k = String(b.k === undefined && base ? base.k : b.k || '');
  if (k && !DOCS.has('courses/' + k)) return null;
  return { judul: judul, isi: isi, k: k, at: base && base.at ? base.at : Date.now() };
}

function decide(method, p, body, sess, existing) {
  const parts = p.split('/'), root = parts[0], id = parts[1];
  const admin = !!(sess && sess.admin);

  if (root === 'akun') {
    if (parts.length !== 2 || !/^(0[1-9]|[12]\d|3[0-2])$/.test(id)) return ERR_FORBID;
    if (method === 'PATCH' && existing && onlyKeys(body, ['resetReq']) && typeof body.resetReq === 'number') {
      return { data: Object.assign({}, existing, { resetReq: Date.now() }) };
    }
    if (!sess) return ERR_NEED;
    if (!admin || method === 'DELETE' || method === 'POST') return ERR_FORBID;
    if (method === 'PATCH' && !existing) return ERR_MISSING;
    const base = existing ? clone(existing) : { no: Number(id), nim: '', admin: false, hash: null, salt: null, resetReq: null };
    let reset = false;
    for (const k of Object.keys(body)) {
      const v = body[k];
      if (k === 'nim' && isStr(v, 20)) base.nim = v;
      else if (k === 'admin' && typeof v === 'boolean') base.admin = v;
      else if (k === 'resetReq' && (v === null || typeof v === 'number')) base.resetReq = v;
      else if ((k === 'hash' || k === 'salt') && v === null) { base.hash = null; base.salt = null; reset = true; }
      else if (k === 'no') continue;
      else return ERR_BAD('Bidang akun tidak dikenal.');
    }
    let admins = base.admin ? 1 : 0;
    DOCS.forEach((d, key) => { if (key.indexOf('akun/') === 0 && key !== p && d.admin === true) admins++; });
    if (admins < 1) return ERR_BAD('Harus ada minimal satu admin.');
    return { data: base, resetNo: reset ? Number(id) : null };
  }

  if (!sess) return ERR_NEED;

  if (root === 'students' || root === 'courses' || root === 'pengumuman') {
    if (!admin || parts.length !== 2) return ERR_FORBID;
    if (method === 'DELETE') return { del: true };
    if (root === 'pengumuman') {
      if (method === 'PATCH' && !existing) return ERR_MISSING;
      const a = cleanAnn(method === 'PATCH' ? Object.assign({}, existing, body) : body, existing);
      return a ? { data: a } : ERR_BAD('Judul wajib diisi dan isi maksimal 1000 karakter.');
    }
    if (method === 'PATCH') {
      if (!existing) return ERR_MISSING;
      return { data: Object.assign(clone(existing), body) };
    }
    return { data: body };
  }

  if (root === 'media') {
    if (parts.length !== 2) return ERR_FORBID;
    const m = /^s(\d\d)$/.exec(id);
    const own = m && Number(m[1]) === sess.no;
    if (!admin && !own) return ERR_FORBID;
    if (method === 'DELETE') return { del: true };
    if (method !== 'PUT') return ERR_FORBID;
    if (!isObj(body) || !onlyKeys(body, ['data']) || !isStr(body.data, 260000) || !/^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+\/=]+$/.test(body.data)) return ERR_BAD('Gambar tidak valid.');
    return { data: { data: body.data } };
  }

  if (root === 'sessions') {
    if (parts.length !== 2) return ERR_FORBID;
    const m = /^([A-Za-z0-9]{2,8})_(\d\d)$/.exec(id);
    if (!m || !DOCS.has('courses/' + m[1]) || Number(m[2]) < 1 || Number(m[2]) > PERT) return ERR_FORBID;
    if (method === 'DELETE') return admin ? { del: true } : ERR_FORBID;
    if (method === 'POST') return ERR_FORBID;
    if (admin) {
      if (method === 'PATCH') {
        if (!existing) return ERR_MISSING;
        const b = Object.assign(clone(existing), pick(body, ['tanggal', 'topik']));
        if (isObj(body.present)) b.present = Object.assign({}, b.present, body.present);
        if (isObj(body.bukti)) b.bukti = Object.assign({}, b.bukti, body.bukti);
        return { data: b };
      }
      return { data: { k: m[1], n: Number(m[2]), tanggal: String(body.tanggal || ''), topik: String(body.topik || '').slice(0, 120), present: isObj(body.present) ? body.present : {}, bukti: isObj(body.bukti) ? body.bukti : {} } };
    }
    // mahasiswa: hanya miliknya sendiri
    const me = String(sess.no);
    if (method === 'PUT' && existing) return ERR_FORBID;
    if (method === 'PATCH' && !existing) return ERR_MISSING;
    if (!onlyKeys(body, method === 'PUT' ? ['k', 'n', 'tanggal', 'topik', 'present', 'bukti'] : ['present', 'bukti'])) return ERR_FORBID;
    if (method === 'PUT' && (body.tanggal || body.topik)) return ERR_FORBID;
    const out = existing ? clone(existing) : { k: m[1], n: Number(m[2]), tanggal: '', topik: '', present: {}, bukti: {} };
    if (!isObj(out.present)) out.present = {};
    if (!isObj(out.bukti)) out.bukti = {};
    if (body.present !== undefined) {
      if (!isObj(body.present) || !onlyKeys(body.present, [me])) return ERR_FORBID;
      const v = body.present[me];
      if (v !== undefined) {
        if (!(v === '' || v === 'H' || v === 'I' || v === 'S')) return ERR_BAD('Status absen tidak valid.');
        if (out.present[me] === 'A') return ERR_FORBID;
        out.present[me] = v;
      }
    }
    if (body.bukti !== undefined) {
      if (!isObj(body.bukti) || !onlyKeys(body.bukti, [me])) return ERR_FORBID;
      if (body.bukti[me] !== undefined) {
        const f = cleanFile(body.bukti[me], sess);
        if (f === undefined) return ERR_BAD('Berkas bukti tidak valid.');
        out.bukti[me] = f;
      }
    }
    return { data: out };
  }

  if (root === 'tugas') {
    if (parts.length !== 2) return ERR_FORBID;
    if (method === 'DELETE') return admin ? { del: true } : ERR_FORBID;
    if (method === 'POST' || (method === 'PUT' && admin)) {
      if (!admin) return ERR_FORBID;
      const k = String(body.k || '');
      const judul = String(body.judul || '').trim();
      if (!DOCS.has('courses/' + k) || !judul || judul.length > 120) return ERR_BAD('Judul dan mata kuliah wajib diisi.');
      const tenggat = String(body.tenggat || '');
      if (tenggat && !/^\d{4}-\d{2}-\d{2}$/.test(tenggat)) return ERR_BAD('Tenggat tidak valid.');
      const deskripsi = String(body.deskripsi || '').slice(0, 1000);
      return { data: { k: k, judul: judul, tenggat: tenggat, deskripsi: deskripsi, subs: existing && isObj(existing.subs) ? existing.subs : {}, dibuat: existing && existing.dibuat ? existing.dibuat : Date.now() } };
    }
    if (method === 'PATCH') {
      if (!existing) return ERR_MISSING;
      if (onlyKeys(body, ['subs'])) {
        const me = String(sess.no);
        if (!isObj(body.subs) || !onlyKeys(body.subs, [me]) || !isObj(body.subs[me])) return ERR_FORBID;
        const s = body.subs[me];
        const tautan = String(s.tautan || '').trim().slice(0, 500);
        if (tautan && !/^https?:\/\//i.test(tautan)) return ERR_BAD('Tautan harus diawali http:// atau https://');
        const berkas = cleanFile(s.berkas, sess);
        if (berkas === undefined) return ERR_BAD('Berkas tidak valid.');
        const catatan = String(s.catatan || '').slice(0, 500);
        if (!tautan && !catatan && !berkas) return ERR_BAD('Isi tautan, catatan, atau kirim berkas dulu.');
        const out = clone(existing);
        if (!isObj(out.subs)) out.subs = {};
        out.subs[me] = { tautan: tautan, catatan: catatan, berkas: berkas, at: Date.now() };
        return { data: out };
      }
      if (!admin) return ERR_FORBID;
      const out = Object.assign(clone(existing), pick(body, ['judul', 'tenggat', 'deskripsi']));
      return { data: out };
    }
    return ERR_FORBID;
  }

  if (root === 'berkas') {
    if (parts.length !== 2) return ERR_FORBID;
    if (method === 'DELETE') {
      if (!existing) return { del: true };
      return admin || existing.no === sess.no ? { del: true } : ERR_FORBID;
    }
    if (method !== 'POST') return ERR_FORBID;
    const jenis = body.jenis;
    if (jenis !== 'ser' && jenis !== 'dok') return ERR_BAD('Jenis berkas tidak valid.');
    const judul = String(body.judul || '').trim().slice(0, 100);
    if (jenis === 'ser' && !judul) return ERR_BAD('Isi nama sertifikat dulu.');
    const file = cleanFile(body.file, sess);
    if (!file) return ERR_BAD('Pilih berkas dulu.');
    return { data: { no: sess.no, jenis: jenis, judul: judul, file: file, at: Date.now() } };
  }

  return ERR_FORBID;
}

function commit(res, p, d) {
  if (d.err) return fail(res, d.err[0], d.err[1], d.err[2]);
  if (d.del) DOCS.delete(p);
  else DOCS.set(p, d.data);
  if (d.resetNo) dropSessions(d.resetNo);
  save();
  broadcast(p);
  return json(res, 200, { ok: true });
}

/* ---------- server ---------- */
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;
  const method = req.method;
  const mutating = method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';

  try {
    if (pathname.startsWith('/api/') && mutating && req.headers['x-requested-with'] !== 'gk') {
      return fail(res, 403, 'forbidden', 'Permintaan tidak diizinkan.');
    }
    if (pathname.startsWith('/api/') && mutating && pathname !== '/api/login' && !take('w:' + clientIp(req), 300, 60000)) {
      return fail(res, 429, 'resource_exhausted', 'Terlalu banyak permintaan. Coba lagi sebentar lagi.');
    }

    if (pathname === '/api/ping') return json(res, 200, { ok: true });

    if (pathname === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      res.write(': ok\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    if (pathname === '/api/me' && method === 'GET') {
      const s = getSession(req);
      return json(res, 200, s ? { no: s.no, admin: s.admin } : { no: null, admin: false });
    }

    if (pathname === '/api/login' && method === 'POST') {
      const ip = clientIp(req);
      if (!take('login:' + ip, 200, 300000)) return fail(res, 429, 'rate_limited', 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.');
      const body = await readJson(req, res); if (!body) return;
      const no = Number(body.no);
      if (!Number.isInteger(no) || no < 1 || no > N) return fail(res, 401, 'bad_credentials', 'NIM atau password salah.');
      const lock = LOCKS.get(no);
      if (lock && lock.until > Date.now()) return fail(res, 429, 'rate_limited', 'Terlalu banyak percobaan untuk akun ini. Coba lagi dalam ' + Math.ceil((lock.until - Date.now()) / 1000) + ' detik.');
      const acc = DOCS.get('akun/' + pad(no));
      let ok = false;
      if (acc && acc.nim && isStr(body.nim, 40) && isStr(body.password, 200)) {
        ok = String(acc.nim).toLowerCase() === String(body.nim).trim().toLowerCase() && await checkPw(acc, body.password);
      }
      if (!ok) {
        const l = LOCKS.get(no) || { n: 0, until: 0 };
        l.n++;
        if (l.n >= 8) { l.n = 0; l.until = Date.now() + 300000; }
        LOCKS.set(no, l);
        return fail(res, 401, 'bad_credentials', 'NIM atau password salah.');
      }
      LOCKS.delete(no);
      const token = crypto.randomBytes(32).toString('hex');
      SESSIONS.set(token, { no: no, exp: Date.now() + SESSION_MS });
      saveSessions();
      setCookie(req, res, token, Math.floor(SESSION_MS / 1000));
      return json(res, 200, { no: no, admin: isAdminNo(no) });
    }

    if (pathname === '/api/logout' && method === 'POST') {
      const s = getSession(req);
      if (s) { SESSIONS.delete(s.token); saveSessions(); }
      setCookie(req, res, '', 0);
      return json(res, 200, { ok: true });
    }

    if (pathname === '/api/password' && method === 'POST') {
      const s = getSession(req);
      if (!s) return fail(res, 401, 'unauthenticated', 'Masuk dulu untuk melanjutkan.');
      if (!take('pw:' + s.no, 6, 600000)) return fail(res, 429, 'rate_limited', 'Terlalu banyak percobaan. Coba lagi nanti.');
      const body = await readJson(req, res); if (!body) return;
      const acc = DOCS.get('akun/' + pad(s.no));
      if (!acc || !isStr(body.old, 200) || !isStr(body.new, 200)) return fail(res, 400, 'invalid_argument', 'Data tidak valid.');
      if (!(await checkPw(acc, body.old))) return fail(res, 400, 'invalid_argument', 'Password lama salah.');
      if (body.new.length < 6) return fail(res, 400, 'invalid_argument', 'Password baru minimal 6 karakter.');
      if (body.new === DEFAULT_PW) return fail(res, 400, 'invalid_argument', 'Pilih password selain password bawaan.');
      const salt = crypto.randomBytes(12).toString('hex');
      acc.hash = await pbk(body.new, salt);
      acc.salt = salt;
      acc.resetReq = null;
      DOCS.set('akun/' + pad(s.no), acc);
      dropSessions(s.no, s.token);
      save();
      broadcast('akun/' + pad(s.no));
      return json(res, 200, { ok: true });
    }

    if (pathname.startsWith('/api/c/')) {
      const cp = parsePath(pathname.slice(7), 'col');
      if (!cp) return fail(res, 400, 'invalid_argument', 'Path koleksi tidak valid.');
      const sess = getSession(req);
      if (method === 'GET') {
        const docs = [];
        DOCS.forEach((data, key) => {
          if (key.startsWith(cp + '/') && key.indexOf('/', cp.length + 1) === -1) {
            const v = view(key, data, sess);
            if (v !== null) docs.push({ id: key.slice(cp.length + 1), data: v });
          }
        });
        docs.sort((a, b) => (a.id < b.id ? -1 : 1));
        return json(res, 200, { docs: docs });
      }
      if (method === 'POST') {
        const body = await readJson(req, res); if (!body) return;
        const id = crypto.randomBytes(10).toString('hex');
        const p = cp + '/' + id;
        return commit(res, p, decide('POST', p, body, sess, undefined));
      }
    }

    if (pathname.startsWith('/api/d/')) {
      const dp = parsePath(pathname.slice(7), 'doc');
      if (!dp) return fail(res, 400, 'invalid_argument', 'Path dokumen tidak valid.');
      const sess = getSession(req);
      if (method === 'GET') {
        const v = DOCS.has(dp) ? view(dp, DOCS.get(dp), sess) : null;
        return json(res, 200, v === null ? { exists: false } : { exists: true, data: v });
      }
      if (method === 'PUT' || method === 'PATCH') {
        const body = await readJson(req, res); if (!body) return;
        return commit(res, dp, decide(method, dp, body, sess, DOCS.get(dp)));
      }
      if (method === 'DELETE') {
        const d = decide('DELETE', dp, {}, sess, DOCS.get(dp));
        if (!d.err && DOCS.has(dp) && dp.indexOf('berkas/') === 0) {
          const f = DOCS.get(dp).file;
          if (f && /^[0-9a-f]{32}$/.test(f.id || '')) {
            try { fs.unlinkSync(path.join(UPLOADS, f.id)); fs.unlinkSync(path.join(UPLOADS, f.id + '.json')); } catch (e) { /* abaikan */ }
          }
        }
        return commit(res, dp, d);
      }
    }

    if (pathname === '/api/upload' && method === 'POST') {
      const s = getSession(req);
      if (!s) return fail(res, 401, 'unauthenticated', 'Masuk dulu untuk melanjutkan.');
      if (!take('up:' + s.no, 60, 600000)) return fail(res, 429, 'rate_limited', 'Terlalu banyak unggahan. Coba lagi nanti.');
      const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      if (FILE_TYPES.indexOf(type) < 0) return fail(res, 415, 'unsupported_type', 'Format belum didukung.');
      let buf;
      try { buf = await readBody(req, MAX_FILE); } catch (e) { return fail(res, 413, 'too_large', 'Berkas lebih dari 20 MB.'); }
      if (!buf.length) return fail(res, 400, 'invalid_request', 'Berkas kosong.');
      const id = crypto.randomBytes(16).toString('hex');
      fs.writeFileSync(path.join(UPLOADS, id), buf);
      fs.writeFileSync(path.join(UPLOADS, id + '.json'), JSON.stringify({ type: type, size: buf.length, owner: s.no }));
      return json(res, 200, { id: id, url: '/_blob/' + id, sizeBytes: buf.length, contentType: type });
    }
    if (pathname.startsWith('/api/upload/') && method === 'DELETE') {
      const s = getSession(req);
      if (!s) return fail(res, 401, 'unauthenticated', 'Masuk dulu untuk melanjutkan.');
      const id = pathname.slice(12);
      const meta = /^[0-9a-f]{32}$/.test(id) ? readMeta(id) : null;
      if (meta && (s.admin || meta.owner === s.no)) {
        try { fs.unlinkSync(path.join(UPLOADS, id)); } catch (e) { /* sudah tidak ada */ }
        try { fs.unlinkSync(path.join(UPLOADS, id + '.json')); } catch (e) { /* sudah tidak ada */ }
      }
      return json(res, 200, { deleted: !!meta });
    }

    if (pathname.startsWith('/_blob/') && method === 'GET') {
      const id = pathname.slice(7);
      const s = getSession(req);
      const meta = /^[0-9a-f]{32}$/.test(id) ? readMeta(id) : null;
      if (!meta || !s || !(s.admin || meta.owner === s.no)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, {
        'Content-Type': meta.type,
        'Content-Length': meta.size,
        'Cache-Control': 'private, max-age=3600',
        'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self'"
      });
      return fs.createReadStream(path.join(UPLOADS, id)).pipe(res);
    }

    if ((method === 'GET' || method === 'HEAD') && STATIC[pathname]) {
      const f = STATIC[pathname];
      const buf = fs.readFileSync(path.join(ROOT, f[0]));
      const h = { 'Content-Type': f[1], 'Cache-Control': 'no-cache' };
      if (f[0] === 'index.html') h['Content-Security-Policy'] = CSP;
      res.writeHead(200, h);
      return res.end(method === 'HEAD' ? undefined : buf);
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Tidak ditemukan');
  } catch (e) {
    console.error(e);
    if (!res.headersSent) fail(res, 500, 'unavailable', 'Terjadi kesalahan di server.');
    else res.end();
  }
});

process.on('SIGINT', () => { try { saveNow(); } catch (e) { /* abaikan */ } process.exit(0); });
process.on('SIGTERM', () => { try { saveNow(); } catch (e) { /* abaikan */ } process.exit(0); });

server.listen(PORT, () => {
  console.log('Grid Kelas berjalan di http://localhost:' + PORT);
  console.log('Akun pengelola awal: absen 4, NIM 2026510004, password ' + DEFAULT_PW);
});