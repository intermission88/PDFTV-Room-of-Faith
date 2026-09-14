// ============================================================
// PDFTV | NEWS — halaman berita + dashboard writer & CEO
// Dipakai tiga halaman:
//   news/index.html       daftar artikel (publik, hanya 'approved')
//   news/p/index.html     isi satu artikel + fallback ?id=<id>
//   news/dashboard/       panel writer (submit) & CEO (approval)
// Semua penulisan lewat RPC; publik hanya bisa membaca artikel yang
// sudah disetujui (dijamin RLS, bukan hanya filter di klien).
// ============================================================

const NEWS_TABLE = 'PDFTV News';
// Kategori = chip di halaman berita + isi dropdown dashboard. Tambah/hapus di
// sini saja; chip "Semua" selalu ada dan tidak perlu didaftarkan.
// Terpisah dari `tags`, yang diisi bebas per artikel oleh writer (tanpa preset).
const NEWS_CATEGORIES = ['Artikel'];

let newsData = [];
let currentNewsCategory = 'all';
let newsSearchQuery = '';
let newsSort = 'latest';
let newsRealtimeChannel = null;
let newsTimeInterval = null;
let currentNews = null;

// Dashboard (dipakai news/dashboard/)
let writerNewsData = [];
let ceoNewsData = [];
let ceoNewsFilter = 'pending';
let editingNewsId = null;

// ── Helper ───────────────────────────────────────────────────
function cleanNewsText(str) {
    if (!str) return '';
    return String(str).replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function normalizeNews(item) {
    return {
        ...item,
        title: cleanNewsText(item.title),
        excerpt: cleanNewsText(item.excerpt),
        body: String(item.body || '').replace(/\r\n?/g, '\n').trim(),
        category: cleanNewsText(item.category) || 'Artikel',
        author_name: cleanNewsText(item.author_name) || 'Redaksi',
        cover_url: String(item.cover_url || '').trim(),
        tags: cleanNewsText(item.tags),
    };
}

function newsTimeAgo(value) {
    const ms = typeof value === 'number' ? value : Date.parse(value);
    if (!Number.isFinite(ms)) return 'Baru saja';
    const diff = Math.floor((Date.now() - ms) / 1000);
    if (diff < 60) return 'Baru saja';
    if (diff < 3600) return `${Math.floor(diff / 60)} mnt yang lalu`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} jam yang lalu`;
    if (diff < 2592000) return `${Math.floor(diff / 86400)} hari yang lalu`;
    return new Date(ms).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function newsFullDate(value) {
    const ms = Date.parse(value);
    if (!Number.isFinite(ms)) return '';
    return new Date(ms).toLocaleDateString('id-ID', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
}

function newsExcerpt(item, max) {
    const raw = cleanNewsText(item.excerpt || item.body || '').replace(/\s+/g, ' ');
    if (raw.length <= max) return raw;
    const cut = raw.slice(0, max);
    const lastSpace = cut.lastIndexOf(' ');
    return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
}

// Tags diisi bebas oleh writer (pemisah koma) → dipecah untuk ditampilkan.
function newsTagList(item) {
    return String(item.tags || '')
        .split(/[,\n]/)
        .map(t => t.trim().replace(/^#+/, '').trim())
        .filter(Boolean)
        .slice(0, 12);
}

// Isi artikel adalah input pengguna: escape DULU, baru tambahkan tag
// sendiri (subset minimal: paragraf, ## heading, **bold**).
function renderNewsBody(text) {
    const safe = escapeHtml(String(text || ''));
    return safe.split(/\n{2,}/).map(block => {
        const trimmed = block.trim();
        if (!trimmed) return '';
        if (/^##\s+/.test(trimmed)) {
            return `<h2 class="text-sm font-bold text-white mt-5 mb-2">${trimmed.replace(/^##\s+/, '')}</h2>`;
        }
        const withBreaks = trimmed.replace(/\n/g, '<br>')
            .replace(/\*\*([^*]+)\*\*/g, '<strong class="text-white">$1</strong>');
        return `<p class="text-[13px] text-slate-300 leading-relaxed mb-3">${withBreaks}</p>`;
    }).join('');
}

function newsArticleLink(id) {
    return 'p/?id=' + encodeURIComponent(String(id));
}

function newsSkeleton(count) {
    return Array.from({ length: count }, () => `
        <div class="skeleton-card p-4 space-y-2.5">
            <div class="skeleton-bar w-24 h-3"></div>
            <div class="skeleton-bar w-full h-3"></div>
            <div class="skeleton-bar w-4/5 h-3"></div>
        </div>
    `).join('<div class="h-px bg-white/[0.06] my-4"></div>');
}

// ── Daftar artikel (news/index.html) ─────────────────────────
async function fetchNews() {
    const container = document.getElementById('newsListContainer');
    if (!container) return;

    container.innerHTML = newsSkeleton(3);
    const btn = document.getElementById('newsRefreshBtn');
    if (btn) { btn.disabled = true; btn.classList.add('opacity-50', 'animate-spin'); }

    const { data, error } = await supabaseClient
        .from(NEWS_TABLE)
        .select('*')
        .eq('status', 'approved')
        .order('created_at', { ascending: false });

    if (btn) { btn.disabled = false; btn.classList.remove('opacity-50', 'animate-spin'); }

    if (error) {
        container.innerHTML = `
            <div class="rounded-xl bg-red-500/[0.06] p-6 text-center text-red-300 text-xs space-y-2 my-3">
                <div class="text-xl">🔌</div>
                <div class="font-medium">Gagal memuat berita</div>
                <div class="text-slate-500 text-[11px]">${escapeHtml(error.message)}</div>
                <p class="text-[11px] text-slate-400 mt-1">💡 Pastikan tabel "PDFTV News" sudah dibuat (bagian 11 di <code>supabase_upgrade.sql</code>).</p>
                <button onclick="fetchNews()" class="mt-2 px-4 py-1.5 bg-white/10 hover:bg-white/15 text-white rounded-lg text-xs transition">Coba Lagi</button>
            </div>
        `;
        return;
    }

    newsData = (data || []).map(normalizeNews);
    renderNews();
    startNewsTimeRefresh();
    subscribeToRealtimeNews();
}

function subscribeToRealtimeNews() {
    if (newsRealtimeChannel) return;
    newsRealtimeChannel = supabaseClient
        .channel('pdftv-news-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: NEWS_TABLE }, () => {
            fetchNewsQuiet();
        })
        .subscribe();
}

// Muat ulang tanpa skeleton (dipakai realtime)
async function fetchNewsQuiet() {
    const { data, error } = await supabaseClient
        .from(NEWS_TABLE)
        .select('*')
        .eq('status', 'approved')
        .order('created_at', { ascending: false });
    if (error) return;
    newsData = (data || []).map(normalizeNews);
    renderNews();
}

function startNewsTimeRefresh() {
    if (newsTimeInterval) return;
    newsTimeInterval = setInterval(() => {
        document.querySelectorAll('.news-time[data-ts]').forEach(el => {
            el.textContent = newsTimeAgo(el.dataset.ts);
        });
    }, 60000);
}

function setNewsCategory(category) {
    playClickSound();
    triggerHaptic('light');
    currentNewsCategory = category;
    renderNews();
}

function setNewsSort(sort) {
    playClickSound();
    triggerHaptic('light');
    newsSort = sort;
    renderNews();
}

function handleNewsSearch(e) {
    newsSearchQuery = (e.target.value || '').toLowerCase().trim();
    renderNews();
}

function renderNewsChips() {
    const box = document.getElementById('newsCategoryChips');
    if (!box) return;
    const chips = ['all'].concat(NEWS_CATEGORIES);
    box.innerHTML = chips.map(c => {
        const active = c === currentNewsCategory;
        const label = c === 'all' ? 'Semua' : c;
        return `<button type="button" onclick="setNewsCategory('${escapeHtml(c)}')" aria-pressed="${active}" class="news-chip ${active ? 'news-chip-active' : ''}">${escapeHtml(label)}</button>`;
    }).join('');
}

function updateNewsSortButtons() {
    const latest = document.getElementById('newsSortLatest');
    const oldest = document.getElementById('newsSortOldest');
    const active = 'px-3 py-1.5 bg-white/10 text-white text-xs font-medium rounded-lg transition';
    const inactive = 'px-3 py-1.5 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-xs font-medium rounded-lg transition';
    if (latest) {
        latest.className = newsSort === 'latest' ? active : inactive;
        latest.setAttribute('aria-pressed', String(newsSort === 'latest'));
    }
    if (oldest) {
        oldest.className = newsSort === 'oldest' ? active : inactive;
        oldest.setAttribute('aria-pressed', String(newsSort === 'oldest'));
    }
}

function renderNewsHero(item) {
    return `
        <a href="${newsArticleLink(item.id)}" class="news-hero block rounded-2xl overflow-hidden bg-white/[0.04] text-left">
            ${item.cover_url ? `
                <div class="aspect-[16/9] bg-black/30 overflow-hidden">
                    <img src="${escapeHtml(item.cover_url)}" alt="${escapeHtml(item.title)}" class="w-full h-full object-cover" loading="lazy" onerror="this.parentNode.style.display='none'">
                </div>
            ` : ''}
            <div class="p-4">
                <div class="flex items-center gap-2 text-[10px] uppercase tracking-wide">
                    <span class="text-emerald-300 font-bold">${escapeHtml(item.category)}</span>
                    <span class="text-slate-600" aria-hidden="true">•</span>
                    <span class="news-time text-slate-500" data-ts="${escapeHtml(item.created_at || '')}">${newsTimeAgo(item.created_at)}</span>
                </div>
                <h2 class="text-base font-black text-white mt-1.5 leading-snug">${escapeHtml(item.title)}</h2>
                <p class="text-[12px] text-slate-400 leading-relaxed mt-1.5 news-clamp-3">${escapeHtml(newsExcerpt(item, 190))}</p>
                <div class="flex items-center justify-between mt-3">
                    <span class="text-[11px] text-slate-500">✍️ ${escapeHtml(item.author_name)}</span>
                    <span class="text-[11px] font-bold text-emerald-300">Baca ➔</span>
                </div>
            </div>
        </a>
    `;
}

function renderNewsCard(item) {
    return `
        <a href="${newsArticleLink(item.id)}" class="news-card flex gap-3 rounded-2xl bg-white/[0.04] p-3 text-left">
            ${item.cover_url ? `
                <div class="w-20 h-20 shrink-0 rounded-xl overflow-hidden bg-black/30">
                    <img src="${escapeHtml(item.cover_url)}" alt="" class="w-full h-full object-cover" loading="lazy" onerror="this.parentNode.style.display='none'">
                </div>
            ` : `
                <div class="w-20 h-20 shrink-0 rounded-xl bg-white/[0.04] flex items-center justify-center text-lg" aria-hidden="true">📰</div>
            `}
            <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5 text-[10px] uppercase tracking-wide">
                    <span class="text-emerald-300 font-bold">${escapeHtml(item.category)}</span>
                    <span class="text-slate-600" aria-hidden="true">•</span>
                    <span class="news-time text-slate-500 truncate" data-ts="${escapeHtml(item.created_at || '')}">${newsTimeAgo(item.created_at)}</span>
                </div>
                <h3 class="text-[13px] font-bold text-white mt-1 leading-snug news-clamp-2">${escapeHtml(item.title)}</h3>
                <p class="text-[11px] text-slate-400 mt-1 news-clamp-2">${escapeHtml(newsExcerpt(item, 110))}</p>
                <span class="text-[10px] text-slate-500 mt-1 block">✍️ ${escapeHtml(item.author_name)}</span>
            </div>
        </a>
    `;
}

function renderNews() {
    const container = document.getElementById('newsListContainer');
    if (!container) return;

    renderNewsChips();
    updateNewsSortButtons();

    let items = [...newsData];

    if (currentNewsCategory !== 'all') {
        items = items.filter(i => i.category === currentNewsCategory);
    }
    if (newsSearchQuery) {
        items = items.filter(i =>
            (i.title || '').toLowerCase().includes(newsSearchQuery) ||
            (i.excerpt || '').toLowerCase().includes(newsSearchQuery) ||
            (i.body || '').toLowerCase().includes(newsSearchQuery) ||
            (i.author_name || '').toLowerCase().includes(newsSearchQuery)
        );
    }

    items.sort((a, b) => {
        const ta = Date.parse(a.created_at) || 0;
        const tb = Date.parse(b.created_at) || 0;
        return newsSort === 'oldest' ? ta - tb : tb - ta;
    });

    if (items.length === 0) {
        const isFiltered = !!newsSearchQuery || currentNewsCategory !== 'all';
        container.innerHTML = `
            <div class="rounded-2xl bg-gradient-to-b from-emerald-500/[0.06] via-transparent to-transparent p-8 text-center space-y-3 my-3">
                <div class="text-3xl" aria-hidden="true">${isFiltered ? '🔍' : '📰'}</div>
                <div class="text-sm font-bold text-white">${isFiltered ? 'Tidak ditemukan' : 'Belum ada berita'}</div>
                <p class="text-xs text-slate-400 max-w-xs mx-auto">${isFiltered
                    ? 'Tidak ada artikel yang cocok dengan filter ini. Coba kata kunci atau kategori lain.'
                    : 'Artikel yang disetujui CEO akan tampil di sini.'}</p>
                ${isFiltered ? `
                    <button onclick="setNewsCategory('all'); document.getElementById('newsSearchInput').value=''; newsSearchQuery=''; renderNews();" class="mt-1 px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 rounded-xl text-xs font-bold transition active:scale-95">
                        Reset filter
                    </button>
                ` : ''}
            </div>
        `;
        return;
    }

    const [lead, ...rest] = items;
    container.innerHTML = renderNewsHero(lead)
        + (rest.length
            ? `<div class="space-y-3 mt-4">${rest.map(renderNewsCard).join('')}</div>`
            : '')
        + `
            <div class="py-8 text-center text-slate-500 text-xs space-y-1 mt-4">
                <div class="inline-block text-sm" aria-hidden="true">📰</div>
                <div class="text-slate-400">Semua berita telah dimuat</div>
                <div class="text-[11px] text-slate-500">Anda telah mencapai akhir daftar.</div>
            </div>
        `;
}

// ── Detail artikel (news/p/index.html) ───────────────────────
// Berurutan dari: meta pre-render, query string, lalu path cantik.
function getNewsIdFromUrl() {
    const meta = document.querySelector('meta[name="news-id"]');
    const metaId = meta && meta.getAttribute('content');
    if (metaId && /^\d+$/.test(metaId)) return metaId;

    const raw = new URLSearchParams(window.location.search).get('id');
    if (raw && /^\d+$/.test(raw)) return raw;

    const m = window.location.pathname.match(/\/news\/p\/(\d+)\/?$/);
    if (m) return m[1];

    return null;
}

async function fetchNewsById(id) {
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) return null;

    try {
        const { data, error } = await supabaseClient
            .from(NEWS_TABLE)
            .select('*')
            .eq('id', numericId)
            .eq('status', 'approved')
            .maybeSingle();
        if (error) throw error;
        if (data) return normalizeNews(data);
    } catch (err) {
        console.error('Gagal memuat artikel:', err);
    }
    return null;
}

function renderNewsNotFound(reason) {
    const container = document.getElementById('newsDetailContainer');
    if (!container) return;
    const isMissing = reason === 'missing';
    container.innerHTML = `
        <div class="rounded-2xl bg-gradient-to-b from-emerald-500/[0.06] via-transparent to-transparent p-8 text-center space-y-3">
            <div class="text-3xl" aria-hidden="true">${isMissing ? '🔗' : '📰'}</div>
            <h1 id="headingArticle" tabindex="-1" class="text-sm font-bold text-white">${isMissing ? 'Link tidak lengkap' : 'Artikel tidak ditemukan'}</h1>
            <p class="text-xs text-slate-400 max-w-xs mx-auto">${isMissing
                ? 'Link ini tidak menyertakan kode artikel. Buka dari daftar berita.'
                : 'Artikel ini mungkin sudah ditarik, belum disetujui, atau kodenya salah.'}</p>
            <a href="../" class="inline-block mt-1 px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 rounded-xl text-xs font-bold transition">
                ← Kembali ke Berita
            </a>
        </div>
    `;
    document.title = `${isMissing ? 'Link tidak lengkap' : 'Artikel tidak ditemukan'} · PDFTV News`;
    const heading = document.getElementById('headingArticle');
    if (heading) heading.focus({ preventScroll: true });
}

function renderNewsDetail() {
    const item = currentNews;
    const container = document.getElementById('newsDetailContainer');
    if (!item || !container) return;

    const tagChips = newsTagList(item)
        .map(t => `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/[0.06] text-slate-300">#${escapeHtml(t)}</span>`)
        .join('');

    container.innerHTML = `
        <article class="rounded-2xl bg-white/[0.04] overflow-hidden text-left">
            ${item.cover_url ? `
                <div class="aspect-[16/9] bg-black/30 overflow-hidden">
                    <img src="${escapeHtml(item.cover_url)}" alt="${escapeHtml(item.title)}" class="w-full h-full object-cover" onerror="this.parentNode.style.display='none'">
                </div>
            ` : ''}

            <div class="p-4">
                <div class="flex items-center gap-2 text-[10px] uppercase tracking-wide">
                    <span class="text-emerald-300 font-bold">${escapeHtml(item.category)}</span>
                    <span class="text-slate-600" aria-hidden="true">•</span>
                    <span class="text-slate-500">${escapeHtml(newsFullDate(item.created_at))}</span>
                </div>

                <h1 id="headingArticle" tabindex="-1" class="text-lg font-black text-white mt-2 leading-snug">${escapeHtml(item.title)}</h1>

                <div class="flex items-center justify-between gap-3 pt-2.5 mt-2.5 border-t border-white/[0.06]">
                    <span class="text-[11px] text-slate-400">✍️ ${escapeHtml(item.author_name)}</span>
                    <button onclick="shareNews('${item.id}')" class="flex items-center gap-1.5 text-slate-400 hover:text-emerald-300 transition" aria-label="Bagikan link artikel ini">
                        <span class="text-xs font-medium">Bagikan</span>
                        <svg class="w-4 h-4" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z"/></svg>
                    </button>
                </div>

                ${item.excerpt ? `
                    <p class="text-[13px] text-slate-300 leading-relaxed mt-4 pl-3 border-l-2 border-emerald-500/40">${escapeHtml(item.excerpt)}</p>
                ` : ''}

                <div class="news-prose mt-4">${renderNewsBody(item.body)}</div>

                ${tagChips ? `
                    <div class="flex flex-wrap gap-1.5 mt-4 pt-4 border-t border-white/[0.06]">${tagChips}</div>
                ` : ''}
            </div>
        </article>
    `;

    document.title = `${item.title} · PDFTV News`;
    const heading = document.getElementById('headingArticle');
    if (heading) heading.focus({ preventScroll: true });
}

async function shareNews(id) {
    const url = buildNewsUrl(id);

    if (navigator.share) {
        try {
            await navigator.share({ title: document.title, url });
            return;
        } catch (err) {
            // Pengguna membatalkan share sheet — lanjut ke salin link
        }
    }

    try {
        await navigator.clipboard.writeText(url);
        showToast('🔗 Link artikel disalin!');
    } catch (err) {
        prompt('Salin link ini:', url);
    }
}

async function initNewsDetail() {
    const container = document.getElementById('newsDetailContainer');
    if (!container) return;

    const id = getNewsIdFromUrl();
    if (!id) {
        renderNewsNotFound('missing');
        return;
    }

    container.innerHTML = newsSkeleton(1);
    currentNews = await fetchNewsById(id);

    if (!currentNews) {
        renderNewsNotFound('notfound');
        return;
    }
    renderNewsDetail();
}

// ── Dashboard Writer & CEO (news/dashboard/) ─────────────────
function writerRpc(rpcName, rpcArgs) {
    return supabaseClient.rpc(rpcName, { p_pass: writerPass, ...rpcArgs });
}

function ceoRpc(rpcName, rpcArgs) {
    return supabaseClient.rpc(rpcName, { p_pass: ceoPass, ...rpcArgs });
}

function newsStatusBadge(status) {
    switch (status) {
        case 'approved':    return { label: 'Diterbitkan', cls: 'bg-emerald-500/15 text-emerald-300' };
        case 'rejected':    return { label: 'Ditolak', cls: 'bg-red-500/15 text-red-300' };
        case 'unpublished': return { label: 'Ditarik', cls: 'bg-slate-500/20 text-slate-300' };
        default:            return { label: 'Menunggu review', cls: 'bg-amber-500/15 text-amber-300' };
    }
}

// Dipanggil core.js (updateAdminUI) — juga saat halaman dimuat.
function renderNewsDashboards() {
    const locked = document.getElementById('newsDashLocked');
    const writerPanel = document.getElementById('writerPanel');
    const ceoPanel = document.getElementById('ceoPanel');
    if (!locked && !writerPanel && !ceoPanel) return;

    const loggedIn = isWriterLoggedIn || isCeoLoggedIn;
    if (locked) locked.classList.toggle('hidden', loggedIn);
    if (writerPanel) writerPanel.classList.toggle('hidden', !isWriterLoggedIn);
    if (ceoPanel) ceoPanel.classList.toggle('hidden', !isCeoLoggedIn);

    if (isWriterLoggedIn) loadWriterNews();
    if (isCeoLoggedIn) loadCeoNews();
}

function newsFormValue(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
}

function resetNewsForm() {
    ['newsTitleInput', 'newsExcerptInput', 'newsBodyInput', 'newsCoverInput', 'newsAuthorInput', 'newsTagsInput']
        .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const category = document.getElementById('newsCategoryInput');
    if (category) category.value = NEWS_CATEGORIES[0];

    editingNewsId = null;
    const submitBtn = document.getElementById('newsSubmitBtn');
    if (submitBtn) submitBtn.textContent = 'Kirim untuk review';
    const cancelBtn = document.getElementById('newsCancelEditBtn');
    if (cancelBtn) cancelBtn.classList.add('hidden');
    updateNewsCharCounter();
}

function updateNewsCharCounter() {
    const body = document.getElementById('newsBodyInput');
    const counter = document.getElementById('newsBodyCounter');
    if (!body || !counter) return;
    const len = body.value.length;
    counter.textContent = len ? `${len}/20000` : '';
    counter.className = 'text-right text-[10px] mt-1 h-3 ' + (len > 19000 ? 'text-amber-400' : 'text-slate-500');
}

function handleNewsCoverPreview() {
    const input = document.getElementById('newsCoverInput');
    const box = document.getElementById('newsCoverPreview');
    const img = document.getElementById('newsCoverPreviewImg');
    if (!input || !box || !img) return;

    const url = input.value.trim();
    if (!/^https?:\/\/.+/.test(url)) {
        box.classList.add('hidden');
        return;
    }
    img.src = url;
    box.classList.remove('hidden');
}

async function submitNews(e) {
    e.preventDefault();
    if (!isWriterLoggedIn) {
        showToast('⚠️ Login sebagai writer dulu.');
        return;
    }

    const title = newsFormValue('newsTitleInput');
    const body = newsFormValue('newsBodyInput');

    if (title.length < 5) { showToast('❌ Judul minimal 5 karakter.'); return; }
    if (body.length < 20) { showToast('❌ Isi artikel minimal 20 karakter.'); return; }

    const payload = {
        p_title: title,
        p_body: body,
        p_excerpt: newsFormValue('newsExcerptInput') || null,
        p_cover_url: newsFormValue('newsCoverInput') || null,
        p_category: newsFormValue('newsCategoryInput') || NEWS_CATEGORIES[0],
        p_tags: newsFormValue('newsTagsInput') || null,
    };

    const submitBtn = document.getElementById('newsSubmitBtn');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Mengirim...'; }

    playClickSound();
    triggerHaptic('medium');

    const isEditing = !!editingNewsId;
    const { error } = isEditing
        ? await writerRpc('writer_update_news', { p_id: Number(editingNewsId), ...payload })
        : await writerRpc('writer_submit_news', { ...payload, p_author: newsFormValue('newsAuthorInput') || 'Redaksi' });

    if (submitBtn) submitBtn.disabled = false;

    if (error) {
        if (submitBtn) submitBtn.textContent = isEditing ? 'Simpan Perubahan' : 'Kirim untuk review';
        showToast(`❌ Gagal: ${rpcErrorMessage(error)}`);
        return;
    }

    showToast(isEditing
        ? '✍️ Artikel diperbarui & kembali menunggu review.'
        : '✍️ Artikel terkirim, menunggu persetujuan CEO.');
    resetNewsForm();
    loadWriterNews();
}

function editNews(id) {
    const item = writerNewsData.find(n => String(n.id) === String(id));
    if (!item) return;

    playClickSound();
    editingNewsId = String(item.id);

    const set = (elId, value) => { const el = document.getElementById(elId); if (el) el.value = value || ''; };
    set('newsTitleInput', item.title);
    set('newsExcerptInput', item.excerpt);
    set('newsBodyInput', item.body);
    set('newsCoverInput', item.cover_url);
    set('newsAuthorInput', item.author_name);
    set('newsCategoryInput', item.category);
    set('newsTagsInput', item.tags);

    const submitBtn = document.getElementById('newsSubmitBtn');
    if (submitBtn) submitBtn.textContent = 'Simpan Perubahan';
    const cancelBtn = document.getElementById('newsCancelEditBtn');
    if (cancelBtn) cancelBtn.classList.remove('hidden');

    updateNewsCharCounter();
    handleNewsCoverPreview();
    const panel = document.getElementById('newsWriterForm');
    if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    showToast('✏️ Mode edit: ubah lalu simpan.');
}

function cancelNewsEdit() {
    playClickSound();
    resetNewsForm();
    showToast('Edit dibatalkan.');
}

async function deleteWriterNews(id) {
    if (!confirm('Hapus artikel ini? Tindakan ini permanen.')) return;

    const { error } = await writerRpc('writer_delete_news', { p_id: Number(id) });
    if (error) {
        showToast(`❌ Gagal menghapus: ${rpcErrorMessage(error)}`);
        return;
    }
    if (String(editingNewsId) === String(id)) resetNewsForm();
    showToast('🗑️ Artikel dihapus.');
    loadWriterNews();
}

function renderWriterRow(item) {
    const badge = newsStatusBadge(item.status);
    const editable = item.status === 'pending' || item.status === 'rejected';

    return `
        <div class="rounded-2xl bg-white/[0.04] p-3.5 space-y-2">
            <div class="flex items-start justify-between gap-2">
                <h3 class="text-[13px] font-bold text-white leading-snug">${escapeHtml(item.title)}</h3>
                <span class="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.cls}">${badge.label}</span>
            </div>
            <div class="text-[10px] text-slate-500 uppercase tracking-wide">${escapeHtml(item.category)} · ${escapeHtml(newsTimeAgo(item.created_at))}</div>
            <p class="text-[11px] text-slate-400 news-clamp-2">${escapeHtml(newsExcerpt(item, 140))}</p>
            ${item.status === 'rejected' && item.reject_reason ? `
                <div class="rounded-lg bg-red-500/[0.08] p-2 text-[11px] text-red-300">
                    <span class="font-bold">Alasan CEO:</span> ${escapeHtml(item.reject_reason)}
                </div>
            ` : ''}
            <div class="flex items-center gap-1 pt-1 text-xs">
                ${editable ? `
                    <button onclick="editNews('${item.id}')" class="px-2 py-1 rounded-md text-slate-400 hover:text-white hover:bg-white/5 transition">✏️ Edit</button>
                    <button onclick="deleteWriterNews('${item.id}')" class="px-2 py-1 rounded-md text-slate-400 hover:text-red-300 hover:bg-white/5 transition">🗑️ Hapus</button>
                ` : ''}
                ${item.status === 'approved' ? `
                    <a href="${newsArticleLink(item.id)}" class="px-2 py-1 rounded-md text-slate-400 hover:text-emerald-300 hover:bg-white/5 transition">🔗 Lihat tayang</a>
                ` : ''}
            </div>
        </div>
    `;
}

async function loadWriterNews() {
    const container = document.getElementById('writerNewsList');
    if (!container || !isWriterLoggedIn) return;

    container.innerHTML = newsSkeleton(2);
    const { data, error } = await writerRpc('writer_list_news', {});

    if (error) {
        container.innerHTML = `<div class="rounded-xl bg-red-500/[0.06] p-4 text-[11px] text-red-300">${escapeHtml(rpcErrorMessage(error))}</div>`;
        return;
    }

    writerNewsData = (data || []).map(normalizeNews);

    if (writerNewsData.length === 0) {
        container.innerHTML = `<p class="text-[11px] text-slate-500 italic">Belum ada artikel. Tulis yang pertama di form atas.</p>`;
        return;
    }
    container.innerHTML = writerNewsData.map(renderWriterRow).join('');
}

function setCeoNewsFilter(filter) {
    playClickSound();
    triggerHaptic('light');
    ceoNewsFilter = filter;
    loadCeoNews();
}

function updateCeoFilterButtons() {
    document.querySelectorAll('[data-ceo-filter]').forEach(btn => {
        const active = btn.dataset.ceoFilter === ceoNewsFilter;
        btn.className = active
            ? 'news-chip news-chip-active'
            : 'news-chip';
        btn.setAttribute('aria-pressed', String(active));
    });
}

function renderCeoRow(item) {
    const badge = newsStatusBadge(item.status);
    return `
        <div class="rounded-2xl bg-white/[0.04] p-3.5 space-y-2">
            <div class="flex items-start justify-between gap-2">
                <h3 class="text-[13px] font-bold text-white leading-snug">${escapeHtml(item.title)}</h3>
                <span class="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.cls}">${badge.label}</span>
            </div>
            <div class="text-[10px] text-slate-500 uppercase tracking-wide">${escapeHtml(item.category)} · ✍️ ${escapeHtml(item.author_name)} · ${escapeHtml(newsTimeAgo(item.created_at))}</div>
            ${newsTagList(item).length ? `
                <div class="flex flex-wrap gap-1.5">
                    ${newsTagList(item).map(t => `<span class="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.06] text-slate-400">#${escapeHtml(t)}</span>`).join('')}
                </div>
            ` : ''}
            ${item.cover_url ? `
                <div class="rounded-xl overflow-hidden bg-black/30 max-h-40">
                    <img src="${escapeHtml(item.cover_url)}" alt="" class="w-full max-h-40 object-cover" loading="lazy" onerror="this.parentNode.style.display='none'">
                </div>
            ` : ''}
            <p class="text-[11px] text-slate-400 news-clamp-3">${escapeHtml(newsExcerpt(item, 220))}</p>
            <details class="text-[11px] text-slate-400">
                <summary class="cursor-pointer text-slate-400 hover:text-white transition">Baca isi lengkap</summary>
                <div class="news-prose mt-2 pt-2 border-t border-white/[0.06]">${renderNewsBody(item.body)}</div>
            </details>
            ${item.status === 'rejected' && item.reject_reason ? `
                <div class="rounded-lg bg-red-500/[0.08] p-2 text-[11px] text-red-300">
                    <span class="font-bold">Alasan penolakan:</span> ${escapeHtml(item.reject_reason)}
                </div>
            ` : ''}
            <div class="flex flex-wrap items-center gap-1 pt-1 text-xs">
                ${item.status !== 'approved' ? `
                    <button onclick="approveNews('${item.id}')" class="px-2.5 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-bold transition">✅ Setujui</button>
                ` : ''}
                ${item.status !== 'rejected' ? `
                    <button onclick="rejectNews('${item.id}')" class="px-2 py-1 rounded-md text-slate-400 hover:text-red-300 hover:bg-white/5 transition">❌ Tolak</button>
                ` : ''}
                ${item.status === 'approved' ? `
                    <button onclick="unpublishNews('${item.id}')" class="px-2 py-1 rounded-md text-slate-400 hover:text-amber-300 hover:bg-white/5 transition">⏸️ Tarik</button>
                ` : ''}
                <button onclick="deleteCeoNews('${item.id}')" class="px-2 py-1 rounded-md text-slate-400 hover:text-red-300 hover:bg-white/5 transition">🗑️ Hapus</button>
            </div>
        </div>
    `;
}

async function loadCeoNews() {
    const container = document.getElementById('ceoNewsList');
    if (!container || !isCeoLoggedIn) return;

    container.innerHTML = newsSkeleton(2);
    updateCeoFilterButtons();

    const args = ceoNewsFilter === 'all' ? {} : { p_status: ceoNewsFilter };
    const { data, error } = await ceoRpc('ceo_list_news', args);

    if (error) {
        container.innerHTML = `<div class="rounded-xl bg-red-500/[0.06] p-4 text-[11px] text-red-300">${escapeHtml(rpcErrorMessage(error))}</div>`;
        return;
    }

    ceoNewsData = (data || []).map(normalizeNews);

    if (ceoNewsData.length === 0) {
        container.innerHTML = `<p class="text-[11px] text-slate-500 italic">Tidak ada artikel pada filter ini.</p>`;
        return;
    }
    container.innerHTML = ceoNewsData.map(renderCeoRow).join('');
}

async function ceoSetStatus(id, status, reason) {
    const { error } = await ceoRpc('ceo_set_news_status', {
        p_id: Number(id),
        p_status: status,
        p_reason: reason || null,
    });
    if (error) {
        showToast(`❌ Gagal: ${rpcErrorMessage(error)}`);
        return false;
    }
    return true;
}

async function approveNews(id) {
    playClickSound();
    triggerHaptic('medium');
    if (await ceoSetStatus(id, 'approved')) {
        showToast('✅ Artikel disetujui & tayang.');
        loadCeoNews();
    }
}

async function rejectNews(id) {
    const reason = prompt('Alasan penolakan (akan terlihat oleh writer):');
    if (reason === null) return;
    playClickSound();
    if (await ceoSetStatus(id, 'rejected', reason.trim() || 'Tidak memenuhi kriteria redaksi.')) {
        showToast('❌ Artikel ditolak.');
        loadCeoNews();
    }
}

async function unpublishNews(id) {
    if (!confirm('Tarik artikel ini dari halaman publik?')) return;
    playClickSound();
    if (await ceoSetStatus(id, 'unpublished')) {
        showToast('⏸️ Artikel ditarik dari publik.');
        loadCeoNews();
    }
}

async function deleteCeoNews(id) {
    if (!confirm('Hapus artikel ini permanen?')) return;
    playClickSound();
    const { error } = await ceoRpc('ceo_delete_news', { p_id: Number(id) });
    if (error) {
        showToast(`❌ Gagal menghapus: ${rpcErrorMessage(error)}`);
        return;
    }
    showToast('🗑️ Artikel dihapus.');
    loadCeoNews();
}

// ── Bootstrap ────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
    // Isi dropdown kategori dari satu sumber (NEWS_CATEGORIES).
    const catSelect = document.getElementById('newsCategoryInput');
    if (catSelect && catSelect.options.length === 0) {
        catSelect.innerHTML = NEWS_CATEGORIES
            .map(c => `<option value="${escapeHtml(c)}" class="bg-[#0a0a0d]">${escapeHtml(c)}</option>`)
            .join('');
        catSelect.value = NEWS_CATEGORIES[0];
    }

    const heading = document.getElementById('headingNews');
    if (heading) heading.focus({ preventScroll: true });

    if (document.getElementById('newsListContainer')) fetchNews();
    if (document.getElementById('newsDetailContainer')) initNewsDetail();
});
