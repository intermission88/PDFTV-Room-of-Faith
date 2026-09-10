# PDFTV | Experience Room 🎮🔥

Web app satu halaman yang menggabungkan landing page bertema arcade, **Room of Faith** (feed pengakuan anonim real-time), dan game roguelite **Blackjack Arcade** bergaya Balatro. Semua berjalan di browser dengan Supabase sebagai backend.

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

### 3. Aksesibilitas & UX ♿
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
| `feeds/index.html` | Halaman Room of Faith |
| `feeds/p/index.html` | Halaman detail satu post + seluruh komentarnya (link bisa dibagikan) |
| `feeds/p/<id>/index.html` | Hasil pre-render per post: tag Open Graph berisi isi post (dibuat otomatis, jangan diedit manual) |
| `arcade/index.html` | Halaman Blackjack Arcade |
| `css/style.css` | Gaya kustom: tema CRT/felt, animasi, ring fokus, reduced-motion |
| `js/core.js` | Fondasi bersama: Supabase, haptic, audio/BGM, toast, manajer modal, login admin, util |
| `js/feeds.js` | Logika Room of Faith + pengambilan data statistik untuk landing |
| `js/post.js` | Logika halaman detail post (render post, komentar, upvote, tombol bagikan) |
| `scripts/prerender-posts.mjs` | Pre-render halaman post + kartu gambar OG (dijalankan CI) |
| `404.html` | Pengalih untuk link post yang belum di-pre-render |
| `js/landing.js` | Typewriter + slider (hanya halaman landing) |
| `js/arcade.js` | Gameplay blackjack, leaderboard, panel cheat, persistensi run |
| `js/feeds-data.js` | Data feed awal untuk fallback sebelum Supabase termuat |
| `seed_feeds.sql` | Pembuatan tabel `PDFTV Feeds`, RLS, dan data awal |
| `supabase_upgrade.sql` | Fungsi RPC, pengetatan RLS, dan penyimpanan kredensial |
| `assets/` | Logo, favicon, dan gambar slider (WebP) |
| `watch-and-push.ps1` | Watcher auto commit + push untuk sinkronisasi ke GitHub |

Urutan `<script>` penting: `js/core.js` dimuat lebih dulu (berisi `escapeHtml`, `isMissingRpcError`, `rpcErrorMessage`), lalu `js/feeds.js`, kemudian `js/landing.js` (landing) atau `js/arcade.js` (arcade).

### URL & state lintas halaman

- `/` landing, `/feeds/` Room of Faith, `/feeds/p/<id>/` detail satu post, `/arcade/` Blackjack Arcade. Halaman lama `/feeds/p/?id=<id>` tetap berfungsi sebagai cadangan.
- Tiap post punya halaman statis hasil pre-render di `/feeds/p/<id>/` yang memuat tag Open Graph berisi **isi postingannya**, sehingga preview saat link dibagikan (WhatsApp, Facebook) menampilkan pengakuan itu, bukan template.
- Preview dihasilkan oleh `.github/workflows/prerender-posts.yml` (jadwal tiap 10 menit + bisa dijalankan manual dari tab Actions). Post yang baru dibuat menunggu jadwal berikutnya; link tetap bisa dibuka sebelum itu lewat `404.html` yang mengalihkan ke halaman `?id=`.
- Post bertanda NSFW **tidak** pernah menuliskan isinya ke tag OG maupun gambar preview: preview-nya hanya "Konten sensitif". Ini disengaja karena link menyebar bebas.
- Tombol **Bagikan** memakai Web Share API, dengan fallback salin ke clipboard.
- Detail post memuat seluruh komentar dan form komentar. Konten NSFW tetap ter-blur di halaman sampai tombol reveal ditekan.
- Halaman di dalam folder memakai path relatif (`../assets/...`), karena situs dilayani di subpath `/PDFTV-Room-of-Faith/`. Jangan pakai path absolut.
- Berpindah halaman berarti reload penuh, jadi state yang perlu bertahan disimpan di `sessionStorage`: `pdftv_run_v1` (run blackjack), `pdftv_session_v1` (login admin/moderator), `pdftv_bgm_on` (preferensi BGM). Semuanya terhapus saat tab ditutup.
- BGM tidak bisa otomatis berbunyi di halaman baru (kebijakan autoplay browser); musik menyala lagi pada interaksi pertama bila sebelumnya aktif.

### Preview share (Open Graph)

WhatsApp/Facebook tidak menjalankan JavaScript, jadi tag OG harus ada di HTML yang dikirim server. Karena itu:

| Bagian | Isi |
|---|---|
| `scripts/prerender-posts.mjs` | Mengambil post dari Supabase REST, menulis `feeds/p/<id>/index.html` + kartu `assets/og/<id>.png` |
| `scripts/package.json` | Dependensi `sharp` untuk merasterkan kartu SVG → PNG |
| `.github/workflows/prerender-posts.yml` | Menjalankan skrip di runner, commit hasilnya, lalu push |
| `assets/og/fallback.png` | Kartu brand, dipakai untuk post NSFW dan sebagai cadangan |
| `404.html` | Mengalihkan `/feeds/p/<id>/` yang belum ter-generate ke `?id=<id>` |

Menjalankan manual (butuh Node 20+):

```bash
cd scripts && npm install
node scripts/prerender-posts.mjs            # semua post
node scripts/prerender-posts.mjs --limit=3  # hanya 3 terbaru
```

Skrip hanya menulis berkas yang isinya berubah, jadi jadwal berulang tidak menghasilkan commit kosong. Kartu yang teksnya melebihi batas diukur ulang setelah render dan dilaporkan sebagai peringatan.

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
2. **`supabase_upgrade.sql`** — membuat fungsi RPC (`insert_confession`, `increment_upvote`, `append_comment`, aksi moderator, reset leaderboard), memindahkan kredensial ke schema `private`, dan mengetatkan RLS. Jalankan bagian perketat RLS **terakhir**, setelah aplikasi memakai RPC.

> Catatan: aplikasi punya jalur fallback ke operasi langsung bila RPC belum tersedia di database. Selama policy insert lama masih ada, fallback itu tetap bekerja.

---

## 🔐 Akses Admin & Moderator

Password **tidak disimpan di kode klien maupun di repo ini**. Verifikasi dilakukan di server melalui RPC `verify_admin` / `verify_moderator`, yang membandingkan input dengan hash **bcrypt** di tabel `private.admin_credentials`.

Schema `private` tidak diekspos PostgREST, akses dari `anon` dicabut, dan tabelnya berada dalam RLS tanpa policy, sehingga hash tidak bisa dibaca dari luar. Fungsi verifikasi berjalan `SECURITY DEFINER` sebagai pemilik tabel.

Untuk memasang atau mengganti password, jalankan di SQL Editor (nilai tidak boleh di-commit ke repo):

```sql
SELECT private.set_credential('admin',     'PASSWORD_BARU');
SELECT private.set_credential('moderator', 'PASSWORD_BARU');
```

Hak akses:

| Peran | Kemampuan |
|---|---|
| **Admin** | Reset leaderboard + panel uji mekanik game |
| **Moderator** | Pin, tandai NSFW, dan hapus postingan di Room of Faith |

Cek apakah kredensial sudah terpasang tanpa membuka hash-nya:

```sql
SELECT role, updated_at FROM private.admin_credentials;
```

---

## 🌐 Deploy

Repositori ini dideploy sebagai situs statis melalui **GitHub Pages**. Cukup push ke `main`, atau gunakan `watch-and-push.ps1` yang otomatis commit dan push setiap kali ada perubahan file.

---

© PDFTV Experience. Stay chill & keep grinding! 🚀
