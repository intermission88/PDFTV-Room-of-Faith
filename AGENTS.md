# PDFTV-Room-of-Faith

Website PDFTV (Room of Faith) — deploy via GitHub Pages.
- `index.html` ~2300 baris: SEMUA HTML/CSS/JS di sini. Jangan pernah dibaca utuh — selalu `grep` dulu, lalu `read` dengan `offset` + `limit` (maks 150 baris).
- `assets/` — file gambar biner (`.webp`), jangan dibaca, cukup `glob` untuk konfirmasi.
- `js/feeds-data.js` dan `js/feeds.js` — cek ukuran dulu; jika besar, gunakan grep + offset.
- Sinkron ke GitHub: watcher `watch-and-push.ps1` (auto commit + push saat file berubah).
- Edit presisi (`edit`) selalu lebih baik daripada menulis ulang file.
- Jangan menjalankan `watch-and-push.ps1` dari sesi opencode — itu tugas user.
