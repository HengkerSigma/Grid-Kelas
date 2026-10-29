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

---

## Audit kode dan rekomendasi perbaikan

Tanggal pencatatan: 27 Oktober 2026.
Cakupan: inspeksi statis kode repository dan catatan konfigurasi. Ini bukan hasil penetration test atau pengujian runtime lengkap. Semua temuan di bawah harus dikonfirmasi melalui tes sebelum dinyatakan sebagai kerentanan yang terbukti.

### Prioritas P1 — Periksa sebelum memakai data mahasiswa sungguhan

- [ ] **Pastikan data yang dibaca tamu benar-benar publik.** Tinjau fungsi `view()` di `server.js` dan respons koleksi `students`, `courses`, `media`, serta `pengumuman`. Terapkan allowlist bidang yang aman untuk respons publik; jangan kirim seluruh objek mahasiswa jika mungkin berisi data pribadi. Uji dengan akun tamu dan periksa respons API mentah.
- [ ] **Hapus atau nonaktifkan fallback password default di produksi.** Kode yang diaudit memiliki fallback `12345678` untuk akun yang belum memiliki hash/salt. Pastikan akun lama yang belum diinisialisasi tidak bisa masuk dengan password default. Gunakan alur aktivasi/reset yang aman dan wajibkan password unik. Jika `DEFAULT_PASSWORD` tetap dipakai untuk proses migrasi, batasi hanya pada inisialisasi yang terkontrol dan jangan biarkan menjadi kredensial permanen.
- [ ] **Audit hak akses pada setiap endpoint.** Buat matriks akses tamu/mahasiswa/admin untuk semua endpoint baca, ubah, hapus, dan unggah. Uji akses langsung menggunakan request buatan, termasuk mencoba mengganti ID/NIM pemilik data. Jangan mengandalkan tombol yang disembunyikan di frontend sebagai kontrol keamanan.
- [ ] **Pastikan rahasia hanya tersedia di server.** Verifikasi `SUPABASE_SERVICE_KEY` dan `SESSION_SECRET` tidak pernah dikirim ke browser, dicatat dalam log, atau masuk ke repository. Jika pernah terpapar, rotasi kunci dan perbarui environment variable deployment.

### Prioritas P2 — Keamanan dan keandalan backend

- [ ] **Evaluasi durasi sesi 30 hari.** Pertimbangkan masa sesi lebih pendek untuk data akademik, pastikan cookie produksi memakai `Secure` melalui HTTPS, dan uji logout, reset password, serta pencabutan sesi. Karena sesi bersifat stateless, pastikan mekanisme invalidasi benar-benar bekerja pada semua instance.
- [ ] **Validasi data di server menggunakan skema eksplisit.** Periksa tipe, panjang, rentang, dan bidang yang diizinkan untuk setiap operasi. Tolak bidang yang tidak dikenal dan jangan mempercayai nilai pemilik, role, atau identitas yang dikirim klien.
- [ ] **Tangani error Supabase pada setiap operasi.** Tinjau `getDoc()`, `setDoc()`, `deleteDoc()`, dan `listCol()` di `server.js`. Periksa properti `error` dan bedakan kegagalan database dari hasil kosong. Jangan mengembalikan respons sukses jika operasi gagal.
- [ ] **Verifikasi unggahan berkas.** MIME type dari browser tidak membuktikan isi file. Batasi ukuran dan jenis yang diizinkan, validasi file di sisi server atau setelah unggahan, uji masa berlaku URL bertanda tangan, dan pastikan akses unduh hanya diberikan kepada pemilik serta admin yang berwenang.
- [ ] **Uji pembatasan percobaan login pada deployment nyata.** Pembatas yang disimpan dalam database perlu diuji terhadap beberapa instance dan request paralel. Pastikan kegagalan database tidak membuat login terbuka tanpa batas.
- [ ] **Periksa konfigurasi cookie dan header keamanan.** Pastikan `COOKIE_SECURE=1` pada deployment HTTPS dan evaluasi Content Security Policy serta header lain tanpa merusak fitur yang diperlukan.

### Prioritas P3 — Stabilitas, performa, dan pemeliharaan

- [ ] **Tetapkan versi Node.js secara eksplisit.** Kode mencampur sintaks `import` dan `require()`; ini tidak otomatis salah, tetapi harus diuji dengan versi Node.js yang benar-benar dipakai Vercel. Tambahkan konfigurasi versi runtime dan pastikan proses build/start berhasil.
- [ ] **Tinjau strategi polling dan SSE.** Catatan proyek menyebut SSE tidak berfungsi di serverless dan polling berjalan setiap 20 detik. Uji jumlah request, penanganan tab yang ditinggalkan, dan perilaku saat koneksi gagal. Pertimbangkan Supabase Realtime jika sesuai kebutuhan dan konfigurasi keamanan.
- [ ] **Jangan mengandalkan state dalam memori untuk konsistensi lintas instance.** Tinjau `Map` atau penyimpanan lokal proses yang digunakan untuk pembatas unggahan/sesi. Pada deployment serverless, instance dapat berbeda; gunakan penyimpanan bersama bila konsistensi lintas instance diperlukan.
- [ ] **Pertimbangkan pagination atau pemilihan bidang.** Saat data bertambah, hindari membaca semua dokumen jika halaman hanya membutuhkan sebagian data. Ukur terlebih dahulu agar optimasi didasarkan pada hasil.
- [ ] **Pertimbangkan pemisahan modul backend.** Secara bertahap pisahkan autentikasi, validasi, akses database, unggahan, dan routing dari `server.js` agar lebih mudah diuji dan dirawat.
- [ ] **Perbaiki cache aset statis berdasarkan hasil pengukuran.** Pertimbangkan cache panjang untuk aset berversi; jangan menerapkan cache panjang ke respons data pribadi atau konten yang berubah tanpa strategi invalidasi.

### Prioritas P4 — UI/UX dan aksesibilitas

- [ ] Uji layout pada ponsel sempit, tablet, dan desktop; pastikan grid mahasiswa, navigasi horizontal, dan dialog tidak terpotong.
- [ ] Sediakan status loading, berhasil, gagal, dan sesi kedaluwarsa untuk aksi penting seperti absensi, pengumpulan tugas, serta unggah dokumen.
- [ ] Pastikan formulir memiliki label, fokus keyboard terlihat, dialog dapat digunakan dengan keyboard, dan pesan status dapat dibaca teknologi bantu.
- [ ] Gunakan konfirmasi untuk tindakan destruktif dan tampilkan pesan yang menjelaskan langkah pemulihan tanpa membocorkan detail internal server.
- [ ] Pastikan ukuran area sentuh memadai dan status tidak dibedakan berdasarkan warna saja.

### Checklist pengujian penerimaan

- [ ] Login dengan password benar dan salah; logout; sesi kedaluwarsa; reset password.
- [ ] Tamu tidak bisa membaca data privat atau melakukan perubahan.
- [ ] Mahasiswa tidak bisa membaca/mengubah data mahasiswa lain dengan memanipulasi ID atau request.
- [ ] Admin dapat melakukan tindakan yang memang diizinkan dan tidak dapat melewati validasi.
- [ ] Absensi, tugas, unggah, unduh, dan penghapusan diuji dengan Supabase asli pada lingkungan uji.
- [ ] File dengan ekstensi/MIME palsu, ukuran berlebih, URL kedaluwarsa, dan akses lintas pemilik ditolak.
- [ ] Error database dan jaringan ditampilkan dengan benar; tidak ada operasi gagal yang dilaporkan sukses.
- [ ] Dua pengguna mengubah data yang sama untuk menguji benturan dan konsistensi.
- [ ] Uji antarmuka mobile, keyboard, formulir, dialog, dan pesan status.
- [ ] Ukur waktu muat halaman dan respons API sebelum serta sesudah optimasi.

### Catatan penilaian temuan

Prioritas P1–P4 di atas adalah urutan pengerjaan yang disarankan, bukan skor risiko final. Khusus temuan data publik, fallback password, validasi unggahan, dan state serverless, verifikasi perilaku aktual serta konfigurasi deployment sebelum menyimpulkan dampak akhirnya.

Jangan mengubah arsitektur atau desain besar sekaligus. Kerjakan satu kelompok perbaikan, buat perubahan kecil, jalankan tes terkait, lalu tinjau diff sebelum merge/deploy.


## Super License dan Class Archive

- **Super License** menggantikan kartu Sertifikat Saya. Sertifikat tetap tampil di daftar pribadi dan tersimpan privat di bucket `uploads`. Setelah diunggah, server mencoba menyalin sertifikat ke folder Google Drive khusus.
- **Class Archive** adalah galeri foto kelas yang dapat dilihat tamu, mahasiswa, dan admin. Foto disimpan di bucket publik `media`; metadata berada di koleksi `classArchive`.
- Admin dapat memberikan atau mencabut izin unggah Class Archive per mahasiswa dari bagian Akun Mahasiswa. Izin diperiksa lagi oleh server, bukan hanya tombol frontend.

### Mengaktifkan arsip otomatis Google Drive

Tambahkan environment variable berikut pada Vercel (server-side only):
- `DRIVE_SERVICE_ACCOUNT_EMAIL`: email service account.
- `DRIVE_SERVICE_ACCOUNT_PRIVATE_KEY`: private key service account; newline dapat ditulis sebagai `\\n`.
- `DRIVE_CERT_FOLDER_ID`: ID folder Drive khusus sertifikat.

Aktifkan Google Drive API di Google Cloud, lalu bagikan folder tujuan kepada service account dengan izin Editor. Jangan simpan private key di repository atau kirim melalui chat. Jika variabel belum dikonfigurasi, sertifikat tetap tersimpan di website dengan status `Menunggu konfigurasi Drive`; konfigurasi Drive belum otomatis dilakukan oleh pull request ini.
