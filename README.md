# PDFTV | Experience Room 🎮🔥

Situs statis multipage yang menggabungkan landing page bertema arcade, **Room of Faith** (feed pengakuan anonim real-time), dua game roguelite — **Blackjack Arcade** bergaya Balatro dan **Snake Roguelite** retro Nokia — serta **PDFTV News** (berita redaksi dengan dashboard writer & CEO). Semua berjalan di browser dengan Supabase sebagai backend.

---

## 🌟 Fitur

### 1. Room of Faith 💬
- Feed pengakuan anonim yang tersambung ke Supabase (`PDFTV Feeds`) dengan update realtime.
- Kirim pengakuan (maks. 500 karakter), upvote dengan undo, komentar, dan lampiran GIF.
- Filter **Terbaru** / **Populer**, pencarian kata kunci, serta penanda NSFW dengan blur opsional.
- Moderator bisa pin, tandai NSFW, dan hapus postingan.

### 2. Blackjack Arcade 🃏💸
- Roguelite 8 ronde per Ante, dengan **Boss Battle** tiap ronde ke-8 (masing-masing punya perk sendiri).
- Ekonomi Cash + Multiplier, kartu **Joker pasif**, dan consumable: Discard, Buster, serta Aegis Shield.
- **Hall of Fame**: leaderboard Top 5 berdasarkan Cash, plus statistik end-game yang bisa dibagikan.
- Panel admin (login diperlukan) untuk reset leaderboard dan uji coba mekanik.

### 3. Snake Roguelite 🐍📟
- Snake retro ala **Nokia 3310** di atas `<canvas>` berpalet LCD hijau, lengkap dengan scanline CRT.
- **Struktur roguelike**: tiap floor punya target apel, kecepatan naik, dan hazard bertambah. Selesai floor = memilih **1 dari 3 relic** (efek permanen sampai run berakhir).
- **Boss floor tiap kelipatan 5** dengan pola arena sendiri: THE WALL (dinding bergerak), OVERCLOCKER (kecepatan 2x), THE VOID (lubang berpindah), ROOM OF FAITH (kombinasi).
- Consumable **Freeze** (hentikan gerak 3 detik) dan **Sever** (potong badan jadi 5 segmen); relic Aegis menahan satu kematian.
- Kontrol lengkap: panah/WASD, swipe di arena, dan D-pad di layar. Run tetap tersimpan walau halaman di-reload.
- **Hall of Fame Snake** sendiri (Top 5 skor, plus floor dan panjang maksimum), terpisah dari papan Blackjack.

### 4. PDFTV News 📰
- Halaman berita dengan headline, filter kategori, pencarian, dan **halaman sendiri per artikel** (`/news/p/<id>/`) yang bisa dibagikan.
- Artikel ditulis lewat **dashboard writer** (perlu login) dan baru tayang setelah disetujui **CEO**: alur `pending` → disetujui / ditolak (dengan alasan yang dilihat writer) / ditarik.
- Dashboard redaksi di `/news/dashboard/` — satu halaman, panelnya menyesuaikan peran yang login.
- Tampilan artikel dibuat seperti halaman berita: kicker kategori, **headline besar**, lead, byline (penulis · tanggal · estimasi waktu baca), cover, lalu isi artikel dan deretan `#tag`.
- Writer punya tombol **👁️ Pratinjau** — dari form (isi yang belum dikirim) maupun dari daftar "Artikel Saya" — untuk melihat tampilannya persis seperti saat tayang, tanpa menunggu persetujuan CEO. Pratinjau memakai perender yang sama dengan halaman publik, jadi tidak ada beda tampilan.
- Publik **hanya** bisa membaca artikel berstatus `approved`; itu dijaga RLS di database, bukan sekadar filter tampilan.
- Gambar cover memakai URL gambar eksternal (tanpa upload/storage). Preview saat link dibagikan mengambil **apa adanya dari artikel** — `og:image` = cover, `og:title` = headline, `og:description` = "Oleh <penulis> — <ringkasan>" — jadi tidak ada berkas gambar yang digenerate.
- Tombol **Bagikan** membuka panel pratinjau berisi gambar, headline, penulis, dan sedikit isi artikel, lengkap dengan tombol Bagikan (share sheet OS) dan Salin link.

### 5. Aksesibilitas & UX ♿
- Seluruh alur dapat diselesaikan dengan keyboard saja; ring fokus `:focus-visible` konsisten.
- Modal mengunci fokus (Tab), ditutup dengan `Escape`, dan mengembalikan fokus ke pemicunya.
- Menghormati `prefers-reduced-motion`: carousel tidak berjalan sendiri dan animasi loop berhenti.
- Live region untuk notifikasi dan status permainan, label pada setiap field, serta input 16px di layar kecil agar iOS tidak melakukan zoom otomatis.
- Layout aman hingga 320px, termasuk mode game.

---

## 🛠️ Tech Stack

- **Frontend:** HTML5, Tailwind CSS (CDN), CSS kustom (CRT scanlines, felt green), animasi keyframe
- **Logic:** Vanilla JavaScript (ES6+), Web Audio API untuk BGM & SFX prosedural
- **Backend:** Supabase (`@supabase/supabase-js`) dengan Realtime subscription, RPC, dan Row Level Security
- **Aset:** gambar WebP teroptimasi + Google Fonts (*Plus Jakarta Sans*, *Space Grotesk*, *Silkscreen*)

---

## 📁 Struktur Proyek

| File | Isi |
|---|---|
| `index.html` | Halaman landing (manifesto, slider, kartu, statistik) |
| `forum/index.html` | Halaman Room of Faith |
| `forum/p/index.html` | Halaman detail satu post + seluruh komentarnya (link bisa dibagikan) |
| `forum/p/<id>/index.html` | Hasil pre-render per post: tag Open Graph berisi isi post (dibuat otomatis, jangan diedit manual) |
| `news/index.html` | Halaman berita (headline, kategori, pencarian) |
| `news/p/index.html` | Halaman isi artikel (sekaligus cadangan `?id=<id>`) |
| `news/p/<id>/index.html` | Hasil pre-render per artikel: tag Open Graph (dibuat otomatis, jangan diedit manual) |
| `news/dashboard/index.html` | Dashboard redaksi: writer (tulis artikel) & CEO (persetujuan) |
| `arcade/index.html` | Halaman Arcade: pemilih dua game (Blackjack + Snake), arena, dan modal |
| `css/style.css` | Gaya kustom: tema CRT/felt, animasi, ring fokus, reduced-motion |
| `js/core.js` | Fondasi bersama: Supabase, haptic, audio/BGM, toast, manajer modal, login admin, util |
| `js/feeds.js` | Logika Room of Faith + pengambilan data statistik untuk landing |
| `js/post.js` | Logika halaman detail post (render post, komentar, upvote, tombol bagikan) |
| `js/news.js` | Logika halaman berita, isi artikel, dan dashboard writer/CEO |
| `scripts/prerender-posts.mjs` | Pre-render halaman post + kartu gambar OG (dijalankan CI) |
| `404.html` | Jaring terakhir untuk path tak dikenal (dan pengalih client-side bila perlu) |
| `vercel.json` | Urutan rute: `handle: filesystem` lebih dulu, lalu fallback `/forum/p/<id>/` & `/news/p/<id>/` → `?id=<id>` |
| `js/landing.js` | Typewriter + slider (hanya halaman landing) |
| `js/arcade.js` | Gameplay blackjack, leaderboard, panel cheat, persistensi run |
| `js/snake.js` | Gameplay Snake Roguelite (canvas, loop, relic, boss), leaderboard, panel cheat, persistensi run |
| `js/feeds-data.js` | Data feed awal untuk fallback sebelum Supabase termuat |
| `seed_feeds.sql` | Pembuatan tabel `PDFTV Feeds`, RLS, dan data awal |
| `supabase_upgrade.sql` | Fungsi RPC, pengetatan RLS, dan penyimpanan kredensial |
| `assets/` | Logo, favicon, dan gambar slider (WebP) |
| `watch-and-push.ps1` | Watcher auto commit + push untuk sinkronisasi ke GitHub |

Urutan `<script>` penting: `js/core.js` dimuat lebih dulu (berisi `escapeHtml`, `isMissingRpcError`, `rpcErrorMessage`), lalu `js/feeds.js`, kemudian `js/landing.js` (landing) atau `js/arcade.js` lalu `js/snake.js` (arcade). Halaman `news/*` tidak memuat `feeds.js`/`feeds-data.js` — cukup `js/core.js` lalu `js/news.js`.

### URL & state lintas halaman

- `/` landing, `/forum/` Room of Faith, `/forum/p/<id>/` detail satu post, `/news/` berita, `/news/p/<id>/` isi satu artikel, `/news/dashboard/` dashboard redaksi, `/arcade/` Arcade (Blackjack + Snake). Halaman lama `/forum/p/?id=<id>` dan `/news/p/?id=<id>` tetap berfungsi sebagai cadangan.
- Section Room of Faith dulu berada di `/feeds/`; sekarang `/forum/`. URL lama **tidak** di-redirect, jadi link `/feeds/*` yang sudah tersebar tidak lagi bisa dibuka.
- Tiap post punya halaman statis hasil pre-render di `/forum/p/<id>/` yang memuat tag Open Graph berisi **isi postingannya**, sehingga preview saat link dibagikan (WhatsApp, Facebook) menampilkan pengakuan itu, bukan template.
- Preview dihasilkan oleh `.github/workflows/prerender-posts.yml` (jadwal tiap 10 menit + bisa dijalankan manual dari tab Actions). Artikel/post yang baru dibuat menunggu jadwal berikutnya.
- Supaya link **tetap berfungsi sebelum halaman pre-render-nya ada**, `vercel.json` memakai urutan `handle: filesystem` lalu mengalihkan `/forum/p/<id>/` dan `/news/p/<id>/` ke halaman `?id=<id>` (yang selalu tersedia). Jadi share link tidak pernah mendarat di 404 — dan crawler WhatsApp/Facebook tidak lagi membaca judul halaman 404. `404.html` tetap ada sebagai jaring terakhir untuk path yang benar-benar tidak dikenal.
- Post bertanda NSFW **tidak** pernah menuliskan isinya ke tag OG maupun gambar preview: preview-nya hanya "Konten sensitif". Ini disengaja karena link menyebar bebas.
- Artikel News ikut di-pre-render (hanya yang sudah `approved`) tapi **tanpa** kartu PNG: `og:image` memakai URL cover artikel, dengan `assets/og/fallback.png` sebagai cadangan. Halaman artikel yang ditolak atau ditarik ikut dihapus, jadi link lama tidak lagi menampilkan artikel yang sudah dicabut. Kalau tabel `PDFTV News` belum dibuat, skrip hanya memberi peringatan dan feed tetap diproses.
- Tombol **Bagikan** memakai Web Share API, dengan fallback salin ke clipboard.
- Detail post memuat seluruh komentar dan form komentar. Konten NSFW tetap ter-blur di halaman sampai tombol reveal ditekan.
- Halaman di dalam folder memakai path relatif (`../assets/...`), karena situs dilayani di subpath `/PDFTV-Room-of-Faith/`. Jangan pakai path absolut.
- Berpindah halaman berarti reload penuh, jadi state yang perlu bertahan disimpan di `sessionStorage`: `pdftv_run_v1` (run blackjack), `pdftv_snake_run_v1` (run snake), `pdftv_session_v1` (login admin/moderator), `pdftv_bgm_on` (preferensi BGM). Semuanya terhapus saat tab ditutup.
- BGM tidak bisa otomatis berbunyi di halaman baru (kebijakan autoplay browser); musik menyala lagi pada interaksi pertama bila sebelumnya aktif.

### Preview share (Open Graph)

WhatsApp/Facebook tidak menjalankan JavaScript, jadi tag OG harus ada di HTML yang dikirim server. Karena itu:

| Bagian | Isi |
|---|---|
| `scripts/prerender-posts.mjs` | Mengambil post **dan artikel** dari Supabase REST: menulis `forum/p/<id>/index.html` + kartu `assets/og/<id>.png`, serta `news/p/<id>/index.html` (OG-nya memakai `cover_url` artikel) |
| `scripts/package.json` | Dependensi `sharp` untuk merasterkan kartu SVG → PNG |
| `.github/workflows/prerender-posts.yml` | Menjalankan skrip di runner, commit hasilnya, lalu push |
| `assets/og/fallback.png` | Kartu brand, dipakai untuk post NSFW dan sebagai cadangan |
| `404.html` | Mengalihkan `/forum/p/<id>/` yang belum ter-generate ke `?id=<id>` |

Menjalankan manual (butuh Node 20+):

```bash
cd scripts && npm install
node scripts/prerender-posts.mjs            # semua post
node scripts/prerender-posts.mjs --limit=3  # hanya 3 terbaru
```

Skrip hanya menulis berkas yang isinya berubah, jadi jadwal berulang tidak menghasilkan commit kosong. Kartu yang teksnya melebihi batas diukur ulang setelah render dan dilaporkan sebagai peringatan. Skrip juga membersihkan halaman dan kartu untuk post yang sudah dihapus, supaya link lama tidak lagi menampilkan konten yang sudah tidak ada.

> **Penting saat menjalankan lokal:** PNG hanya boleh digenerate oleh CI. macOS tidak memiliki font DejaVu Sans yang dipakai runner Ubuntu, sehingga hasil render lokal selalu berbeda byte-nya dan akan membuat commit bolak-balik. Setelah menjalankan skrip lokal, kembalikan gambarnya dengan `git checkout -- assets/og/`. Perubahan HTML di `forum/p/` aman di-commit karena tidak bergantung pada font.

---

## 🚀 Menjalankan Secara Lokal

Jalankan lewat local server (bukan `file://`) agar fetch aset dan Supabase lancar:

```bash
git clone https://github.com/intermission88/PDFTV-Room-of-Faith.git
cd PDFTV-Room-of-Faith
python3 -m http.server 8000
```

Buka `http://localhost:8000`. Alternatif lain: `npx serve .` bila Node.js tersedia.

**Konfigurasi Supabase** ada di bagian atas `js/core.js`:

```js
const SUPABASE_URL = 'https://<project>.supabase.co';
const SUPABASE_KEY = 'sb_publishable_...';
```

Kunci yang dipakai adalah *publishable key*, jadi memang aman berada di sisi klien selama RLS aktif. Jangan pernah menaruh `service_role` key atau password apa pun di file ini.

---

## 📦 Setup Database (Supabase)

Jalankan kedua script berikut di **Supabase → SQL Editor**, berurutan:

1. **`seed_feeds.sql`** — membuat tabel `PDFTV Feeds` (beserta kolom NSFW, komentar, dsb.), mengaktifkan RLS, mengatur policy publik (baca / insert / update), dan memasukkan data awal.
2. **`supabase_upgrade.sql`** — membuat fungsi RPC (`insert_confession`, `increment_upvote`, `append_comment`, aksi moderator, reset leaderboard), **tabel `PDFTV News` beserta RPC News (bagian 11)**, **tabel `PDFTV Snake Leaderboard` beserta RPC Snake (bagian 12)**, memindahkan kredensial ke schema `private`, dan mengetatkan RLS. Jalankan bagian perketat RLS **terakhir**, setelah aplikasi memakai RPC.

> Catatan: aplikasi punya jalur fallback ke operasi langsung bila RPC belum tersedia di database. Selama policy insert lama masih ada, fallback itu tetap bekerja.

---

## 🔐 Akses Admin, Moderator, Writer & CEO

Password **tidak disimpan di kode klien maupun di repo ini**. Verifikasi dilakukan di server melalui RPC `verify_admin` / `verify_moderator` / `verify_writer` / `verify_ceo`, yang membandingkan input dengan hash **bcrypt** di tabel `private.admin_credentials`.

Schema `private` tidak diekspos PostgREST, akses dari `anon` dicabut, dan tabelnya berada dalam RLS tanpa policy, sehingga hash tidak bisa dibaca dari luar. Fungsi verifikasi berjalan `SECURITY DEFINER` sebagai pemilik tabel.

Satu modal login dipakai untuk semua peran: setelah password dikirim, server mencoba berurutan `verify_admin` → `verify_moderator` → `verify_writer` → `verify_ceo` dan mengaktifkan peran yang cocok.

Untuk memasang atau mengganti password, jalankan di SQL Editor (nilai tidak boleh di-commit ke repo):

```sql
SELECT private.set_credential('admin',     'PASSWORD_BARU');
SELECT private.set_credential('moderator', 'PASSWORD_BARU');
SELECT private.set_credential('writer',    'PASSWORD_BARU');
SELECT private.set_credential('ceo',       'PASSWORD_BARU');
```

Hak akses:

| Peran | Kemampuan |
|---|---|
| **Admin** | Reset kedua leaderboard (Blackjack & Snake) + panel uji mekanik game |
| **Moderator** | Pin, tandai NSFW, dan hapus postingan di Room of Faith |
| **Writer** | Menulis, mengubah, dan menghapus artikel News miliknya yang masih `pending`/`rejected` |
| **CEO** | Melihat semua artikel, menyetujui, menolak (dengan alasan), menarik, dan menghapus artikel News |

Cek apakah kredensial sudah terpasang tanpa membuka hash-nya:

```sql
SELECT role, updated_at FROM private.admin_credentials;
SELECT public.verify_writer('PASSWORD_WRITER'), public.verify_ceo('PASSWORD_CEO');
```

---

## 🔄 Kerja dari 2 device

Repo ini dikerjakan bergantian dari macOS dan Windows, keduanya sudah punya clone. Aturannya sederhana: **selalu tarik dulu sebelum mulai, kirim setelah selesai.**

```bash
git pull --rebase          # sebelum mulai kerja
# ...kerjakan perubahan...
git add <file> && git commit -m "..." && git push
```

Tanpa `pull` di awal, push akan ditolak ketika device lain sudah mengirim perubahan lebih dulu. `watch-and-push.ps1` (Windows) sudah melakukan pull-otomatis sebelum push, jadi kalau watcher itu menyala, perubahan file langsung tersinkron.

Yang **tidak** ikut tersinkron dan memang sebaiknya begitu:

| Hal | Alasan |
|---|---|
| `node_modules/` (16 MB) | Regenerasi sekali per device: `cd scripts && npm ci` |
| `.commandcode/` (catatan belajar agent) | Lokal per device dan pernah memuat kredensial — jangan pernah di-commit. Aturan penting taruh di `AGENTS.md` |
| `private-seed.local.sql` | Sekali pakai (password sudah masuk Supabase), tidak perlu disalin |
| `~/.commandcode/auth.json` | Login Command Code per device — login sendiri di setiap mesin |

---

## ⏰ Menjaga Supabase tetap aktif

Supabase free tier menjeda proyek yang tidak ada aktivitas API selama ~7 hari. Proyek yang dijeda harus di-resume manual dari dashboard, dan selama itu situs tidak bisa baca/tulis.

Dua lapis penjagaan:

| Lapis | Apa | Kenapa |
|---|---|---|
| 1 | `.github/workflows/supabase-keepalive.yml` — menembak `get_platform_stats()` tiap 6 jam | Tanpa dependensi (hanya `curl`), jadi tidak bisa gagal karena `npm ci`/sharp. Kalau ping gagal, job sengaja exit non-zero supaya GitHub mengirim notifikasi |
| 2 | Pinger eksternal (disarankan) | Lihat peringatan di bawah |

Sebenarnya workflow pre-render (`*/10 * * * *`) juga sudah menembak Supabase tiap 10 menit. Tapi workflow itu butuh `npm ci` + sharp, jadi kalau langkah itu gagal, job mati sebelum sempat menyentuh database. Itu sebabnya lapis 1 dibuat terpisah dan sengaja dibuat sesederhana mungkin.

> **Risiko yang tidak bisa ditutup oleh GitHub saja:** GitHub menonaktifkan workflow terjadwal otomatis setelah **60 hari** repo tanpa aktivitas. Kalau situs sedang sepi (tidak ada posting, tidak ada commit), jadwal mati → tidak ada lagi yang menembak Supabase → proyek bisa dijeda.
>
> Penawarnya: daftarkan pinger eksternal gratis yang tidak bergantung pada GitHub, mis. [cron-job.org](https://cron-job.org) atau [UptimeRobot](https://uptimerobot.com), dijadwalkan harian. Pakai URL ini (kunci di query string supaya bisa dipakai layanan yang tidak mendukung header kustom, dan endpoint ini mengembalikan angka statistik sebagai bukti query benar-benar jalan):
>
> ```
> https://fhpyvnbsreoaiaeqfkvk.supabase.co/rest/v1/rpc/get_platform_stats?apikey=sb_publishable_aSPwcLUMW2y7r3nk6cpBpg_3DJH5sky
> ```
>
> Kunci ini memang publik (dikirim ke setiap browser lewat `js/core.js`) dan RLS membatasi apa yang bisa dibaca, jadi menaruhnya di URL pinger aman.

Cara manual mengecek proyek masih hidup (sama seperti URL pinger di atas):

```bash
curl -sS -o /dev/null -w '%{http_code}\n' \
  "https://fhpyvnbsreoaiaeqfkvk.supabase.co/rest/v1/rpc/get_platform_stats?apikey=<publishable key>"
# 200 = hidup, 503 = sedang dijeda
```

---

## 🌐 Deploy

Repositori ini dideploy sebagai situs statis melalui **Vercel** di `https://pdftv.vercel.app/`. Cukup push ke `main`, atau gunakan `watch-and-push.ps1` yang otomatis commit dan push setiap kali ada perubahan file.

GitHub Pages tidak dipakai. Tag Open Graph memuat URL absolut yang dihasilkan dari `SITE_ORIGIN` di `scripts/prerender-posts.mjs` (di-override workflow `prerender-posts.yml`); kalau domain berubah, ubah di kedua tempat lalu jalankan ulang pre-render, jika tidak preview share WhatsApp kehilangan gambarnya.

---

© PDFTV Experience. Stay chill & keep grinding! 🚀
