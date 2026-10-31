'use strict';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://uboroxjkcvjbywcshdbq.supabase.co';
/* Server memakai kunci service_role untuk SEMUA akses database & Storage. Kunci ini melewati RLS,
 * jadi tabel bisa dikunci total dari kunci publik (anon). Kunci ini hanya boleh ada di environment
 * variable server — jangan di kode, repo, atau folder public/. */
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const UPLOAD_BUCKET = process.env.UPLOAD_BUCKET || 'uploads';
const CERTIFICATE_BUCKET = process.env.CERTIFICATE_BUCKET || 'certificates';
const ATTENDANCE_BUCKET = process.env.ATTENDANCE_BUCKET || 'attendance';
const MEDIA_BUCKET = process.env.MEDIA_BUCKET || 'media';
if (!SERVICE_KEY) console.error('PERINGATAN: SUPABASE_SERVICE_KEY belum di-set. Database dan unggah berkas tidak akan berfungsi.');

const supabase = createClient(SUPABASE_URL, SERVICE_KEY || 'missing-key', { auth: { persistSession: false, autoRefreshToken: false } });
const storage = SERVICE_KEY ? supabase.storage.from(UPLOAD_BUCKET) : null;
const certificateStore = SERVICE_KEY ? supabase.storage.from(CERTIFICATE_BUCKET) : null;
const attendanceStore = SERVICE_KEY ? supabase.storage.from(ATTENDANCE_BUCKET) : null;
const mediaStore = SERVICE_KEY ? supabase.storage.from(MEDIA_BUCKET) : null;
function storeFor(bucket) { if (!SERVICE_KEY) return null; return bucket === MEDIA_BUCKET ? mediaStore : bucket === CERTIFICATE_BUCKET ? certificateStore : bucket === ATTENDANCE_BUCKET ? attendanceStore : bucket === UPLOAD_BUCKET ? storage : null; }
function bucketFor(meta) { return meta && [MEDIA_BUCKET,CERTIFICATE_BUCKET,ATTENDANCE_BUCKET,UPLOAD_BUCKET].includes(meta.bucket) ? meta.bucket : UPLOAD_BUCKET; }
const SUPA_ORIGIN = (() => { try { return new URL(SUPABASE_URL).origin; } catch (e) { return ''; } })();

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const DEFAULT_PW = process.env.DEFAULT_PASSWORD || '12345678';
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const N = 32;
const PERT = 16;
const MAX_JSON = 300 * 1024;
const MAX_FILE = 20 * 1024 * 1024;
const SESSION_MS = 30 * 24 * 3600 * 1000;
const FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
const STATIC = {
  '/': ['public/index.html', 'text/html; charset=utf-8'],
  '/index.html': ['public/index.html', 'text/html; charset=utf-8'],
  '/style.css': ['public/style.css', 'text/css; charset=utf-8'],
  '/app.js': ['public/app.js', 'text/javascript; charset=utf-8'],
  '/db.js': ['public/db.js', 'text/javascript; charset=utf-8'],
  '/diagnostic.js': ['public/diagnostic.js', 'text/javascript; charset=utf-8']
};
const CSP = "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob: " + SUPA_ORIGIN + "; script-src 'self'; connect-src 'self' " + SUPA_ORIGIN + "; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

const pad = (n) => String(n).padStart(2, '0');
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isStr = (v, max) => typeof v === 'string' && v.length <= max;
/* Tugas lewat tenggat: pengumpulan ditutup, tampil sebagai DNF selama DNF_DAYS hari, lalu dihapus otomatis
 * (set AUTO_DELETE_TASKS=0 bila hanya ingin disembunyikan). Tanggal dihitung dalam waktu Jakarta (WIB). */
const DNF_DAYS = Number(process.env.DNF_DAYS) || 3;
const AUTO_DELETE = process.env.AUTO_DELETE_TASKS !== '0';
function dayDiffWib(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  const t = new Date(Date.now() + 7 * 3600 * 1000);
  return Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate())) / 86400000);
}
function taskExpired(d) { if (!d || typeof d !== 'object') return false; const x = dayDiffWib(d.tenggat); return x !== null && x < -DNF_DAYS; }
const DRIVE_HOSTS = ['drive.google.com', 'docs.google.com', 'drive.usercontent.google.com'];
function isDriveUrl(u) { try { const x = new URL(String(u || '').trim()); return x.protocol === 'https:' && DRIVE_HOSTS.indexOf(x.hostname) >= 0; } catch (e) { return false; } }
function isHttpUrl(u) { try { const x = new URL(String(u || '').trim()); return x.protocol === 'https:' || x.protocol === 'http:'; } catch (e) { return false; } }
const clone = (v) => JSON.parse(JSON.stringify(v));

/* ---------- penyimpanan data ke Supabase ---------- */
/* Kolom rentang hari di tabel courses (mis. hari_sampai). Aplikasi memakai nama "hariSampai";
 * nama kolom di Supabase dikenali otomatis dari beberapa kemungkinan, atau paksa lewat env COURSE_RANGE_COLUMN. */
const RANGE_COLS = ['hari_sampai', 'hariSampai', 'harisampai', 'hari_akhir', 'hari_selesai', 'sampai_hari', 'hari_end'];
let rangeCol = process.env.COURSE_RANGE_COLUMN || null;
function detectRangeCol(row) {
  if (!rangeCol && row && typeof row === 'object') rangeCol = RANGE_COLS.find((c) => Object.prototype.hasOwnProperty.call(row, c)) || null;
  return rangeCol;
}
function courseFromRow(row) {
  if (!row) return row;
  const col = detectRangeCol(row);
  if (!col) return row;
  const out = Object.assign({}, row);
  delete out[col];
  out.hariSampai = row[col] || '';
  return out;
}
async function rangeColumn() {
  if (rangeCol) return rangeCol;
  const { data } = await supabase.from('courses').select('*').limit(1);
  if (data && data[0]) detectRangeCol(data[0]);
  return rangeCol;
}
async function courseToRow(val) {
  const v = Object.assign({}, val);
  if (!Object.prototype.hasOwnProperty.call(v, 'hariSampai')) return v;
  const r = v.hariSampai;
  delete v.hariSampai;
  const col = await rangeColumn();
  if (col) v[col] = r || null;
  else if (r) throw new Error('Kolom rentang hari tidak ditemukan di tabel courses. Tambahkan: alter table public.courses add column hari_sampai text; (atau isi env COURSE_RANGE_COLUMN).');
  return v;
}
const must = (r) => { if (r && r.error) throw r.error; return r; };

async function getDoc(p) {
  const parts = p.split('/');
  const root = parts[0];
  const id = parts.slice(1).join('/');

  if (root === 'courses') {
    const r = must(await supabase.from('courses').select('*').eq('k', id).maybeSingle());
    return courseFromRow(r.data);
  } else if (root === 'course_updates') {
    const r = must(await supabase.from('course_updates').select('*').eq('id', id).maybeSingle());
    return r.data || null;
  } else {
    const r = must(await supabase.from('app_data').select('content').eq('key', p).maybeSingle());
    return r.data ? r.data.content : null;
  }
}

async function setDoc(p, val) {
  const parts = p.split('/');
  const root = parts[0];

  if (root === 'courses') {
    must(await supabase.from('courses').upsert(await courseToRow(val)));
  } else if (root === 'course_updates') {
    must(await supabase.from('course_updates').upsert(Object.assign({}, val, { id: p.slice('course_updates/'.length) })));
  } else {
    must(await supabase.from('app_data').upsert({ key: p, content: val }));
  }
}

async function deleteDoc(p) {
  const parts = p.split('/');
  const root = parts[0];
  const id = parts.slice(1).join('/');

  if (root === 'courses') {
    must(await supabase.from('courses').delete().eq('k', id));
  } else if (root === 'course_updates') {
    must(await supabase.from('course_updates').delete().eq('id', id));
  } else {
    must(await supabase.from('app_data').delete().eq('key', p));
  }
}

/* Ambil hanya dokumen anak langsung dari satu koleksi (bukan seluruh database). */
async function listCol(cp) {
  const out = [];
  if (cp === 'courses') {
    const r = must(await supabase.from('courses').select('*'));
    (r.data || []).forEach((c) => out.push({ key: 'courses/' + c.k, data: courseFromRow(c) }));
    return out;
  }
  if (cp === 'course_updates') {
    const r = must(await supabase.from('course_updates').select('*').order('meeting_number', { ascending: true }));
    (r.data || []).forEach((u) => out.push({ key: 'course_updates/' + u.id, data: u }));
    return out;
  }
  const r2 = must(await supabase.from('app_data').select('key,content').like('key', cp + '/%'));
  (r2.data || []).forEach((row) => {
    if (row.key.startsWith(cp + '/') && row.key.indexOf('/', cp.length + 1) === -1) out.push({ key: row.key, data: row.content });
  });
  return out;
}

/* ---------- sesi login ----------
 * Sesi disimpan di dalam cookie bertanda tangan (HMAC), bukan di memori server.
 * Jadi tetap sah setelah server restart / berpindah instance (Vercel, dsb.)
 * dan berlaku selama SESSION_MS. Wajib set env SESSION_SECRET (acak, panjang).
 */
let SECRET = process.env.SESSION_SECRET;
if (!SECRET) {
  console.error('PERINGATAN: SESSION_SECRET belum di-set. Sesi akan hilang tiap server restart / ganti instance.');
  SECRET = crypto.randomBytes(32).toString('hex');
}
const b64u = (b) => Buffer.from(b).toString('base64url');
function accVer(acc) {
  // berubah saat password diganti / direset -> sesi lama otomatis tidak berlaku
  return crypto.createHash('sha256').update(String(acc && acc.hash || '') + '|' + String(acc && acc.salt || '')).digest('hex').slice(0, 12);
}
function signToken(no, acc) {
  const body = b64u(JSON.stringify({ no: no, exp: Date.now() + SESSION_MS, v: accVer(acc) }));
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return body + '.' + sig;
}
function dropSessions() { /* tidak perlu: tanda tangan memuat versi password */ }
function cookies(req) {
  const o = {};
  String(req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) o[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  });
  return o;
}
async function getSession(req) {
  const t = cookies(req).gk_session;
  if (!t || t.indexOf('.') < 0) return null;
  const [body, sig] = t.split('.');
  const want = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  if (!sig || sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  let s;
  try { s = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch (e) { return null; }
  if (!s || !Number.isInteger(s.no) || s.exp < Date.now()) return null;
  const acc = await getDoc('akun/' + pad(s.no));
  if (!acc || accVer(acc) !== s.v) return null;
  return { token: t, no: s.no, admin: acc.admin === true };
}
async function isAdminNo(no) {
  const a = await getDoc('akun/' + pad(no));
  return !!(a && a.admin === true);
}
function setCookie(req, res, token, maxAgeSec) {
  const secure = process.env.COOKIE_SECURE === '1' ||
    (TRUST_PROXY && String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https');
  res.setHeader('Set-Cookie', 'gk_session=' + token + '; HttpOnly; SameSite=Lax; Path=/; Max-Age=' + maxAgeSec + (secure ? '; Secure' : ''));
}

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

/* ---------- pembatas ----------
 * Disimpan di Supabase (app_data, kunci "rl:..."), bukan di memori, karena di Vercel memori
 * dibuang tiap instance berganti sehingga pembatas biasa mudah dilewati.
 */
const HITS = new Map();
function take(key, max, windowMs) { // ringan, hanya di memori: untuk unggahan
  const now = Date.now();
  const a = (HITS.get(key) || []).filter((t) => now - t < windowMs);
  if (a.length >= max) { HITS.set(key, a); return false; }
  a.push(now);
  HITS.set(key, a);
  return true;
}
const RL = (k) => 'rl:' + k;
async function rlWait(keys) { // detik tersisa bila salah satu kunci sedang dikunci, selain itu 0
  const now = Date.now();
  const rows = await Promise.all(keys.map((k) => getDoc(RL(k))));
  let wait = 0;
  rows.forEach((r) => { if (r && r.until > now) wait = Math.max(wait, Math.ceil((r.until - now) / 1000)); });
  return wait;
}
async function rlFail(k, max, windowMs, lockMs) {
  const now = Date.now();
  let r = await getDoc(RL(k));
  if (!r || now - r.t > windowMs) r = { n: 0, t: now, until: 0 };
  r.n++;
  if (r.n >= max) r = { n: 0, t: now, until: now + lockMs };
  await setDoc(RL(k), r);
}
const LIMITS = {
  pair: [6, 15 * 60000, 10 * 60000],   // satu akun dari satu IP: 6 gagal / 15 menit -> kunci 10 menit
  acc: [40, 60 * 60000, 15 * 60000],   // satu akun dari mana saja: 40 gagal / jam -> kunci 15 menit
  ip: [40, 10 * 60000, 10 * 60000]     // satu IP ke akun mana saja: 40 gagal / 10 menit -> kunci 10 menit
};
function clientIp(req) {
  const h = req.headers;
  let f = '';
  if (process.env.VERCEL) f = String(h['x-vercel-forwarded-for'] || h['x-forwarded-for'] || '').split(',')[0].trim();
  else if (TRUST_PROXY) f = String(h['x-forwarded-for'] || '').split(',')[0].trim();
  return f || req.socket.remoteAddress || 'x';
}
const ipKey = (req) => crypto.createHash('sha256').update(clientIp(req)).digest('hex').slice(0, 16); // IP tidak disimpan mentah
function loginKeys(req, no) { const ip = ipKey(req); return { pair: 'pair:' + pad(no) + ':' + ip, acc: 'acc:' + pad(no), ip: 'ip:' + ip }; }
async function recordFail(req, no) {
  const k = loginKeys(req, no);
  await Promise.all([rlFail(k.pair, ...LIMITS.pair), rlFail(k.acc, ...LIMITS.acc), rlFail(k.ip, ...LIMITS.ip)]);
}

/* ---------- tautan folder Google Drive Super License ---------- */
const SUPER_LICENSE_DRIVE_URL = process.env.SUPER_LICENSE_DRIVE_URL || '';
function publicConfig() {
  return { superLicenseDriveUrl: isDriveUrl(SUPER_LICENSE_DRIVE_URL) ? SUPER_LICENSE_DRIVE_URL : '' };
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

async function purgeTask(p, d) {
  if (!AUTO_DELETE) return;
  try {
    for (const sb of Object.values(isObj(d.subs) ? d.subs : {})) {
      const fid = sb && sb.berkas && sb.berkas.id;
      if (fid && /^[0-9a-f]{32}$/.test(fid)) {
        if (storage) { try { await storage.remove([fid]); } catch (e) { /* sudah tidak ada */ } }
        await deleteDoc('upl:' + fid);
      }
    }
    await deleteDoc(p);
  } catch (e) { console.error(e); }
}
async function dropExpired(rows) {
  const keep = [];
  for (const r of rows) { if (taskExpired(r.data)) await purgeTask(r.key, r.data); else keep.push(r); }
  return keep;
}

/* ---------- unggahan ---------- */
const UPL = (id) => 'upl:' + id;
async function putMedia(id, dataUrl) {
  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+\/=]+)$/.exec(dataUrl);
  if (!m) throw new Error('gambar tidak valid');
  const { error } = await mediaStore.upload(id, Buffer.from(m[2], 'base64'), { contentType: m[1], upsert: true, cacheControl: '31536000' });
  if (error) throw error;
  const { data } = mediaStore.getPublicUrl(id);
  return data.publicUrl + '?v=' + Date.now(); // ?v= memaksa browser mengambil foto baru saat diganti
}
async function readMeta(id) {
  if (!/^[0-9a-f]{32}$/.test(String(id || ''))) return null;
  return await getDoc(UPL(id));
}
async function cleanFile(f, sess, expectedBucket) {
  if (f === null || f === undefined) return null;
  if (!isObj(f) || !/^[0-9a-f]{32}$/.test(f.id || '')) return undefined;
  const meta = await readMeta(f.id);
  if (!meta) return undefined;
  if (!sess.admin && meta.owner !== sess.no) return undefined;
  if (expectedBucket && bucketFor(meta) !== expectedBucket) return undefined;
  return { id: f.id, name: String(f.name || 'berkas').slice(0, 80), type: meta.type, bucket: bucketFor(meta) };
}

/* ---------- siapa melihat apa ---------- */
function pick(o, keys) {
  const r = {};
  if (!isObj(o)) return r;
  keys.forEach((k) => { if (o[k] !== undefined) r[k] = o[k]; });
  return r;
}
async function view(p, data, sess) {
  const parts = p.split('/'), root = parts[0];
  const me = sess ? String(sess.no) : null;
  const admin = !!(sess && sess.admin);
  if (root === 'students' || root === 'courses' || root === 'constructors' || root === 'media' || root === 'pengumuman' || root === 'classArchive') return data;
  if (root === 'course_updates') return sess ? data : null;
  if (root === 'drives') return sess ? data : null; // folder Drive: hanya untuk yang sudah masuk
  if (root === 'platform') return sess ? data : null; // link absen platform: hanya untuk yang sudah masuk
  if (root === 'akun') {
    const out = { no: data.no, admin: data.admin === true };
    // NIM boleh dilihat oleh seluruh mahasiswa yang sudah login.
    // Data sensitif akun tetap hanya untuk pemilik akun dan admin.
    if (sess) out.nim = data.nim;
    out.teamPrincipal = data.teamPrincipal || null;
    if (admin) { out.resetReq = data.resetReq || null; out.hash = !!data.hash; out.archiveEdit = data.archiveEdit === true; }
    else if (sess && sess.no === data.no) { out.hash = !!data.hash; out.archiveEdit = data.archiveEdit === true; }
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
    const out = Object.assign({}, data, { subs: {}, groupSubs: {} });
    if (me && isObj(data.subs) && data.subs[me]) out.subs[me] = data.subs[me];
    if (sess && data.mode === 'group') {
      const groups = await listCol('constructors');
      const own = groups.find((row) => {
        const g = row.data || {};
        return g.courseCode === data.k && ((Array.isArray(g.members) && g.members.map(Number).includes(sess.no)) || Number(g.principal) === Number(sess.no));
      });
      if (own) {
        const gid = own.key.slice('constructors/'.length), sub = isObj(data.groupSubs) ? data.groupSubs[gid] : null;
        if (sub && typeof sub.at === 'number') {
          out.groupSubs[gid] = Number((own.data || {}).principal) === Number(sess.no) ? sub : { at: sub.at };
        }
      }
    }
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
  return { judul: judul, isi: isi, k: k, at: base && base.at ? base.at : Date.now() };
}

async function decide(method, p, body, sess, existing) {
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
      else if (k === 'archiveEdit' && typeof v === 'boolean') base.archiveEdit = v;
      else if (k === 'teamPrincipal' && (v === null || (typeof v === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(v)))) {
        if (v !== null && !(await getDoc('constructors/' + v))) return ERR_BAD('Kelompok untuk Team Principal tidak ditemukan.');
        if (v !== null) {
          for (let n=1;n<=32;n++) {
            if (n===Number(id)) continue;
            const other=await getDoc('akun/'+pad(n));
            if (other&&other.teamPrincipal===v) return ERR_BAD('Kelompok ini sudah memiliki Team Principal. Cabut role sebelumnya terlebih dahulu.');
          }
        }
        base.teamPrincipal = v;
      }
      else if (k === 'resetReq' && (v === null || typeof v === 'number')) base.resetReq = v;
      else if ((k === 'hash' || k === 'salt') && v === null) { base.hash = null; base.salt = null; reset = true; }
      else if (k === 'no') continue;
      else return ERR_BAD('Bidang akun tidak dikenal.');
    }
    return { data: base, resetNo: reset ? Number(id) : null };
  }

  if (!sess) return ERR_NEED;

  if (root === 'course_updates') {
    if (!admin || parts.length !== 2) return ERR_FORBID;
    if (method === 'DELETE') return { del: true };
    if (method !== 'POST' && method !== 'PUT' && method !== 'PATCH') return ERR_FORBID;
    const k = String(body.course_code || '').trim(), meeting = Number(body.meeting_number);
    const attendance = String(body.attendance_url || '').trim(), taskTitle = String(body.task_title || '').trim();
    const taskUrl = String(body.task_url || '').trim(), submission = String(body.submission_url || '').trim(), deadline = String(body.deadline || '').trim();
    if (!/^[A-Za-z0-9]{2,8}$/.test(k) || !Number.isInteger(meeting) || meeting < 1 || meeting > PERT) return ERR_BAD('Pilih mata kuliah dan pertemuan 1 sampai ' + PERT + '.');
    if ([attendance, taskUrl, submission].some(u => u && (!/^https:\/\//i.test(u) || !isHttpUrl(u)))) return ERR_BAD('Semua tautan harus menggunakan HTTPS.');
    if (taskTitle.length > 120 || (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(deadline))) return ERR_BAD('Judul tugas atau tenggat tidak valid.');
    const course = await getDoc('courses/' + k);
    if (!course) return ERR_BAD('Mata kuliah tidak ditemukan.');
    const now = Date.now();
    return { data: { course_code:k, meeting_number:meeting, attendance_url:attendance, task_title:taskTitle, task_url:taskUrl, submission_url:submission, deadline:deadline || null, created_at:existing && existing.created_at || new Date(now).toISOString(), updated_at:new Date(now).toISOString() } };
  }

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

  if (root === 'drives') {
    if (!admin || parts.length !== 2 || !/^[A-Za-z0-9_]{1,20}$/.test(id)) return ERR_FORBID;
    if (method === 'DELETE') return { del: true };
    if (method !== 'PUT' && method !== 'PATCH') return ERR_FORBID;
    if (!isObj(body) || !onlyKeys(body, ['url']) || !isStr(body.url, 500) || !isDriveUrl(body.url)) return ERR_BAD('Tautan folder harus dari Google Drive (drive.google.com atau docs.google.com).');
    return { data: { url: body.url.trim() } };
  }

  /* Mata kuliah bertipe platform: link khusus tempat absen diisi (web lain, misalnya LMS kampus). Hanya admin yang mengubah. */
  if (root === 'platform') {
    if (!admin || parts.length !== 2 || !/^[A-Za-z0-9_]{1,20}$/.test(id)) return ERR_FORBID;
    if (method === 'DELETE') return { del: true };
    if (method !== 'PUT' && method !== 'PATCH') return ERR_FORBID;
    if (!isObj(body) || !onlyKeys(body, ['url']) || !isStr(body.url, 500) || !/^https:\/\//i.test(body.url.trim()) || !isHttpUrl(body.url)) return ERR_BAD('Link absen platform harus diawali https://');
    return { data: { url: body.url.trim() } };
  }

  if (root === 'media') {
    if (parts.length !== 2 || !/^[A-Za-z0-9_]{1,40}$/.test(id)) return ERR_FORBID;
    const m = /^s(\d\d)$/.exec(id);
    const own = m && Number(m[1]) === sess.no;
    const archiveKey = /^archive_[A-Za-z0-9]{6,24}$/.test(id);
    const acc = archiveKey ? await getDoc('akun/' + pad(sess.no)) : null;
    const canArchive = archiveKey && (admin || (acc && acc.archiveEdit === true));
    if (!admin && !own && !canArchive) return ERR_FORBID;
    if (method === 'DELETE') {
      if (archiveKey && !admin) return ERR_FORBID;
      return { del: true };
    }
    if (method !== 'PUT') return ERR_FORBID;
    if (!isObj(body) || !onlyKeys(body, ['data']) || !isStr(body.data, 260000) || !/^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+\/=]+$/.test(body.data)) return ERR_BAD('Gambar tidak valid.');
    return { upload: { id: id, dataUrl: body.data } };
  }

  if (root === 'sessions') {
    if (parts.length !== 2) return ERR_FORBID;
    const m = /^([A-Za-z0-9]{2,8})_(\d\d)$/.exec(id);
    if (!m || Number(m[2]) < 1 || Number(m[2]) > PERT) return ERR_FORBID;
    if (method === 'DELETE') return admin ? { del: true } : ERR_FORBID;
    if (method === 'POST') return ERR_FORBID;
    if (admin) {
      if (method === 'PATCH') {
        if (!existing) return ERR_MISSING;
        const b = Object.assign(clone(existing), pick(body, ['tanggal', 'topik']));
        if (isObj(body.present)) b.present = Object.assign({}, b.present, body.present);
        if (isObj(body.bukti)) b.bukti = Object.assign({}, b.bukti, body.bukti);
        if (Object.keys(isObj(b.present)?b.present:{}).some((no)=>b.present[no]==='K'&&!(b.bukti&&b.bukti[no]&&b.bukti[no].id))) return ERR_BAD('Kelas Berjalan memerlukan file bukti mahasiswa tersebut.');
        return { data: b };
      }
      const created = { k: m[1], n: Number(m[2]), tanggal: String(body.tanggal || ''), topik: String(body.topik || '').slice(0, 120), present: isObj(body.present) ? body.present : {}, bukti: isObj(body.bukti) ? body.bukti : {} };
      if (Object.keys(created.present).some((no)=>created.present[no]==='K'&&!(created.bukti[no]&&created.bukti[no].id))) return ERR_BAD('Kelas Berjalan memerlukan file bukti mahasiswa tersebut.');
      return { data: created };
    }
    const me = String(sess.no);
    if (method === 'PUT' && existing) return ERR_FORBID;
    if (method === 'PATCH' && !existing) return ERR_MISSING;
    if (!onlyKeys(body, method === 'PUT' ? ['k', 'n', 'tanggal', 'topik', 'present', 'bukti'] : ['present', 'bukti'])) return ERR_FORBID;
    const out = existing ? clone(existing) : { k: m[1], n: Number(m[2]), tanggal: '', topik: '', present: {}, bukti: {} };
    if (!isObj(out.present)) out.present = {};
    if (!isObj(out.bukti)) out.bukti = {};
    if (body.present !== undefined) {
      if (!isObj(body.present) || !onlyKeys(body.present, [me])) return ERR_FORBID;
      const v = body.present[me];
      if (v !== undefined) {
        if (!(v === '' || v === 'H' || v === 'I' || v === 'S' || v === 'K')) return ERR_BAD('Status absen tidak valid.');
        out.present[me] = v;
      }
    }
    if (body.bukti !== undefined) {
      if (!isObj(body.bukti) || !onlyKeys(body.bukti, [me])) return ERR_FORBID;
      if (body.bukti[me] !== undefined) {
        const f = await cleanFile(body.bukti[me], sess, ATTENDANCE_BUCKET);
        if (f === undefined) return ERR_BAD('Berkas bukti tidak valid.');
        out.bukti[me] = f;
      }
    }
    if (out.present[me] === 'K' && !(out.bukti[me] && /^[0-9a-f]{32}$/.test(out.bukti[me].id || ''))) return ERR_BAD('Lampirkan file bukti terlebih dahulu untuk memilih Kelas Berjalan.');
    return { data: out };
  }

  if (root === 'tugas') {
    if (parts.length !== 2) return ERR_FORBID;
    if (method === 'DELETE') return admin ? { del: true } : ERR_FORBID;
    if (method === 'POST' || (method === 'PUT' && admin)) {
      if (!admin) return ERR_FORBID;
      const k = String(body.k || '');
      const judul = String(body.judul || '').trim();
      if (!judul || judul.length > 120) return ERR_BAD('Judul wajib diisi.');
      const tenggat = String(body.tenggat || '');
      if (tenggat && !/^\d{4}-\d{2}-\d{2}$/.test(tenggat)) return ERR_BAD('Tenggat tidak valid.');
      const deskripsi = String(body.deskripsi || '').slice(0, 1000);
      const link = String(body.link || '').trim();
      if (link && (link.length > 500 || !isHttpUrl(link))) return ERR_BAD('Tautan kerjakan harus diawali http:// atau https://.');
      const mode = body.mode === 'group' ? 'group' : 'individual';
      return { data: { k: k, judul: judul, tenggat: tenggat, deskripsi: deskripsi, link: link, mode: mode, subs: existing && isObj(existing.subs) ? existing.subs : {}, groupSubs: existing && isObj(existing.groupSubs) ? existing.groupSubs : {}, dibuat: existing && existing.dibuat ? existing.dibuat : Date.now() } };
    }
    if (method === 'PATCH') {
      if (!existing) return ERR_MISSING;
      if (onlyKeys(body, ['subs'])) {
        if (dayDiffWib(existing.tenggat) !== null && dayDiffWib(existing.tenggat) < 0) return ERR_BAD('Tenggat sudah lewat. Pengumpulan ditutup.');
        const me = String(sess.no);
        if (!isObj(body.subs) || !onlyKeys(body.subs, [me]) || !isObj(body.subs[me])) return ERR_FORBID;
        if (existing.mode === 'group') return ERR_FORBID;
        const s = body.subs[me];
        const tautan = String(s.tautan || '').trim().slice(0, 500);
        const berkas = await cleanFile(s.berkas, sess, UPLOAD_BUCKET);
        const catatan = String(s.catatan || '').slice(0, 500);
        if (berkas === undefined) return ERR_BAD('Berkas tidak valid. Unggah ulang berkasnya.');
        if (tautan && !(/^https:\/\//i.test(tautan) && isHttpUrl(tautan))) return ERR_BAD('Tautan harus diawali https://');
        if (!tautan && !berkas) return ERR_BAD('Unggah berkas atau isi tautan tugas.');
        const out = clone(existing);
        if (!isObj(out.subs)) out.subs = {};
        out.subs[me] = { tautan: tautan, catatan: catatan, berkas: berkas, at: Date.now() };
        return { data: out };
      }
      if (onlyKeys(body, ['groupSubs'])) {
        if (existing.mode !== 'group') return ERR_FORBID;
        if (dayDiffWib(existing.tenggat) !== null && dayDiffWib(existing.tenggat) < 0) return ERR_BAD('Tenggat sudah lewat. Pengumpulan ditutup.');
        if (!isObj(body.groupSubs) || Object.keys(body.groupSubs).length !== 1) return ERR_FORBID;
        const gid = Object.keys(body.groupSubs)[0], s = body.groupSubs[gid];
        if (!/^[A-Za-z0-9_-]{1,40}$/.test(gid) || !isObj(s)) return ERR_FORBID;
        const group = await getDoc('constructors/' + gid);
        if (!group || group.courseCode !== existing.k || Number(group.principal) !== Number(sess.no)) return ERR_FORBID;
        const tautan = String(s.tautan || '').trim().slice(0, 500);
        const berkas = await cleanFile(s.berkas, sess, UPLOAD_BUCKET);
        const catatan = String(s.catatan || '').slice(0, 500);
        if (berkas === undefined) return ERR_BAD('Berkas tidak valid. Unggah ulang berkasnya.');
        if (tautan && !(/^https:\/\//i.test(tautan) && isHttpUrl(tautan))) return ERR_BAD('Tautan harus diawali https://');
        if (!tautan && !berkas) return ERR_BAD('Unggah berkas atau isi tautan tugas.');
        const out = clone(existing);
        if (!isObj(out.groupSubs)) out.groupSubs = {};
        out.groupSubs[gid] = { tautan: tautan, catatan: catatan, berkas: berkas, at: Date.now(), by: sess.no };
        return { data: out };
      }
      if (!admin) return ERR_FORBID;
      const out = Object.assign(clone(existing), pick(body, ['judul', 'tenggat', 'deskripsi', 'link']));
      if (out.link !== undefined) {
        out.link = String(out.link || '').trim();
        if (out.link && (out.link.length > 500 || !isHttpUrl(out.link))) return ERR_BAD('Tautan kerjakan harus diawali http:// atau https://.');
      }
      return { data: out };
    }
    return ERR_FORBID;
  }

  if (root === 'constructors') {
    if (parts.length !== 2 || !/^[A-Za-z0-9_-]{1,40}$/.test(id)) return ERR_FORBID;
    if (method === 'DELETE') {
      if (!admin) return ERR_FORBID;
      if (Number(existing && existing.principal)) return ERR_BAD('Cabut role Team Principal sebelum menghapus kelompok.');
      return { del: true };
    }
    if (method === 'POST' || method === 'PUT') {
      if (!admin) return ERR_FORBID;
      const name=String(body.name||'').trim();
      const courseCode=String(body.courseCode||'');
      const members=Array.isArray(body.members)?body.members:[];
      if (!name || name.length>80 || !/^[A-Za-z0-9_-]{1,40}$/.test(courseCode) || !(await getDoc('courses/'+courseCode)) || members.length>32 || members.some(n=>!Number.isInteger(n)||n<1||n>32) || new Set(members).size!==members.length) return ERR_BAD('Nama Constructor, mata kuliah, atau daftar anggota tidak valid.');
      const others=await listCol('constructors');
      if(others.some(row=>{const g=row.data||{};return g.courseCode===courseCode&&((Array.isArray(g.members)&&g.members.some(n=>members.includes(Number(n))))||(members.includes(Number(g.principal))&&Number(g.principal)>0));}))return ERR_BAD('Mahasiswa sudah terdaftar di Constructor lain pada mata kuliah ini.');
      return { data:{courseCode:courseCode,name:name,members:members,principal:null,createdAt:existing&&existing.createdAt||Date.now()} };
    }
    if (method === 'PATCH') {
      if (!existing) return ERR_MISSING;
      if (!admin && Number(existing.principal)!==Number(sess.no)) return ERR_FORBID;
      if (!onlyKeys(body,['name','members','color','principal','courseCode'])) return ERR_FORBID;
      if (!admin && (body.principal!==undefined || body.courseCode!==undefined)) return ERR_FORBID;
      const name=String(body.name===undefined?existing.name||'':body.name).trim();
      const members=body.members===undefined?(Array.isArray(existing.members)?existing.members:[]):body.members;
      const colors=['red','blue','cyan','orange','yellow','green','purple','pink','silver','black'];
      const color=body.color===undefined?existing.color:body.color;
      const courseCode=body.courseCode===undefined?existing.courseCode:String(body.courseCode);
      const principal=body.principal===undefined?existing.principal:(body.principal===null?null:Number(body.principal));
      if (!name || name.length>80 || !Array.isArray(members) || members.length>32 || members.some(n=>!Number.isInteger(n)||n<1||n>32) || new Set(members).size!==members.length) return ERR_BAD('Nama kelompok atau daftar anggota tidak valid.');
      if (color!==undefined && !colors.includes(color)) return ERR_BAD('Pilihan warna Constructor tidak valid.');
      if (!/^[A-Za-z0-9_-]{1,40}$/.test(String(courseCode||'')) || !(await getDoc('courses/'+courseCode))) return ERR_BAD('Mata kuliah Constructor tidak valid.');
      if (principal!==undefined && principal!==null && (!Number.isInteger(principal)||principal<1||principal>32)) return ERR_BAD('Team Principal tidak valid.');
      const others=await listCol('constructors');
      if(others.some(row=>row.key!=='constructors/'+id&&((row.data||{}).courseCode===courseCode)&&(((Array.isArray((row.data||{}).members)?(row.data||{}).members:[]).concat(Number((row.data||{}).principal)||[])).some(n=>members.concat(Number(principal)||[]).includes(Number(n))))))return ERR_BAD('Mahasiswa sudah terdaftar di Constructor lain pada mata kuliah ini.');
      return { data:Object.assign({},existing,{courseCode:courseCode,name:name,members:members,color:color,principal:principal,updatedAt:Date.now()}) };
    }
    return ERR_FORBID;
  }

  if (root === 'classArchive') {
    if (parts.length !== 2) return ERR_FORBID;
    if (method === 'DELETE') return admin ? { del: true } : ERR_FORBID;
    if (method !== 'POST') return ERR_FORBID;
    const acc = await getDoc('akun/' + pad(sess.no));
    if (!admin && !(acc && acc.archiveEdit === true)) return ERR_FORBID;
    const judul = String(body.judul || '').trim();
    const caption = String(body.caption || '').trim();
    const photoKey = String(body.photoKey || '');
    if (!judul || judul.length > 100 || caption.length > 300 || !/^archive_[A-Za-z0-9]{6,24}$/.test(photoKey)) return ERR_BAD('Judul, keterangan, atau foto tidak valid.');
    const photo = await getDoc('media/' + photoKey);
    if (!photo || typeof photo.data !== 'string' || !photo.data.startsWith('https://')) return ERR_BAD('Foto arsip belum tersedia.');
    return { data: { judul: judul, caption: caption, photoKey: photoKey, no: sess.no, at: Date.now() } };
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
    const file = await cleanFile(body.file, sess, jenis === 'ser' ? CERTIFICATE_BUCKET : UPLOAD_BUCKET);
    if (!file) return ERR_BAD('Pilih berkas dulu.');
    return { data: { no: sess.no, jenis: jenis, judul: judul, file: file, at: Date.now() } };
  }

  return ERR_FORBID;
}

/* Semua kegagalan simpan (mis. kolom belum ada di Supabase) dijawab rapi sebagai error 500, tidak menjatuhkan server. */
async function commit(res, p, d) {
  try { return await commitInner(res, p, d); }
  catch (e) {
    console.error(e);
    if (res.headersSent) return res.end();
    const msg = e && /^Kolom rentang hari/.test(e.message || '') ? e.message : 'Gagal menyimpan data. Coba lagi.';
    return fail(res, 500, 'unavailable', msg);
  }
}
async function commitInner(res, p, d) {
  if (d.err) return fail(res, d.err[0], d.err[1], d.err[2]);
  if (d.del) {
    await deleteDoc(p);
    if (mediaStore && p.startsWith('media/')) { try { await mediaStore.remove([p.slice(6)]); } catch (e) { /* sudah tidak ada */ } }
  } else if (d.upload) {
    if (mediaStore) {
      try { await setDoc(p, { data: await putMedia(d.upload.id, d.upload.dataUrl) }); }
      catch (e) { console.error(e); return fail(res, 500, 'unavailable', 'Gagal menyimpan gambar.'); }
    } else await setDoc(p, { data: d.upload.dataUrl }); // tanpa kunci service: tetap simpan di database seperti sebelumnya
  } else await setDoc(p, d.data);
  if (d.resetNo) dropSessions(d.resetNo);
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
    if (pathname === '/api/ping') return json(res, 200, { ok: true });
    if (pathname === '/api/public-config' && method === 'GET') return json(res, 200, publicConfig());

    if (pathname === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      res.write(': ok\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    if (pathname === '/api/me' && method === 'GET') {
      const s = await getSession(req);
      return json(res, 200, s ? { no: s.no, admin: s.admin } : { no: null, admin: false });
    }

    if (pathname === '/api/login' && method === 'POST') {
      const body = await readJson(req, res); if (!body) return;
      const no = Number(body.no);
      if (!Number.isInteger(no) || no < 1 || no > N) { await rlFail('ip:' + ipKey(req), ...LIMITS.ip); return fail(res, 401, 'bad_credentials', 'NIM atau password salah.'); }
      const lk = loginKeys(req, no);
      const wait = await rlWait([lk.pair, lk.acc, lk.ip]);
      if (wait) { res.setHeader('Retry-After', String(wait)); return fail(res, 429, 'rate_limited', 'Terlalu banyak percobaan. Coba lagi dalam ' + Math.ceil(wait / 60) + ' menit.'); }
      const acc = await getDoc('akun/' + pad(no));
      let ok = false;
      if (acc && acc.nim && isStr(body.nim, 40) && isStr(body.password, 200)) {
        ok = String(acc.nim).toLowerCase() === String(body.nim).trim().toLowerCase() && await checkPw(acc, body.password);
      }
      if (!ok) { await recordFail(req, no); return fail(res, 401, 'bad_credentials', 'NIM atau password salah.'); }
      await deleteDoc(RL(lk.pair)); // login benar: hitungan gagal dari perangkat ini dikosongkan
      const token = signToken(no, acc);
      setCookie(req, res, token, Math.floor(SESSION_MS / 1000));
      return json(res, 200, { no: no, admin: await isAdminNo(no) });
    }

    if (pathname === '/api/logout' && method === 'POST') {
      const s = await getSession(req);
      setCookie(req, res, '', 0);
      return json(res, 200, { ok: true });
    }

    if (pathname === '/api/password' && method === 'POST') {
      const s = await getSession(req);
      if (!s) return fail(res, 401, 'unauthenticated', 'Masuk dulu untuk melanjutkan.');
      const body = await readJson(req, res); if (!body) return;
      const acc = await getDoc('akun/' + pad(s.no));
      if (!acc || !isStr(body.old, 200) || !isStr(body.new, 200)) return fail(res, 400, 'invalid_argument', 'Data tidak valid.');
      const pk = 'pw:' + pad(s.no);
      const pwait = await rlWait([pk]);
      if (pwait) { res.setHeader('Retry-After', String(pwait)); return fail(res, 429, 'rate_limited', 'Terlalu banyak percobaan. Coba lagi nanti.'); }
      if (!(await checkPw(acc, body.old))) { await rlFail(pk, 5, 15 * 60000, 15 * 60000); return fail(res, 400, 'invalid_argument', 'Password lama salah.'); }
      if (body.new.length < 6) return fail(res, 400, 'invalid_argument', 'Password baru minimal 6 karakter.');
      const salt = crypto.randomBytes(12).toString('hex');
      acc.hash = await pbk(body.new, salt);
      acc.salt = salt;
      acc.resetReq = null;
      await setDoc('akun/' + pad(s.no), acc);
      setCookie(req, res, signToken(s.no, acc), Math.floor(SESSION_MS / 1000));
      broadcast('akun/' + pad(s.no));
      return json(res, 200, { ok: true });
    }

    if (pathname === '/api/upload' && method === 'POST') {
      const s = await getSession(req);
      if (!s) return fail(res, 401, 'unauthenticated', 'Masuk dulu untuk melanjutkan.');
      if (!SERVICE_KEY) return fail(res, 500, 'unavailable', 'Penyimpanan berkas belum dikonfigurasi.');
      if (!take('up:' + s.no, 60, 600000)) return fail(res, 429, 'rate_limited', 'Terlalu banyak unggahan. Coba lagi nanti.');
      const body = await readJson(req, res); if (!body) return;
      const type = String(body.type || '').split(';')[0].trim().toLowerCase();
      const size = Number(body.size), bucket = String(body.bucket || UPLOAD_BUCKET), target = storeFor(bucket);
      if (!target) return fail(res, 400, 'invalid_bucket', 'Tujuan penyimpanan tidak valid.');
      const allowed = bucket === MEDIA_BUCKET ? /^image\/(jpeg|png|webp|gif)$/.test(type) : FILE_TYPES.indexOf(type) >= 0;
      if (!allowed) return fail(res, 415, 'unsupported_type', 'Format belum didukung untuk bucket ini.');
      if (!Number.isFinite(size) || size <= 0) return fail(res, 400, 'invalid_request', 'Berkas kosong.');
      const maxSize = bucket === CERTIFICATE_BUCKET ? 10 * 1024 * 1024 : bucket === MEDIA_BUCKET ? 5 * 1024 * 1024 : MAX_FILE;
      if (size > maxSize) return fail(res, 413, 'too_large', 'Berkas melebihi batas ukuran bucket.');
      const id = crypto.randomBytes(16).toString('hex');
      const { data, error } = await target.createSignedUploadUrl(id);
      if (error || !data) { console.error(error); return fail(res, 500, 'unavailable', 'Tidak bisa menyiapkan unggahan.'); }
      await setDoc(UPL(id), { type: type, size: size, owner: s.no, bucket: bucket, at: Date.now() });
      const publicUrl = bucket === MEDIA_BUCKET ? SUPABASE_URL.replace(/\/$/, '') + '/storage/v1/object/public/' + MEDIA_BUCKET + '/' + id : null;
      return json(res, 200, { id: id, uploadUrl: data.signedUrl, contentType: type, publicUrl: publicUrl });
    }
    if (pathname.startsWith('/api/upload/') && method === 'DELETE') {
      const s = await getSession(req);
      if (!s) return fail(res, 401, 'unauthenticated', 'Masuk dulu untuk melanjutkan.');
      const id = pathname.slice(12), meta = await readMeta(id), target = storeFor(bucketFor(meta));
      if (meta && (s.admin || meta.owner === s.no)) {
        if (target) { try { await target.remove([id]); } catch (e) { /* sudah tidak ada */ } }
        await deleteDoc(UPL(id));
      }
      return json(res, 200, { deleted: !!meta });
    }
    if (pathname.startsWith('/_blob/') && method === 'GET') {
      const id = pathname.slice(7), s = await getSession(req), meta = await readMeta(id), target = storeFor(bucketFor(meta));
      if (!meta || !s || !target || !(s.admin || meta.owner === s.no)) { res.writeHead(404); return res.end(); }
      if (bucketFor(meta) === MEDIA_BUCKET) {
        const url = SUPABASE_URL.replace(/\/$/, '') + '/storage/v1/object/public/' + MEDIA_BUCKET + '/' + id;
        res.writeHead(302, { Location: url, 'Cache-Control': 'public, max-age=300' }); return res.end();
      }
      const { data, error } = await target.createSignedUrl(id, 300);
      if (error || !data) { res.writeHead(404); return res.end(); }
      res.writeHead(302, { Location: data.signedUrl, 'Cache-Control': 'private, max-age=120' });
      return res.end();
    }

    if (pathname === '/api/sektor' && method === 'GET') {
      // Hanya jumlah hadir per mahasiswa per mata kuliah (bukan status/bukti), untuk peringkat Sektor Absensi.
      const s = await getSession(req);
      if (!s) return fail(res, 401, 'unauthenticated', 'Masuk dulu untuk melanjutkan.');
      const out = {};
      (await listCol('sessions')).forEach((row) => {
        const d = row.data;
        if (!isObj(d) || !isObj(d.present) || !Object.values(d.present).some(Boolean)) return;
        const c = out[d.k] || (out[d.k] = { t: 0, h: {} });
        c.t++;
        Object.keys(d.present).forEach((no) => { if (d.present[no] === 'H' || d.present[no] === 'K') c.h[no] = (c.h[no] || 0) + 1; });
      });
      return json(res, 200, { courses: out });
    }

    if (pathname === '/api/hasil' && method === 'GET') {
      // Hanya waktu pengumpulan per mahasiswa per tugas (bukan tautan, berkas, atau catatan), untuk podium dan time tower.
      const s = await getSession(req);
      if (!s) return fail(res, 401, 'unauthenticated', 'Masuk dulu untuk melanjutkan.');
      const out = {}, groupOut = {};
      (await listCol('tugas')).forEach((row) => {
        const d = row.data;
        if (!isObj(d) || taskExpired(d)) return;
        const m = {};
        Object.keys(isObj(d.subs) ? d.subs : {}).forEach((no) => {
          const at = d.subs[no] && d.subs[no].at;
          if (/^\d{1,2}$/.test(no) && typeof at === 'number') m[no] = at;
        });
        const taskId = row.key.slice('tugas/'.length);
        out[taskId] = m;
        if (isObj(d.groupSubs)) {
          groupOut[taskId] = {};
          Object.keys(d.groupSubs).forEach((gid) => {
            const at = d.groupSubs[gid] && d.groupSubs[gid].at;
            if (typeof at === 'number') groupOut[taskId][gid] = at;
          });
        }
      });
      return json(res, 200, { tugas: out, groupTugas: groupOut });
    }

    if (pathname.startsWith('/api/c/')) {
      const cp = parsePath(pathname.slice(7), 'col');
      if (!cp) return fail(res, 400, 'invalid_argument', 'Path koleksi tidak valid.');
      const sess = await getSession(req);
      if (method === 'GET') {
        const docs = [];
        let rows = await listCol(cp);
        if (cp === 'tugas') rows = await dropExpired(rows);
        for (const row of rows) {
          const v = await view(row.key, row.data, sess);
          if (v !== null) docs.push({ id: row.key.slice(cp.length + 1), data: v });
        }
        docs.sort((a, b) => (a.id < b.id ? -1 : 1));
        return json(res, 200, { docs: docs });
      }
      if (method === 'POST') {
        const body = await readJson(req, res); if (!body) return;
        const id = crypto.randomBytes(10).toString('hex');
        const p = cp + '/' + id;
        return commit(res, p, await decide('POST', p, body, sess, undefined));
      }
    }

    if (pathname.startsWith('/api/d/')) {
      const dp = parsePath(pathname.slice(7), 'doc');
      if (!dp) return fail(res, 400, 'invalid_argument', 'Path dokumen tidak valid.');
      const sess = await getSession(req);
      const docData = await getDoc(dp);
      if (method === 'GET' && dp.startsWith('tugas/') && taskExpired(docData)) { await purgeTask(dp, docData); return json(res, 200, { exists: false }); }
      if (method === 'GET') {
        const v = docData !== null ? await view(dp, docData, sess) : null;
        return json(res, 200, v === null ? { exists: false } : { exists: true, data: v });
      }
      if (method === 'PUT' || method === 'PATCH') {
        const body = await readJson(req, res); if (!body) return;
        return commit(res, dp, await decide(method, dp, body, sess, docData));
      }
      if (method === 'DELETE') {
        const d = await decide('DELETE', dp, {}, sess, docData);
        return commit(res, dp, d);
      }
    }

    if ((method === 'GET' || method === 'HEAD') && STATIC[pathname]) {
      const f = STATIC[pathname];
      const buf = fs.readFileSync(path.join(process.cwd(), f[0]));
      const h = { 'Content-Type': f[1], 'Cache-Control': 'no-cache' };
      if (f[0] === 'public/index.html') h['Content-Security-Policy'] = CSP;
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

server.listen(PORT, () => {
  console.log('Grid Kelas berjalan di http://localhost:' + PORT);
});