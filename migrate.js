'use strict';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Gunakan kredensial Supabase yang sama
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://uboroxjkcvjbywcshdbq.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY; // service_role: tabel dikunci RLS, kunci anon tidak bisa menulis
if (!SUPABASE_KEY) { console.error('Isi SUPABASE_SERVICE_KEY dulu.'); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const DATA_FILE = path.join(__dirname, 'data', 'db.json');
async function migrate() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      console.error('File db.json tidak ditemukan di folder data!');
      return;
    }

    const rawData = fs.readFileSync(DATA_FILE, 'utf8');
    const obj = JSON.parse(rawData);

    console.log('Memulai migrasi data ke Supabase...');

    for (const [key, value] of Object.entries(obj)) {
      if (key.startsWith('courses/')) {
        // Masukkan ke tabel courses
        const courseData = Object.assign({ k: key.replace('courses/', '') }, value);
        const { error } = await supabase.from('courses').upsert(courseData);
        if (error) console.error(`Gagal memasukkan course ${key}:`, error.message);
        else console.log(`Berhasil migrasi course: ${key}`);
      } else {
        // Masukkan ke tabel app_data
        const { error } = await supabase.from('app_data').upsert({ key: key, content: value });
        if (error) console.error(`Gagal memasukkan app_data ${key}:`, error.message);
        else console.log(`Berhasil migrasi app_data: ${key}`);
      }
    }

    console.log('Migrasi selesai! Semua data berhasil dipindahkan ke Supabase.');
  } catch (e) {
    console.error('Terjadi kesalahan saat migrasi:', e.message);
  }
}

migrate();