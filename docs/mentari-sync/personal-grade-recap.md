# Personal Grade Recap — implementasi

Fitur ini menyimpan rekap Pre-test dan Post-test Mentari secara terpisah dari tugas dan absensi Grid Kelas.

## Alur
1. Admin mengunggah JSON Collector v2.
2. Backend memetakan NIM ke `app_data` akun dan memvalidasi semester, mata kuliah, pertemuan, UUID, status, serta rentang nilai.
3. Batch preview disimpan sementara selama 30 menit.
4. Admin mengonfirmasi batch; RPC `mentari_commit_grade_import` menyimpan seluruh hasil dalam satu transaksi PostgreSQL.
5. Mahasiswa hanya membaca rekap milik akunnya melalui endpoint backend.

## Kebijakan data
- Semester aktif: `20261`.
- Nilai 0 valid; nilai null bukan nilai nol.
- Nilai di luar 0–100 ditolak.
- Ekspor parsial tidak menghapus nilai lama.
- Perubahan nilai disimpan dalam `quiz_result_history`.
- Pergantian UUID membuat versi aktivitas baru dan tidak mengubah identitas logis mata kuliah/pertemuan/jenis kuis.
- Batch preview kedaluwarsa dalam 30 menit.
- Tidak menyimpan JSON mentah, nama, email, atau nomor telepon Mentari.

## Database
Migration: `supabase/migrations/20261123000100_mentari_personal_grade_recap.sql`.

RPC hanya dapat dipanggil service_role. Backend wajib memeriksa sesi Grid Kelas dan peran admin sebelum mengimpor; service_role melewati RLS sehingga tidak boleh diekspos ke browser.

## Catatan implementasi
Migration ini belum diterapkan ke Supabase. Endpoint aplikasi dan UI harus dirilis setelah migration ditinjau dan diuji di lingkungan nonproduksi.
