# PDFTV-Room-of-Faith

Website PDFTV (Room of Faith) — deploy via GitHub Pages (multipage).

**Halaman**
- `index.html` — landing (baris ~220). `feeds/index.html` — Room of Faith. `feeds/p/index.html` — detail satu post (link share). `arcade/index.html` — Blackjack Arcade.
- Halaman di dalam folder memakai path relatif `../` untuk aset/script. `feeds/p/` ada dua tingkat, jadi asetnya `../../` sementara tautan nav: home `../../`, feeds `../`, arcade `../../arcade/`. Jangan pakai path absolut (`/js/...`) karena situs dilayani di subpath `/PDFTV-Room-of-Faith/`.
- Nav (header + bottom nav) sengaja diduplikasi di tiap halaman agar tampil instan tanpa JS; tab aktif ditandai `aria-current="page"`. Modal admin disuntik dari `core.js`, tidak ditulis di HTML.

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
