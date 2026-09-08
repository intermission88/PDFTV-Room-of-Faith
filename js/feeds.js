// ============================================================
// ROOM OF FAITH — FULL ONLINE MODE + SUPABASE REALTIME
// ============================================================
const FEEDS_TABLE = 'PDFTV Feeds';

let feedsData = [];
let currentFeedFilter = 'latest';
let feedSearchQuery = '';
let upvotedFeedIds = JSON.parse(localStorage.getItem('pdftv_upvoted_feeds') || '[]');
let feedsRealtimeChannel = null;
let isSubmitting = false;

// ── Utility ──────────────────────────────────────────────────
function cleanText(str) {
    if (!str) return '';
    return String(str)
        .replace(/[ \t]+/g, ' ')
        .replace(/\n\s*\n\s*\n+/g, '\n\n')
        .trim();
}

function normalizeItem(item) {
    return {
        ...item,
        alias: cleanText(item.alias),
        confession: cleanText(item.confession),
        upvotes: Number(item.upvotes || 0),
        comments: Array.isArray(item.comments)
            ? item.comments.map(c => cleanText(String(c)))
            : [],
        is_pinned: item.is_pinned === true || item.is_pinned === 'true'
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
    badge.className = `text-[8px] font-mono-custom font-bold px-2 py-0.5 rounded-full border ${c.cls} flex items-center gap-1`;
    badge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full ${c.dot}"></span> ${c.label}`;
}

// ── Fetch & Realtime ──────────────────────────────────────────
async function fetchFeeds() {
    const container = document.getElementById('feedsListContainer');
    if (!container) return;

    // Tampilkan loading state
    container.innerHTML = `
        <div class="p-8 text-center text-slate-400 font-mono-custom text-xs animate-pulse">
            ⏳ Menyambungkan ke Supabase...
        </div>
    `;
    updateFeedSyncBadge('loading');

    // Fetch semua data dari Supabase
    const { data, error } = await supabaseClient
        .from(FEEDS_TABLE)
        .select('*')
        .order('id', { ascending: false });

    if (error) {
        console.error('Supabase fetch error:', error);
        // Fallback ke INITIAL_FEEDS_DATA jika tabel belum dibuat di Supabase
        if (typeof INITIAL_FEEDS_DATA !== 'undefined' && INITIAL_FEEDS_DATA.length > 0) {
            feedsData = INITIAL_FEEDS_DATA.map(normalizeItem);
            updateFeedSyncBadge('connected');
            renderFeeds();
            return;
        }

        container.innerHTML = `
            <div class="glass p-6 rounded-2xl text-center border border-red-500/30 text-red-400 font-mono-custom text-xs space-y-2">
                <div class="text-2xl">🔌</div>
                <div class="font-bold">Gagal terhubung ke Supabase</div>
                <div class="text-slate-500 text-[10px]">${escapeHtml(error.message)}</div>
                <p class="text-[10px] text-amber-300 mt-1">💡 Pastikan tabel "PDFTV Feeds" sudah dibuat di Supabase menggunakan file <code>seed_feeds.sql</code>.</p>
                <button onclick="fetchFeeds()" class="mt-2 px-4 py-1.5 bg-red-500/20 border border-red-500/40 text-red-300 rounded-xl text-[10px] hover:bg-red-500/30 transition">
                    🔄 Coba Lagi
                </button>
            </div>
        `;
        updateFeedSyncBadge('error');
        return;
    }

    feedsData = (data || []).map(normalizeItem);
    updateFeedSyncBadge('connected');
    renderFeeds();

    // Pasang Realtime Subscription (hanya sekali)
    subscribeToRealtimeFeeds();
}

function subscribeToRealtimeFeeds() {
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
                    // Toast hanya kalau bukan dari diri sendiri (cek timestamp berbeda lebih dari 1 detik)
                    const diff = Math.abs(Date.now() - Number(newItem.id));
                    if (diff > 2000) {
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
    const btnPinned  = document.getElementById('filterBtnPinned');

    const active   = 'px-2.5 py-1 rounded-xl bg-white/10 text-white transition';
    const inactive = 'px-2.5 py-1 rounded-xl text-slate-400 hover:text-white transition';

    if (btnLatest)  btnLatest.className  = filter === 'latest'  ? active : inactive;
    if (btnPopular) btnPopular.className = filter === 'popular' ? active : inactive;
    if (btnPinned)  btnPinned.className  = filter === 'pinned'  ? active : inactive;

    renderFeeds();
}

function handleFeedSearch(e) {
    feedSearchQuery = (e.target.value || '').toLowerCase().trim();
    renderFeeds();
}

// ── Render ────────────────────────────────────────────────────
function renderFeeds() {
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
    } else if (currentFeedFilter === 'pinned') {
        filtered = filtered.filter(item => item.is_pinned);
    } else {
        // Latest: pinned di atas, lalu urutkan by timestamp desc
        filtered.sort((a, b) => {
            if (a.is_pinned && !b.is_pinned) return -1;
            if (!a.is_pinned && b.is_pinned) return 1;
            return (b.timestamp || b.id) - (a.timestamp || a.id);
        });
    }

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="glass p-6 rounded-2xl text-center border border-white/10 text-slate-400 font-mono-custom text-xs space-y-1">
                <div class="text-2xl">📭</div>
                <div>Tidak ada pengakuan yang ditemukan.</div>
            </div>
        `;
        return;
    }

    // Simpan drawer yang sedang terbuka sebelum re-render
    const openDrawers = new Set(
        [...document.querySelectorAll('[id^="comments-drawer-"]')]
            .filter(el => !el.classList.contains('hidden'))
            .map(el => el.id.replace('comments-drawer-', ''))
    );

    container.innerHTML = filtered.map(item => {
        const isPinned      = item.is_pinned;
        const commentsList  = Array.isArray(item.comments) ? item.comments : [];
        const timeAgoStr    = formatTimeAgo(item.timestamp || item.id);
        const hasUpvoted    = upvotedFeedIds.includes(String(item.id));
        const drawerOpen    = openDrawers.has(String(item.id));

        return `
            <div class="glass p-3.5 rounded-2xl border ${isPinned ? 'border-amber-500/50 bg-amber-950/10' : 'border-white/10'} shadow-xl space-y-2.5 relative overflow-hidden transition hover:border-white/20 text-left w-full">
                ${isPinned ? `
                    <div class="flex items-center gap-1 text-[9px] font-mono-custom font-bold text-amber-400 bg-amber-500/20 border border-amber-500/30 px-2 py-0.5 rounded-full w-fit">
                        📌 PINNED CONFESSION
                    </div>
                ` : ''}

                <div class="flex items-center justify-between text-left">
                    <div>
                        <h3 class="text-xs font-bold text-white font-mono-custom flex items-center gap-1 text-left">
                            ${escapeHtml(item.alias || 'Anonim')}
                        </h3>
                        <span class="text-[9px] text-slate-500 font-mono-custom block text-left">${timeAgoStr}</span>
                    </div>
                </div>

                <p class="text-xs text-slate-200 leading-relaxed font-sans whitespace-pre-wrap text-left break-words">
                    ${escapeHtml(item.confession)}
                </p>

                <div class="flex items-center justify-between pt-1 border-t border-white/5 text-[10px] font-mono-custom font-bold">
                    <button onclick="upvoteFeed('${item.id}')" class="flex items-center gap-1.5 px-3 py-1 rounded-full ${hasUpvoted ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 cursor-default' : 'bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-amber-400 active:scale-95'} transition text-[11px] font-medium">
                        <span>🔥</span>
                        <span>${item.upvotes} Upvote ${hasUpvoted ? '✓' : ''}</span>
                    </button>
                    <button onclick="toggleCommentsDrawer('${item.id}')" class="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition active:scale-95">
                        <span>💬</span>
                        <span>${commentsList.length} Komentar</span>
                    </button>
                </div>

                <!-- COMMENTS DRAWER -->
                <div id="comments-drawer-${item.id}" class="${drawerOpen ? '' : 'hidden'} pt-2 border-t border-white/10 space-y-2 text-left">
                    <div class="space-y-1 max-h-40 overflow-y-auto pr-1">
                        ${commentsList.length === 0
                            ? `<p class="text-[9px] text-slate-500 italic py-1 text-left font-mono-custom">Belum ada komentar. Jadilah yang pertama!</p>`
                            : commentsList.map(c => `
                                <div class="bg-white/5 border border-white/5 p-2 rounded-xl text-[10px] text-slate-300 font-mono-custom leading-tight text-left">
                                    💬 ${escapeHtml(c)}
                                </div>
                            `).join('')
                        }
                    </div>
                    <form onsubmit="addCommentToFeed('${item.id}', event)" class="flex gap-1.5 pt-1">
                        <input id="comment-input-${item.id}" type="text" placeholder="Tulis komentar..." required
                            class="flex-1 bg-black/50 border border-white/10 rounded-xl px-2.5 py-1 text-[10px] text-white placeholder-slate-500 focus:outline-none focus:border-white/30 font-mono-custom text-left">
                        <button type="submit" class="px-3 py-1 bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-300 border border-emerald-500/40 rounded-xl text-[9px] font-mono-custom font-bold transition active:scale-95">
                            Kirim
                        </button>
                    </form>
                </div>
            </div>
        `;
    }).join('');
}

// ── Submit Confession ─────────────────────────────────────────
async function submitConfession(e) {
    e.preventDefault();
    if (isSubmitting) return;

    const aliasInput   = cleanText(document.getElementById('feedAliasInput').value) || 'Anonim';
    const contentInput = cleanText(document.getElementById('feedContentInput').value);
    if (!contentInput) return;

    isSubmitting = true;
    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="animate-spin">⏳</span> Mengirim...';
    }

    try {
        const newId = Date.now();
        const { data, error } = await supabaseClient
            .from(FEEDS_TABLE)
            .insert([{
                id:        newId,
                alias:     aliasInput,
                confession: contentInput,
                upvotes:   0,
                comments:  [],
                timestamp: newId,
                is_pinned: false
            }])
            .select()
            .single();

        if (error) throw error;

        // Realtime akan auto-update, tapi kita tambahkan langsung supaya responsif
        const exists = feedsData.some(f => String(f.id) === String(data.id));
        if (!exists) {
            feedsData.unshift(normalizeItem(data));
            renderFeeds();
        }

        document.getElementById('feedContentInput').value = '';
        document.getElementById('feedAliasInput').value   = '';
        showToast('✨ Pengakuan berhasil dikirim!');
        playWinSound();
        triggerHaptic('heavy');

    } catch (err) {
        console.error('Submit confession error:', err);
        showToast(`❌ Gagal: ${err.message || 'Periksa koneksi / RLS Supabase'}`);
    } finally {
        isSubmitting = false;
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span>Kirim Pengakuan</span><span>🚀</span>';
        }
    }
}

// ── Upvote ────────────────────────────────────────────────────
async function upvoteFeed(id) {
    const idStr = String(id);
    if (upvotedFeedIds.includes(idStr)) {
        playBustSound();
        triggerHaptic('bust');
        showToast('⚠️ Kamu sudah memberikan upvote pada pengakuan ini!');
        return;
    }

    playClickSound();
    triggerHaptic('light');

    const post = feedsData.find(item => String(item.id) === idStr);
    if (!post) return;

    const newUpvotes = (post.upvotes || 0) + 1;

    // Optimistic update
    post.upvotes = newUpvotes;
    upvotedFeedIds.push(idStr);
    localStorage.setItem('pdftv_upvoted_feeds', JSON.stringify(upvotedFeedIds));
    renderFeeds();
    showToast('🔥 Upvote berhasil ditambahkan!');

    // Sync ke Supabase
    const { error } = await supabaseClient
        .from(FEEDS_TABLE)
        .update({ upvotes: newUpvotes })
        .eq('id', post.id);

    if (error) {
        console.warn('Supabase upvote error:', error);
        // Rollback optimistic update
        post.upvotes = newUpvotes - 1;
        upvotedFeedIds = upvotedFeedIds.filter(x => x !== idStr);
        localStorage.setItem('pdftv_upvoted_feeds', JSON.stringify(upvotedFeedIds));
        renderFeeds();
        showToast(`❌ Upvote gagal: ${error.message || 'Cek RLS policy Supabase'}`);
    }
}

// ── Comments ──────────────────────────────────────────────────
function toggleCommentsDrawer(id) {
    playClickSound();
    triggerHaptic('light');
    const drawer = document.getElementById(`comments-drawer-${id}`);
    if (drawer) drawer.classList.toggle('hidden');
}

async function addCommentToFeed(id, e) {
    e.preventDefault();
    const commentInput = document.getElementById(`comment-input-${id}`);
    if (!commentInput) return;

    const text = cleanText(commentInput.value);
    if (!text) return;

    playClickSound();
    triggerHaptic('medium');

    const post = feedsData.find(item => item.id == id);
    if (!post) return;

    if (!Array.isArray(post.comments)) post.comments = [];

    const updatedComments = [...post.comments, text];

    // Optimistic update
    post.comments = updatedComments;
    commentInput.value = '';
    renderFeeds();

    // Re-open drawer setelah render (supaya tidak tertutup)
    const drawer = document.getElementById(`comments-drawer-${id}`);
    if (drawer) drawer.classList.remove('hidden');

    // Sync ke Supabase
    const { error } = await supabaseClient
        .from(FEEDS_TABLE)
        .update({ comments: updatedComments })
        .eq('id', id);

    if (error) {
        console.warn('Supabase comment error:', error);
        showToast(`❌ Komentar gagal: ${error.message || 'Cek RLS policy Supabase'}`);
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

