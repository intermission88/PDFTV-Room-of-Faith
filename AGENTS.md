# PDFTV-Room-of-Faith

Situs statis, live di **https://pdftv.vercel.app/** (multipage, tanpa build step). GitHub Pages **tidak** dipakai — jangan tulis `intermission88.github.io` ke halaman: domain itu 404 dan preview share WhatsApp rusak.

## Hemat context (baca dulu)
- **Jangan baca**: `feeds/p/<angka>/` (43 halaman hasil pre-render — turunan, bukan sumber), `assets/og/` (35 PNG), `assets/*.webp` (biner), `scripts/node_modules/` (16 MB), `scripts/package-lock.json`. Cukup `glob`/`ls` untuk memastikan keberadaannya.
- Yang diedit hanya `feeds/p/index.html` (template, 125 baris). Halaman berangka di dalam `feeds/p/` ditimpa `scripts/prerender-posts.mjs` — jangan disentuh.
- `js/arcade.js` (~1200 baris), `js/feeds.js` (~870), `js/core.js` (~790): **grep dulu, baru `read` dengan offset/limit** — jangan pernah dibaca utuh.
- Edit presisi (`edit`) lebih baik daripada menulis ulang file. Ukuran file cek cepat dengan `wc -l`.

## Di mana harus ubah
| Kebutuhan | File |
|---|---|
| Landing (manifesto, slider, kartu, statistik) | `index.html` + `js/landing.js` + `css/style.css` |
| Feed / komentar / upvote / moderasi | `js/feeds.js` |
| Halaman detail post | `js/post.js` + `feeds/p/index.html` |
| Game / leaderboard / cheat | `js/arcade.js` + `arcade/index.html` |
| Nav, header, bottom nav | **keempat** HTML (sengaja diduplikasi agar tampil instan tanpa JS) |
| Domain absolut / tag Open Graph | `scripts/prerender-posts.mjs` **dan** env `SITE_ORIGIN` di `.github/workflows/prerender-posts.yml` **dan** `404.html` |
| Logika bersama (modal a11y, audio, login, toast) | `js/core.js` |
| Skema / RPC Supabase | `seed_feeds.sql` lalu `supabase_upgrade.sql` |

## Path & urutan script
- Pakai path relatif, jangan absolut (`/js/...`). `feeds/p/` **dua tingkat**: asetnya `../../`, tautan nav home `../../`, feeds `../`, arcade `../../arcade/`.
- Urutan `<script>` penting: `feeds-data.js` → `core.js` (menyediakan `escapeHtml`, `isMissingRpcError`, `rpcErrorMessage`) → `feeds.js` → lalu `landing.js` (landing; jangan dimuat tanpa `#slider`) / `post.js` (detail) / `arcade.js` (arcade, tanpa `feeds.js`).
- Modal admin disuntik dari `core.js`; observer a11y didaftarkan **setelah** injeksi.

## Link post, state, data
- URL share `feeds/p/<id>/` (dibuat `buildPostUrl()` dari lokasi `core.js`). Template `?id=<id>` tetap hidup sebagai cadangan yang diarahkan `404.html`. Drawer komentar inline sudah dihapus — jangan dihidupkan lagi.
- `sessionStorage`: `pdftv_run_v1` (run), `pdftv_session_v1` (login admin/moderator), `pdftv_bgm_on`. Run disimpan `saveRun()` (+event `pagehide`), dipulihkan `restoreRun()`.
- **Semua penulisan lewat RPC** — tidak ada insert/update/delete langsung dari client. Password admin/moderator tidak ada di repo; setel via `*.local.sql` (gitignored) memakai `private.set_credential`; jangan tulis nilai asli ke doc/README.

## Preview share (Open Graph)
- WhatsApp/Facebook tidak menjalankan JS, jadi tag OG harus ada di HTML yang dikirim server → itu sebabnya ada pre-render.
- CI `.github/workflows/prerender-posts.yml` (cron 10 menit + manual) menjalankan `scripts/prerender-posts.mjs`, lalu commit `feeds/p/<id>/` + `assets/og/<id>.png`.
- Post NSFW **tidak pernah** menulis isi ke HTML/PNG (pakai `assets/og/fallback.png`). Skrip mengukur ulang hasil render untuk deteksi teks meluber (warning, bukan error).
- Skrip juga **menghapus** `feeds/p/<id>/` + `assets/og/<id>.png` untuk post yang sudah tidak ada di database (kalau tidak, link lama tetap menampilkan konten terhapus). Pemulihan ini dilewati saat `--limit` dipakai.
- **PNG hanya boleh digenerate CI.** macOS tidak punya DejaVu Sans (font runner Ubuntu) → hasil run lokal selalu beda byte dan bikin commit bolak-balik. Setelah run lokal: `git checkout -- assets/og/`. HTML `feeds/p/` aman di-commit (tidak bergantung font).

## Lain-lain
- Cara kerja: user berbahasa Indonesia → balas dalam Bahasa Indonesia (termasuk artifact seperti README/laporan). Selesai kerja langsung commit + push ke `main` (tanpa branch/PR), dan jangan tinggalkan perubahan menggantung.
- Repo dipakai dari **2 device** (macOS + Windows, keduanya sudah clone). Windows menjalankan `watch-and-push.ps1` (auto commit + push, allowlist + pemindai rahasia): **jangan dijalankan dari sesi agent** — itu tugas user. Selalu `git pull --rebase` sebelum mulai kerja; jangan tinggalkan perubahan menggantung antar sesi.
- `.commandcode/` (catatan belajar agent) bersifat **lokal per device**, di-gitignore, dan pernah memuat kredensial asli → jangan pernah di-commit. Aturan lintas-device yang penting taruh di AGENTS.md ini, bukan di sana.
- Env: macOS, `node`/`npm` tidak ada di PATH shell (pakai `/opt/homebrew/opt/node/bin/node`); tanpa Postgres/Docker/PowerShell → SQL & `.ps1` divalidasi statis, eksekusi akhir di sisi user.
