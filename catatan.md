# Catatan Proyek: Grid Kelas

Website kelas bergaya Formula 1: 32 mahasiswa (grid menurut nomor absen), 9 mata kuliah, absen dan tugas, login NIM + password, mode tamu/mahasiswa/pengelola.
Situs: https://www.1else3.my.id · Repo: github.com/HengkerSigma/Grid-Kelas

## Susunan
- `server.js`: server Node (satu file). Login, hak akses, API data, unggah berkas, pembatas login.
- `public/`: `index.html`, `style.css`, `app.js` (tampilan dan logika), `db.js` (penghubung ke server).
- `migrate.js`: memasukkan `data/db.json` (data awal) ke Supabase. `migrate-media.js`: memindahkan foto lama ke Storage.
- `supabase-rls.sql`: mengunci tabel dari kunci publik.
- `vercel.json`: hosting di Vercel.

## Arsitektur
- Hosting: Vercel (serverless). Database: Supabase tabel `app_data(key, content jsonb)` dan `courses`.
- Browser tidak pernah bicara langsung ke database. Semua lewat `server.js`, yang memakai kunci `service_role`.
- Sesi: cookie `gk_session` bertanda tangan HMAC (30 hari), tanpa penyimpanan di server. Berlaku lagi setelah restart.
  Sesi otomatis tidak sah bila password diganti/direset.
- Hak akses (di `view()` dan `decide()` pada server.js): tamu hanya melihat data publik; mahasiswa hanya mengubah absen,
  tugas, dan berkas miliknya; admin (akun `admin:true`, awalnya absen 4) mengubah semuanya.
- Berkas bukti/tugas/sertifikat: bucket **`uploads`** (privat). Browser mengunggah langsung lewat tautan bertanda tangan;
  dibuka lewat `/_blob/<id>` (hanya pemilik dan admin).
- Foto mahasiswa/dosen dan logo: bucket **`media`** (publik). Database hanya menyimpan alamat gambarnya.
- Pembatas login disimpan di `app_data` dengan kunci `rl:...` (per akun+IP, per akun, per IP).
- Data langsung-segar: polling 20 detik (SSE `/api/events` tidak berfungsi di serverless).

## Environment variable (Vercel → Settings → Environment Variables)
| Nama | Isi |
|---|---|
| `SUPABASE_URL` | alamat proyek Supabase |
| `SUPABASE_SERVICE_KEY` | kunci `service_role` (RAHASIA, hanya di sini) |
| `SESSION_SECRET` | teks acak panjang (minimal 32 karakter) |
| `COOKIE_SECURE` | `1` |
| `DEFAULT_PASSWORD` | opsional, password awal akun baru (bawaan 12345678) |
Daftar nama ada di `.env.example`.

## Urutan menyiapkan dari nol
1. Supabase: buat tabel `app_data` dan `courses`; buat bucket `uploads` (privat, 20 MB, gambar+PDF) dan `media` (publik, 1 MB, gambar).
2. Isi environment variable di atas, deploy.
3. Jalankan `node migrate.js` (data awal) dan bila perlu `node migrate-media.js`. Keduanya butuh `SUPABASE_SERVICE_KEY`.
4. Jalankan `supabase-rls.sql` di SQL Editor, lalu cek hasil query di dalamnya.
5. Login sebagai admin (absen 4), ganti password bawaan.

## Keamanan: jangan lupa
- Kunci `service_role` jangan pernah masuk repo, kode, atau chat. Bila bocor: buat kunci baru dan perbarui di Vercel.
- Repo dibuat private; `node_modules/`, `.env`, dan `data/` ada di `.gitignore`.
- Ganti password bawaan semua akun; admin menambah admin baru lewat tab Pengelola.

## Status
Selesai: tampilan F1, tiga mode pengguna, absen, tugas, bukti berkas, sertifikat/dokumentasi, pengumuman,
login server-side, sesi tahan lama, unggah ke Storage, foto di Storage, pembatas login, RLS.
Belum diuji dengan Supabase asli: unggah berkas, foto, pembatas login (hanya diuji dengan Supabase tiruan).

## Ide berikutnya
- Realtime dengan Supabase Realtime (ganti polling).
- Pembersihan berkas yatim (init unggah tanpa selesai) di bucket `uploads`.
- Tes otomatis untuk alur login dan unggah.