// ============================================================
// PDFTV | PRE-RENDER POST UNTUK PREVIEW SHARE (Open Graph)
//
// WhatsApp/Facebook tidak menjalankan JavaScript, jadi tag OG harus
// sudah ada di HTML yang dikirim server. Skrip ini dijalankan oleh
// GitHub Actions untuk menghasilkan, per post:
//   - feeds/p/<id>/index.html  (tag OG berisi isi post + gambar absolut)
//   - assets/og/<id>.png       (kartu 1200x630 berisi teks post)
//
// Post NSFW TIDAK pernah ditulis isinya ke HTML/PNG — link bisa menyebar
// bebas, jadi preview tidak boleh membuka konten yang dikunci di situs.
//
// Jalankan: node scripts/prerender-posts.mjs [--limit=N]
// ============================================================

import { readFile, writeFile, mkdir, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const TEMPLATE_PATH = path.join(ROOT, 'feeds/p/index.html');
const OG_DIR = path.join(ROOT, 'assets/og');
const PAGE_DIR = path.join(ROOT, 'feeds/p');

// Origin situs yang benar-benar melayani halaman ini (Vercel), BUKAN GitHub
// Pages: repo ini tidak mengaktifkan Pages, jadi gambar dari github.io 404 dan
// WhatsApp hanya menampilkan preview teks tanpa gambar.
const SITE_ORIGIN = (process.env.SITE_ORIGIN || 'https://pdftv.vercel.app/').replace(/\/?$/, '/');
const OG_FALLBACK = SITE_ORIGIN + 'assets/og/fallback.png';

const CARD_W = 1200;
const CARD_H = 630;

// ── Konfigurasi Supabase ─────────────────────────────────────
// Kunci yang dipakai adalah publishable key yang memang sudah publik di
// js/core.js, jadi tidak perlu disimpan sebagai secret Actions.
async function resolveSupabaseConfig() {
    let url = process.env.SUPABASE_URL;
    let key = process.env.SUPABASE_KEY;

    if (!url || !key) {
        const core = await readFile(path.join(ROOT, 'js/core.js'), 'utf8');
        url = url || (core.match(/SUPABASE_URL\s*=\s*'([^']+)'/) || [])[1];
        key = key || (core.match(/SUPABASE_KEY\s*=\s*'([^']+)'/) || [])[1];
    }
    if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_KEY tidak ditemukan');
    return { url, key };
}

// ── Escaping ─────────────────────────────────────────────────
// Isi pengakuan & alias adalah input pengguna: wajib di-escape sebelum
// masuk atribut HTML atau teks SVG, kalau tidak bisa keluar dari atribut.
function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ── Teks untuk atribut ───────────────────────────────────────
function collapse(text) {
    return String(text ?? '').replace(/\s+/g, ' ').trim();
}

function truncate(text, max) {
    const t = collapse(text);
    if (t.length <= max) return t;
    // Potong di batas kata supaya tidak memotong di tengah kata
    const cut = t.slice(0, max);
    const lastSpace = cut.lastIndexOf(' ');
    return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
}

// ── Pembungkus teks untuk kartu ──────────────────────────────
// librsvg tidak mendukung foreignObject secara andal, jadi baris dihitung
// manual dengan estimasi lebar karakter. Estimasi ini sengaja dibuat
// KONSERVATIF (cenderung melebih-lebihkan): lebih baik teks dipotong sedikit
// lebih awal daripada meluber keluar kartu.
function charWidth(ch, fontSize) {
    const code = ch.codePointAt(0);
    // Emoji & simbol lebar (mis. 🎭) memakan ~1em, bukan lebar huruf biasa
    if (code > 0x2000 && !/[’‘“”–—…]/.test(ch)) return 1.0 * fontSize;
    if ('iljI.,:;\'!|()[]'.includes(ch)) return 0.32 * fontSize;
    if ('mwMW@%'.includes(ch)) return 0.92 * fontSize;
    if (ch === ' ') return 0.30 * fontSize;
    if (/[A-Z]/.test(ch)) return 0.74 * fontSize;
    return 0.62 * fontSize;
}

// Faktor keamanan: estimasi di atas masih bisa meleset beberapa persen
// tergantung font yang tersedia di runner.
const WIDTH_SAFETY = 1.08;

// Ukur lebar teks (sudah termasuk faktor keamanan). Semua perhitungan
// pembungkusan & pemotongan memakai fungsi ini supaya konsisten.
function measureText(text, fontSize) {
    let sum = 0;
    for (const ch of String(text)) sum += charWidth(ch, fontSize);
    return sum * WIDTH_SAFETY;
}

function wrapText(text, maxWidthPx, fontSize, maxLines) {
    const widthOf = (s) => measureText(s, fontSize);

    // Kata yang lebih lebar dari satu baris (URL panjang, teks tanpa spasi)
    // harus dipecah paksa, kalau tidak akan melewati batas kartu.
    const words = [];
    for (const word of collapse(text).split(' ').filter(Boolean)) {
        if (widthOf(word) <= maxWidthPx) {
            words.push(word);
            continue;
        }
        let chunk = '';
        for (const ch of word) {
            if (chunk && widthOf(chunk + ch) > maxWidthPx) {
                words.push(chunk);
                chunk = ch;
            } else {
                chunk += ch;
            }
        }
        if (chunk) words.push(chunk);
    }

    const lines = [];
    let line = '';

    for (const word of words) {
        const candidate = line ? line + ' ' + word : word;
        if (widthOf(candidate) <= maxWidthPx) {
            line = candidate;
            continue;
        }
        if (line) lines.push(line);
        line = word;

        if (lines.length === maxLines) break;
    }
    if (line && lines.length < maxLines) lines.push(line);

    const truncated = lines.length === maxLines && words.join(' ').length > lines.join(' ').length;
    if (truncated) {
        let last = lines[maxLines - 1];
        while (last.length > 1 && widthOf(last + '…') > maxWidthPx) last = last.slice(0, -1);
        lines[maxLines - 1] = last.trimEnd() + '…';
    }
    return lines;
}

// Potong satu baris agar benar-benar muat lebar piksel (bukan jumlah karakter).
function fitText(text, maxWidthPx, fontSize) {
    const widthOf = (s) => measureText(s, fontSize);
    let out = collapse(text);
    if (widthOf(out) <= maxWidthPx) return out;

    const chars = [...out];
    while (chars.length > 1 && widthOf(chars.join('') + '…') > maxWidthPx) chars.pop();
    return chars.join('').trimEnd() + '…';
}

// ── Kartu gambar ─────────────────────────────────────────────
function buildCardSvg({ alias, text, upvotes, comments, sensitive }) {
    const padding = 72;
    const lines = sensitive ? [] : wrapText(text, CARD_W - padding * 2, 40, 6);

    const body = sensitive
        ? `<text x="${padding}" y="330" font-size="44" font-weight="bold" fill="#fca5a5">🔒 Konten sensitif</text>
           <text x="${padding}" y="392" font-size="28" fill="#94a3b8">Post ini ditandai 18+. Buka tautannya untuk melihat.</text>`
        : lines.map((line, i) =>
            `<text x="${padding}" y="${300 + i * 56}" font-size="40" fill="#e2e8f0">${escapeHtml(line)}</text>`
          ).join('\n        ');

    const stats = sensitive
        ? ''
        : `<text x="${padding}" y="${CARD_H - 62}" font-size="26" fill="#64748b">${upvotes} upvote · ${comments} komentar</text>`;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}" font-family="DejaVu Sans, Liberation Sans, Verdana, sans-serif">
    <defs>
        <radialGradient id="felt" cx="50%" cy="20%" r="85%">
            <stop offset="0%" stop-color="#14472b"/>
            <stop offset="65%" stop-color="#0a2516"/>
            <stop offset="100%" stop-color="#041009"/>
        </radialGradient>
    </defs>

    <rect width="${CARD_W}" height="${CARD_H}" fill="url(#felt)"/>
    <rect x="0" y="0" width="${CARD_W}" height="8" fill="#10b981"/>

    <text x="${padding}" y="96" font-size="26" font-weight="bold" fill="#10b981" letter-spacing="4">PDFTV</text>
    <text x="${padding}" y="134" font-size="22" fill="#64748b" letter-spacing="3">ROOM OF FAITH</text>

    <text x="${padding}" y="224" font-size="32" font-weight="bold" fill="#ffffff">${escapeHtml(fitText(alias, CARD_W - padding * 2, 32))}</text>

    ${body}

    <line x1="${padding}" y1="${CARD_H - 110}" x2="${CARD_W - padding}" y2="${CARD_H - 110}" stroke="#1e293b" stroke-width="2"/>
    ${stats}
</svg>`;
}

// ── Halaman HTML ─────────────────────────────────────────────
// Halaman pre-render berada SATU TINGKAT LEBIH DALAM dari template
// (feeds/p/<id>/ vs feeds/p/), jadi setiap path relatif harus ditambah
// satu "../". Tanpa ini, semua aset (CSS/JS/gambar) dan tautan nav 404.
function deepenRelativePaths(html) {
    return html.replace(/(\b(?:href|src)=")((?:\.\.\/)+)/g, (match, attr, dots) => attr + '../' + dots);
}

function buildPageHtml(template, { id, title, description, image, imageAlt, absoluteUrl }) {
    const metaBlock = [
        `<title>${escapeHtml(title)}</title>`,
        `<meta name="description" content="${escapeHtml(description)}">`,
        `<link rel="canonical" href="${escapeHtml(absoluteUrl)}">`,
        `<meta property="og:type" content="article">`,
        `<meta property="og:title" content="${escapeHtml(title)}">`,
        `<meta property="og:description" content="${escapeHtml(description)}">`,
        `<meta property="og:url" content="${escapeHtml(absoluteUrl)}">`,
        `<meta property="og:image" content="${escapeHtml(image)}">`,
        `<meta property="og:image:width" content="${CARD_W}">`,
        `<meta property="og:image:height" content="${CARD_H}">`,
        `<meta property="og:image:alt" content="${escapeHtml(imageAlt)}">`,
        `<meta name="twitter:card" content="summary_large_image">`,
    ].join('\n    ');

    const html = template
        .replace(/<meta name="post-id" content="[^"]*">/, `<meta name="post-id" content="${id}">`)
        .replace(/<title>[\s\S]*?<\/title>\s*/, '')
        .replace(/<meta name="description"[^>]*>\s*/g, '')
        .replace(/<link rel="canonical"[^>]*>\s*/g, '')
        .replace(/<meta property="og:[^>]*>\s*/g, '')
        .replace(/<meta name="twitter:[^>]*>\s*/g, '')
        .replace(/(<meta name="viewport"[^>]*>)/, `$1\n    ${metaBlock}`);

    return deepenRelativePaths(html);
}

// ── Tulis hanya kalau berubah (anti-churn) ───────────────────
const written = { changed: 0, unchanged: 0, removed: 0 };

async function writeIfChanged(filePath, content) {
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    if (existsSync(filePath)) {
        const existing = await readFile(filePath);
        if (existing.equals(buffer)) {
            written.unchanged++;
            return false;
        }
    }
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, buffer);
    written.changed++;
    return true;
}

// ── Deteksi teks meluber ─────────────────────────────────────
// Estimasi lebar karakter bisa meleset tergantung font yang tersedia di
// runner, jadi hasil render benar-benar diukur: margin kanan harus kosong.
async function cardOverflows(pngBuffer) {
    const limit = CARD_W - 72; // batas aman kanan (padding 72)
    const { data, info } = await sharp(pngBuffer)
        .greyscale()
        .raw()
        .toBuffer({ resolveWithObject: true });

    let bright = 0;
    for (let y = 0; y < info.height; y++) {
        for (let x = limit; x < info.width; x++) {
            if (data[y * info.width + x] > 170) bright++;
        }
    }
    return bright > 0;
}

// ── Bersihkan hasil untuk post yang sudah dihapus ────────────
// Link share lama harus berhenti menampilkan konten yang sudah dihapus,
// jadi halaman dan kartunya ikut dibuang. `fallback.png` tidak pernah dihapus.
async function removeOrphans(liveIds) {
    let removed = 0;

    if (existsSync(PAGE_DIR)) {
        for (const entry of await readdir(PAGE_DIR, { withFileTypes: true })) {
            if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue;
            if (liveIds.has(entry.name)) continue;
            await rm(path.join(PAGE_DIR, entry.name), { recursive: true });
            console.log(`  - hapus halaman yatim: feeds/p/${entry.name}/`);
            removed++;
        }
    }

    if (existsSync(OG_DIR)) {
        for (const name of await readdir(OG_DIR)) {
            const m = name.match(/^(\d+)\.png$/);
            if (!m) continue; // fallback.png dan berkas lain dibiarkan
            if (liveIds.has(m[1])) continue;
            await rm(path.join(OG_DIR, name));
            console.log(`  - hapus kartu yatim: assets/og/${name}`);
            removed++;
        }
    }

    return removed;
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
    const limitArg = process.argv.find(a => a.startsWith('--limit='));
    const limit = limitArg ? Number(limitArg.split('=')[1]) : null;

    const { url: supaUrl, key: supaKey } = await resolveSupabaseConfig();
    const template = await readFile(TEMPLATE_PATH, 'utf8');

    console.log('Mengambil daftar post dari Supabase...');
    const res = await fetch(`${supaUrl}/rest/v1/PDFTV%20Feeds?select=*&order=id.desc`, {
        headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` },
    });
    if (!res.ok) throw new Error(`Supabase menolak: HTTP ${res.status} ${await res.text()}`);

    let posts = await res.json();
    if (limit) posts = posts.slice(0, limit);
    console.log(`Ditemukan ${posts.length} post.`);

    const overflowIds = [];
    const liveIds = new Set();

    // Kartu brand sebagai cadangan (dipakai post NSFW & kalau kartu gagal dibuat)
    await writeIfChanged(
        path.join(OG_DIR, 'fallback.png'),
        await sharp(Buffer.from(buildCardSvg({
            alias: 'Room of Faith',
            text: 'Ruang anonim untuk berbagi cerita dan pengakuan',
            upvotes: 0, comments: 0, sensitive: false,
        }))).png({ compressionLevel: 9 }).toBuffer()
    );

    for (const post of posts) {
        const id = String(post.id);
        // Jangan percaya id mentah dari API: dipakai sebagai nama folder & berkas.
        if (!/^\d+$/.test(id)) {
            console.warn(`  ! lewati post dengan id tidak valid: ${JSON.stringify(post.id)}`);
            continue;
        }
        liveIds.add(id);
        const isNsfw = post.is_nsfw === true || post.is_nsfw === 'true';
        const alias = collapse(post.alias) || 'Anonim';
        const confession = collapse(post.confession);
        const comments = Array.isArray(post.comments) ? post.comments.length : 0;
        const upvotes = Number(post.upvotes || 0);
        const absoluteUrl = `${SITE_ORIGIN}feeds/p/${id}/`;

        const page = isNsfw
            ? {
                title: 'Konten sensitif · Room of Faith',
                description: 'Post ini ditandai 18+. Buka tautannya untuk melihat.',
                image: OG_FALLBACK,
                imageAlt: 'Konten sensitif',
            }
            : {
                title: `${alias} · Room of Faith`,
                description: truncate(confession, 200) || 'Lihat postingan ini di PDFTV Room of Faith.',
                image: `${SITE_ORIGIN}assets/og/${id}.png`,
                imageAlt: alias,
            };

        await writeIfChanged(
            path.join(PAGE_DIR, id, 'index.html'),
            buildPageHtml(template, { id, ...page, absoluteUrl })
        );

        if (isNsfw) {
            // Kalau post ini pernah SFW, kartu lamanya berisi teks -> hapus
            const stale = path.join(OG_DIR, `${id}.png`);
            if (existsSync(stale)) {
                await rm(stale);
                written.removed++;
            }
            continue;
        }

        try {
            const svg = buildCardSvg({ alias, text: confession || 'Lihat GIF-nya di PDFTV', upvotes, comments, sensitive: false });
            const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();

            if (await cardOverflows(png)) {
                overflowIds.push(id);
                console.warn(`  ! teks meluber di kartu ${id}`);
            }
            await writeIfChanged(path.join(OG_DIR, `${id}.png`), png);
        } catch (err) {
            // Kartu gagal dibuat bukan alasan menggagalkan seluruh proses;
            // halaman pakai gambar cadangan.
            console.warn(`  ! kartu untuk ${id} gagal: ${err.message}`);
        }
    }

    if (overflowIds.length) {
        // Dibuat warning, bukan error: kartu tetap terpakai, tapi perlu
        // penyetelan estimasi lebar (WIDTH_SAFETY / charWidth).
        console.warn(`PERINGATAN: ${overflowIds.length} kartu meluber: ${overflowIds.join(', ')}`);
    }

    // Bersihkan hasil untuk post yang sudah tidak ada di database.
    // Tanpa ini, link share lama tetap menampilkan konten yang sudah dihapus.
    // HANYA dijalankan saat daftar post lengkap; dengan --limit, post di luar
    // jendela itu akan salah dianggap yatim.
    let orphanRemoved = 0;
    if (!limit) {
        orphanRemoved = await removeOrphans(liveIds);
    }

    console.log(`Selesai. berubah: ${written.changed}, tetap: ${written.unchanged}, dihapus: ${written.removed}, meluber: ${overflowIds.length}, yatim dibersihkan: ${orphanRemoved}`);
    return overflowIds.length;
}

main().catch(err => {
    console.error('GAGAL:', err);
    process.exit(1);
});
