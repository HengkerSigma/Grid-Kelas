'use strict';
/*
 * Memindahkan foto/logo lama (base64 di tabel app_data) ke bucket Storage "media".
 * Jalankan SEKALI dari komputer Anda setelah bucket dibuat:
 *   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_KEY=... node migrate-media.js
 * Aman diulang: foto yang sudah berupa alamat https dilewati.
 */
import { createClient } from '@supabase/supabase-js';

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET = process.env.MEDIA_BUCKET || 'media';
if (!URL_ || !KEY) { console.error('Isi SUPABASE_URL dan SUPABASE_SERVICE_KEY dulu.'); process.exit(1); }

const sb = createClient(URL_, KEY, { auth: { persistSession: false } });
const store = sb.storage.from(BUCKET);

const { data: rows, error } = await sb.from('app_data').select('key,content').like('key', 'media/%');
if (error) { console.error(error.message); process.exit(1); }

let done = 0, skipped = 0, failed = 0;
for (const r of rows) {
  const id = r.key.slice('media/'.length);
  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec((r.content && r.content.data) || '');
  if (!m || !/^[A-Za-z0-9_]{1,40}$/.test(id)) { skipped++; continue; }
  const up = await store.upload(id, Buffer.from(m[2], 'base64'), { contentType: m[1], upsert: true, cacheControl: '31536000' });
  if (up.error) { console.error('Gagal', id, up.error.message); failed++; continue; }
  const url = store.getPublicUrl(id).data.publicUrl + '?v=' + Date.now();
  const w = await sb.from('app_data').upsert({ key: r.key, content: { data: url } });
  if (w.error) { console.error('Gagal simpan', id, w.error.message); failed++; continue; }
  console.log('OK', id);
  done++;
}
console.log(`Selesai: ${done} dipindah, ${skipped} dilewati, ${failed} gagal.`);