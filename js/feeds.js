// ============================================================
// ROOM OF FAITH — FULL ONLINE MODE + SUPABASE REALTIME
// Dimuat di index.html (statistik) dan feeds/index.html (feed penuh).
// Status login moderator ada di core.js karena sesi lintas halaman.
// ============================================================
const FEEDS_TABLE = 'PDFTV Feeds';

let feedsData = [];
let currentFeedFilter = 'latest';
let feedSearchQuery = '';
let upvotedFeedIds = JSON.parse(localStorage.getItem('pdftv_upvoted_feeds') || '[]');
let feedsRealtimeChannel = null;
let isSubmitting = false;
let gifInputVisible = false;
let revealedNsfwIds = [];
let myPostIds = [];
let timeRefreshInterval = null;

// ── GIF Toggle ───────────────────────────────────────────────
function toggleGifInput() {
    gifInputVisible = !gifInputVisible;
    const container = document.getElementById('gifInputContainer');
    const toggleIcon = document.getElementById('gifToggleIcon');
    const toggleText = document.getElementById('gifToggleText');

    if (gifInputVisible) {
        container.classList.remove('hidden');
        toggleIcon.textContent = '−';
        toggleText.textContent = 'Sembunyikan GIF';
    } else {
        container.classList.add('hidden');
        toggleIcon.textContent = '+';
        toggleText.textContent = 'Tambah GIF';
    }
}

// ── Char Counter ─────────────────────────────────────────────
function updateCharCounter() {
    const ta = document.getElementById('feedContentInput');
    const counter = document.getElementById('feedCharCounter');
    if (!ta || !counter) return;
    const len = ta.value.length;
    if (len === 0) {
        counter.textContent = '';
        return;
    }
    counter.textContent = `${len}/500`;
    counter.className = 'text-right text-[10px] mt-1 h-3 ' + (len > 450 ? 'text-amber-400' : 'text-slate-500');
}

// ── GIF Preview ──────────────────────────────────────────────
function handleGifPreview() {
    const input = document.getElementById('feedGifInput');
    const container = document.getElementById('gifPreviewContainer');
    const img = document.getElementById('gifPreviewImg');
    const errorEl = document.getElementById('gifPreviewError');
    if (!input || !container || !img || !errorEl) return;

    const url = input.value.trim();
    errorEl.classList.add('hidden');
    if (!url || !/^https?:\/\/.+/.test(url)) {
        container.classList.add('hidden');
        return;
    }
    img.src = url;
    container.classList.remove('hidden');
}

// ── Utility ──────────────────────────────────────────────────
function cleanText(str) {
    if (!str) return '';
    return String(str)
        .replace(/^[ \t\n\r]+/, '')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n\s*\n\s*\n+/g, '\n\n')
        .trim();
}

function normalizeItem(item) {
    return {
        ...item,
        alias: cleanText(item.alias),
        confession: cleanText(item.confession),
        gif_url: (item.gif_url || '').trim(),
        upvotes: Number(item.upvotes || 0),
        comments: Array.isArray(item.comments)
            ? item.comments.map(c => cleanText(String(c)))
            : [],
        is_pinned: item.is_pinned === true || item.is_pinned === 'true',
        is_nsfw: item.is_nsfw === true || item.is_nsfw === 'true'
    };
}

// ── Badge ─────────────────────────────────────────────────────
function updateFeedSyncBadge(state) {
    // state: 'connected' | 'realtime' | 'error' | 'loading'
    const badge = document.getElementById('feedSyncBadge');
    if (!badge) return;
    const configs = {
        loading:   { cls: 'bg-slate-500/20 border-slate-500/40 text-slate-300',  dot: 'bg-slate-400 animate-pulse', label: 'MEMUAT...' },
        connected: { cls: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300', dot: 'bg-emerald-400 animate-ping', label: 'SUPABASE CONNECTED' },
        realtime:  { cls: 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300',     dot: 'bg-cyan-400 animate-ping',    label: '🔴 LIVE REALTIME' },
        error:     { cls: 'bg-red-500/20 border-red-500/40 text-red-300',        dot: 'bg-red-400',                  label: 'GAGAL TERHUBUNG' },
    };
    const c = configs[state] || configs.error;
    badge.className = `text-[10px] font-mono-custom font-bold px-2 py-0.5 rounded-full border ${c.cls} flex items-center gap-1`;
    badge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full ${c.dot}"></span> ${c.label}`;
}

// ── Fetch & Realtime ──────────────────────────────────────────

// Ambil data feeds TANPA merender (dipakai halaman landing untuk statistik).
// Tidak berlangganan realtime — landing tidak memerlukannya.
async function loadFeedsForStats() {
    try {
        const { data, error } = await supabaseClient
            .from(FEEDS_TABLE)
            .select('*')
            .order('id', { ascending: false });
        if (error) throw error;
        feedsData = (data || []).map(normalizeItem);
    } catch (err) {
        console.error('Gagal memuat statistik feeds:', err);
        if (typeof INITIAL_FEEDS_DATA !== 'undefined' && INITIAL_FEEDS_DATA.length > 0) {
            feedsData = INITIAL_FEEDS_DATA.map(normalizeItem);
        } else {
            return;
        }
    }
    updateHomeStatsUI();
}

async function fetchFeeds() {
    const container = document.getElementById('feedsListContainer');
    if (!container) return;

    // Tampilkan loading state
    container.innerHTML = [0, 1, 2].map(() => `
        <div class="skeleton-card p-4 space-y-2.5">
            <div class="flex items-center gap-2">
                <div class="skeleton-bar w-20 h-3"></div>
                <div class="skeleton-bar w-10 h-3"></div>
            </div>
            <div class="skeleton-bar w-full h-3"></div>
            <div class="skeleton-bar w-4/5 h-3"></div>
            <div class="skeleton-bar w-2/3 h-3"></div>
        </div>
    `).join('<div class="h-px bg-white/[0.06] my-4"></div>');
    setRefreshBtnLoading(true);
    updateFeedSyncBadge('loading');

    // Fetch semua data dari Supabase
    const { data, error } = await supabaseClient
        .from(FEEDS_TABLE)
        .select('*')
        .order('id', { ascending: false });

    if (error) {
        console.error('Supabase fetch error:', error);
        setRefreshBtnLoading(false);
        // Fallback ke INITIAL_FEEDS_DATA jika tabel belum dibuat di Supabase
        if (typeof INITIAL_FEEDS_DATA !== 'undefined' && INITIAL_FEEDS_DATA.length > 0) {
            feedsData = INITIAL_FEEDS_DATA.map(normalizeItem);
            updateFeedSyncBadge('connected');
            renderFeeds();
            return;
        }

        container.innerHTML = `
            <div class="rounded-xl bg-red-500/[0.06] p-6 text-center text-red-300 text-xs space-y-2 my-3">
                <div class="text-xl">🔌</div>
                <div class="font-medium">Gagal memuat pengakuan</div>
                <div class="text-slate-500 text-[11px]">${escapeHtml(error.message)}</div>
                <p class="text-[11px] text-slate-400 mt-1">💡 Pastikan tabel "PDFTV Feeds" sudah dibuat di Supabase menggunakan <code>seed_feeds.sql</code>.</p>
                <button onclick="fetchFeeds()" class="mt-2 px-4 py-1.5 bg-white/10 hover:bg-white/15 text-white rounded-lg text-xs transition">
                    Coba Lagi
                </button>
            </div>
        `;
        updateFeedSyncBadge('error');
        return;
    }

    feedsData = (data || []).map(normalizeItem);
    updateFeedSyncBadge('connected');
    renderFeeds();
    setRefreshBtnLoading(false);
    updateBlackjackTop5Stats();
    startTimeRefresh();

    // Pasang Realtime Subscription (hanya sekali)
    subscribeToRealtimeFeeds();
}

// Spinner state tombol refresh
function setRefreshBtnLoading(loading) {
    const btn = document.getElementById('feedRefreshBtn');
    if (!btn) return;
    if (loading) {
        btn.disabled = true;
        btn.classList.add('opacity-50', 'animate-spin');
    } else {
        btn.disabled = false;
        btn.classList.remove('opacity-50', 'animate-spin');
    }
}

// Auto-refresh label waktu ("x mnt yang lalu") tiap 60 detik tanpa re-render penuh
function startTimeRefresh() {
    if (timeRefreshInterval) return;
    timeRefreshInterval = setInterval(() => {
        document.querySelectorAll('.feed-time[data-ts]').forEach(el => {
            el.textContent = formatTimeAgo(Number(el.dataset.ts));
        });
    }, 60000);
}

function subscribeToRealtimeFeeds() {
    // Hanya halaman feeds yang butuh langganan realtime
    if (!document.getElementById('feedsListContainer')) return;
    // Kalau sudah subscribe, skip
    if (feedsRealtimeChannel) return;

    feedsRealtimeChannel = supabaseClient
        .channel('pdftv-feeds-live')
        .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: FEEDS_TABLE },
            (payload) => {
                const newItem = normalizeItem(payload.new);
                // Cek duplikat sebelum tambah
                const exists = feedsData.some(f => String(f.id) === String(newItem.id));
                if (!exists) {
                    feedsData.unshift(newItem);
                    renderFeeds();
                    // Jangan tampilkan toast untuk postingan sendiri
                    const ownIdx = myPostIds.indexOf(String(newItem.id));
                    if (ownIdx !== -1) {
                        myPostIds.splice(ownIdx, 1);
                    } else {
                        showToast('📨 Ada pengakuan baru masuk!');
                    }
                }
            }
        )
        .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: FEEDS_TABLE },
            (payload) => {
                const updated = normalizeItem(payload.new);
                const idx = feedsData.findIndex(f => String(f.id) === String(updated.id));
                if (idx !== -1) {
                    feedsData[idx] = updated;
                    renderFeeds();
                }
            }
        )
        .on(
            'postgres_changes',
            { event: 'DELETE', schema: 'public', table: FEEDS_TABLE },
            (payload) => {
                const delId = String(payload.old.id);
                const before = feedsData.length;
                feedsData = feedsData.filter(f => String(f.id) !== delId);
                if (feedsData.length !== before) {
                    renderFeeds();
                }
            }
        )
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                updateFeedSyncBadge('realtime');
            } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
                updateFeedSyncBadge('connected');
                feedsRealtimeChannel = null; // reset supaya bisa reconnect
            }
        });
}

// Unsubscribe kalau user keluar dari halaman feeds
function unsubscribeFeeds() {
    if (feedsRealtimeChannel) {
        supabaseClient.removeChannel(feedsRealtimeChannel);
        feedsRealtimeChannel = null;
    }
}

// ── Filter & Search ───────────────────────────────────────────
function setFeedFilter(filter) {
    playClickSound();
    triggerHaptic('light');
    currentFeedFilter = filter;

    const btnLatest  = document.getElementById('filterBtnLatest');
    const btnPopular = document.getElementById('filterBtnPopular');

    const active   = 'px-3 py-1.5 bg-white/10 text-white text-xs font-medium rounded-lg transition';
    const inactive = 'px-3 py-1.5 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-xs font-medium rounded-lg transition';

    if (btnLatest) {
        btnLatest.className  = filter === 'latest'  ? active : inactive;
        btnLatest.setAttribute('aria-pressed', String(filter === 'latest'));
    }
    if (btnPopular) {
        btnPopular.className = filter === 'popular' ? active : inactive;
        btnPopular.setAttribute('aria-pressed', String(filter === 'popular'));
    }

    renderFeeds();
}

function handleFeedSearch(e) {
    feedSearchQuery = (e.target.value || '').toLowerCase().trim();
    renderFeeds();
}

// ── Render ────────────────────────────────────────────────────
function renderFeeds() {
    updateHomeStatsUI();
    const container = document.getElementById('feedsListContainer');
    if (!container) return;

    let filtered = [...feedsData];

    if (feedSearchQuery) {
        filtered = filtered.filter(item =>
            (item.alias || '').toLowerCase().includes(feedSearchQuery) ||
            (item.confession || '').toLowerCase().includes(feedSearchQuery)
        );
    }

    if (currentFeedFilter === 'popular') {
        filtered.sort((a, b) => b.upvotes - a.upvotes);
    } else {
        // Latest: pinned di atas, lalu urutkan by timestamp desc
        filtered.sort((a, b) => {
            if (a.is_pinned && !b.is_pinned) return -1;
            if (!a.is_pinned && b.is_pinned) return 1;
            return (b.timestamp || b.id) - (a.timestamp || a.id);
        });
    }

    if (filtered.length === 0) {
        const isSearching = !!feedSearchQuery;
        container.innerHTML = `
            <div class="rounded-2xl bg-gradient-to-b from-emerald-500/[0.06] via-transparent to-transparent p-8 text-center space-y-3 my-3">
                <div class="text-3xl ${isSearching ? '' : 'animate-bounce'}">${isSearching ? '🔍' : '🕊️'}</div>
                <div class="text-sm font-bold text-white">${isSearching ? 'Tidak ditemukan' : 'Room masih sepi'}</div>
                <p class="text-xs text-slate-400 max-w-xs mx-auto">${isSearching
                    ? `Tidak ada pengakuan yang cocok dengan "<b class="text-slate-200">${escapeHtml(feedSearchQuery)}</b>". Coba kata kunci lain.`
                    : 'Jadilah yang pertama berbagi cerita atau pengakuan di sini.'}</p>
                ${!isSearching ? `
                    <button onclick="document.getElementById('feedContentInput').focus()" class="mt-1 px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 rounded-xl text-xs font-bold transition active:scale-95">
                        ✍️ Tulis Pengakuan
                    </button>
                ` : ''}
            </div>
        `;
        return;
    }

    container.innerHTML = filtered.map(item => {
        const isPinned      = item.is_pinned;
        const isNsfw        = item.is_nsfw === true || item.is_nsfw === 'true';
        const isRevealed    = revealedNsfwIds.includes(String(item.id));
        const showNsfwBlur  = isNsfw && !isRevealed;
        const commentsList  = Array.isArray(item.comments) ? item.comments : [];
        const timeAgoStr    = formatTimeAgo(item.timestamp || item.id);
        const hasUpvoted    = upvotedFeedIds.includes(String(item.id));

        return `
            <div class="feed-card rounded-2xl ${isPinned ? 'bg-amber-400/[0.06]' : isNsfw ? 'bg-red-300/[0.04]' : 'bg-white/[0.04]'} p-4 text-left w-full transition">
                ${isPinned ? `
                    <div class="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-amber-300/90 mb-2.5">
                        <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h12a1 1 0 011 1v13a1 1 0 01-1.4.9L12 15.9l-5.6 3A1 1 0 015 18V5a1 1 0 011-1z"/></svg>
                        Disematkan
                    </div>
                ` : ''}

                <div class="relative ${showNsfwBlur ? 'select-none pointer-events-none' : ''}">
                    <a href="p/?id=${encodeURIComponent(String(item.id))}" class="block text-left">
                        <div class="flex items-baseline gap-2 text-left">
                            <h3 class="text-sm font-semibold text-white text-left ${showNsfwBlur ? 'blur-[3px]' : ''}">${escapeHtml(item.alias || 'Anonim')}</h3>
                            ${isNsfw ? `<span class="text-[10px] uppercase tracking-wide text-red-300/80 bg-red-300/[0.06] px-1 py-px rounded self-center">18+</span>` : ''}
                            <span class="feed-time text-[11px] text-slate-500" data-ts="${Number(item.timestamp || item.id)}">${timeAgoStr}</span>
                        </div>

                        <div class="space-y-1 ${showNsfwBlur ? 'max-h-16 overflow-hidden blur-sm transition-all duration-300' : ''}">
                            ${item.confession ? `
                                <p class="text-[13px] text-slate-200 leading-relaxed font-sans whitespace-pre-wrap text-left break-words m-0 pt-0.5">${escapeHtml(item.confession)}</p>
                            ` : ''}
                            ${item.gif_url ? `
                                <div class="rounded-xl overflow-hidden bg-black/30 max-h-80 flex items-center justify-center">
                                    <img src="${escapeHtml(item.gif_url)}" alt="GIF" class="w-full max-h-80 object-contain rounded-xl cursor-zoom-in" loading="lazy" onclick="event.preventDefault(); event.stopPropagation(); openLightbox(this.src)" onerror="this.parentNode.style.display='none'">
                                </div>
                            ` : ''}
                        </div>
                    </a>

                    ${showNsfwBlur ? `
                        <button type="button" onclick="revealNsfw('${item.id}')" aria-label="Tampilkan konten sensitif" class="absolute inset-0 flex items-center justify-center cursor-pointer z-10 pointer-events-auto">
                            <span class="flex items-center gap-1.5 text-[10px] font-semibold text-slate-200 bg-white/10 backdrop-blur-sm rounded-full px-3.5 py-1.5 active:scale-95 transition">
                                🔒 Konten sensitif — klik untuk lihat
                            </span>
                        </button>
                    ` : ''}
                </div>

                ${isModeratorLoggedIn ? `
                    <div class="flex items-center gap-1 pt-3 mt-3 text-xs">
                        <button onclick="moderatorTogglePin('${item.id}', ${isPinned})" class="px-2 py-1 rounded-md text-slate-400 hover:text-amber-300 hover:bg-white/5 transition">
                            ${isPinned ? '📌 Lepas Pin' : '📌 Pin'}
                        </button>
                        <button onclick="moderatorToggleNsfw('${item.id}', ${isNsfw})" class="px-2 py-1 rounded-md text-slate-400 hover:text-white hover:bg-white/5 transition">
                            ${isNsfw ? '✅ SFW' : '🔞 NSFW'}
                        </button>
                        <button onclick="moderatorDeleteFeed('${item.id}')" class="px-2 py-1 rounded-md text-slate-400 hover:text-red-300 hover:bg-white/5 transition">
                            🗑️ Hapus
                        </button>
                    </div>
                ` : ''}

                <div class="flex items-center justify-between pt-3 mt-3 text-[13px] text-left">
                    <a href="p/?id=${encodeURIComponent(String(item.id))}" aria-label="Lihat komentar" class="flex items-center gap-1.5 ${commentsList.length ? 'text-slate-300' : 'text-slate-500'} hover:text-white transition">
                        <svg class="w-4 h-4" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M21 12c0 4.42-4.03 8-9 8a9.9 9.9 0 01-4.2-.9L3 20l1.05-3.3A7.9 7.9 0 013 12c0-4.42 4.03-8 9-8s9 3.58 9 8z"/></svg>
                        <span class="font-medium">${commentsList.length}</span>
                        <span class="text-xs text-slate-500 font-normal">Komentar</span>
                    </a>
                    <button onclick="upvoteFeed('${item.id}')" aria-label="Upvote" class="flex items-center gap-1.5 ${hasUpvoted ? 'text-amber-400' : 'text-slate-400 hover:text-amber-300'} transition">
                        <span class="text-xs text-slate-500 font-normal">${hasUpvoted ? 'Upvoted' : 'Upvote'}</span>
                        <span class="font-medium">${item.upvotes}</span>
                        <svg class="w-4 h-4" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7"/></svg>
                    </button>
                </div>
            </div>
        `;
    }).join('<div class="h-px bg-white/[0.06] my-4"></div>') + `
        <div class="py-8 text-center text-slate-500 text-xs space-y-1 mt-4">
            <div class="inline-block animate-bounce text-sm">⚓</div>
            <div class="text-slate-400">Semua pengakuan telah dimuat</div>
            <div class="text-[11px] text-slate-500">Anda telah mencapai akhir dari linimasa.</div>
        </div>
    `;
}

// ── Submit Confession ─────────────────────────────────────────
async function submitConfession(e) {
    e.preventDefault();
    if (isSubmitting) return;

    const aliasInput   = cleanText(document.getElementById('feedAliasInput').value) || 'Anonim';
    const contentInput = cleanText(document.getElementById('feedContentInput').value);
    const gifUrlInput  = cleanText(document.getElementById('feedGifInput')?.value || '');
    const isNsfwInput  = document.getElementById('feedNsfwCheckbox')?.checked || false;

    if (!contentInput && !gifUrlInput) {
        showToast('⚠️ Masukkan teks pengakuan atau link GIF terlebih dahulu.');
        return;
    }

    isSubmitting = true;
    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = 'Mengirim...';
    }

    try {
        // Semua penulisan lewat RPC: validasi, rate limit, dan id dibuat server.
        const rpcResult = await supabaseClient.rpc('insert_confession', {
            p_alias:     aliasInput,
            p_confession: contentInput,
            p_gif_url:   gifUrlInput,
            p_is_nsfw:   isNsfwInput
        });

        const data = rpcResult.data;
        const error = rpcResult.error;

        if (error) throw error;

        // Tandai sebagai postingan sendiri (supaya realtime tidak menampilkan toast)
        myPostIds.push(String(data.id));
        if (myPostIds.length > 50) myPostIds.shift();

        // Realtime akan auto-update, tapi kita tambahkan langsung supaya responsif
        const exists = feedsData.some(f => String(f.id) === String(data.id));
        if (!exists) {
            feedsData.unshift(normalizeItem(data));
            renderFeeds();
        }

        document.getElementById('feedContentInput').value = '';
        document.getElementById('feedAliasInput').value   = '';
        const gifInput = document.getElementById('feedGifInput');
        if (gifInput) gifInput.value = '';
        const gifPreview = document.getElementById('gifPreviewContainer');
        if (gifPreview) gifPreview.classList.add('hidden');
        const charCounter = document.getElementById('feedCharCounter');
        if (charCounter) charCounter.textContent = '';
        const nsfwBox = document.getElementById('feedNsfwCheckbox');
        if (nsfwBox) nsfwBox.checked = false;
        clearFeedDraft();
        showToast('✨ Pengakuan berhasil dikirim!', 'success');
        playWinSound();
        triggerHaptic('heavy');

    } catch (err) {
        console.error('Submit confession error:', err);
        showToast(`❌ Gagal: ${rpcErrorMessage(err)}`);
    } finally {
        isSubmitting = false;
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Kirim';
        }
    }
}

// isMissingRpcError & rpcErrorMessage sekarang tinggal di core.js (dipakai lintas halaman).

// ── Lapisan API bersama (dipakai halaman feeds dan halaman detail post) ──

// Ambil satu post berdasarkan id. Dipakai halaman detail /feeds/p/.
async function fetchFeedById(id) {
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) return null;

    try {
        const { data, error } = await supabaseClient
            .from(FEEDS_TABLE)
            .select('*')
            .eq('id', numericId)
            .maybeSingle();
        if (error) throw error;
        if (data) return normalizeItem(data);
    } catch (err) {
        console.error('Gagal memuat post:', err);
    }

    // Fallback: kalau Supabase tidak bisa dihubungi, coba data awal
    if (typeof INITIAL_FEEDS_DATA !== 'undefined') {
        const found = INITIAL_FEEDS_DATA.find(it => String(it.id) === String(id));
        if (found) return normalizeItem(found);
    }
    return null;
}

// Upvote lewat RPC atomik. Hanya untuk mengirim — UI diurus pemanggil.
async function sendUpvote(id, delta) {
    const { data, error } = await supabaseClient.rpc('increment_upvote', {
        p_id: Number(id),
        p_delta: delta
    });
    if (error) return { error };
    return { upvotes: typeof data === 'number' ? data : null };
}

// Kirim komentar lewat RPC atomik (anti timpa komentar user lain).
async function sendComment(id, text) {
    const { data, error } = await supabaseClient.rpc('append_comment', {
        p_id: Number(id),
        p_text: text
    });
    if (error) return { error };
    return { comments: Array.isArray(data) ? data : null };
}

function hasUpvotedFeed(id) {
    return upvotedFeedIds.includes(String(id));
}

// Balik status upvote di localStorage. Mengembalikan true bila sekarang ter-upvote.
function toggleLocalUpvote(idStr) {
    const wasUpvoted = upvotedFeedIds.includes(idStr);
    if (wasUpvoted) {
        upvotedFeedIds = upvotedFeedIds.filter(x => x !== idStr);
    } else {
        upvotedFeedIds.push(idStr);
    }
    // Cap ukuran localStorage agar tidak tumbuh tanpa batas
    if (upvotedFeedIds.length > 500) upvotedFeedIds = upvotedFeedIds.slice(-500);
    localStorage.setItem('pdftv_upvoted_feeds', JSON.stringify(upvotedFeedIds));
    return !wasUpvoted;
}

// ── Upvote (halaman feeds) ────────────────────────────────────
async function upvoteFeed(id) {
    const idStr = String(id);
    const post = feedsData.find(item => String(item.id) === idStr);
    if (!post) return;

    playClickSound();
    triggerHaptic('light');

    const wasUpvoted = hasUpvotedFeed(idStr);
    const delta = wasUpvoted ? -1 : 1;
    const newUpvotes = Math.max(0, (post.upvotes || 0) + delta);

    // Optimistic update
    const nowUpvoted = toggleLocalUpvote(idStr);
    post.upvotes = newUpvotes;
    showToast(nowUpvoted ? '🔥 Upvote ditambahkan!' : '🔥 Upvote dibatalkan.');
    renderFeeds();

    const result = await sendUpvote(id, delta);

    if (result.error) {
        // Rollback
        toggleLocalUpvote(idStr);
        post.upvotes = newUpvotes - delta;
        renderFeeds();
        showToast(`❌ Gagal: ${rpcErrorMessage(result.error)}`);
    } else if (typeof result.upvotes === 'number') {
        // Sinkronkan dengan nilai server (atomic, sudah termasuk upvote user lain)
        post.upvotes = result.upvotes;
        renderFeeds();
    }
}

// ── Time Format ───────────────────────────────────────────────
function formatTimeAgo(timestamp) {
    if (!timestamp) return 'Baru saja';
    const num = Number(timestamp);
    if (isNaN(num)) return String(timestamp);

    const diff = Math.floor((Date.now() - num) / 1000);

    if (diff < 60)      return 'Baru saja';
    if (diff < 3600)    return `${Math.floor(diff / 60)} mnt yang lalu`;
    if (diff < 86400)   return `${Math.floor(diff / 3600)} jam yang lalu`;
    if (diff < 2592000) return `${Math.floor(diff / 86400)} hari yang lalu`;

    return new Date(num).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Platform Stats ────────────────────────────────────────────
function updateHomeStatsUI() {
    const totalPosts = feedsData.length;
    let totalUpvotes = 0;
    let totalComments = 0;
    feedsData.forEach(item => {
        totalUpvotes += Number(item.upvotes || 0);
        totalComments += Array.isArray(item.comments) ? item.comments.length : 0;
    });

    const countEl = document.getElementById('statFeedsCount');
    const engEl = document.getElementById('statFeedsEngagement');
    if (countEl) countEl.innerText = `${totalPosts} Pengakuan`;
    if (engEl) engEl.innerText = `${totalUpvotes} Upvote · ${totalComments} Komentar`;
}

async function updateBlackjackTop5Stats() {
    const statEl = document.getElementById('statBlackjackTop5');
    if (!statEl) return;
    try {
        const { data, error } = await supabaseClient
            .from('PDFTV Blackjack Leaderboard')
            .select('streak_count')
            .order('streak_count', { ascending: false })
            .limit(5);

        if (error) throw error;
        let sum = 0;
        if (data && data.length > 0) {
            sum = data.reduce((acc, curr) => acc + Number(curr.streak_count || 0), 0);
        }
        statEl.innerText = `$${sum.toLocaleString()} 💵`;
    } catch (err) {
        console.warn('Failed to load blackjack top 5 stats:', err);
        statEl.innerText = '$0 💵';
    }
}

// ── Feeds Moderator & NSFW System ──────────────────────────────
// (state isModeratorLoggedIn, moderatorPass, revealedNsfwIds
//  dideklarasikan di bagian atas file)

function revealNsfw(id) {
    playClickSound();
    triggerHaptic('light');
    revealedNsfwIds.push(String(id));
    if (revealedNsfwIds.length > 500) revealedNsfwIds = revealedNsfwIds.slice(-500);
    // Status reveal murni lokal, jadi cukup render ulang (tanpa ambil data baru)
    if (document.getElementById('feedsListContainer')) renderFeeds();
    else if (typeof currentPost !== 'undefined' && currentPost) renderPostDetail();
}

// Segarkan tampilan yang sedang aktif setelah perubahan dari server
// (pin/NSFW). Di halaman detail, data diambil ulang agar benar-benar sinkron.
function refreshFeedView() {
    if (document.getElementById('feedsListContainer')) renderFeeds();
    else if (typeof refreshPostDetail === 'function') refreshPostDetail();
}

// Helper: eksekusi aksi moderator lewat RPC (verifikasi password server-side).
// Tidak ada jalur tulis langsung — tanpa RPC, aksi ditolak.
async function moderatorRpc(rpcName, rpcArgs) {
    return supabaseClient.rpc(rpcName, { p_pass: moderatorPass, ...rpcArgs });
}

async function moderatorTogglePin(id, currentPinned) {
    if (!isModeratorLoggedIn) {
        showToast("⚠️ Akses ditolak. Login sebagai moderator diperlukan.");
        return;
    }
    const newVal = !currentPinned;
    const result = await moderatorRpc('moderator_update_feed',
        { p_id: Number(id), p_is_pinned: newVal, p_is_nsfw: null }
    );

    if (result.error) {
        showToast(`❌ Gagal pin: ${result.error.message}`);
    } else {
        showToast(newVal ? "📌 Postingan berhasil di-pin!" : "📌 Pin postingan dilepas.");
        refreshFeedView();
    }
}

async function moderatorToggleNsfw(id, currentNsfw) {
    if (!isModeratorLoggedIn) {
        showToast("⚠️ Akses ditolak. Login sebagai moderator diperlukan.");
        return;
    }
    const newVal = !currentNsfw;
    const result = await moderatorRpc('moderator_update_feed',
        { p_id: Number(id), p_is_pinned: null, p_is_nsfw: newVal }
    );

    if (result.error) {
        showToast(`❌ Gagal update NSFW: ${result.error.message}`);
    } else {
        showToast(newVal ? "🔞 Postingan ditandai NSFW." : "✅ Postingan dikembalikan normal (SFW).");
        refreshFeedView();
    }
}

async function moderatorDeleteFeed(id) {
    if (!isModeratorLoggedIn) {
        showToast("⚠️ Akses ditolak. Login sebagai moderator diperlukan.");
        return;
    }
    if (!confirm("Yakin ingin menghapus pengakuan ini?")) return;
    const result = await moderatorRpc('moderator_delete_feed',
        { p_id: Number(id) }
    );

    if (result.error) {
        showToast(`❌ Gagal menghapus: ${result.error.message}`);
    } else {
        // Hapus langsung dari tampilan (realtime DELETE juga akan menangani klien lain)
        feedsData = feedsData.filter(f => String(f.id) !== String(id));
        showToast("🗑️ Postingan berhasil dihapus.");
        if (document.getElementById('feedsListContainer')) {
            renderFeeds();
        } else {
            // Dihapus dari halaman detail: post sudah tidak ada, kembali ke daftar
            setTimeout(() => { window.location.href = SITE_ROOT + 'feeds/'; }, 800);
        }
    }
}

// ── Draft Auto-Save & Lightbox ─────────────────────────────────
const FEED_DRAFT_KEY = 'pdftv_feed_draft';

function initFeedDraft() {
    const aliasInput = document.getElementById('feedAliasInput');
    const contentInput = document.getElementById('feedContentInput');
    const gifInput = document.getElementById('feedGifInput');
    if (!aliasInput || !contentInput) return;

    try {
        const draft = JSON.parse(localStorage.getItem(FEED_DRAFT_KEY) || '{}');
        if (draft.alias) aliasInput.value = draft.alias;
        if (draft.content) contentInput.value = draft.content;
        if (draft.gif && gifInput) gifInput.value = draft.gif;
    } catch (e) { /* draft korup, abaikan */ }

    const saveDraft = () => {
        localStorage.setItem(FEED_DRAFT_KEY, JSON.stringify({
            alias: aliasInput.value,
            content: contentInput.value,
            gif: gifInput ? gifInput.value : ''
        }));
    };
    aliasInput.addEventListener('input', saveDraft);
    contentInput.addEventListener('input', saveDraft);
    if (gifInput) gifInput.addEventListener('input', saveDraft);
}

function clearFeedDraft() {
    localStorage.removeItem(FEED_DRAFT_KEY);
}

function openLightbox(src) {
    let lb = document.getElementById('gifLightbox');
    if (!lb) {
        lb = document.createElement('div');
        lb.id = 'gifLightbox';
        lb.className = 'fixed inset-0 z-[90] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 cursor-zoom-out opacity-0 transition-opacity duration-200';
        lb.setAttribute('role', 'dialog');
        lb.setAttribute('aria-modal', 'true');
        lb.setAttribute('aria-label', 'Pratinjau GIF, klik atau tekan Escape untuk menutup');
        lb.tabIndex = -1;
        lb.innerHTML = '<img src="" alt="GIF" class="max-w-full max-h-[85vh] rounded-xl shadow-2xl">';
        lb.addEventListener('click', () => closeLightbox());
        document.body.appendChild(lb);
    }
    const img = lb.querySelector('img');
    img.src = src;
    requestAnimationFrame(() => {
        lb.style.opacity = '1';
        lb.focus();
    });
    document.body.style.overflow = 'hidden';
}

function closeLightbox() {
    const lb = document.getElementById('gifLightbox');
    if (!lb) return;
    lb.style.opacity = '0';
    document.body.style.overflow = '';
    setTimeout(() => lb.remove(), 200);
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeLightbox();
});

window.addEventListener('DOMContentLoaded', initFeedDraft);

// --- INIT HALAMAN FEEDS ---
// File ini juga dimuat di halaman landing, jadi inisialisasi dijaga
// oleh keberadaan elemen khas halaman feeds.
window.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('feedsListContainer')) fetchFeeds();

    const scrollTopBtn = document.getElementById('scrollTopBtn');
    if (scrollTopBtn) {
        window.addEventListener('scroll', () => {
            scrollTopBtn.classList.toggle('visible', window.scrollY > 400);
        }, { passive: true });
    }
});

// ── Pull-to-Refresh ─────────────────────────────────────────────
(function initPullToRefresh() {
    let touchStartY = null;
    let pulling = false;

    const getIndicator = () => {
        let el = document.getElementById('pullIndicator');
        if (!el) {
            el = document.createElement('div');
            el.id = 'pullIndicator';
            el.className = 'fixed top-14 left-1/2 -translate-x-1/2 z-40 text-emerald-300 text-lg transition-opacity duration-200 opacity-0 pointer-events-none';
            el.textContent = '⬇️';
            document.body.appendChild(el);
        }
        return el;
    };

    window.addEventListener('touchstart', (e) => {
        if (window.scrollY <= 0) {
            touchStartY = e.touches[0].clientY;
        }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
        if (touchStartY === null) return;
        const delta = e.touches[0].clientY - touchStartY;
        if (delta > 0) e.preventDefault(); // blokir pull-to-refresh native browser
        const indicator = getIndicator();
        if (delta > 70 && !pulling) {
            pulling = true;
            indicator.style.opacity = '1';
            indicator.style.transform = 'translate(-50%, 0) rotate(180deg)';
        }
    }, { passive: false });

    window.addEventListener('touchend', () => {
        const indicator = getIndicator();
        if (pulling) {
            pulling = false;
            indicator.style.opacity = '0';
            const activeView = !document.getElementById('viewFeeds').classList.contains('hidden') ? 'feeds'
                             : !document.getElementById('viewArcade').classList.contains('hidden') ? 'arcade'
                             : 'landing';
            if (activeView === 'feeds') {
                fetchFeeds();
                showToast('🔄 Feeds dimuat ulang');
            } else if (activeView === 'arcade' && typeof fetchLeaderboard === 'function') {
                fetchLeaderboard();
                showToast('🔄 Leaderboard dimuat ulang');
            }
        }
        touchStartY = null;
    });
})();

