# Mentari Collector v2

## Tujuan

Userscript Tampermonkey ini menangkap snapshot nilai Pre-test/Post-test dari respons Mentari yang memang dimuat oleh browser saat pengguna menavigasi situs secara normal. Script tidak membuat request API sendiri, tidak membuka kuis yang belum diakses, tidak melewati kontrol akses, dan tidak mengirim data ke Grid Kelas atau Supabase.

## Endpoint yang diamati

Hanya endpoint same-origin berikut:
- `/api/user-course/{kode_course}` untuk metadata aktivitas kuis.
- `/api/quiz/peserta/{quiz_uuid}` untuk hasil peserta.

Script tidak menyimpan cookie, token, authorization header, nama, email, nomor telepon, jawaban, atau body mentah. Data minimal disimpan di IndexedDB lokal: UUID kuis, mata kuliah, pertemuan, jenis kuis, NIM, nilai, status, dan waktu pengerjaan.

## Instalasi dan penggunaan

1. Pasang Tampermonkey.
2. Buat userscript baru dan salin seluruh isi `tools/mentari/collector-v2.user.js`.
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
- `no_record` hanya berarti respons saat itu tidak berisi objek percobaan, bukan bukti bahwa mahasiswa tidak pernah mengerjakan kuis.

## Privasi

IndexedDB tidak otomatis terenkripsi. Gunakan perangkat pribadi yang terkunci, batasi akses file ekspor, jangan unggah ke lokasi publik, dan hapus data lokal setelah file aman dipindahkan. Data ekspor mencakup NIM dan nilai seluruh peserta.

## Batasan versi awal

- Hanya sembilan mata kuliah yang telah dipetakan; PKKMB/kode lain diabaikan.
- Tidak ada importer, sinkronisasi, penulisan database, atau perubahan aplikasi produksi.
- Hook fetch/XHR hanya memeriksa endpoint yang cocok dan tetap mengembalikan respons asli ke Mentari.
- Pengujian browser pada akun berwenang tetap diperlukan sebelum pemakaian rutin.

## Tes

```sh
node --check tools/mentari/collector-v2.user.js
node --test tests/mentari/collector-v2-static.test.js
```
