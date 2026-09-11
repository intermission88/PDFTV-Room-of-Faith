# PDFTV-Room-of-Faith

Website PDFTV (Room of Faith) — deploy via Vercel (multipage) di `https://pdftv.vercel.app/`.

- GitHub Pages **tidak** dipakai (`has_pages: false`). Jangan pernah menulis URL `intermission88.github.io` ke halaman: domain itu 404, dan preview share WhatsApp akan tampil sebagai teks tanpa gambar.
- Origin situs untuk tag absolut ada di `SITE_ORIGIN` (`scripts/prerender-posts.mjs`, di-override workflow lewat env). Kalau domain berubah, ubah di kedua tempat lalu jalankan ulang pre-render.

**Halaman**
- `index.html` — landing (baris ~220). `feeds/index.html` — Room of Faith. `feeds/p/index.html` — detail satu post (template). `arcade/index.html` — Blackjack Arcade.
- `feeds/p/<id>/index.html` — **hasil pre-render otomatis** (tag Open Graph berisi isi post). Jangan diedit manual; skrip `scripts/prerender-posts.mjs` akan menimpanya.
- Halaman di dalam folder memakai path relatif `../` untuk aset/script. `feeds/p/` ada dua tingkat, jadi asetnya `../../` sementara tautan nav: home `../../`, feeds `../`, arcade `../../arcade/`. Jangan pakai path absolut (`/js/...`) agar halaman tetap jalan dari kedalaman folder mana pun.
- Nav (header + bottom nav) sengaja diduplikasi di tiap halaman agar tampil instan tanpa JS; tab aktif ditandai `aria-current="page"`. Modal admin disuntik dari `core.js`, tidak ditulis di HTML.

**Preview share (Open Graph)**
- WhatsApp/Facebook tidak menjalankan JS, jadi tag OG harus ada di HTML yang dikirim server. Itu sebabnya ada pre-render.
- `.github/workflows/prerender-posts.yml` (cron 10 menit + manual) menjalankan `scripts/prerender-posts.mjs`, lalu commit `feeds/p/<id>/` dan `assets/og/<id>.png`.
- Post NSFW **tidak pernah** menulis isi ke HTML/PNG; pakai `assets/og/fallback.png`.
- `404.html` mengalihkan `/feeds/p/<id>/` yang belum ter-generate ke `?id=<id>`.
- Skrip mengukur ulang hasil render untuk mendeteksi teks meluber (warning, bukan error).
- **PNG hanya boleh digenerate CI.** macOS tidak punya DejaVu Sans (font yang dipakai render di runner Ubuntu), jadi hasil run lokal selalu berbeda byte-nya dan bikin commit bolak-balik. Jangan commit PNG hasil run lokal; kembalikan dengan `git checkout -- assets/og/`. Perubahan HTML (`feeds/p/`) aman di-commit karena tidak bergantung font.

**Script (urutan penting)**
- Landing: `js/feeds-data.js` → `js/core.js` → `js/feeds.js` → `js/landing.js`.
- Feeds: `js/feeds-data.js` → `js/core.js` → `js/feeds.js`.
- Detail post: `js/feeds-data.js` → `js/core.js` → `js/feeds.js` → `js/post.js`.
- Arcade: `js/core.js` → `js/arcade.js`.
- `js/core.js` — fondasi bersama: konfigurasi Supabase, `SITE_ROOT`/`buildPostUrl`, haptic, audio/BGM/SFX, toast, manajer modal a11y, login admin, `escapeHtml`, `isMissingRpcError`, `rpcErrorMessage`, persistensi sesi.
- `js/feeds.js` — Room of Faith (fetch, render, komentar, upvote, moderasi). Lapisan API bersama `fetchFeedById`/`sendUpvote`/`sendComment` dipakai juga oleh `js/post.js`.
- `js/post.js` — halaman detail: render post + seluruh komentar, upvote, `sharePost()`.
- `js/landing.js` — typewriter + slider. Hanya landing. Jangan dimuat di halaman tanpa `#slider`.
- `js/arcade.js` — gameplay, leaderboard, cheat, persistensi run. Hanya arcade.

**Link post**
- URL: `feeds/p/?id=<id post>`. `buildPostUrl()` menghitung dari lokasi `core.js` supaya kedalaman folder tidak salah.
- Konten kartu di daftar feed adalah tautan ke halaman detail. Drawer komentar inline sudah dihapus — jangan dihidupkan lagi.

**State lintas halaman (reload penuh)**
- `sessionStorage`: `pdftv_run_v1` (run blackjack), `pdftv_session_v1` (login admin/moderator), `pdftv_bgm_on` (preferensi BGM).
- Run disimpan via `saveRun()` (dipanggil di `startNewGame`/`endRound` + event `pagehide`), dipulihkan via `restoreRun()`.

**Data & keamanan**
- Semua penulisan ke Supabase lewat RPC (tidak ada insert/update/delete langsung dari client). Skema: `seed_feeds.sql` lalu `supabase_upgrade.sql`.
- Password admin/moderator tidak ada di repo; setel lewat `*.local.sql` (gitignored) memakai `private.set_credential`.

**Lain-lain**
- `assets/` — gambar biner (`.webp`), jangan dibaca, cukup `glob`.
- Sinkron ke GitHub: `watch-and-push.ps1` (auto commit + push, allowlist eksplisit + pemindai rahasia).
- Edit presisi (`edit`) selalu lebih baik daripada menulis ulang file.
- Jangan menjalankan `watch-and-push.ps1` dari sesi opencode — itu tugas user.
