# PDFTV-Room-of-Faith

Website PDFTV (Room of Faith) — deploy via GitHub Pages.
- `index.html` ~723 baris: hanya markup. CSS di `css/style.css`, logika landing/arcade/modal di `js/app.js`. Jangan pernah dibaca utuh — selalu `grep` dulu, lalu `read` dengan `offset` + `limit` (maks 150 baris).
- `js/feeds.js` — logika Room of Faith (fetch, render, komentar, upvote, moderasi). `isMissingRpcError` & `rpcErrorMessage` didefinisikan di sini dan dipakai `js/app.js`, jadi urutan `<script>` penting: feeds.js sebelum app.js.
- `assets/` — file gambar biner (`.webp`), jangan dibaca, cukup `glob` untuk konfirmasi.
- `js/feeds-data.js` — dataset awal; cek ukuran dulu, gunakan grep + offset.
- Semua penulisan ke Supabase lewat RPC (tidak ada insert/update/delete langsung dari client). Skema & fungsi: `seed_feeds.sql` lalu `supabase_upgrade.sql`.
- Password admin/moderator tidak ada di repo; setel lewat `*.local.sql` (gitignored) memakai `private.set_credential`.
- Sinkron ke GitHub: watcher `watch-and-push.ps1` (auto commit + push saat file berubah).
- Edit presisi (`edit`) selalu lebih baik daripada menulis ulang file.
- Jangan menjalankan `watch-and-push.ps1` dari sesi opencode — itu tugas user.
