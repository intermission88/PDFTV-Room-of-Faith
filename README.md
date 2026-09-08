# PDFTV | Experience Room

An immersive web application featuring a retro-styled landing page and an advanced **Balatro-Inspired Roguelite Blackjack** arcade game. Built with modern web technologies, Tailwind CSS, and Supabase integration, PDFTV combines nostalgic CRT arcade aesthetics with deep tactical card gameplay.

---

## 🌟 Key Features

### 1. Interactive Landing Page
- **Dynamic Typewriter Greeting:** Engaging animated intro text by Zaldnielsen.
- **Media Slider:** Showcase carousel for rosters, mixtapes, and social links.
- **Room of Faith (Feeds):** Community space (currently under maintenance).

### 2. Balatro-Style Blackjack Arcade (Roguelite)
- **Ante & Round Progression:** Navigate through 8 rounds per Ante, culminating in intense Boss Battles.
- **Boss Battles & Perks:** Face unique bosses (such as *The Government Boss* with tax mechanics) that test your strategy.
- **Active Jokers (Passives):** Equip and benefit from permanent Joker cards:
  - **The Jester:** Grants +0.5x Multiplier.
  - **Greedy Joker:** Boosts cash earnings by +50%.
  - **Heartbreaker:** Turns draws into wins.
- **Tactical Consumables:**
  - **Discard:** Swap out the final card in your hand.
  - **Buster:** Force the dealer to draw an extra risk card (+1 Hit).
- **Aegis Shield:** Protect your losses (max 3 shields, earned upon scoring 21).
- **Hall of Fame:** Live leaderboards tracking top cash runs and high scores.
- **Admin & Cheat Panel:** Administrative testing tools for cash, multipliers, instant wins, and item management.

### 3. Visual & Audio Design
- **CRT & Felt Arena:** Custom CSS shaders replicating vintage CRT scanlines and Balatro felt green poker tables.
- **Typography:** Styled with Google Fonts (*Plus Jakarta Sans*, *Space Grotesk*, and *Silkscreen*).
- **Sound Effects & BGM:** Integrated toggleable background music and interactive audio feedback.

---

## 🛠️ Tech Stack

- **Markup & Styling:** HTML5, Tailwind CSS (CDN), Custom CSS Animations & CRT Shaders
- **Scripting:** Vanilla JavaScript (ES6+)
- **Backend & Database:** Supabase JS (`@supabase/supabase-js`)
- **Fonts & Assets:** Google Fonts, WebP asset management

---

## 🚀 Getting Started

To run or view the project locally:

1. Clone or download this repository.
2. Open `index.html` directly in any modern web browser, or serve it using a local static server:
   ```bash
   npx serve /Users/ario/pdftv-devs
   # or
   python3 -m http.server 8000
   ```
3. Enjoy the arcade experience!

---

© PDFTV Experience. All rights reserved.
