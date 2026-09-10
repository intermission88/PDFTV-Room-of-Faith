// ============================================================
// PDFTV | Experience Room - logika landing, arcade, dan modal
// Dipisah dari index.html agar bisa di-cache browser.
// Dimuat sebagai script klasik di akhir <body>, setelah feeds.js.
// ============================================================
// --- KONFIGURASI SUPABASE ---
const SUPABASE_URL = 'https://fhpyvnbsreoaiaeqfkvk.supabase.co';
const SUPABASE_KEY = 'sb_publishable_aSPwcLUMW2y7r3nk6cpBpg_3DJH5sky';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const LEADERBOARD_TABLE = 'PDFTV Blackjack Leaderboard';

// --- HAPTIC FEEDBACK ENGINE ---
function triggerHaptic(type = 'light') {
    if (!('vibrate' in navigator)) return;
    switch(type) {
        case 'light': navigator.vibrate(12); break;
        case 'medium': navigator.vibrate(30); break;
        case 'heavy': navigator.vibrate(60); break;
        case 'gacha_tick': navigator.vibrate(15); break;
        case 'gacha_win': navigator.vibrate([40, 60, 40, 60, 100]); break;
        case 'boss_hit': navigator.vibrate([80, 40, 80]); break;
        case 'boss_defeat': navigator.vibrate([100, 50, 100, 50, 200, 50, 300]); break;
        case 'bust': navigator.vibrate([120, 80, 150]); break;
    }
}

// --- ADMIN SYSTEM & CHEAT ENGINE STATE ---
let isAdminLoggedIn = false;
let adminPass = null;
let cheatUnlimitedConsumables = false;

function toggleAdminModal(open) {
    playModalSound();
    triggerHaptic('light');
    const modal = document.getElementById('adminModal');
    if (open) {
        modal.classList.remove('hidden-modal');
        modal.classList.add('show-modal');
        document.getElementById('adminPasswordInput').value = '';
        // Fokus diurus a11yModalObserver (data-autofocus) agar pemicu asli tercatat untuk restore.
    } else {
        modal.classList.remove('show-modal');
        modal.classList.add('hidden-modal');
    }
}

// --- A11Y MODAL MANAGER: fokus masuk/keluar modal, trap Tab, Escape ---
const A11Y_FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const a11yModalStack = [];

const a11yModalObserver = new MutationObserver((mutations) => {
    mutations.forEach((m) => {
        const el = m.target;
        const shown = el.classList.contains('show-modal');
        const trackedIdx = a11yModalStack.findIndex((e) => e.el === el);
        if (shown && trackedIdx === -1) {
            a11yModalStack.push({ el, trigger: document.activeElement });
            const target = el.querySelector('[data-autofocus]') || el.querySelector(A11Y_FOCUSABLE);
            if (target) target.focus({ preventScroll: true });
            else el.focus({ preventScroll: true });
        } else if (!shown && trackedIdx !== -1) {
            const [entry] = a11yModalStack.splice(trackedIdx, 1);
            const trigger = entry && entry.trigger;
            if (trigger && document.contains(trigger) && trigger !== document.body) {
                trigger.focus({ preventScroll: true });
            }
        }
    });
});
['adminModal', 'passiveChoiceModal', 'bossRewardModal', 'dealerEncounterModal', 'scoreSubmitModal'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) a11yModalObserver.observe(el, { attributes: true, attributeFilter: ['class'] });
});

document.addEventListener('keydown', (e) => {
    // Escape: tutup lapisan teratas yang memang punya jalur tutup
    if (e.key === 'Escape') {
        const burgerDropdown = document.getElementById('burgerMenuDropdown');
        if (burgerDropdown && !burgerDropdown.classList.contains('hidden')) {
            toggleBurgerMenu(false);
            return;
        }
        const top = a11yModalStack[a11yModalStack.length - 1];
        if (top) {
            // Modal paksa-pilih (joker pasif, reward boss, gacha) sengaja tanpa Escape:
            // alur game mewajibkan pemain memilih salah satu opsi.
            if (top.el.id === 'adminModal') { e.preventDefault(); toggleAdminModal(false); }
            else if (top.el.id === 'scoreSubmitModal') { e.preventDefault(); closeScoreModal(); }
        }
        return;
    }
    // Tab: pengunci fokus di dalam modal teratas
    if (e.key === 'Tab') {
        const top = a11yModalStack[a11yModalStack.length - 1];
        if (!top) return;
        const focusables = [...top.el.querySelectorAll(A11Y_FOCUSABLE)];
        if (!focusables.length) { e.preventDefault(); top.el.focus(); return; }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        if (!top.el.contains(active)) { first.focus({ preventScroll: true }); e.preventDefault(); }
        else if (e.shiftKey && active === first) { last.focus({ preventScroll: true }); e.preventDefault(); }
        else if (!e.shiftKey && active === last) { first.focus({ preventScroll: true }); e.preventDefault(); }
    }
});

// Verifikasi password via RPC server-side (password tidak tersimpan di kode client).
// Tidak ada verifikasi lokal: jika RPC belum ada, login ditolak.
async function verifyPasswordServerSide(pass, rpcName) {
    const result = await supabaseClient.rpc(rpcName, { p_pass: pass });
    if (result.error && isMissingRpcError(result.error)) {
        return { ok: null }; // RPC belum tersedia
    }
    return { ok: result.data === true, error: result.error };
}

async function handleAdminLogin(e) {
    e.preventDefault();
    const passwordInput = document.getElementById('adminPasswordInput').value;
    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = 'Memverifikasi...';
    }

    let role = null;

    try {
        const adminCheck = await verifyPasswordServerSide(passwordInput, 'verify_admin');
        if (adminCheck.ok === true) {
            role = 'admin';
            adminPass = passwordInput;
        } else if (adminCheck.ok === null) {
            // Tidak ada verifikasi lokal. Password TIDAK boleh ada di kode client.
            playBustSound();
            alert("Verifikasi server belum aktif. Jalankan supabase_upgrade.sql di Supabase, lalu coba lagi.");
            return;
        } else {
            const modCheck = await verifyPasswordServerSide(passwordInput, 'verify_moderator');
            if (modCheck.ok === true) {
                role = 'moderator';
            }
        }

        if (role === 'admin') {
            isAdminLoggedIn = true;
            isModeratorLoggedIn = false;
            toggleAdminModal(false);
            updateAdminUI();
            playAdminSound();
            triggerHaptic('heavy');
            showToast("🔓 Akses Admin Blackjack (Cheat Panel) Aktif!");
        } else if (role === 'moderator') {
            isModeratorLoggedIn = true;
            isAdminLoggedIn = false;
            moderatorPass = passwordInput;
            toggleAdminModal(false);
            updateAdminUI();
            playAdminSound();
            triggerHaptic('heavy');
            showToast("🛡️ Akses Moderator Feeds (Pin & NSFW) Aktif!");
        } else {
            playBustSound();
            triggerHaptic('bust');
            alert("Password Admin / Moderator Salah!");
        }
    } catch (err) {
        console.error('Login error:', err);
        playBustSound();
        alert("Gagal memverifikasi: " + (err.message || "cek koneksi"));
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'MASUK ADMIN';
        }
    }
}

function handleAdminLogout() {
    playClickSound();
    triggerHaptic('light');
    isAdminLoggedIn = false;
    isModeratorLoggedIn = false;
    adminPass = null;
    cheatUnlimitedConsumables = false;
    updateAdminUI();
    showToast("🔒 Sesi Admin / Moderator Berakhir.");
}

function toggleBurgerMenu(open) {
    playClickSound();
    triggerHaptic('light');
    const dropdown = document.getElementById('burgerMenuDropdown');
    const btn = document.getElementById('btnBurgerMenu');
    if (!dropdown) return;
    let willOpen;
    if (typeof open === 'boolean') {
        willOpen = open;
        dropdown.classList.toggle('hidden', !open);
    } else {
        willOpen = dropdown.classList.contains('hidden');
        dropdown.classList.toggle('hidden', !willOpen);
    }
    if (btn) btn.setAttribute('aria-expanded', String(willOpen));
    if (willOpen) {
        const firstItem = dropdown.querySelector('button');
        if (firstItem) firstItem.focus();
    } else if (btn && document.activeElement && dropdown.contains(document.activeElement)) {
        btn.focus();
    }
}

function updateAdminUI() {
    const adminResetBtn = document.getElementById('adminResetLeaderboardBtn');
    const adminCheatPanel = document.getElementById('adminCheatPanel');
    const burgerAdminBadge = document.getElementById('burgerAdminBadge');
    const burgerAdminActions = document.getElementById('burgerAdminActions');

    if (isAdminLoggedIn) {
        if (burgerAdminBadge) {
            burgerAdminBadge.className = "text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold  ";
            burgerAdminBadge.textContent = "ADMIN (BLACKJACK)";
        }
        if (burgerAdminActions) burgerAdminActions.classList.remove('hidden');
        if (adminResetBtn) adminResetBtn.classList.remove('hidden');
        if (adminCheatPanel) adminCheatPanel.classList.remove('hidden');
    } else if (isModeratorLoggedIn) {
        if (burgerAdminBadge) {
            burgerAdminBadge.className = "text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-bold  ";
            burgerAdminBadge.textContent = "MODERATOR (FEEDS)";
        }
        if (burgerAdminActions) burgerAdminActions.classList.remove('hidden');
        if (adminResetBtn) adminResetBtn.classList.add('hidden');
        if (adminCheatPanel) adminCheatPanel.classList.add('hidden');
    } else {
        if (burgerAdminBadge) {
            burgerAdminBadge.className = "text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-slate-300";
            burgerAdminBadge.textContent = "Guest";
        }
        if (burgerAdminActions) burgerAdminActions.classList.add('hidden');
        if (adminResetBtn) adminResetBtn.classList.add('hidden');
        if (adminCheatPanel) adminCheatPanel.classList.add('hidden');
    }
    if (typeof renderFeeds === 'function') renderFeeds();
}

// --- BALATRO CHEAT FUNCTIONS ---
function cheatToggleUnlimitedConsumables() {
    playAdminSound();
    cheatUnlimitedConsumables = !cheatUnlimitedConsumables;
    const statusStr = cheatUnlimitedConsumables ? "ON" : "OFF";
    
    const txt = document.getElementById('textCheatConsumables');
    const txtBurger = document.getElementById('textCheatConsumablesBurger');
    if (txt) txt.textContent = statusStr;
    if (txtBurger) txtBurger.textContent = statusStr;

    const btn = document.getElementById('btnCheatConsumables');
    if (btn) btn.classList.toggle('bg-emerald-500/30', cheatUnlimitedConsumables);
    
    if (cheatUnlimitedConsumables) {
        discardCount = 99;
        busterCount = 99;
    }
    updateConsumableUI();
    showToast(`🧪 Unlimited Items: ${statusStr}`);
}

function cheatAddCash(amt) {
    playWinSound();
    totalCash += amt;
    if (totalCash > statsTracker.maxCash) statsTracker.maxCash = totalCash;
    updateUIStats();
    spawnFloatingMultiplier(`+$${amt}`, "CHEAT CASH");
    showToast(`💵 Cheat: +$${amt} Cash Added!`);
}

function cheatAddMultiplier(amt) {
    playJackpotSound();
    activeMultiplier = +(activeMultiplier + amt).toFixed(1);
    if (activeMultiplier > statsTracker.maxMult) statsTracker.maxMult = activeMultiplier;
    updateUIStats();
    spawnFloatingMultiplier(`+${amt}x`, "CHEAT MULT");
    showToast(`🔥 Cheat: +${amt}x Multiplier!`);
}

function cheatSkipToBoss() {
    playBossAlertSound();
    currentRound = 8;
    startNewGame();
    showToast(`⚔️ CHEAT: Lompat ke Ronde 8/8 (Boss Battle)!`);
}

function cheatInstantWin() {
    if (!isGameActive) startNewGame();
    endRound('win', '👑 CHEAT: Instant Round Win!');
}

function cheatAddShields(amt) {
    playShieldSound();
    shieldCount = Math.min(MAX_SHIELDS, shieldCount + amt);
    isShieldActive = true;
    updateShieldUI();
    showToast(`🛡️ CHEAT: Max ${shieldCount}/${MAX_SHIELDS} Shields!`);
}

async function adminResetLeaderboard() {
    playClickSound();
    if (!isAdminLoggedIn) return;
    if (confirm("⚠️ Yakin ingin menghapus seluruh Leaderboard?")) {
        try {
            // Hanya lewat RPC: reset langsung dari client tidak lagi diizinkan.
            const result = await supabaseClient.rpc('admin_reset_leaderboard', { p_pass: adminPass });
            if (result.error) throw result.error;
            showToast("🔄 Leaderboard berhasil direset!");
            fetchLeaderboard();
        } catch(e) {
            alert("Gagal reset leaderboard: " + e.message);
        }
    }
}

// --- TYPEWRITER ENGINE ---
const taglineText = '"IF EVERY MOMENT MATTERED, WOULD IT STILL BE LIKE THIS?"';
let taglineIndex = 0;

function typeWriter() {
    const el = document.getElementById("typewriterText");
    if (!el) return;

    // A11Y: ketik sekali lalu diamkan — teks hero tidak boleh menghapus dirinya sendiri.
    // Teks lengkap tersedia untuk screen reader lewat span .sr-only di dalam h1.
    if (taglineIndex <= taglineText.length) {
        el.textContent = taglineText.substring(0, taglineIndex);
        taglineIndex++;
        if (taglineIndex > taglineText.length) return;
        setTimeout(typeWriter, 45);
    }
}
typeWriter();

// --- BALATRO SYNTH AUDIO ENGINE & PROCEDURAL CHIPTUNE BGM (WEB AUDIO API) ---
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx;

function initAudio() {
    if (!audioCtx) audioCtx = new AudioCtx();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

// --- PROCEDURAL 8-BIT / LO-FI CASINO BGM ENGINE ---
let isBgmPlaying = false;
let bgmInterval = null;
let bgmStep = 0;

// Pentatonic chill casino arpeggio progression (in Hz)
const bgmNotes = [
    [261.63, 329.63, 392.00], // C major
    [293.66, 349.23, 440.00], // D minor
    [329.63, 392.00, 493.88], // E minor
    [349.23, 440.00, 523.25], // F major
    [392.00, 493.88, 587.33], // G major
    [440.00, 523.25, 659.25], // A minor
    [349.23, 440.00, 523.25], // F major
    [392.00, 493.88, 587.33]  // G major
];
const bassNotes = [130.81, 146.83, 164.81, 174.61, 196.00, 220.00, 174.61, 196.00];

function playBgmBeat() {
    if (!isBgmPlaying || !audioCtx) return;

    let chordIndex = Math.floor(bgmStep / 4) % bgmNotes.length;
    let noteInChord = bgmStep % 3;
    let currentFreq = bgmNotes[chordIndex][noteInChord];

    // 1. Chiptune melody note
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(currentFreq, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.18);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.18);

    // 2. Warm lo-fi bass on beat 1 & 3 of chord
    if (bgmStep % 4 === 0 || bgmStep % 4 === 2) {
        const bassOsc = audioCtx.createOscillator();
        const bassGain = audioCtx.createGain();
        bassOsc.type = 'sine';
        bassOsc.frequency.setValueAtTime(bassNotes[chordIndex], audioCtx.currentTime);
        bassGain.gain.setValueAtTime(0.08, audioCtx.currentTime);
        bassGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
        bassOsc.connect(bassGain);
        bassGain.connect(audioCtx.destination);
        bassOsc.start();
        bassOsc.stop(audioCtx.currentTime + 0.35);
    }

    bgmStep++;
}

function toggleBGM() {
    initAudio();
    isBgmPlaying = !isBgmPlaying;

    const btn = document.getElementById('btnBgmToggle');
    const icon = document.getElementById('bgmIcon');
    if (btn) btn.setAttribute('aria-pressed', String(isBgmPlaying));

    if (isBgmPlaying) {
        if (btn) btn.className = "w-8 h-8 rounded-xl bg-emerald-500/20   text-emerald-300 transition active:scale-95 flex items-center justify-center shadow-lg shadow-emerald-500/10";
        if (icon) icon.textContent = "🎶";
        bgmStep = 0;
        bgmInterval = setInterval(playBgmBeat, 240);
        showToast("🎵 BGM Chiptune Aktif!");
    } else {
        if (btn) btn.className = "w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10   text-slate-400 hover:text-white transition active:scale-95 flex items-center justify-center";
        if (icon) icon.textContent = "🎵";
        if (bgmInterval) {
            clearInterval(bgmInterval);
            bgmInterval = null;
        }
        showToast("🔇 BGM Dimatikan.");
    }
}

function playClickSound() {
    initAudio();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, audioCtx.currentTime + 0.04);
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.04);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.04);
}

function playModalSound() {
    initAudio();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.08);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.08);
}

function playCardSound() {
    initAudio();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1200, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, audioCtx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.08);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.08);
}

function playTensionCardSound() {
    initAudio();
    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc1.type = 'sawtooth';
    osc2.type = 'square';
    osc1.frequency.setValueAtTime(220, audioCtx.currentTime);
    osc1.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.18);
    osc2.frequency.setValueAtTime(330, audioCtx.currentTime);
    osc2.frequency.exponentialRampToValueAtTime(1320, audioCtx.currentTime + 0.18);
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.22);
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(audioCtx.destination);
    osc1.start();
    osc2.start();
    osc1.stop(audioCtx.currentTime + 0.22);
    osc2.stop(audioCtx.currentTime + 0.22);
}

function playDiscardSound() {
    initAudio();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(900, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(150, audioCtx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.12);
}

function playTaxSound() {
    initAudio();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(350, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(120, audioCtx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.15);
}

function playWinSound() {
    initAudio();
    const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51];
    notes.forEach((freq, idx) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.25, audioCtx.currentTime + idx * 0.07);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + idx * 0.07 + 0.35);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(audioCtx.currentTime + idx * 0.07);
        osc.stop(audioCtx.currentTime + idx * 0.07 + 0.35);
    });
}

function playBustSound() {
    initAudio();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.35);
    gain.gain.setValueAtTime(0.35, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.35);
}

function playBusterSound() {
    initAudio();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(450, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(90, audioCtx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.35, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
}

function playShieldSound() {
    initAudio();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.12);
}

function playBossAlertSound() {
    initAudio();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(250, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(60, audioCtx.currentTime + 0.5);
    gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.5);
}

function playAdminSound() {
    initAudio();
    const notes = [440, 880, 1320];
    notes.forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime + i * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + i * 0.06 + 0.2);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(audioCtx.currentTime + i * 0.06);
        osc.stop(audioCtx.currentTime + i * 0.06 + 0.2);
    });
}

function playGachaTickSound() {
    initAudio();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(800 + Math.random() * 400, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.04);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.04);
}

function playJackpotSound() {
    initAudio();
    const arpeggio = [440, 554.37, 659.25, 880, 1108.73, 1318.51, 1760];
    arpeggio.forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.25, audioCtx.currentTime + i * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + i * 0.06 + 0.4);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(audioCtx.currentTime + i * 0.06);
        osc.stop(audioCtx.currentTime + i * 0.06 + 0.4);
    });
}

function playBossDefeatSound() {
    initAudio();
    const freqs = [300, 200, 150, 100, 600, 900, 1200, 1600];
    freqs.forEach((freq, idx) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime + idx * 0.09);
        gain.gain.setValueAtTime(0.35, audioCtx.currentTime + idx * 0.09);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + idx * 0.09 + 0.3);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(audioCtx.currentTime + idx * 0.09);
        osc.stop(audioCtx.currentTime + idx * 0.09 + 0.3);
    });
}

function spawnCoins() {
    const emojis = ['💵', '🪙', '✨', '🔥', '👑', '🎰'];
    for (let i = 0; i < 18; i++) {
        const coin = document.createElement('div');
        coin.className = 'coin-particle';
        coin.textContent = emojis[Math.floor(Math.random() * emojis.length)];
        coin.style.left = (window.innerWidth / 2 + (Math.random() * 220 - 110)) + 'px';
        coin.style.top = (window.innerHeight / 2 + (Math.random() * 100 - 50)) + 'px';
        document.body.appendChild(coin);
        setTimeout(() => coin.remove(), 1200);
    }
}

function spawnFloatingMultiplier(cashText, multText) {
    const popup = document.createElement('div');
    popup.className = 'balatro-popup text-amber-400 font-pixel drop-shadow-[0_0_15px_rgba(245,158,11,0.8)]';
    popup.innerHTML = `
        <div class="text-xl sm:text-2xl text-amber-300 font-black">${cashText}</div>
        <div class="text-xs sm:text-sm text-rose-400 font-mono-custom font-bold">${multText}</div>
    `;
    popup.style.left = '50%';
    popup.style.top = (window.innerHeight / 2 - 20) + 'px';
    document.body.appendChild(popup);
    setTimeout(() => popup.remove(), 1400);
}

function spawnTaxPopup(taxText) {
    const popup = document.createElement('div');
    popup.className = 'tax-popup drop-shadow-[0_0_15px_rgba(239,68,68,0.9)]';
    popup.innerHTML = `
        <div class="text-lg sm:text-xl text-rose-400 font-black">${taxText}</div>
        <div class="text-[10px] text-red-300 font-mono-custom font-bold">GOVERNMENT TAX 5%</div>
    `;
    popup.style.left = '50%';
    popup.style.top = (window.innerHeight / 2 + 10) + 'px';
    document.body.appendChild(popup);
    setTimeout(() => popup.remove(), 1300);
}

function triggerScreenShake() {
    const card = document.getElementById('blackjackCard');
    card.classList.remove('shake-effect');
    void card.offsetWidth;
    card.classList.add('shake-effect');
}

function triggerWinPulse() {
    const card = document.getElementById('blackjackCard');
    card.classList.remove('win-pulse');
    void card.offsetWidth;
    card.classList.add('win-pulse');
}

function handleFeedsClick() {
    playClickSound();
    triggerHaptic('light');
    switchMode('feeds');
}

function triggerPageAnimation(targetEl) {
    targetEl.classList.remove('page-transition');
    void targetEl.offsetWidth; 
    targetEl.classList.add('page-transition');
}

function animateViewIn(el) {
    el.classList.remove('view-enter');
    void el.offsetWidth;
    el.classList.add('view-enter');
}

function switchMode(mode) {
    playClickSound();
    triggerHaptic('light');
    const viewLanding = document.getElementById('viewLanding');
    const viewFeeds = document.getElementById('viewFeeds');
    const viewArcade = document.getElementById('viewArcade');
    const tabHome = document.getElementById('tabHome');
    const tabFeeds = document.getElementById('tabFeeds');
    const tabArcade = document.getElementById('tabArcade');

    const activeClass = "flex-1 py-1.5 rounded-full text-white bg-white/10 transition-all text-center";
    const inactiveClass = "flex-1 py-1.5 rounded-full text-slate-400 hover:text-white transition-all text-center";

    if (mode === 'landing') {
        viewLanding.classList.remove('hidden');
        viewFeeds.classList.add('hidden');
        viewArcade.classList.add('hidden');
        animateViewIn(viewLanding);

        if (typeof unsubscribeFeeds === 'function') unsubscribeFeeds();

        tabHome.className = activeClass;
        tabFeeds.className = inactiveClass;
        tabArcade.className = inactiveClass;

        triggerPageAnimation(viewLanding);
    } else if (mode === 'feeds') {
        viewLanding.classList.add('hidden');
        viewFeeds.classList.remove('hidden');
        viewArcade.classList.add('hidden');
        animateViewIn(viewFeeds);

        tabHome.className = inactiveClass;
        tabFeeds.className = activeClass;
        tabArcade.className = inactiveClass;

        triggerPageAnimation(viewFeeds);
        fetchFeeds();
    } else if (mode === 'arcade') {
        viewLanding.classList.add('hidden');
        viewFeeds.classList.add('hidden');
        viewArcade.classList.remove('hidden');
        animateViewIn(viewArcade);

        if (typeof unsubscribeFeeds === 'function') unsubscribeFeeds();
        exitCasinoGame();

        tabHome.className = inactiveClass;
        tabFeeds.className = inactiveClass;
        tabArcade.className = activeClass;

        triggerPageAnimation(viewArcade);
        fetchLeaderboard();
    }
    // A11Y SPA navigation: retitle dokumen + pindahkan fokus ke heading view baru
    const viewMeta = {
        landing: { title: 'PDFTV | Experience Room', heading: 'headingLanding' },
        feeds:   { title: 'Room of Faith · PDFTV',  heading: 'headingFeeds' },
        arcade:  { title: 'Blackjack Arcade · PDFTV', heading: 'headingArcade' }
    };
    const meta = viewMeta[mode];
    if (meta) {
        document.title = meta.title;
        const headingEl = document.getElementById(meta.heading);
        if (headingEl) headingEl.focus({ preventScroll: true });
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function enterCasinoGame() {
    playClickSound();
    triggerHaptic('medium');
    const lobby = document.getElementById('arcadeLobby');
    const gameUI = document.getElementById('arcadeGameUI');

    lobby.classList.add('hidden');
    gameUI.classList.remove('hidden');
    triggerPageAnimation(gameUI);

    if (!isGameActive && playerHand.length === 0) {
        startNewGame();
    }
}

function exitCasinoGame() {
    playClickSound();
    triggerHaptic('light');
    const lobby = document.getElementById('arcadeLobby');
    const gameUI = document.getElementById('arcadeGameUI');

    gameUI.classList.add('hidden');
    lobby.classList.remove('hidden');
    triggerPageAnimation(lobby);
    fetchLeaderboard();
}

function toggleRulesAccordion() {
    playClickSound();
    triggerHaptic('light');
    const rules = document.getElementById('rulesAccordion');
    rules.classList.toggle('hidden');
}

function closeScoreModal() {
    playClickSound();
    triggerHaptic('light');
    const modal = document.getElementById('scoreSubmitModal');
    modal.classList.remove('show-modal');
    modal.classList.add('hidden-modal');
    resetSessionBuffs();
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    const styles = {
        success: 'bg-emerald-500 text-black',
        error:   'bg-red-500 text-white',
        info:    'bg-white text-black'
    };
    toast.className = toast.className.replace(/bg-\S+ text-\S+/, styles[type]);
    toast.textContent = message;
    toast.style.opacity = '1';
    toast.style.transform = 'translate(-50%, 10px)';
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translate(-50%, 0)';
    }, 2500);
}

// --- SLIDER ENGINE ---
let currentSlide = 0;
const totalSlides = 3;
const slider = document.getElementById('slider');
const dots = document.querySelectorAll('.dot-btn');
let slideInterval;

function updateSliderUI() {
    slider.style.transform = `translateX(-${currentSlide * 100}%)`;
    dots.forEach((dot, idx) => {
        const pill = dot.querySelector('.dot-pill');
        const isActive = idx === currentSlide;
        if (pill) {
            pill.classList.remove('opacity-40', 'w-1.5', 'opacity-100', 'w-3');
            pill.classList.add(isActive ? 'opacity-100' : 'opacity-40', isActive ? 'w-3' : 'w-1.5');
        }
        if (isActive) dot.setAttribute('aria-current', 'true');
        else dot.removeAttribute('aria-current');
    });
}

function nextSlide() { playClickSound(); currentSlide = (currentSlide + 1) % totalSlides; updateSliderUI(); resetTimer(); }
function prevSlide() { playClickSound(); currentSlide = (currentSlide - 1 + totalSlides) % totalSlides; updateSliderUI(); resetTimer(); }
function goToSlide(index) { playClickSound(); currentSlide = index; updateSliderUI(); resetTimer(); }
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
function startTimer() {
    // A11Y: carousel tidak menyala sendiri bila pengguna meminta gerakan minimal
    if (prefersReducedMotion.matches) return;
    slideInterval = setInterval(() => { currentSlide = (currentSlide + 1) % totalSlides; updateSliderUI(); }, 3500);
}
function resetTimer() { clearInterval(slideInterval); startTimer(); }
startTimer();

// ================= BALATRO-STYLE BLACKJACK GAMEPLAY LOGIC & 1/8 ANTE CYCLES =================
let shoeDeck = [];
let playerHand = [];
let dealerHand = [];
let isGameActive = false;

// BALATRO RUN ECONOMY & MULTIPLIERS (RESET ON LOSS / REFRESH)
let currentAnte = 1;
let currentRound = 1; // 1 to 8 (8 is BOSS BATTLE)
let totalCash = 0;
let activeMultiplier = 1.0;

let wins = 0;
let losses = 0;
let draws = 0;

// AEGIS SHIELD REBALANCE
const MAX_SHIELDS = 3;
let shieldCount = 1;
let isShieldActive = true;

// TACTICAL CONSUMABLES REBALANCE
const MAX_CONSUMABLES = 2;
let discardCount = 1;
let busterCount = 1;
let isBusterActiveThisRound = false;
let isDealerRevealed = false; 

// STATISTIK END-GAME TRACKER
let statsTracker = {
    aegisUsed: 0,
    discardUsed: 0,
    busterUsed: 0,
    maxMult: 1.0,
    maxCash: 0,
    highestAnte: 1
};

// BALATRO JOKER PASSIVES (3 SLOTS)
let availableJokers = ['jester', 'greedy', 'heartbreaker'];
let activeJokers = {
    jester: false,       // +0.5x Mult per win
    greedy: false,       // +50% Cash bounty per win
    heartbreaker: false  // Draw = Win
};

let isBossLevel = false;
let currentBoss = null;
let bossHP = 3;
let maxBossHP = 3;

// BOSSES INCLUDING "THE GOVERNMENT"
const BOSSES = [
    {
        name: "THE GOVERNMENT",
        avatar: "🏛️",
        perkDesc: "Pajak 5% Total Cash setiap kali Player menekan HIT!",
        perkType: "gov_tax_5pct"
    },
    {
        name: "SAMARITAN",
        avatar: "🥷",
        perkDesc: "Kartu ke-2 Player disembunyikan.",
        perkType: "blind_hold"
    },
    {
        name: "SUNARTO",
        avatar: "👑",
        perkDesc: "Tombol Stand dikunci jika poin di bawah 20!",
        perkType: "force_stand_20"
    },
    {
        name: "DON SALIERI",
        avatar: "🗿",
        perkDesc: "Batas BUST menjadi 30 (Samgong).",
        perkType: "samgong_burst"
    }
];

// --- DYNAMIC SHOE DECK & SHUFFLING ENGINE ---
function createShoeDeck() {
    const suits = ['♠', '♥', '♦', '♣'];
    const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const newShoe = [];
    
    // 4 Decks Continuous Shoe (208 Cards)
    for (let d = 0; d < 4; d++) {
        for (let suit of suits) {
            for (let val of values) {
                newShoe.push({ suit, value: val });
            }
        }
    }
    return shuffle(newShoe);
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function drawCardFromShoe() {
    if (shoeDeck.length < 15) {
        shoeDeck = createShoeDeck();
        showToast("🔀 Shoe Deck Diacak Ulang (Reshuffle)!");
    }
    return shoeDeck.pop();
}

function calculateScore(hand) {
    let score = 0;
    let aces = 0;
    for (let card of hand) {
        if (card.value === 'A') {
            aces += 1;
            score += 11;
        } else if (['K', 'Q', 'J'].includes(card.value)) {
            score += 10;
        } else {
            score += parseInt(card.value) || 0;
        }
    }
    while (score > 21 && aces > 0) {
        score -= 10;
        aces -= 1;
    }
    return score;
}

function getMaxBossHP(ante) {
    if (ante >= 3) return 5;
    if (ante === 2) return 4;
    return 3;
}

function renderJokerSlots() {
    const slotJester = document.getElementById('jokerSlotJester');
    const slotGreedy = document.getElementById('jokerSlotGreedy');
    const slotHeart = document.getElementById('jokerSlotHeart');

    if (activeJokers.jester) {
        slotJester.className = "joker-slot joker-active p-1.5 rounded-lg text-center flex flex-col items-center justify-center min-h-[46px]";
        slotJester.querySelector('.text-slate-400')?.classList.replace('text-slate-400', 'text-amber-300');
    } else {
        slotJester.className = "joker-slot p-1.5 rounded-lg text-center flex flex-col items-center justify-center min-h-[46px]";
    }

    if (activeJokers.greedy) {
        slotGreedy.className = "joker-slot joker-active p-1.5 rounded-lg text-center flex flex-col items-center justify-center min-h-[46px]";
        slotGreedy.querySelector('.text-slate-400')?.classList.replace('text-slate-400', 'text-amber-300');
    } else {
        slotGreedy.className = "joker-slot p-1.5 rounded-lg text-center flex flex-col items-center justify-center min-h-[46px]";
    }

    if (activeJokers.heartbreaker) {
        slotHeart.className = "joker-slot joker-active p-1.5 rounded-lg text-center flex flex-col items-center justify-center min-h-[46px]";
        slotHeart.querySelector('.text-slate-400')?.classList.replace('text-slate-400', 'text-purple-300');
    } else {
        slotHeart.className = "joker-slot p-1.5 rounded-lg text-center flex flex-col items-center justify-center min-h-[46px]";
    }
}

function renderCards() {
    const pCards = document.getElementById('playerCards');
    const dCards = document.getElementById('dealerCards');

    pCards.innerHTML = playerHand.map((c, idx) => {
        if (isBossLevel && currentBoss && currentBoss.perkType === 'blind_hold' && idx === 1 && isGameActive) {
            return `
                <div class="card-animate bg-gradient-to-tr from-slate-800 to-slate-900 text-rose-400 font-mono-custom font-bold w-10 h-14 rounded-lg   flex items-center justify-center shadow flex-shrink-0 text-base">
                    🔒
                </div>
            `;
        }
        return `
            <div class="card-animate bg-gradient-to-tr from-slate-100 to-white text-black font-mono-custom font-bold w-10 h-14 rounded-lg   flex flex-col justify-between p-1 shadow flex-shrink-0 text-center ${['♥','♦'].includes(c.suit) ? 'text-red-600' : 'text-slate-900'}">
                <div class="text-[10px] text-left leading-none">${c.value}</div>
                <div class="text-xs leading-none">${c.suit}</div>
                <div class="text-[10px] text-right leading-none">${c.value}</div>
            </div>
        `;
    }).join('');

    dCards.innerHTML = dealerHand.map((c, idx) => {
        if (idx === 1 && isGameActive && !isDealerRevealed) {
            return `
                <div class="card-animate bg-gradient-to-tr from-slate-800 to-slate-900 text-amber-400 font-mono-custom font-bold w-10 h-14 rounded-lg   flex items-center justify-center shadow flex-shrink-0 text-base">
                    ❓
                </div>
            `;
        }
        return `
            <div class="card-animate bg-gradient-to-tr from-slate-100 to-white text-black font-mono-custom font-bold w-10 h-14 rounded-lg   flex flex-col justify-between p-1 shadow flex-shrink-0 text-center ${['♥','♦'].includes(c.suit) ? 'text-red-600' : 'text-slate-900'}">
                <div class="text-[10px] text-left leading-none">${c.value}</div>
                <div class="text-xs leading-none">${c.suit}</div>
                <div class="text-[10px] text-right leading-none">${c.value}</div>
            </div>
        `;
    }).join('');

    if (isBossLevel && currentBoss && currentBoss.perkType === 'blind_hold' && isGameActive && playerHand.length >= 2) {
        let firstVal = playerHand[0].value;
        let visibleScore = ['K','Q','J'].includes(firstVal) ? 10 : (firstVal === 'A' ? 11 : parseInt(firstVal) || 0);
        document.getElementById('playerScore').textContent = `${visibleScore} + ?`;
    } else {
        document.getElementById('playerScore').textContent = calculateScore(playerHand);
    }

    if (isGameActive && dealerHand.length > 0 && !isDealerRevealed) {
        let firstVal = dealerHand[0].value;
        let hiddenVal = ['K','Q','J'].includes(firstVal) ? 10 : (firstVal === 'A' ? 11 : parseInt(firstVal) || 0);
        document.getElementById('dealerScore').textContent = `${hiddenVal} + ?`;
    } else {
        document.getElementById('dealerScore').textContent = calculateScore(dealerHand);
    }

    const btnStand = document.getElementById('btnStand');
    const pScore = calculateScore(playerHand);
    if (isBossLevel && currentBoss && currentBoss.perkType === 'force_stand_20' && isGameActive) {
        if (pScore < 20) {
            btnStand.disabled = true;
            btnStand.innerHTML = 'STAND 🔒 (MIN 20)';
            btnStand.classList.add('opacity-40');
        } else {
            btnStand.disabled = false;
            btnStand.innerHTML = 'STAND ✋';
            btnStand.classList.remove('opacity-40');
        }
    } else {
        if (isGameActive) {
            btnStand.disabled = false;
            btnStand.innerHTML = 'STAND ✋';
            btnStand.classList.remove('opacity-40');
        }
    }

    updateConsumableUI();
    renderJokerSlots();
}

function updateConsumableUI() {
    document.getElementById('countDiscard').textContent = cheatUnlimitedConsumables ? '∞' : `${discardCount}/${MAX_CONSUMABLES}`;
    document.getElementById('countBuster').textContent = cheatUnlimitedConsumables ? '∞' : `${busterCount}/${MAX_CONSUMABLES}`;

    const btnDiscard = document.getElementById('btnDiscard');
    const btnBust = document.getElementById('btnBuster');
    const lockTag = document.getElementById('consumablesLockedTag');

    if (isBossLevel && !cheatUnlimitedConsumables) {
        btnDiscard.disabled = true;
        btnBust.disabled = true;
        lockTag.classList.remove('hidden');
    } else {
        lockTag.classList.add('hidden');
        btnDiscard.disabled = !isGameActive || (discardCount <= 0 && !cheatUnlimitedConsumables) || playerHand.length === 0;
        btnBust.disabled = !isGameActive || (busterCount <= 0 && !cheatUnlimitedConsumables) || isBusterActiveThisRound;
    }
}

// --- BALATRO CONSUMABLE ACTIONS ---
function useDiscard() {
    if (isBossLevel && !cheatUnlimitedConsumables) return;
    if (!isGameActive || (discardCount <= 0 && !cheatUnlimitedConsumables) || playerHand.length === 0) return;
    
    playDiscardSound();
    triggerHaptic('medium');
    if (!cheatUnlimitedConsumables) discardCount--;
    statsTracker.discardUsed++;
    
    // Discard player's last card and draw a new one
    playerHand.pop();
    playerHand.push(drawCardFromShoe());
    showToast("🔄 DISCARD: Kartu terakhir diganti dari Shoe!");
    
    let limitBurst = (isBossLevel && currentBoss && currentBoss.perkType === 'samgong_burst') ? 30 : 21;
    let score = calculateScore(playerHand);
    renderCards();

    if (score > limitBurst) {
        endRound('loss_bust', `BUST! Melebihi ${limitBurst} 💥`);
    }
}

function useBuster() {
    if (isBossLevel && !cheatUnlimitedConsumables) return;
    if (!isGameActive || (busterCount <= 0 && !cheatUnlimitedConsumables) || isBusterActiveThisRound) return;
    
    playBusterSound();
    triggerHaptic('heavy');
    if (!cheatUnlimitedConsumables) busterCount--;
    statsTracker.busterUsed++;
    isBusterActiveThisRound = true;
    
    showToast("💣 BUSTER AKTIF! Dealer dipaksa menarik +1 kartu ekstra!");
    updateConsumableUI();
}

function startNewGame() {
    triggerHaptic('light');
    if (shoeDeck.length < 20) shoeDeck = createShoeDeck();

    playerHand = [drawCardFromShoe(), drawCardFromShoe()];
    dealerHand = [drawCardFromShoe(), drawCardFromShoe()];
    isGameActive = true;
    isDealerRevealed = false;
    isBusterActiveThisRound = false;

    // 1/8 ROUND BOSS CYCLE ENGINE
    if (currentRound === 8) {
        isBossLevel = true;
        maxBossHP = getMaxBossHP(currentAnte);
        if (!currentBoss || bossHP <= 0) {
            currentBoss = BOSSES[Math.floor(Math.random() * BOSSES.length)];
            bossHP = maxBossHP;
        }
    } else {
        isBossLevel = false;
        currentBoss = null;
    }

    const cardUI = document.getElementById('blackjackCard');
    const bossAlert = document.getElementById('bossAlertBanner');
    const tableTitle = document.getElementById('tableHeaderTitle');

    if (isBossLevel && currentBoss) {
        playBossAlertSound();
        triggerHaptic('boss_hit');
        cardUI.classList.add('boss-card-bg');
        bossAlert.classList.remove('hidden');
        document.getElementById('bossNameTitle').textContent = `${currentBoss.avatar} ${currentBoss.name}`;
        document.getElementById('bossPerkDescription').textContent = `PERK: ${currentBoss.perkDesc}`;
        updateBossHeartsUI();
        
        document.getElementById('dealerAvatar').textContent = currentBoss.avatar;
        document.getElementById('dealerTitleText').textContent = currentBoss.name;
        tableTitle.innerHTML = `<span class="text-rose-400 font-bold">⚔️ ANTE ${currentAnte} • BOSS BATTLE (${maxBossHP - bossHP + 1}/${maxBossHP})</span>`;
    } else {
        cardUI.classList.remove('boss-card-bg');
        bossAlert.classList.add('hidden');
        document.getElementById('dealerAvatar').textContent = "🎩";
        document.getElementById('dealerTitleText').textContent = "DEALER";
        tableTitle.innerHTML = `<span>🃏</span> ANTE ${currentAnte} • ROUND ${currentRound}/8`;
    }

    document.getElementById('gameStatus').textContent = "";
    document.getElementById('btnHit').disabled = false;
    document.getElementById('btnStand').disabled = false;
    document.getElementById('btnStart').disabled = true;

    playCardSound();
    renderCards();
    updateUIStats();

    let pScore = calculateScore(playerHand);
    if (pScore === 21) {
        endRound('win_bj', "NATURAL BLACKJACK! 🎉");
    }
}

function updateBossHeartsUI() {
    const container = document.getElementById('bossHeartsContainer');
    let hearts = '';
    for (let i = 0; i < maxBossHP; i++) {
        hearts += (i < bossHP) ? '❤️' : '🖤';
    }
    container.textContent = hearts;
}

function hit() {
    if (!isGameActive) return;
    
    // THE GOVERNMENT BOSS PERK: 5% CASH TAX PER HIT
    if (isBossLevel && currentBoss && currentBoss.perkType === 'gov_tax_5pct' && totalCash > 0) {
        let taxAmount = Math.max(1, Math.round(totalCash * 0.05));
        totalCash -= taxAmount;
        spawnTaxPopup(`-$${taxAmount.toLocaleString()} TAX`);
        playTaxSound();
        updateUIStats();
    }

    let prevScore = calculateScore(playerHand);
    playerHand.push(drawCardFromShoe());
    
    // TENSION AUDIO & ANIMATION ON 12-16 HIT ZONE
    if (prevScore >= 12 && prevScore <= 16) {
        playTensionCardSound();
        triggerHaptic('heavy');
    } else {
        playCardSound();
        triggerHaptic('light');
    }

    renderCards();

    let limitBurst = (isBossLevel && currentBoss && currentBoss.perkType === 'samgong_burst') ? 30 : 21;
    let score = calculateScore(playerHand);
    if (score > limitBurst) {
        endRound('loss_bust', `BUST! Melebihi ${limitBurst} 💥`);
    } else if (playerHand.length >= 5 && score <= 21) {
        endRound('win_charlie', "FIVE-CARD CHARLIE! 🌟");
    }
}

function stand() {
    if (!isGameActive) return;

    let pScore = calculateScore(playerHand);

    if (isBossLevel && currentBoss && currentBoss.perkType === 'force_stand_20' && pScore < 20) {
        playBustSound();
        triggerHaptic('bust');
        showToast("👑 SUNARTO: Poin di bawah 20 dilarang Stand!");
        return;
    }

    triggerHaptic('medium');
    isDealerRevealed = true;
    let dScore = calculateScore(dealerHand);

    // SCALING DEALER AI (Stand at 18 if Ante >= 3)
    let dealerStandThreshold = (currentAnte >= 3) ? 18 : 17;

    while (dScore < dealerStandThreshold) {
        dealerHand.push(drawCardFromShoe());
        dScore = calculateScore(dealerHand);
    }

    // REVAMPED BUSTER (OVERCHARGE DEALER FORCES +1 EXTRA HIT)
    if (isBusterActiveThisRound) {
        dealerHand.push(drawCardFromShoe());
        dScore = calculateScore(dealerHand);
        showToast("💣 BUSTER: Dealer dipaksa menarik 1 kartu ekstra!");
    }

    renderCards();

    let limitBurst = (isBossLevel && currentBoss && currentBoss.perkType === 'samgong_burst') ? 30 : 21;

    if (dScore > limitBurst) {
        endRound('win_dealer_bust', "DEALER BUST! Kamu Menang! 🎉");
    } else if (pScore > dScore) {
        endRound('win', "KAMU MENANG! 🔥");
    } else if (pScore < dScore) {
        endRound('loss', "DEALER MENANG! 🤖");
    } else {
        if (activeJokers.heartbreaker) {
            endRound('win_heartbreaker', "SERI! Heartbreaker Joker Aktif (Seri = Menang) 💔");
        } else {
            endRound('draw', "HASIL SERI! (PUSH) 🤝");
        }
    }
}

function toggleShield() {
    playShieldSound();
    triggerHaptic('light');
    if (shieldCount > 0) {
        isShieldActive = !isShieldActive;
        updateShieldUI();
    } else {
        showToast("⚠️ Kuota Shield Habis! (Dapatkan saat skor 21)");
    }
}

function updateShieldUI() {
    const badge = document.getElementById('shieldBadge');
    const btn = document.getElementById('btnShieldToggle');
    document.getElementById('shieldCount').textContent = `${shieldCount}/${MAX_SHIELDS}`;

    if (isShieldActive && shieldCount > 0) {
        badge.textContent = "ON";
        badge.className = "text-[10px] px-1 rounded font-mono-custom bg-emerald-500/20 text-emerald-300  ";
        btn.className = "px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider   bg-emerald-500/20 text-emerald-300 transition-all active:scale-95 shadow-[0_0_10px_rgba(16,185,129,0.2)]";
    } else {
        badge.textContent = "OFF";
        badge.className = "text-[10px] px-1 rounded font-mono-custom bg-slate-800 text-slate-400  ";
        btn.className = "px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider   bg-white/5 text-slate-400 transition-all active:scale-95";
    }
}

// --- SISTEM PEMILIHAN JOKER PASIF BOSS ---
function triggerPassiveChoiceModal() {
    playModalSound();
    const modal = document.getElementById('passiveChoiceModal');
    const container = document.getElementById('passiveButtonsContainer');
    const subtitle = document.getElementById('passiveModalSubtitle');
    
    container.innerHTML = '';

    if (availableJokers.length > 0) {
        subtitle.textContent = "Selamat! Pilih 1 Joker permanen untuk run ini:";
        
        if (availableJokers.includes('jester')) {
            container.innerHTML += `
                <button onclick="selectJoker('jester')" class="w-full p-2.5 bg-rose-500/10   hover:bg-rose-500/20 text-left rounded-xl transition group">
                    <div class="text-xs font-bold text-rose-300 font-mono-custom">🃏 The Jester (Red Joker)</div>
                    <div class="text-[10px] text-slate-300 mt-0.5">+0.5x Multiplier permanen setiap kali menang ronde!</div>
                </button>
            `;
        }
        if (availableJokers.includes('greedy')) {
            container.innerHTML += `
                <button onclick="selectJoker('greedy')" class="w-full p-2.5 bg-yellow-500/10   hover:bg-yellow-500/20 text-left rounded-xl transition group">
                    <div class="text-xs font-bold text-yellow-300 font-mono-custom">💰 Greedy Joker (Gold Joker)</div>
                    <div class="text-[10px] text-slate-300 mt-0.5">+50% Total Cash Reward setiap kali menang ronde!</div>
                </button>
            `;
        }
        if (availableJokers.includes('heartbreaker')) {
            container.innerHTML += `
                <button onclick="selectJoker('heartbreaker')" class="w-full p-2.5 bg-purple-500/10   hover:bg-purple-500/20 text-left rounded-xl transition group">
                    <div class="text-xs font-bold text-purple-300 font-mono-custom">💔 Heartbreaker (Purple Joker)</div>
                    <div class="text-[10px] text-slate-300 mt-0.5">Hasil Seri (Draw / Push) langsung dianggap sebagai Menang!</div>
                </button>
            `;
        }
    } else {
        subtitle.textContent = "Semua Joker utama sudah aktif! Pilih reward bounty ultimate:";
        container.innerHTML = `
            <button onclick="selectUltimateBonus('cash')" class="w-full p-3 bg-amber-500/20   hover:bg-amber-500/30 text-left rounded-xl transition group">
                <div class="text-xs font-bold text-amber-300 font-mono-custom">💵 +$1,000 Cash Bounty</div>
                <div class="text-[10px] text-slate-300 mt-0.5">Tambahan instan $1,000 ke total cash run saat ini.</div>
            </button>
            <button onclick="selectUltimateBonus('aegis')" class="w-full p-3 bg-emerald-500/20   hover:bg-emerald-500/30 text-left rounded-xl transition group">
                <div class="text-xs font-bold text-emerald-300 font-mono-custom">🛡️ +2 Aegis Shields</div>
                <div class="text-[10px] text-slate-300 mt-0.5">Tambahan 2 kuota pelindung kekalahan beruntun (Max 3).</div>
            </button>
        `;
    }

    modal.classList.remove('hidden-modal');
    modal.classList.add('show-modal');
}

function selectJoker(type) {
    playWinSound();
    triggerHaptic('heavy');
    
    if (type === 'jester') activeJokers.jester = true;
    if (type === 'greedy') activeJokers.greedy = true;
    if (type === 'heartbreaker') activeJokers.heartbreaker = true;

    availableJokers = availableJokers.filter(j => j !== type);

    const modal = document.getElementById('passiveChoiceModal');
    modal.classList.remove('show-modal');
    modal.classList.add('hidden-modal');

    showToast("✨ Joker Baru Diaktifkan!");
    updateUIStats();
}

function selectUltimateBonus(bonusType) {
    playWinSound();
    triggerHaptic('heavy');

    if (bonusType === 'cash') {
        totalCash += 1000;
        if (totalCash > statsTracker.maxCash) statsTracker.maxCash = totalCash;
        showToast("💵 +$1,000 Cash Berhasil Ditambahkan!");
    } else if (bonusType === 'aegis') {
        shieldCount = Math.min(MAX_SHIELDS, shieldCount + 2);
        isShieldActive = true;
        showToast("🛡️ +2 Aegis Shields Berhasil Ditambahkan!");
    }

    const modal = document.getElementById('passiveChoiceModal');
    modal.classList.remove('show-modal');
    modal.classList.add('hidden-modal');
    updateUIStats();
}

function triggerBossRewardModal() {
    playModalSound();
    const modal = document.getElementById('bossRewardModal');
    modal.classList.remove('hidden-modal');
    modal.classList.add('show-modal');
}

function chooseBossReward(itemType) {
    playWinSound();
    triggerHaptic('medium');
    if (itemType === 'discard') {
        discardCount = Math.min(MAX_CONSUMABLES, discardCount + 1);
        showToast("🔄 +1 Discard Ditambahkan!");
    } else if (itemType === 'buster') {
        busterCount = Math.min(MAX_CONSUMABLES, busterCount + 1);
        showToast("💣 +1 Buster Ditambahkan!");
    } else if (itemType === 'cash') {
        totalCash += 500;
        if (totalCash > statsTracker.maxCash) statsTracker.maxCash = totalCash;
        showToast("💵 +$500 Cash Bounty Diperoleh!");
    }

    const modal = document.getElementById('bossRewardModal');
    modal.classList.remove('show-modal');
    modal.classList.add('hidden-modal');
    updateConsumableUI();
    updateUIStats();
}

function triggerDealerEncounterModal() {
    playModalSound();
    const modal = document.getElementById('dealerEncounterModal');
    modal.classList.remove('hidden-modal');
    modal.classList.add('show-modal');
    document.getElementById('gachaRollBox').textContent = "Tekan Roll untuk Spin! 🎲";
    document.getElementById('btnSpinGacha').disabled = false;
}

function executeGachaRoll() {
    triggerHaptic('heavy');
    const rollBox = document.getElementById('gachaRollBox');
    const spinBtn = document.getElementById('btnSpinGacha');
    spinBtn.disabled = true;

    rollBox.classList.add('gacha-active');

    let counter = 0;
    const items = ["🔄 Discard", "💣 Buster", "💵 +$300 Cash", "🛡️ +1 Shield"];
    
    const spinInterval = setInterval(() => {
        const randomItem = items[Math.floor(Math.random() * items.length)];
        rollBox.textContent = randomItem;
        playGachaTickSound();
        triggerHaptic('gacha_tick');
        counter++;

        if (counter > 15) {
            clearInterval(spinInterval);
            rollBox.classList.remove('gacha-active');

            const wonItem = items[Math.floor(Math.random() * items.length)];
            rollBox.innerHTML = `✨ JACKPOT! <br><span class="text-amber-400 text-base font-bold">${wonItem}</span>`;
            
            playJackpotSound();
            triggerHaptic('gacha_win');
            spawnCoins();

            if (wonItem.includes("Discard")) discardCount = Math.min(MAX_CONSUMABLES, discardCount + 1);
            else if (wonItem.includes("Buster")) busterCount = Math.min(MAX_CONSUMABLES, busterCount + 1);
            else if (wonItem.includes("Cash")) {
                totalCash += 300;
                if (totalCash > statsTracker.maxCash) statsTracker.maxCash = totalCash;
            }
            else if (wonItem.includes("Shield")) {
                shieldCount = Math.min(MAX_SHIELDS, shieldCount + 1);
                isShieldActive = true;
            }

            updateConsumableUI();
            updateUIStats();

            setTimeout(() => {
                const modal = document.getElementById('dealerEncounterModal');
                modal.classList.remove('show-modal');
                modal.classList.add('hidden-modal');
            }, 1800);
        }
    }, 80);
}

// --- BALATRO SCORING & ROUND EVALUATION ENGINE ---
function endRound(result, message) {
    isGameActive = false;
    document.getElementById('btnHit').disabled = true;
    document.getElementById('btnStand').disabled = true;
    document.getElementById('btnStart').disabled = false;

    document.getElementById('gameStatus').textContent = message;

    let isWin = result.startsWith('win');
    let isLoss = result.startsWith('loss');

    if (isWin) {
        playWinSound();
        triggerWinPulse();
        spawnCoins();
        triggerHaptic('medium');

        // 1. Calculate Base Cash Reward
        let baseReward = 100;
        let pScore = calculateScore(playerHand);

        if (result === 'win_bj') baseReward = 400; // Natural BJ
        else if (result === 'win_charlie') baseReward = 600; // 5-Cards
        else if (pScore === 21) baseReward = 250; // Exact 21
        else if (result === 'win_dealer_bust') baseReward = 250; // Dealer Bust

        // 2. Card Combo Multipliers
        let roundMultiplier = activeMultiplier;
        
        // Check Suited Hand (all cards same suit)
        if (playerHand.length >= 2 && playerHand.every(c => c.suit === playerHand[0].suit)) {
            roundMultiplier *= 1.5;
        }
        // Check Pocket Pair (first 2 cards same value)
        if (playerHand.length >= 2 && playerHand[0].value === playerHand[1].value) {
            roundMultiplier *= 1.3;
        }
        // The Jester (+0.5x Mult)
        if (activeJokers.jester) roundMultiplier += 0.5;

        let finalRoundCash = Math.round(baseReward * roundMultiplier);
        
        // Greedy Joker (+50% Cash Reward)
        if (activeJokers.greedy) finalRoundCash = Math.round(finalRoundCash * 1.5);

        totalCash += finalRoundCash;
        wins++;

        // Momentum Multiplier Increment
        activeMultiplier = Math.min(10.0, +(activeMultiplier + 0.2).toFixed(1));
        if (activeMultiplier > statsTracker.maxMult) statsTracker.maxMult = activeMultiplier;
        if (totalCash > statsTracker.maxCash) statsTracker.maxCash = totalCash;

        spawnFloatingMultiplier(`+$${finalRoundCash}`, `×${roundMultiplier.toFixed(1)} MULT`);

        // Shield Gain Rule: Win with Score 21 gives +1 Shield (Up to Max 3)
        if (pScore === 21 && shieldCount < MAX_SHIELDS) {
            shieldCount++;
            showToast("🛡️ Nilai 21! +1 Aegis Shield Diperoleh!");
        }

        // 1/8 BOSS ROUND VICTORY HANDLING
        if (isBossLevel && currentBoss) {
            bossHP--;
            updateBossHeartsUI();

            if (bossHP <= 0) {
                spawnCoins();
                playBossDefeatSound();
                triggerScreenShake();
                triggerHaptic('boss_defeat');
                
                let bossBounty = 1500 * currentAnte;
                totalCash += bossBounty;
                showToast(`💥 VICTORY! BOSS ${currentBoss.name} TUMBANG! (+$${bossBounty})`);
                
                // BOSS TAX: -1 Shield sacrificed on Boss Defeat
                if (shieldCount > 0) {
                    shieldCount--;
                    showToast("🛡️ Boss Tax: 1 Shield dikorbankan!");
                }

                // ADVANCE ANTE & RESET TO ROUND 1
                currentAnte++;
                currentRound = 1;
                if (currentAnte > statsTracker.highestAnte) statsTracker.highestAnte = currentAnte;

                isBossLevel = false;
                currentBoss = null;

                setTimeout(() => {
                    triggerPassiveChoiceModal();
                    triggerBossRewardModal();
                }, 800);
            } else {
                showToast(`⚔️ Ronde Menang! Sisa HP Boss: ${bossHP} Hearts.`);
            }
        } else {
            // Regular round advances
            currentRound++;
            // Gacha encounter at Round 4
            if (currentRound === 4) {
                setTimeout(() => {
                    triggerDealerEncounterModal();
                }, 700);
            }
        }

    } else if (isLoss) {
        playBustSound();
        triggerScreenShake();
        triggerHaptic('bust');
        losses++;

        // Reset Momentum Multiplier
        activeMultiplier = 1.0;

        // AEGIS SHIELD USAGE & STREAK FATIGUE
        if (isShieldActive && shieldCount > 0) {
            // Streak Fatigue at Ante >= 3 deducts 2 shields
            let shieldsToDeduct = (currentAnte >= 3 && shieldCount >= 2) ? 2 : 1;
            shieldCount -= shieldsToDeduct;
            statsTracker.aegisUsed += shieldsToDeduct;

            if (shieldsToDeduct === 2) {
                showToast("🛡️ ANTE FATIGUE (Ante 3+): 2 Shield Digunakan! Cash Aman!");
            } else {
                showToast("🛡️ SHIELD DIGUNAKAN! Cash & Run Aman!");
            }

            if (shieldCount === 0) isShieldActive = false;
        } else {
            // RUN GAME OVER - RESET TOTAL CASH TO $0
            let endCash = totalCash;
            let endAnte = currentAnte;
            let endRoundNum = currentRound;

            totalCash = 0;
            activeMultiplier = 1.0;

            showScoreModal(endCash, endAnte, endRoundNum);
            resetSessionBuffs();
        }
    } else {
        draws++;
        playClickSound();
    }

    isBusterActiveThisRound = false;
    renderCards();
    updateUIStats();
}

function resetSessionBuffs() {
    currentAnte = 1;
    currentRound = 1;
    totalCash = 0;
    activeMultiplier = 1.0;
    shieldCount = 1;
    isShieldActive = true;
    
    if (!cheatUnlimitedConsumables) {
        discardCount = 1;
        busterCount = 1;
    }
    activeJokers = { jester: false, greedy: false, heartbreaker: false };
    availableJokers = ['jester', 'greedy', 'heartbreaker'];
    
    shoeDeck = createShoeDeck();
    isBossLevel = false;
    currentBoss = null;
    bossHP = 3;

    updateShieldUI();
    updateConsumableUI();
    updateUIStats();
}

function updateUIStats() {
    document.getElementById('totalCashText').textContent = `$${totalCash.toLocaleString()}`;
    document.getElementById('activeMultText').textContent = `×${activeMultiplier.toFixed(1)}`;
    document.getElementById('roundCounterText').innerHTML = `${currentRound}/8 <span class="text-[10px] text-amber-400">(A${currentAnte})</span>`;
    
    document.getElementById('statWLD').textContent = `${wins}-${losses}-${draws}`;

    let total = wins + losses + draws;
    document.getElementById('statTotal').textContent = total;

    let winrate = total > 0 ? Math.round((wins / total) * 100) : 0;
    document.getElementById('statWinrate').textContent = `${winrate}%`;

    updateShieldUI();
    renderJokerSlots();
}

let cashToSubmit = 0;

function showScoreModal(finalCash, finalAnte, finalRound) {
    playModalSound();
    cashToSubmit = finalCash;
    document.getElementById('finalCash').textContent = `$${finalCash.toLocaleString()}`;
    document.getElementById('finalAnteRound').textContent = `Ante ${finalAnte} • Round ${finalRound}/8`;
    
    // ISI DATA END-GAME STATISTICS
    document.getElementById('statEndAegis').textContent = statsTracker.aegisUsed;
    document.getElementById('statEndDiscard').textContent = statsTracker.discardUsed;
    document.getElementById('statEndBuster').textContent = statsTracker.busterUsed;
    document.getElementById('statEndMaxMult').textContent = `×${statsTracker.maxMult.toFixed(1)}`;
    document.getElementById('statEndMaxCash').textContent = `$${statsTracker.maxCash.toLocaleString()}`;

    const modal = document.getElementById('scoreSubmitModal');
    const nameContainer = document.getElementById('nameInputContainer');
    const submitBtn = document.getElementById('btnSubmitScore');
    const warningEl = document.getElementById('minScoreWarning');
    const nameInput = document.getElementById('playerName');

    if (finalCash < 500) {
        warningEl.classList.remove('hidden');
        nameContainer.classList.add('hidden');
        submitBtn.classList.add('hidden');
        nameInput.required = false;
    } else {
        warningEl.classList.add('hidden');
        nameContainer.classList.remove('hidden');
        submitBtn.classList.remove('hidden');
        nameInput.required = true;
        nameInput.value = '';
    }

    modal.classList.remove('hidden-modal');
    modal.classList.add('show-modal');
}

async function submitHighScore(e) {
    e.preventDefault();
    if (cashToSubmit < 500) return;

    playWinSound();
    triggerHaptic('heavy');
    const nameInput = document.getElementById('playerName').value.trim();

    if (nameInput) {
        try {
            // Skor dikirim lewat RPC: validasi rentang + rate limit di server.
            const { error } = await supabaseClient.rpc('submit_score', {
                p_name: nameInput,
                p_cash: Number(cashToSubmit)
            });

            if (error) throw error;

            showToast("🏆 Rekor Balatro Cash berhasil dicatat!");
            await fetchLeaderboard();
        } catch (err) {
            console.error('Error submitting score:', err);
            alert("Gagal mencatat rekor: " + rpcErrorMessage(err));
        }
    }

    closeScoreModal();
    exitCasinoGame();
}

async function fetchLeaderboard() {
    const listEl = document.getElementById('leaderboardList');
    try {
        const { data, error } = await supabaseClient
            .from(LEADERBOARD_TABLE)
            .select('*')
            .order('streak_count', { ascending: false })
            .limit(5);

        if (error) throw error;

        if (!data || data.length === 0) {
            listEl.innerHTML = `
                <div class="relative overflow-hidden p-4 rounded-2xl    bg-gradient-to-b from-emerald-500/10 via-black/40 to-transparent text-center space-y-2">
                    <div class="text-2xl animate-bounce">👑</div>
                    <div class="text-xs font-black text-amber-400 font-mono-custom uppercase">Papan Peringkat Kosong!</div>
                    <p class="text-[10px] text-slate-400 max-w-xs mx-auto">Jadilah pemain pertama yang mencatatkan rekor *Balatro Cash* di Hall of Fame!</p>
                </div>
            `;
            return;
        }

        listEl.innerHTML = data.map((item, index) => {
            const rankIcons = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
            const isTop1 = index === 0;
            return `
                <div class="flex items-center justify-between p-2 rounded-xl ${isTop1 ? 'gold-rank' : 'bg-white/[0.06]'} transition-all">
                    <div class="flex items-center gap-2">
                        <span class="text-base">${rankIcons[index] || '🎖️'}</span>
                        <span class="text-xs font-black ${isTop1 ? 'text-amber-300' : 'text-white'} font-mono-custom">${escapeHtml(item.player_name)}</span>
                    </div>
                    <span class="text-xs font-black text-amber-400 font-pixel">$${Number(item.streak_count || 0).toLocaleString()} 💵</span>
                </div>
            `;
        }).join('');

    } catch (err) {
        console.error("Gagal load leaderboard:", err);
        listEl.innerHTML = `<div class="text-center text-slate-500 text-xs py-3 italic">Gagal memuat leaderboard.</div>`;
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

window.addEventListener('DOMContentLoaded', () => {
    if (typeof fetchFeeds === 'function') fetchFeeds();
    if (typeof updateBlackjackTop5Stats === 'function') updateBlackjackTop5Stats();

    const scrollTopBtn = document.getElementById('scrollTopBtn');
    if (scrollTopBtn) {
        window.addEventListener('scroll', () => {
            scrollTopBtn.classList.toggle('visible', window.scrollY > 400);
        }, { passive: true });
    }
});

