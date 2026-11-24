# Mentari Collector v2

## Tujuan

Userscript Tampermonkey ini menangkap snapshot nilai Pre-test/Post-test dari respons Mentari yang memang dimuat oleh browser saat pengguna menavigasi situs secara normal. Collector tidak membuat request API Mentari sendiri, tidak membuka kuis yang belum diakses, dan tidak melewati kontrol akses. Pengiriman ke Grid Kelas hanya terjadi setelah admin menekan tombol sinkronisasi, melalui tiket upload singkat.

## Endpoint yang diamati

Untuk pengumpulan di Mentari, hanya endpoint same-origin berikut yang diamati:
- `/api/user-course/{kode_course}` untuk metadata aktivitas kuis.
- `/api/quiz/peserta/{quiz_uuid}` untuk hasil peserta.

Script tidak membaca atau mengirim cookie maupun token login Mentari. Script tidak menyimpan authorization header, nama, email, nomor telepon, jawaban, atau body mentah. Data minimal disimpan di IndexedDB lokal: ID aktivitas/UUID kuis, mata kuliah, pertemuan, jenis kuis, ketersediaan kuis, NIM, nilai, status, dan waktu pengerjaan.

## Instalasi dan penggunaan

Untuk versi sinkronisasi klik, pasang versi terbaru dari `tools/mentari/collector-v2.user.js` melalui Tampermonkey. Script berjalan pada dua origin yang diizinkan: Mentari dan `www.1else3.my.id`. Pastikan Tampermonkey aktif pada kedua situs. Buka Grid Kelas dan Mentari pada browser/profil yang sama, lalu login Mentari secara normal.

1. Buka menu **Rekap Nilai** di Grid Kelas sebagai admin.
2. Tekan **Sinkronkan Mentari**. Grid Kelas membuat tiket upload singkat yang hanya dapat membuat preview.
3. Collector di tab Mentari mengirim data IndexedDB ke endpoint Grid Kelas melalui koneksi HTTPS. Tidak ada cookie atau token login Mentari yang dibaca atau dikirim.
4. Setelah preview tampil, periksa jumlah aktivitas, baris, dan peringatan. Tekan **Konfirmasi & Simpan** hanya jika hasilnya benar.
5. Tiket upload berlaku lima menit dan nonce tiket hanya dapat membuat satu batch preview. Konfirmasi tetap membutuhkan sesi admin Grid Kelas yang aktif.

Sinkronisasi mengirim snapshot lengkap yang telah dikumpulkan sebelumnya. Kuis yang belum pernah dimuat belum otomatis dijelajahi; buka mata kuliah dan kuis melalui navigasi Mentari biasa, lalu ulangi sinkronisasi.

1. Pasang Tampermonkey.
2. Buat userscript baru dan salin seluruh isi `tools/mentari/collector-v2.user.js` (versi 2.2.0).
3. Aktifkan script lalu buka Mentari melalui login resmi.
4. Buka halaman mata kuliah terlebih dahulu agar metadata kuis tertangkap.
5. Buka halaman kuis melalui navigasi normal. Snapshot akan tersimpan otomatis.
6. Tombol **Mentari Collector** menampilkan jumlah aktivitas dan rekaman.
7. Pilih **Ekspor JSON** untuk menghasilkan file lokal.

Jika halaman kuis terbuka sebelum metadata aktivitas tertangkap, kembali ke halaman mata kuliah lalu buka ulang kuis. Body respons kuis yang belum memiliki metadata tidak disimpan.

## Data dan kelengkapan

- Database IndexedDB: `grid-kelas-mentari-collector`.
- Data bertahan setelah refresh/browser ditutup, selama data situs tidak dibersihkan.
- Kunci deduplikasi hasil: `quiz_uuid + NIM`.
- Hanya snapshot lengkap (32 baris dan 32 NIM unik valid) yang menggantikan seluruh hasil sebelumnya untuk UUID kuis yang sama dalam satu transaksi IndexedDB. Snapshot tidak lengkap tidak disimpan dan tidak menghapus atau mengubah hasil sebelumnya; hasil kuis lain tetap dipertahankan.
- Snapshot hanya ditandai lengkap bila tepat 32 baris dan 32 NIM unik valid terdeteksi. Ini pemeriksaan struktural, bukan jaminan roster sumber tidak terpotong.
- Nilai 0 valid. Nilai numerik 0–100 termasuk desimal diterima; nilai di luar rentang diberi status `invalid_grade` dan diekspor sebagai null.
- `no_record` hanya berarti respons saat itu tidak berisi objek percobaan, bukan bukti bahwa mahasiswa tidak pernah mengerjakan kuis. Metadata aktivitas dengan `quiz: null` dicatat sebagai `not_open` (belum dibuka) berdasarkan struktur respons Mentari yang telah diverifikasi; entri tersebut dikirim terpisah sebagai `activity_metadata`, tidak dimasukkan ke daftar kuis/nilai yang diimpor.

## Privasi

IndexedDB tidak otomatis terenkripsi. Gunakan perangkat pribadi yang terkunci, batasi akses file ekspor, jangan unggah ke lokasi publik, dan hapus data lokal setelah file aman dipindahkan. Data ekspor mencakup NIM dan nilai seluruh peserta.

## Batasan versi awal

- Hanya sembilan mata kuliah yang telah dipetakan; PKKMB/kode lain diabaikan.
- `activity_metadata` menyimpan aktivitas Pretest/Posttest yang belum memiliki objek kuis. Data ini hanya menjadi informasi status pada preview dan tidak membuat baris nilai.
- Sinkronisasi klik mengirim snapshot lokal ke preview Grid Kelas; penulisan nilai ke database tetap memerlukan konfirmasi admin.
- Collector tidak menavigasi atau membuka kuis yang belum pernah dimuat. Pengumpulan awal tetap melalui navigasi Mentari normal.
- Hook fetch/XHR hanya memeriksa endpoint yang cocok dan tetap mengembalikan respons asli ke Mentari.
- Pengujian browser pada akun berwenang tetap diperlukan sebelum pemakaian rutin.

## Tes

```sh
node --check tools/mentari/collector-v2.user.js
node --test tests/mentari/collector-v2-static.test.js
```
