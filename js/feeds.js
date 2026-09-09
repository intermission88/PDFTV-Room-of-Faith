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
let gifInputVisible = false;

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
    badge.className = `text-[8px] font-mono-custom font-bold px-2 py-0.5 rounded-full border ${c.cls} flex items-center gap-1`;
    badge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full ${c.dot}"></span> ${c.label}`;
}

// ── Fetch & Realtime ──────────────────────────────────────────
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
    `).join('');
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
            <div class="rounded-xl border border-red-400/20 bg-white/[0.02] p-6 text-center text-red-300 text-xs space-y-2">
                <div class="text-xl">🔌</div>
                <div class="font-medium">Gagal memuat pengakuan</div>
                <div class="text-slate-500 text-[11px]">${escapeHtml(error.message)}</div>
                <p class="text-[11px] text-slate-400 mt-1">💡 Pastikan tabel "PDFTV Feeds" sudah dibuat di Supabase menggunakan <code>seed_feeds.sql</code>.</p>
                <button onclick="fetchFeeds()" class="mt-2 px-4 py-1.5 bg-white/10 hover:bg-white/15 border border-white/10 text-white rounded-lg text-xs transition">
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
    updateBlackjackTop5Stats();

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

    const active   = 'px-3 py-1.5 bg-white/10 text-white text-xs font-medium rounded-lg border border-white/10 transition';
    const inactive = 'px-3 py-1.5 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-xs font-medium rounded-lg border border-white/10 transition';

    if (btnLatest)  btnLatest.className  = filter === 'latest'  ? active : inactive;
    if (btnPopular) btnPopular.className = filter === 'popular' ? active : inactive;

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
            <div class="rounded-2xl border border-dashed border-emerald-500/25 bg-gradient-to-b from-emerald-500/[0.06] via-transparent to-transparent p-8 text-center space-y-3">
                <div class="text-3xl ${isSearching ? '' : 'animate-bounce'}">${isSearching ? '🔍' : '🕊️'}</div>
                <div class="text-sm font-bold text-white">${isSearching ? 'Tidak ditemukan' : 'Room masih sepi'}</div>
                <p class="text-xs text-slate-400 max-w-xs mx-auto">${isSearching
                    ? `Tidak ada pengakuan yang cocok dengan "<b class="text-slate-200">${escapeHtml(feedSearchQuery)}</b>". Coba kata kunci lain.`
                    : 'Jadilah yang pertama berbagi cerita atau pengakuan di sini.'}</p>
                ${!isSearching ? `
                    <button onclick="document.getElementById('feedContentInput').focus()" class="mt-1 px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 rounded-xl text-xs font-bold transition active:scale-95">
                        ✍️ Tulis Pengakuan
                    </button>
                ` : ''}
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
        const isNsfw        = item.is_nsfw === true || item.is_nsfw === 'true';
        const isRevealed    = revealedNsfwIds.includes(String(item.id));
        const showNsfwBlur  = isNsfw && !isRevealed;
        const commentsList  = Array.isArray(item.comments) ? item.comments : [];
        const timeAgoStr    = formatTimeAgo(item.timestamp || item.id);
        const hasUpvoted    = upvotedFeedIds.includes(String(item.id));
        const drawerOpen    = openDrawers.has(String(item.id));

        return `
            <div class="feed-card rounded-2xl border ${isPinned ? 'border-amber-400/30 bg-amber-400/[0.04]' : isNsfw ? 'border-red-300/[0.15]' : 'border-white/[0.07]'} bg-white/[0.03] p-4 text-left w-full transition">
                ${isPinned ? `
                    <div class="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-amber-300/90 mb-2.5">
                        <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h12a1 1 0 011 1v13a1 1 0 01-1.4.9L12 15.9l-5.6 3A1 1 0 015 18V5a1 1 0 011-1z"/></svg>
                        Disematkan
                    </div>
                ` : ''}

                <div class="relative">
                    <div class="${showNsfwBlur ? 'blur-md select-none pointer-events-none' : ''} space-y-1">
                        <div class="flex items-baseline gap-2 text-left">
                            <h3 class="text-sm font-semibold text-white text-left">${escapeHtml(item.alias || 'Anonim')}</h3>
                            ${isNsfw ? `<span class="text-[9px] uppercase tracking-wide text-red-300/80 border border-red-300/20 bg-red-300/[0.06] px-1.5 py-0.5 rounded self-center">18+</span>` : ''}
                            <span class="text-[11px] text-slate-500">${timeAgoStr}</span>
                        </div>
                        ${item.confession ? `
                            <p class="text-[13px] text-slate-200 leading-relaxed font-sans whitespace-pre-wrap text-left break-words m-0 pt-0.5">${escapeHtml(item.confession)}</p>
                        ` : ''}
                        ${item.gif_url ? `
                            <div class="rounded-xl overflow-hidden border border-white/10 bg-black/30 max-h-80 flex items-center justify-center">
                                <img src="${escapeHtml(item.gif_url)}" alt="GIF" class="w-full max-h-80 object-contain rounded-xl" loading="lazy" onerror="this.parentNode.style.display='none'">
                            </div>
                        ` : ''}
                    </div>

                    ${showNsfwBlur ? `
                        <div onclick="revealNsfw('${item.id}')" class="absolute inset-0 bg-black/50 hover:bg-black/60 rounded-xl flex flex-col items-center justify-center gap-2 p-3 text-center cursor-pointer transition z-10">
                            <div class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.06] border border-white/[0.08] text-slate-300">
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22"/></svg>
                                <span class="text-xs font-medium">Konten sensitif</span>
                            </div>
                            <span class="text-[11px] text-slate-500">Klik untuk menampilkan</span>
                        </div>
                    ` : ''}
                </div>

                ${isModeratorLoggedIn ? `
                    <div class="flex items-center gap-1 pt-3 mt-3 border-t border-white/[0.06] text-xs">
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

                <div class="flex items-center justify-between pt-3 mt-3 border-t border-white/[0.06] text-[13px] text-left">
                    <button onclick="toggleCommentsDrawer('${item.id}')" class="flex items-center gap-1.5 ${commentsList.length ? 'text-slate-300' : 'text-slate-500'} hover:text-white transition">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M21 12c0 4.42-4.03 8-9 8a9.9 9.9 0 01-4.2-.9L3 20l1.05-3.3A7.9 7.9 0 013 12c0-4.42 4.03-8 9-8s9 3.58 9 8z"/></svg>
                        <span class="font-medium">${commentsList.length}</span>
                        <span class="text-xs text-slate-500 font-normal">Komentar</span>
                    </button>
                    <button onclick="upvoteFeed('${item.id}')" class="flex items-center gap-1.5 ${hasUpvoted ? 'text-amber-400' : 'text-slate-400 hover:text-amber-300'} transition">
                        <span class="text-xs text-slate-500 font-normal">${hasUpvoted ? 'Upvoted' : 'Upvote'}</span>
                        <span class="font-medium">${item.upvotes}</span>
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7"/></svg>
                    </button>
                </div>

                <!-- COMMENTS DRAWER -->
                <div id="comments-drawer-${item.id}" class="${drawerOpen ? '' : 'hidden'} pt-3 mt-1 border-t border-white/[0.06] space-y-2 text-left">
                    <div class="space-y-1.5 max-h-44 overflow-y-auto pr-1 text-left">
                        ${commentsList.length === 0
                            ? `<p class="text-[11px] text-slate-500 italic text-left">Belum ada komentar.</p>`
                            : commentsList.map(c => `
                                <div class="bg-white/[0.04] border border-white/[0.06] p-2.5 rounded-lg text-[12px] text-slate-300 font-sans text-left">${escapeHtml(c)}</div>
                            `).join('')
                        }
                    </div>
                    <form onsubmit="addCommentToFeed('${item.id}', event)" class="flex gap-2 pt-0.5 text-left">
                        <input id="comment-input-${item.id}" type="text" placeholder="Tulis komentar..." required
                            class="flex-1 bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-white/20 font-sans text-left">
                        <button type="submit" class="px-3.5 py-2 bg-white/10 hover:bg-white/15 text-white rounded-lg text-xs font-medium transition">
                            Kirim
                        </button>
                    </form>
                </div>
            </div>
        `;
    }).join('') + `
        <div class="py-8 text-center text-slate-500 text-xs space-y-1 border-t border-white/[0.04] mt-4">
            <div class="inline-block animate-bounce text-sm">⚓</div>
            <div class="text-slate-400">Semua pengakuan telah dimuat</div>
            <div class="text-[11px] text-slate-600">Anda telah mencapai akhir dari linimasa.</div>
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
        const newId = Date.now();
        const { data, error } = await supabaseClient
            .from(FEEDS_TABLE)
            .insert([{
                id:        newId,
                alias:     aliasInput,
                confession: contentInput,
                gif_url:   gifUrlInput,
                upvotes:   0,
                comments:  [],
                timestamp: newId,
                is_pinned: false,
                is_nsfw:   isNsfwInput
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
        const gifInput = document.getElementById('feedGifInput');
        if (gifInput) gifInput.value = '';
        const nsfwBox = document.getElementById('feedNsfwCheckbox');
        if (nsfwBox) nsfwBox.checked = false;
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
            submitBtn.innerHTML = 'Kirim';
        }
    }
}

// ── Upvote ────────────────────────────────────────────────────
async function upvoteFeed(id) {
    const idStr = String(id);
    const post = feedsData.find(item => String(item.id) === idStr);
    if (!post) return;

    playClickSound();
    triggerHaptic('light');

    const hasUpvoted = upvotedFeedIds.includes(idStr);
    const newUpvotes = hasUpvoted ? Math.max(0, (post.upvotes || 0) - 1) : (post.upvotes || 0) + 1;

    // Optimistic update
    post.upvotes = newUpvotes;
    if (hasUpvoted) {
        upvotedFeedIds = upvotedFeedIds.filter(x => x !== idStr);
        showToast('🔥 Upvote dibatalkan.');
    } else {
        upvotedFeedIds.push(idStr);
        showToast('🔥 Upvote ditambahkan!');
    }
    localStorage.setItem('pdftv_upvoted_feeds', JSON.stringify(upvotedFeedIds));
    renderFeeds();

    // Sync ke Supabase
    const { error } = await supabaseClient
        .from(FEEDS_TABLE)
        .update({ upvotes: newUpvotes })
        .eq('id', post.id);

    if (error) {
        console.warn('Supabase upvote error:', error);
        // Rollback
        post.upvotes = hasUpvoted ? newUpvotes + 1 : newUpvotes - 1;
        if (hasUpvoted) {
            upvotedFeedIds.push(idStr);
        } else {
            upvotedFeedIds = upvotedFeedIds.filter(x => x !== idStr);
        }
        localStorage.setItem('pdftv_upvoted_feeds', JSON.stringify(upvotedFeedIds));
        renderFeeds();
        showToast(`❌ Gagal: ${error.message || 'Cek RLS policy Supabase'}`);
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
let isModeratorLoggedIn = false;
let revealedNsfwIds = [];

function revealNsfw(id) {
    playClickSound();
    triggerHaptic('light');
    revealedNsfwIds.push(String(id));
    renderFeeds();
}

async function moderatorTogglePin(id, currentPinned) {
    if (!isModeratorLoggedIn) {
        showToast("⚠️ Akses ditolak. Login sebagai moderator (rusdi123) diperlukan.");
        return;
    }
    const newVal = !currentPinned;
    const { error } = await supabaseClient
        .from(FEEDS_TABLE)
        .update({ is_pinned: newVal })
        .eq('id', id);

    if (error) {
        showToast(`❌ Gagal pin: ${error.message}`);
    } else {
        showToast(newVal ? "📌 Postingan berhasil di-pin!" : "📌 Pin postingan dilepas.");
        fetchFeeds();
    }
}

async function moderatorToggleNsfw(id, currentNsfw) {
    if (!isModeratorLoggedIn) {
        showToast("⚠️ Akses ditolak. Login sebagai moderator (rusdi123) diperlukan.");
        return;
    }
    const newVal = !currentNsfw;
    const { error } = await supabaseClient
        .from(FEEDS_TABLE)
        .update({ is_nsfw: newVal })
        .eq('id', id);

    if (error) {
        showToast(`❌ Gagal update NSFW: ${error.message}`);
    } else {
        showToast(newVal ? "🔞 Postingan ditandai NSFW." : "✅ Postingan dikembalikan normal (SFW).");
        fetchFeeds();
    }
}

async function moderatorDeleteFeed(id) {
    if (!isModeratorLoggedIn) {
        showToast("⚠️ Akses ditolak. Login sebagai moderator (rusdi123) diperlukan.");
        return;
    }
    if (!confirm("Yakin ingin menghapus pengakuan ini?")) return;
    const { error } = await supabaseClient
        .from(FEEDS_TABLE)
        .delete()
        .eq('id', id);

    if (error) {
        showToast(`❌ Gagal menghapus: ${error.message}`);
    } else {
        showToast("🗑️ Postingan berhasil dihapus.");
        fetchFeeds();
    }
}

