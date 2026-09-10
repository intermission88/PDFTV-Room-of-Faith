# PDFTV — Experience Room · `/design review`

**Tanggal:** 2026-09-10 · **Mode:** review (laporan saja, tanpa perbaikan) · **Skor: 33/50 — Block**

Permukaan yang direview: `index.html` (2.777 baris, markup + ~1.800 baris JS inline) dan `js/feeds.js` (941 baris). Situs one-page mobile-first dengan tiga mode: Landing (manifesto + slider + kartu), Feeds "Room of Faith" (anon confession + komentar + GIF), Arcade (blackjack roguelite bergaya Balatro). Data live via Supabase.

## Skor Heuristik (/50)

| # | Heuristik | Skor | Temuan Kunci |
|---|---|---|---|
| 1 | First impression | 7/10 | Suara visual kuat dan authored (felt-green Balatro, kutipan manifesto, ikonografi band). Ditahan oleh hero H1 yang menghapus dirinya tiap siklus typewriter dan desktop 1440px yang hanya kolom 448px di kehampaan hitam. |
| 2 | Hierarchy | 7/10 | Urutan baca landing jelas (quote → slider → 2 kartu → statistik → footer); lobby arcade sangat baik (badge → judul → value prop → CTA → Hall of Fame). Melemah: CTA "Kirim" (aksi utama Ruang Pengakuan) lebih sunyi secara visual daripada tombol game, dan banjir label 8–9px mengaburkan tingkatan. |
| 3 | Color voice | 8/10 | Lensa terkuat. Emerald sebagai suara produk, amber sebagai dopamin game, rose untuk bahaya — 60-30-10 disiplin; warna status (pin amber, NSFW merah, boss merah) terbaca. Ditarik turun oleh `slate-600` di bawah AA (2.64:1 terukur) dan logo header yang nyaris tak terlihat. |
| 4 | Type voice | 6/10 | Tiga keluarga font berkarakter (Plus Jakarta Sans / Space Grotesk / Silkscreen) pas dengan register retro-arcade. Tapi: banjir ukuran one-off (`text-[8px]`–`text-[13px]`) tanpa skala, dan input form 12px memicu zoom-on-focus iOS Safari. |
| 5 | Interaction feel | 5/10 | Feedback kaya dan disengaja: haptic, click sound, skeleton, empty state, error state, char counter, preview GIF, blur NSFW. Tapi lantainya rapuh: dua CTA utama landing mati bagi keyboard, fokus tak terlihat, modal tanpa trap/Escape, motion abaikan `prefers-reduced-motion`, toolbar feeds terpotong di 320px. |
| | **Total** | **33/50** | |

## TL;DR

Situs ini punya karakter nyata — bukan hasil generate: arah warna felt-green yang disiplin, manifesto typewriter, dan ruang game Balatro yang benar-benar dikomposisi. Masalahnya ada di lantai interaksi: jalur keyboard putus tepat di CTA utama, indikator fokus dihapus tanpa pengganti, carousel auto-play mengabaikan reduced-motion, dan layout 320px terpotong. **Langkah berikutnya: `/design a11y` dulu (menutup 6 HIGH), lalu `/design typeset` untuk skala huruf, lalu `/design responsive` untuk 320px & desktop.**

## Temuan

| # | Severity | Disiplin | Lokasi | Before | After | Why |
|---|---|---|---|---|---|---|
| 1 | HIGH | Interaction | `index.html:390, 406` (kartu landing), `js/feeds.js:377` (reveal NSFW) | `<div onclick="handleFeedsClick()">` | `<button>` (atau `<a href="#">`) dengan nama aksesibel | Dua CTA utama landing ("Room of Faith", "Blackjack Arcade") tidak fokusable — jalur yang bisa dijalan mouse tidak bisa dijalan keyboard. Terverifikasi: hanya 6 elemen tabbable di landing, kedua kartu di luar itu. |
| 2 | HIGH | Accessibility | `index.html:481, 484, 493, 522, 829, 936`; `js/feeds.js:424` | `focus:outline-none focus:bg-white/10` | `focus-visible` ring 2px emerald dengan offset; jangan hapus outline tanpa pengganti | Tab mendarat tanpa apa pun yang terlihat. Terverifikasi visual: textarea dalam keadaan fokus tidak menunjukkan indikator apa pun; transisi bg 5%→10% tak terbedakan. |
| 3 | HIGH | Accessibility | `index.html:375, 378` (panah slider), `383–385` (dots), `818` (close modal); `290, 295` (BGM/burger: `title` saja, tanpa state) | Tombol ikon tanpa nama aksesibel; BGM tanpa `aria-pressed` | `aria-label` pada semua tombol ikon; `aria-pressed` pada BGM; dots `aria-label="Ke slide N"` + `aria-current` | Kontrol yang bisa dioperasikan tapi tidak pernah menyebut apa dirinya. Terverifikasi via DOM: `aria-label` hanya ada pada elemen hasil render dinamis; elemen statis polos. |
| 4 | HIGH | Motion | `index.html:1782–1784` (slider auto-play 3,5 detik), `85–88` (bossPulse infinite), `317, 429, 432, 886` (`animate-bounce/ping/pulse`) | Animasi & carousel self-starting tanpa gerbang `prefers-reduced-motion` | `@media (prefers-reduced-motion: reduce)`: matikan auto-play, loop infinite, dan float-up; pertahankan transisi ≤100ms | Pemicu eskalasi: gerak vestibular/carousel autoplay yang berjalan tanpa peduli preferensi pengguna. |
| 5 | HIGH | Accessibility | `index.html:816–948` (5 modal); `987` | Modal tanpa focus trap, tanpa `inert` di background, tanpa Escape, tanpa restore fokus (hanya modal admin yang memindahkan fokus masuk) | Trap fokus di dalam modal, `role="dialog"` + `aria-modal`, tutup via Escape, kembalikan fokus ke pemicu | Begitu modal terbuka, pengguna keyboard terdampar di latar belakang; Escape tidak tertangani di seluruh file. |
| 6 | HIGH | Accessibility | `index.html:481, 484, 493, 522, 829, 936`; `js/feeds.js:423` | Field hanya ber-placeholder ("Nama / Alias (opsional)", "Password Admin / Moderator...", "Tulis komentar...") | Label terlihat, atau minimal `aria-label`; contoh format pindah ke placeholder | Placeholder melakukan tugas label lalu menghilang saat fokus — pemicu eskalasi eksplisit. Kasus paling tajam: password admin. |
| 7 | HIGH | Layout | `index.html:516–527` (toolbar feeds) | Baris filter + search `w-32` + tombol refresh dalam satu `flex` tanpa wrap | Izinkan wrap atau kecilkan search (`w-24`) / collapse refresh menjadi ikon di `<360px` | Terverifikasi di 320px: konten 338px > viewport 320px; tombol refresh terpotong keluar layar. Pemicu eskalasi "terpotong saat window menyempit ke 320px". |
| 8 | MEDIUM | Surface | `index.html:608` | `${[0,1,2,3,4].map(() => \`<div class="skeleton-card"...>\`).join('')}` sebagai HTML statis | Ganti dengan markup skeleton statis (5 baris div) yang sama | Template literal JS mentah ter-render sebagai teks di Hall of Fame selama fetch pending/gagal. Terverifikasi visual + eval saat Supabase diblokir. |
| 9 | MEDIUM | Type | `index.html:595, 599, 602, 691, 722` dan puluhan lokasi lain | Ukuran one-off 8–13px tanpa skala (`text-[8px]` … `text-[13px]`) | Skala tetap (11/12/14/16/20/24px), floor 11px untuk teks informatif | Mikro-tipografi mengaburkan hierarki dan di bawah kenyamanan baca mobile; beberapa kombinasi jatuh di bawah AA. |
| 10 | MEDIUM | Interaction | `index.html:481, 484, 493, 522`; `js/feeds.js:424` | Input/textarea `text-xs` (12px) | ≥16px (`text-base`) pada viewport <640px | iOS Safari memicu zoom viewport otomatis saat fokus ke input <16px, melanggar layout. |
| 11 | MEDIUM | Accessibility | `index.html:275` (toast), `797` (gameStatus) | Elemen status yang berubah tanpa live region | `role="status"` + `aria-live="polite"` pada toast dan status game | Notifikasi dan hasil aksi tidak pernah diumumkan ke screen reader. `role` = 0 di seluruh dokumen (terverifikasi). |
| 12 | MEDIUM | Layout | `index.html:351` (`max-w-md` di `main`); footer `449–462` | Kolom 448px di tengah kehampaan pada 1440px; konten footer tertindih bottom nav pada 1440×900 | Komposisi desktop yang disengaja (grid dua kolom: manifesto + kartu) atau minimal clearance footer | Terverifikasi visual 1440×900 dan 320×844. Mobile-first sah, tapi besar layar tidak dikomposisi sama sekali. |
| 13 | LOW | Color | `index.html:459` (© footer), `485` (char counter) | `text-slate-600` di atas `#030a06` | Naik ke `slate-500` (≈6.9:1) atau `slate-400` | Terverifikasi terukur: 2.64:1 — gagal WCAG AA 4.5:1 untuk teks kecil. |
| 14 | LOW | Type | `index.html:356–358` + `1218–1242`; h1 di `356`, `473`, `579` | H1 hero diketik lalu dihapus berulang; tiga `<h1>` dalam satu dokumen | Ketik sekali lalu diamkan (loop jadikan lapisan dekoratif terpisah); satu h1 per dokumen | Teks heading hilang tiap siklus — first read tidak pernah stabil; mutasi karakter-per-karakter dibaca ulang screen reader. |

## Dipertimbangkan tapi Ditolak

| Lokasi | Kandidat | Alasan ditolak |
|---|---|---|
| `index.html:14` | Font via `@import` tanpa `preconnect` | Kesehatan teknis/performance, bukan kualitas desain — bukan wilayah review ini |
| `index.html:9` | Tailwind via CDN di produksi | Hasil visual runtime identik; masalah build/performance, bukan desain |
| — | Tidak ada meta description / OG tag | Berdampak ke sharing/SEO, bukan pengalaman desain di halaman |
| `index.html:375–380` | Kontras panah slider di area gambar terang | Chip `bg-black/40` di belakang ikon memberi kontras cukup pada screenshot; polish, bukan hambatan |
| `index.html:397, 412, dst.` | Emoji sebagai ikon ("💬", "🎰") | Konsisten dengan register arcade-band dan punya nama yang dibacakan SR; hambatan nyatanya sudah tercakup temuan #3 |

## Verifikasi

**Dijalankan dan lulus/teramasi:**

- Render nyata via Chromium CDP (Brave headless): screenshot landing, feeds, arcade lobby, game UI pada 390×844; landing pada 1440×900; feeds pada 320×844.
- Alur utama dijalan: landing → FEEDS (bottom nav) → form + list live data → ARCADE lobby (leaderboard live) → MAIN SEKARANG → game UI (deal state).
- State offline: route Supabase di-abort → teks kode mentah muncul di Hall of Fame (temuan #8), error state leaderboard ada ("Gagal memuat leaderboard") tetapi hanya setelah fetch gagal total.
- Fokus keyboard: `focus()` ke textarea → tanpa indikator visual (temuan #2).
- Hitung DOM: landing 6 tabbable vs 2 `div[onclick]`; `aria-label` hanya pada render dinamis; `[role]` = 0; semua `img` punya `alt`.
- Kontras terukur: `text-slate-600` (#475569) di atas `#030a06` = 2.64:1.
- Overflow: 320px → `scrollWidth` 338px vs viewport 320px (temuan #7).
- Toast: tampil dan auto-hide; teks terbaca (temuan #11: tanpa live region).

**Tidak terverifikasi:**

- Walk screen reader sungguhan (VoiceOver/NVDA) — atribut dibaca dari kode, bukan dari audio nyata.
- Perilaku zoom iOS pada perangkat fisik — disimpulkan dari kode + perilaku terdokumentasi Safari.
- Audio BGM/SFX, haptic, lightbox GIF, alur boss battle penuh, viewport 768px dan 2560px.

## Verdict

**Block** — masih ada HIGH yang berdiri (temuan #1–#7). Karakter visual situs sudah di atas rata-rata; pekerjaan berikutnya adalah lantai aksesibilitas agar pengalaman itu sampai ke semua pengguna. Mode yang disarankan berurutan: `/design a11y` → `/design typeset` → `/design responsive`.

---

*Generated with CommandCode — 2026-09-10*
