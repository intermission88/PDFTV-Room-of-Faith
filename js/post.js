// ============================================================
// PDFTV | DETAIL POST (feeds/p/index.html)
// Menampilkan satu post beserta SELURUH komentarnya, dengan link
// yang bisa dibagikan (/feeds/p/?id=<id>).
// Memakai lapisan API bersama dari feeds.js — tidak ada RPC langsung.
// ============================================================

let currentPost = null;

// Ambil id dari query string. Hanya terima angka.
function getPostIdFromUrl() {
    const raw = new URLSearchParams(window.location.search).get('id');
    return raw && /^\d+$/.test(raw) ? raw : null;
}

function renderSkeletons() {
    return `
        <div class="skeleton-card p-4 space-y-2.5">
            <div class="flex items-center gap-2">
                <div class="skeleton-bar w-24 h-3"></div>
                <div class="skeleton-bar w-12 h-3"></div>
            </div>
            <div class="skeleton-bar w-full h-3"></div>
            <div class="skeleton-bar w-4/5 h-3"></div>
        </div>
    `;
}

function renderNotFound(reason) {
    const container = document.getElementById('postContainer');
    const isMissing = reason === 'missing';
    container.innerHTML = `
        <div class="rounded-2xl bg-gradient-to-b from-emerald-500/[0.06] via-transparent to-transparent p-8 text-center space-y-3">
            <div class="text-3xl" aria-hidden="true">${isMissing ? '🔗' : '🕊️'}</div>
            <h1 id="headingPost" tabindex="-1" class="text-sm font-bold text-white">${isMissing ? 'Link tidak lengkap' : 'Post tidak ditemukan'}</h1>
            <p class="text-xs text-slate-400 max-w-xs mx-auto">${isMissing
                ? 'Link ini tidak menyertakan kode post. Buka dari daftar Room of Faith.'
                : 'Post ini mungkin sudah dihapus, atau kodenya salah.'}</p>
            <a href="../" class="inline-block mt-1 px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 rounded-xl text-xs font-bold transition">
                ← Kembali ke Room of Faith
            </a>
        </div>
    `;
    document.title = `${isMissing ? 'Link tidak lengkap' : 'Post tidak ditemukan'} · Room of Faith | PDFTV`;
    document.getElementById('headingPost').focus({ preventScroll: true });
}

function renderPostDetail() {
    const item = currentPost;
    const container = document.getElementById('postContainer');

    const isPinned     = item.is_pinned;
    const isNsfw       = item.is_nsfw === true || item.is_nsfw === 'true';
    const isRevealed   = revealedNsfwIds.includes(String(item.id));
    const showNsfwBlur = isNsfw && !isRevealed;
    const comments     = Array.isArray(item.comments) ? item.comments : [];
    const hasUpvoted   = hasUpvotedFeed(item.id);
    const timeAgoStr   = formatTimeAgo(item.timestamp || item.id);
    const alias        = item.alias || 'Anonim';

    container.innerHTML = `
        <article class="rounded-2xl ${isPinned ? 'bg-amber-400/[0.06]' : isNsfw ? 'bg-red-300/[0.04]' : 'bg-white/[0.04]'} p-4 text-left">
            ${isPinned ? `
                <div class="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-amber-300/90 mb-2.5">
                    <svg class="w-3 h-3" aria-hidden="true" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h12a1 1 0 011 1v13a1 1 0 01-1.4.9L12 15.9l-5.6 3A1 1 0 015 18V5a1 1 0 011-1z"/></svg>
                    Disematkan
                </div>
            ` : ''}

            <div class="relative ${showNsfwBlur ? 'select-none' : ''}">
                <div class="flex items-baseline gap-2">
                    <h1 id="headingPost" tabindex="-1" class="text-sm font-semibold text-white ${showNsfwBlur ? 'blur-[3px]' : ''}">${escapeHtml(alias)}</h1>
                    ${isNsfw ? `<span class="text-[10px] uppercase tracking-wide text-red-300/80 bg-red-300/[0.06] px-1 py-px rounded self-center">18+</span>` : ''}
                    <span class="feed-time text-[11px] text-slate-500" data-ts="${Number(item.timestamp || item.id)}">${timeAgoStr}</span>
                </div>

                <div class="${showNsfwBlur ? 'max-h-16 overflow-hidden blur-sm' : ''}">
                    ${item.confession ? `
                        <p class="text-[13px] text-slate-200 leading-relaxed font-sans whitespace-pre-wrap break-words m-0 pt-1">${escapeHtml(item.confession)}</p>
                    ` : ''}
                    ${item.gif_url ? `
                        <div class="rounded-xl overflow-hidden bg-black/30 max-h-[70vh] flex items-center justify-center mt-2">
                            <img src="${escapeHtml(item.gif_url)}" alt="GIF" class="w-full max-h-[70vh] object-contain rounded-xl cursor-zoom-in" onclick="openLightbox(this.src)" onerror="this.parentNode.style.display='none'">
                        </div>
                    ` : ''}
                </div>

                ${showNsfwBlur ? `
                    <button type="button" onclick="revealNsfw('${item.id}')" aria-label="Tampilkan konten sensitif" class="absolute inset-0 flex items-center justify-center z-10">
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

            <div class="flex items-center justify-between pt-3 mt-3 text-[13px]">
                <span class="flex items-center gap-1.5 text-slate-400">
                    <svg class="w-4 h-4" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M21 12c0 4.42-4.03 8-9 8a9.9 9.9 0 01-4.2-.9L3 20l1.05-3.3A7.9 7.9 0 013 12c0-4.42 4.03-8 9-8s9 3.58 9 8z"/></svg>
                    <span class="font-medium">${comments.length}</span>
                    <span class="text-xs text-slate-500 font-normal">Komentar</span>
                </span>

                <div class="flex items-center gap-3">
                    <button onclick="upvoteDetail()" aria-pressed="${hasUpvoted}" aria-label="Upvote" class="flex items-center gap-1.5 ${hasUpvoted ? 'text-amber-400' : 'text-slate-400 hover:text-amber-300'} transition">
                        <span class="text-xs text-slate-500 font-normal">${hasUpvoted ? 'Upvoted' : 'Upvote'}</span>
                        <span class="font-medium">${item.upvotes}</span>
                        <svg class="w-4 h-4" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7"/></svg>
                    </button>

                    <button onclick="sharePost('${item.id}')" class="flex items-center gap-1.5 text-slate-400 hover:text-emerald-300 transition" aria-label="Bagikan link post ini">
                        <span class="text-xs font-medium">Bagikan</span>
                        <svg class="w-4 h-4" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8.7 10.7a3 3 0 100 2.6m0-2.6l6.6-3.4m-6.6 6l6.6 3.4M18 8a3 3 0 100-6 3 3 0 000 6zm-12 5a3 3 0 100 6 3 3 0 000-6z"/></svg>
                    </button>
                </div>
            </div>
        </article>

        <section class="rounded-2xl bg-white/[0.03] p-4 text-left" aria-labelledby="headingComments">
            <h2 id="headingComments" class="text-sm font-bold text-white mb-3">Semua Komentar</h2>

            <div class="space-y-1.5">
                ${comments.length === 0
                    ? `<p class="text-[11px] text-slate-500 italic">Belum ada komentar. Jadilah yang pertama.</p>`
                    : comments.map(c => `
                        <div class="bg-white/[0.06] p-2.5 rounded-lg text-[12px] text-slate-300 font-sans">${escapeHtml(c)}</div>
                    `).join('')
                }
            </div>

            <form onsubmit="submitDetailComment(event)" class="flex gap-2 pt-3">
                <label for="detailCommentInput" class="sr-only">Tulis komentar</label>
                <input id="detailCommentInput" type="text" placeholder="Tulis komentar..." required
                    class="flex-1 bg-white/[0.07] rounded-lg px-3 py-2 text-base sm:text-xs text-white placeholder-slate-500 focus:bg-white/[0.12] font-sans">
                <button type="submit" id="btnSubmitDetailComment" class="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-black rounded-lg transition">
                    Kirim
                </button>
            </form>
        </section>
    `;

    document.title = `Room of Faith · ${alias} | PDFTV`;
    const heading = document.getElementById('headingPost');
    if (heading && !showNsfwBlur) heading.focus({ preventScroll: true });
}

// Dipanggil feeds.js (revealNsfw, aksi moderator) saat halaman ini yang aktif.
// Mengambil ulang dari server supaya perubahan (pin/NSFW) benar-benar tercermin.
async function refreshPostDetail() {
    const id = getPostIdFromUrl();
    if (!id) return;

    const fresh = await fetchFeedById(id);
    if (!fresh) {
        currentPost = null;
        renderNotFound('notfound');
        return;
    }
    currentPost = fresh;
    renderPostDetail();
}

async function upvoteDetail() {
    if (!currentPost) return;

    playClickSound();
    triggerHaptic('light');

    const idStr = String(currentPost.id);
    const wasUpvoted = hasUpvotedFeed(idStr);
    const delta = wasUpvoted ? -1 : 1;
    const previousUpvotes = currentPost.upvotes || 0;

    // Optimistic update
    const nowUpvoted = toggleLocalUpvote(idStr);
    currentPost.upvotes = Math.max(0, previousUpvotes + delta);
    showToast(nowUpvoted ? '🔥 Upvote ditambahkan!' : '🔥 Upvote dibatalkan.');
    renderPostDetail();

    const result = await sendUpvote(currentPost.id, delta);

    if (result.error) {
        toggleLocalUpvote(idStr);
        currentPost.upvotes = previousUpvotes;
        renderPostDetail();
        showToast(`❌ Gagal: ${rpcErrorMessage(result.error)}`);
    } else if (typeof result.upvotes === 'number') {
        currentPost.upvotes = result.upvotes;
        renderPostDetail();
    }
}

async function submitDetailComment(e) {
    e.preventDefault();
    if (!currentPost) return;

    const input = document.getElementById('detailCommentInput');
    const text = cleanText(input.value);
    if (!text) return;

    const submitBtn = document.getElementById('btnSubmitDetailComment');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Mengirim...'; }

    playClickSound();
    triggerHaptic('medium');

    const result = await sendComment(currentPost.id, text);

    if (result.error) {
        showToast(`❌ Komentar gagal: ${rpcErrorMessage(result.error)}`);
    } else {
        if (Array.isArray(result.comments)) currentPost.comments = result.comments;
        showToast('💬 Komentar terkirim!');
        renderPostDetail();
        const newInput = document.getElementById('detailCommentInput');
        if (newInput) newInput.focus();
        return;
    }

    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Kirim'; }
}

async function sharePost(id) {
    const url = buildPostUrl(id);

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
        showToast('🔗 Link disalin!');
    } catch (err) {
        // Fallback terakhir bila clipboard diblokir
        prompt('Salin link ini:', url);
    }
}

window.addEventListener('DOMContentLoaded', async () => {
    const container = document.getElementById('postContainer');
    const id = getPostIdFromUrl();

    if (!id) {
        renderNotFound('missing');
        return;
    }

    container.innerHTML = renderSkeletons();
    currentPost = await fetchFeedById(id);

    if (!currentPost) {
        renderNotFound('notfound');
        return;
    }

    renderPostDetail();
});
