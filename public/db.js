/*
 * Klien basis data untuk Grid Kelas (dipakai bila halaman dibuka lewat server.js).
 * Menyediakan window.claude.use('db' | 'user' | 'assets') yang dipanggil app.js.
 * Bila window.claude sudah ada (misalnya di platform Claude), file ini tidak melakukan apa-apa.
 */
(function () {
  'use strict';
  if (window.claude && window.claude.use) return;

  const enc = (p) => p.split('/').map(encodeURIComponent).join('/');

  async function req(method, url, body, raw) {
    const opt = { method: method, headers: {}, credentials: 'same-origin' };
    if (raw) { opt.headers = Object.assign({}, raw.headers); opt.body = raw.body; }
    else if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    if (method !== 'GET') opt.headers['X-Requested-With'] = 'gk';
    let r;
    try { r = await fetch(url, opt); }
    catch (e) { throw { code: 'unavailable', message: 'Server tidak bisa dihubungi.' }; }
    let j = null;
    try { j = await r.json(); } catch (e) { /* tanpa isi */ }
    if (!r.ok) {
      if (r.status === 401 && j && j.code === 'unauthenticated') window.dispatchEvent(new Event('gk-expired'));
      throw { code: (j && j.code) || 'unavailable', message: (j && j.message) || ('Server ' + r.status) };
    }
    return j;
  }

  /* ---- langganan perubahan ---- */
  const listeners = new Set();
  let events = null;
  function related(l, p) { return p === l.path || p.indexOf(l.path + '/') === 0 || l.path.indexOf(p + '/') === 0; }
  function startEvents() {
    if (events || typeof EventSource === 'undefined') return;
    events = new EventSource('/api/events');
    events.onmessage = (m) => {
      let p = '';
      try { p = JSON.parse(m.data).p || ''; } catch (e) { return; }
      listeners.forEach((l) => { if (related(l, p)) l.run(); });
    };
    events.onopen = () => { listeners.forEach((l) => l.run()); };
  }
  setInterval(() => { listeners.forEach((l) => l.run()); }, 20000);

  function listen(path, fetcher, next, error) {
    const l = { path: path, dead: false, got: false, errored: false, last: '', busy: false };
    l.run = async function () {
      if (l.dead || l.busy) return;
      l.busy = true;
      try {
        const raw = await fetcher();
        if (l.dead) return;
        l.got = true;
        const sig = JSON.stringify(raw);
        if (sig !== l.last) { l.last = sig; next(raw); }
      } catch (e) {
        if (!l.got && !l.errored) { l.errored = true; if (error) error(e); }
      } finally { l.busy = false; }
    };
    listeners.add(l);
    startEvents();
    l.run();
    return function () { l.dead = true; listeners.delete(l); };
  }

  const mkDoc = (id, raw) => ({ id: id, exists: !!raw.exists, data: () => raw.data, metadata: { fromCache: false, hasPendingWrites: false } });

  function docRef(path) {
    const id = path.split('/').pop();
    return {
      id: id,
      path: path,
      get: async () => mkDoc(id, await req('GET', '/api/d/' + enc(path))),
      set: (d) => req('PUT', '/api/d/' + enc(path), d).then(() => undefined),
      update: (d) => req('PATCH', '/api/d/' + enc(path), d).then(() => undefined),
      delete: () => req('DELETE', '/api/d/' + enc(path)).then(() => undefined),
      onSnapshot: (next, error) => listen(path, () => req('GET', '/api/d/' + enc(path)), (raw) => next(mkDoc(id, raw)), error),
      collection: (sub) => colRef(path + '/' + sub)
    };
  }
  function colRef(path) {
    const snap = (raw) => {
      const docs = raw.docs.map((d) => ({ id: d.id, exists: true, data: () => d.data }));
      return { docs: docs, size: docs.length, empty: !docs.length };
    };
    return {
      path: path,
      doc: (id) => docRef(path + '/' + (id || Math.random().toString(16).slice(2, 12))),
      add: async (data) => { const r = await req('POST', '/api/c/' + enc(path), data); return docRef(path + '/' + r.id); },
      get: async () => snap(await req('GET', '/api/c/' + enc(path))),
      onSnapshot: (next, error) => listen(path, () => req('GET', '/api/c/' + enc(path)), (raw) => next(snap(raw)), error)
    };
  }

  const DB = { doc: docRef, collection: colRef };

  /* ---- unggah berkas ---- */
  const ASSETS = {
    // 1) minta izin ke server, 2) unggah langsung ke penyimpanan (tidak lewat server, jadi tak ada batas 4,5 MB Vercel)
    upload: async (blob, bucket) => {
      const type = blob.type || 'application/octet-stream';
      const init = await req('POST', '/api/upload', { type: type, size: blob.size, bucket: bucket || 'uploads' });
      const fd = new FormData();
      fd.append('cacheControl', '3600');
      fd.append('', blob);
      let r;
      try { r = await fetch(init.uploadUrl, { method: 'PUT', headers: { 'x-upsert': 'false' }, body: fd }); }
      catch (e) { req('DELETE', '/api/upload/' + init.id).catch(() => {}); throw { code: 'unavailable', message: 'Server tidak bisa dihubungi.' }; }
      if (!r.ok) {
        req('DELETE', '/api/upload/' + init.id).catch(() => {});
        throw { code: r.status === 413 ? 'too_large' : 'unavailable', message: 'Gagal mengunggah berkas. Coba lagi.' };
      }
      return { id: init.id, url: '/_blob/' + init.id, sizeBytes: blob.size, contentType: init.contentType };
    },
    delete: (id) => req('DELETE', '/api/upload/' + encodeURIComponent(id)),
    list: async () => ({ assets: [], usage: {} })
  };

  /* ---- identitas perangkat ---- */
  let uid = null;
  try { uid = localStorage.getItem('gk_uid'); } catch (e) { /* abaikan */ }
  if (!uid) {
    const a = new Uint8Array(11);
    (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach((_, i) => { a[i] = Math.floor(Math.random() * 256); });
    uid = 'u_' + Array.from(a).map((b) => b.toString(16).padStart(2, '0')).join('');
    try { localStorage.setItem('gk_uid', uid); } catch (e) { /* abaikan */ }
  }
  const USER = {
    id: async () => uid,
    me: async () => ({ id: uid, name: '', isOwner: false, canEdit: false }),
    isOwner: async () => false,
    canEdit: async () => false,
    can: async () => true
  };

  /* ---- ketersediaan server ---- */
  let alive = null;
  function check() {
    if (!alive) alive = fetch('/api/ping').then((r) => r.ok).catch(() => false);
    return alive;
  }

  /* ---- login (diperiksa server, sesi lewat cookie HttpOnly) ---- */
  function refreshAll() { listeners.forEach((l) => { l.last = ''; l.run(); }); }
  const AUTH = {
    me: async () => { try { return await req('GET', '/api/me'); } catch (e) { return { no: null, admin: false }; } },
    login: async (no, nim, password) => { const r = await req('POST', '/api/login', { no: no, nim: nim, password: password }); refreshAll(); return r; },
    logout: async () => { try { await req('POST', '/api/logout', {}); } finally { refreshAll(); } },
    sektor: () => req('GET', '/api/sektor'),
    hasil: () => req('GET', '/api/hasil'),
    changePassword: async (oldPw, newPw) => { await req('POST', '/api/password', { old: oldPw, new: newPw }); }
  };
  window.addEventListener('gk-expired', () => { refreshAll(); });

  window.claude = {
    auth: AUTH,
    use: async function (name) {
      if (name === 'user') return USER;
      if (name === 'db') return (await check()) ? DB : null;
      if (name === 'assets') return (await check()) ? ASSETS : null;
      return null;
    }
  };
})();