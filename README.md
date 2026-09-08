# PDFTV | Experience Room 🎮🔥

Welcome to **PDFTV Experience Room**—web app paling chill dan *aesthetic* yang memadukan retro CRT landing page, **Room of Faith** (anonim feeds real-time), dan game roguelite arcade **Balatro-Style Blackjack** yang dijamin bikin ketagihan. 

Built with pure vibes, modern web tech, and Supabase integration! ✨

---

## 🌟 What's Inside? (Key Features)

### 1. Room of Faith (Anonymous Feeds) 💬
- **Real-time & Public:** Ruang curhat/pengakuan anonim yang tersambung langsung ke Supabase database (`PDFTV Feeds`).
- **Interactive Vibe:** Bisa kirim confession baru, upvote (lengkap dengan fitur *undo*), dan balas komentar tanpa ribet.
- **Clean UI:** Tampilan super simpel, *left-aligned*, tanpa spasi ngaret di awal teks.

### 2. Balatro-Style Blackjack (Roguelite Arcade) 🃏💸
- **8 Rounds & Boss Battles:** Taklukkan tantangan tiap ronde sampai Ante terakhir. Lawan boss unik (kayak *The Government Boss* yang hobi narikin pajak!).
- **Joker Cards & Consumables:** Kumpul pasif buff dari Joker, pakai *Discards*, *Busters*, dan *Aegis Shields* buat amankan skor.
- **Hall of Fame:** Live leaderboard buat pamer siapa yang paling cuan.
- **Admin Cheat Panel:** Buat yang suka bereksperimen, ada panel cheat khusus admin juga lho.

### 3. Visuals & Audio 🎨🎵
- **CRT & Felt Green Aesthetics:** Nuansa meja poker hijau klasik berpadu dengan scanlines ala monitor CRT vintage.
- **Immersive Audio:** Dilengkapi BGM dan SFX interaktif yang bikin experience main makin *immersive*.

---

## 🛠️ Tech Stack

- **Frontend:** HTML5, Tailwind CSS, Custom CRT CSS Shaders & Keyframe Animations
- **Logic:** Vanilla JavaScript (ES6+)
- **Backend & Database:** Supabase (`@supabase/supabase-js`) with Realtime subscriptions
- **Assets:** Optimized WebP media and Google Fonts (*Plus Jakarta Sans*, *Space Grotesk*, *Silkscreen*)

---

## 🚀 Quick Start / Local Setup

Mau run project ini di lokal komputer kamu? Gampang banget, bro/sist:

1. Clone repo ini ke laptop/PC kamu:
   ```bash
   git clone https://github.com/intermission88/PDFTV-Room-of-Faith.git
   ```
2. Buka folder proyeknya, lalu jalankan pakai local server (biar Supabase & fetch asset lancar):
   ```bash
   npx serve .
   # atau pakai python
   python3 -m http.server 8000
   ```
3. Buka browser di `http://localhost:8000` and enjoy the game! 🎉

---

## 📦 Database Setup (Supabase)

Buat yang mau setup database sendiri, cukup jalankan script migrasi yang ada di file **`seed_feeds.sql`** ke Supabase SQL Editor kamu. Tabel `PDFTV Feeds` udah di-set lengkap dengan RLS policy publik supaya siap dipakai bareng temen-temen.

---

© PDFTV Experience. All rights reserved. Stay chill & keep grinding! 🚀
