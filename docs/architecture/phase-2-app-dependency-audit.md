# Phase 2 — Audit Dependensi Frontend

Status: audit statis, tanpa perubahan runtime  
Baseline: `public/app.js` (3.250 baris; sekitar 284 KB), `public/db.js`, `public/index.html`  
Branch: `refactor/phase-2-app-dependency-audit`

## 1. Tujuan dan batasan

Dokumen ini memetakan area kode, state bersama, event, dan dependensi utama sebelum ekstraksi modul. Ini adalah pembacaan statis, bukan jaminan bahwa seluruh jalur runtime sudah diuji.

Tidak ada perubahan pada perilaku aplikasi, HTML, CSS, API, autentikasi, skema Supabase, atau data. Jangan memindahkan fungsi hanya berdasarkan nama; cek semua pemanggil, efek samping, dan urutan inisialisasinya.

## 2. Baseline teknis

- `public/app.js` dimuat sebagai script klasik dan seluruh implementasi dibungkus satu IIFE dengan `'use strict'`.
- Fungsi, konstanta, dan state di dalam IIFE berbagi lexical scope. Modul ES tidak dapat mengaksesnya otomatis.
- `public/index.html` memuat elemen DOM tetap dengan ID yang dipakai langsung oleh `app.js`; beberapa listener dipasang saat IIFE berjalan. DOM harus tersedia dan elemen yang diwajibkan harus ada.
- `public/db.js` menyediakan adapter `window.claude.use('db' | 'user' | 'assets')` untuk deployment melalui `server.js`; adapter mengimplementasikan operasi dokumen/koleksi, snapshot, user, dan upload.
- Saat inisialisasi, `app.js` juga mendukung runtime `window.claude` yang sudah tersedia. Karena itu, kontrak adapter tidak boleh berubah saat pemisahan frontend.
- `package.json` belum mengaktifkan `type: module`. Jangan mengubah mode modul global hanya untuk memulai ekstraksi.
- `server.js` adalah entry point backend/deployment dan tidak termasuk dalam audit ekstraksi frontend tahap ini.

## 3. Peta area dalam app.js

Rentang berikut merupakan peta orientasi berdasarkan deklarasi fungsi dan blok kode. Beberapa fungsi lintas area menggunakan state/helper bersama.

| Area | Rentang indikatif | Fungsi / tanggung jawab utama |
|---|---:|---|
| Core helpers, config, state | 1–172 | DOM helper, sanitasi, validasi URL/ID, jadwal, waktu WIB, status akses, state global, toast/loading, wrapper operasi |
| Statistik dan file/task preview | 173–225 | Statistik tugas/absensi, rendering file, preview gambar tugas, gallery |
| Presence dan greeting | 226–271 | Presence heartbeat, status online, ulang tahun, greeting, inbox dan cooldown |
| Mahasiswa / Line-Up | 272–302 | Strip mahasiswa, kartu dan daftar mahasiswa |
| Mata kuliah | 303–356 | Daftar mata kuliah, dosen, tugas aktif dan kartu kursus |
| Constructor | 357–478 | Grup, principal, task grup, tower, seed default, tampilan Constructor |
| Navigasi dan jadwal akademik | 479–638 | Header/nav, view/subtab, tenggat, statistik sektor, ringkasan home |
| Tutorial | 639–970 | Demo snapshot, onboarding tour, driver UI, tooltip/popover dan langkah mobile |
| Grand Prix / hasil / sektor | 971–1170 | Pit dialog, hasil, tower, podium, recap file, Makrab file, sektor |
| Home dan Exhibition | 1171–1433 | Alert password, home, Super License, Class Archive, Exhibition, jadwal, pengumuman, Team Radio, template WhatsApp |
| Admin | 1434–1568 | Render panel pengelola dan sub-area pengelolaan |
| Orkestrasi dan dialog | 1569–1629 | `refreshAll`, tabs, pertemuan default, buka/render dialog, jadwal absensi |
| Export | 1630–1805 | Rekap pertemuan, builder baris, load library, ekspor XLSX/CSV/PDF |
| Mata kuliah / absensi / tugas | 1806–2028 | Dialog kursus, pemilih pertemuan, tampilan absensi mahasiswa/admin, status periode, jadwal absensi, redirect eksternal, task actions dan render tugas |
| Profil dan hasil akademik | 2029–2145 | Pengaturan, tab kehadiran/hasil/prestasi, dialog profil mahasiswa, password |
| Auth, session, media | 2146–2305 | Login, tulis sesi, set/clear user, image transform, upload, hashing/password, akun |
| Event handlers dan UI wiring | 2306–3211 | Delegasi click/input/change/touch, aksi dialog, file upload, strip drag, expired session, kontrol UI |
| Bootstrap dan subscriptions | 3212–3250 | Load config dan adapter, resolve user, subscriptions koleksi, presence/greetings, refresh dan timer |

Jumlah kandidat deklarasi fungsi/helper yang terdeteksi secara statis sekitar 217. Angka ini mencakup arrow function, helper lokal, dan fungsi callback; bukan jumlah modul yang disarankan.

## 4. State bersama dan tingkat coupling

### State inti berisiko tinggi

- `S`: cache data lintas koleksi (students, courses, sessions, tasks, accounts, constructors, media, archive, announcements, presence, greetings, dan lainnya). Hampir semua fitur membaca state ini.
- `db`, `user`, `AS`, `AUTH`, `uid`, `ME`, `isAdmin`, `canWrite`, `dbState`: koneksi data, identitas, izin, dan status sesi.
- `D`, `dlg`, `box`: state dan elemen dialog bersama; banyak fitur mengubah konten dialog yang sama.
- `view`, `ownerMode`, `studentPreviewMode`, `adm()`: navigasi dan gate akses.
- `DR`, `PEND`, `loaded`, `TOUR_DEMO_ACTIVE`, `TOUR_DEMO_SNAPSHOT`: draft form, status load, serta mode demo yang memengaruhi data live.
- `refreshAll()`: orkestrator lintas layar yang dipanggil setelah perubahan snapshot, autentikasi, dan aksi.

### Implikasi

1. Memindahkan fungsi render saja tidak cukup jika fungsi tersebut memanggil helper/state yang tetap tersembunyi dalam IIFE.
2. Memindahkan state ke object global baru berisiko mengubah urutan baca/tulis atau membuat dua sumber kebenaran.
3. Mengganti `refreshAll()` dengan render per-modul harus dilakukan bertahap; sekarang ia menjadi mekanisme invalidasi layar lintas fitur.
4. `adm()` dan pemeriksaan peran dipakai sebagai kontrol akses UI. Otorisasi server tetap menjadi batas keamanan utama; jangan menganggap pemisahan modul sebagai pengganti validasi backend.
5. `D` dan dialog global membuat fitur kursus, tugas, profil, hasil, serta admin saling bergantung pada lifecycle modal yang sama.

## 5. Peta data dan integrasi

### Adapter data

`app.js` mengambil adapter melalui `window.claude.use` untuk `db`, `user`, dan `assets`. Adapter database dipakai dengan pola `db.collection(path)`, `db.doc(path)`, `get/set/update/delete`, dan `onSnapshot`. Upload menggunakan `AS.upload`/helper `sendFile` sesuai alur.

`db.js` memiliki polling fallback dan EventSource untuk menyegarkan listener; perubahan path yang terkait dapat memicu callback snapshot. Jangan membuat subscription duplikat ketika memindahkan bootstrap.

### Subscription koleksi yang terlihat pada bootstrap

- `students` → `S.st`
- `courses` → `S.co`
- `constructors` → `S.cs`
- `media` → `S.md`
- `sessions` → `S.se`
- `tugas` → `S.tu`
- `pengumuman` → `S.an`
- `akun` → `S.ak`
- `berkas` → `S.be`
- `classArchive` → `S.ca`
- `paddockClub` → `S.pc`
- `drives` → `S.dr`
- `platform` → `S.pl`
- `course_updates` → `S.cu`
- `greetingCooldown` → `S.gc`
- `presence` → `S.pr`
- `greetings` → `S.gs`
- `birthdayGreetings` → `birthdayInboxMessages`

Subscription `sessions` memicu `loadSektor()`; `tugas` dapat memicu `loadHasil()`; seluruh snapshot memanggil `refreshAll()`. Ini adalah hubungan yang harus dipertahankan atau diganti secara eksplisit.

### Pola operasi tulis yang perlu dilacak saat ekstraksi

- `writeSession` menjadi jalur tulis penting untuk kehadiran dan metadata sesi.
- Presence menulis dokumen di jalur `presence/<nomor>-<session>`.
- Greeting/cooldown memakai koleksi terpisah.
- Fitur tugas, Constructor, profil/akun, Class Archive, Super License/berkas, pengumuman, dan pengelolaan kursus memakai operasi dokumen/koleksi dan/atau upload.
- File menggunakan bucket berbeda sesuai jenis (misalnya `attendance`, `uploads`, `certificates`, `media`); pemilihan bucket dan validasi tipe/ukuran harus tetap identik.
- Backend server melakukan otorisasi dan validasi tambahan. Jangan memindahkan kredensial atau mengakses Supabase service key dari frontend.

## 6. Event dan DOM ownership

Event utama dipasang langsung dalam IIFE, termasuk:

- `document.click` untuk delegasi `data-act` dan aksi dinamis;
- `document.input` dan `document.change` untuk input dinamis, termasuk data form dan upload;
- listener `dlg.click/keydown/close` untuk dialog;
- `touchstart/touchend` untuk interaksi sentuh;
- `rail` click/pointer handlers untuk strip mahasiswa;
- `window.gk-expired`, `pagehide/pageshow`, `visibilitychange`, `resize`, dan interval untuk sesi, presence, clock, serta refresh berkala.

HTML memakai banyak atribut delegasi seperti `data-act`, `data-view`, `data-tab`, `data-file`, `data-id`, dan `data-export-*`. Saat ekstraksi, setiap aksi harus tetap memiliki satu pemilik dan tidak boleh didaftarkan dua kali.

**Rekomendasi:** pada tahap awal pertahankan satu event router/delegator pusat. Modul fitur mendaftarkan handler melalui kontrak eksplisit, bukan memasang ulang listener global sendiri-sendiri.

## 7. Rekomendasi batas modul

Batas target yang disarankan setelah audit:

- `core`: app state/context, permission facade, date/time, escaping/validation, toast/loading, lifecycle dan event router.
- `services`: adapter database, upload, export library loader, presence transport bila nanti dipisah dari UI.
- `features/students`: strip, lineup, kartu mahasiswa, profil.
- `features/courses`: daftar kursus, jadwal, pemilih pertemuan dan dialog kursus.
- `features/attendance`: status/periode, tampilan mahasiswa/admin, bukti, rekap sektor dan export absensi.
- `features/assignments`: daftar tugas, render, submit, file preview/gallery.
- `features/constructor`: grup, principal, tower, task group.
- `features/grand-prix`: hasil, podium, pit, tower, statistik.
- `features/super-license`: sertifikat, dokumentasi, Makrab.
- `features/class-archive`: Exhibition/Class Archive.
- `features/team-radio`: pengumuman, Team Radio, greeting, birthday.
- `features/admin`: komposisi layar admin dan koordinasi pengelolaan; domain write logic sebaiknya tetap di fitur masing-masing.
- `features/tutorial`: tour/demo sebagai fitur tersendiri, dengan dependency eksplisit pada app context.

## 8. Urutan ekstraksi yang paling aman

Urutan ini mempertimbangkan keterikatan dengan state global dan dampak regresi, bukan sekadar ukuran file.

1. **Pure utilities**: fungsi format tanggal/angka, escaping, validasi, dan helper stateless yang tidak mengakses DOM atau `S`. Tambahkan unit test sebelum dipindah.
2. **Export utilities**: loader library dan formatter/serializer yang input-output-nya dapat dibuat eksplisit; tetap pertahankan kontrak unduhan.
3. **Task image gallery / file presentation**: helper tampilan file dan gallery setelah kontrak dialog/DOM dibuat jelas.
4. **Team Radio dan greeting**: pisahkan rendering dari presence transport dan lifecycle.
5. **Class Archive / Super License**: ekstraksi setelah kontrak upload, permissions, dan refresh disepakati.
6. **Constructor dan Grand Prix**: banyak memakai data tugas/mahasiswa/constructor; perlu context facade dan test snapshot.
7. **Students / profile**: terkait identitas, role, strip, dialog, dan data akun.
8. **Courses / assignments / attendance**: paling berisiko karena saling terkait dengan jadwal, pertemuan, tugas, sesi, bukti, rekap, dan notifikasi. Kerjakan setelah core data contract stabil.
9. **Admin dan app bootstrap**: terakhir, karena menjadi titik integrasi lintas domain.

Tidak perlu mengekstrak semua fitur dalam satu PR. Setiap PR idealnya memindahkan satu batas tanggung jawab, mempertahankan behavior, dan menyertakan test/regression checklist.

## 9. Risiko utama dan mitigasi

| Risiko | Dampak potensial | Mitigasi |
|---|---|---|
| Lexical scope IIFE hilang saat jadi ES module | ReferenceError / dependency undefined | Introduksi context/import-export eksplisit; jangan switch seluruh app sekaligus |
| Urutan script atau bootstrap berubah | Login, subscriptions, dan initial render gagal | Pertahankan satu entry point dan urutan init; uji cold load |
| Event listener ganda | Aksi tersimpan dua kali atau handler berjalan berulang | Satu router terpusat; registry handler dan test jumlah pemanggilan |
| Snapshot/subscription ganda | Refresh berulang, data stale, beban jaringan | Satu pemilik subscription; lifecycle unsubscribe eksplisit |
| Dialog `D` dipakai lintas fitur | Dialog salah konten atau state bocor | Tetapkan kontrak dialog dan reset lifecycle |
| Permission UI berubah | Aksi tampil untuk role yang salah | Uji guest, mahasiswa, admin dan preview mode; jangan ubah backend authorization |
| Demo/tutorial mengubah snapshot live | Data demo bercampur dengan data produksi | Pertahankan isolasi `TOUR_DEMO_SNAPSHOT` dan test masuk/keluar demo |
| Perubahan static script di Vercel | MIME/path/caching/deployment error | Uji route asset dan entry point; jangan ubah `vercel.json` tanpa kebutuhan |
| Upload bucket/validasi berubah | File gagal atau masuk bucket salah | Test per tipe file dan bucket; jangan ubah storage schema |

## 10. Definition of Done untuk setiap ekstraksi

- Tidak ada perubahan UI/teks/behavior yang tidak diminta.
- Tidak ada perubahan schema/data Supabase, auth, endpoint, bucket, atau environment variable.
- Semua import/export eksplisit; tidak ada ketergantungan pada global yang tidak terdokumentasi.
- Tidak ada listener atau subscription ganda.
- Uji syntax/build yang tersedia dan smoke test halaman.
- Regression checklist mencakup guest, mahasiswa, admin, preview mode, mobile, dialog, upload, dan refresh snapshot sesuai fitur yang disentuh.
- PR hanya satu concern; jangan merge sebelum persetujuan pemilik repo.

## 11. Langkah implementasi berikutnya

Sebelum memindahkan kode, buat satu PR kecil untuk menyiapkan **core context + pure utility module** (atau test harness terlebih dahulu bila belum ada runner). Mulai dengan satu atau dua helper yang benar-benar pure, bukan seluruh kelompok helper. Pertahankan `public/app.js` sebagai entry point dan jembatani modul baru secara eksplisit. Jangan menambahkan `type: module` global sebelum strategi loading dan kompatibilitas Vercel dipastikan.
