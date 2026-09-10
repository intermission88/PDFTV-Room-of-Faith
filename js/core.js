// ============================================================
// PDFTV | EXPERIENCE ROOM - FONDASI BERSAMA
// Dimuat di SEMUA halaman: konfigurasi Supabase, haptic, audio/BGM/SFX,
// toast, manajer modal a11y, autentikasi admin, dan util.
// Harus dimuat SEBELUM feeds.js / landing.js / arcade.js.
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
// Status moderator ikut di sini (bukan di feeds.js) karena sesi harus
// bertahan saat berpindah halaman.
let isAdminLoggedIn = false;
let isModeratorLoggedIn = false;
let adminPass = null;
let moderatorPass = null;
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
// Modal admin disuntik dari sini agar tidak diduplikasi di setiap halaman.
// Penting: injeksi HARUS terjadi sebelum observer didaftarkan di bawah.
injectSharedModals();

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
            saveSession();
        } else if (role === 'moderator') {
            isModeratorLoggedIn = true;
            isAdminLoggedIn = false;
            moderatorPass = passwordInput;
            toggleAdminModal(false);
            updateAdminUI();
            playAdminSound();
            triggerHaptic('heavy');
            showToast("🛡️ Akses Moderator Feeds (Pin & NSFW) Aktif!");
            saveSession();
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
    moderatorPass = null;
    cheatUnlimitedConsumables = false;
    saveSession();
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
    saveBgmPreference();

    const btn = document.getElementById('btnBgmToggle');
    const icon = document.getElementById('bgmIcon');
    if (btn) btn.setAttribute('aria-pressed', String(isBgmPlaying));

    if (isBgmPlaying) {
        if (btn) btn.className = "w-10 h-10 rounded-xl bg-emerald-500/20   text-emerald-300 transition active:scale-95 flex items-center justify-center shadow-lg shadow-emerald-500/10";
        if (icon) icon.textContent = "🎶";
        bgmStep = 0;
        bgmInterval = setInterval(playBgmBeat, 240);
        showToast("🎵 BGM Chiptune Aktif!");
    } else {
        if (btn) btn.className = "w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10   text-slate-400 hover:text-white transition active:scale-95 flex items-center justify-center";
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

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// --- MODAL BERSAMA (ADMIN) ---
// Satu sumber untuk semua halaman; dipanggil sebelum observer didaftarkan.
// Fokus, trap Tab, dan Escape ditangani a11yModalObserver di atas.
function injectSharedModals() {
    if (document.getElementById('adminModal')) return;
    const holder = document.createElement('div');
    holder.innerHTML = `
    <div id="adminModal" role="dialog" aria-modal="true" aria-labelledby="adminModalTitle" tabindex="-1" class="modal-base hidden-modal fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <div class="glass w-full max-w-xs p-5 rounded-3xl   shadow-2xl relative bg-[#0a0a0d]">
            <button onclick="toggleAdminModal(false)" aria-label="Tutup" class="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-full hover:bg-white/10 transition">
                <svg class="w-4 h-4" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>

            <div class="text-center mb-3">
                <span class="text-2xl" aria-hidden="true">🔑</span>
                <h2 id="adminModalTitle" class="text-sm font-black text-white mt-1">Akses Admin</h2>
                <p class="text-[10px] text-slate-400">Masukkan kata sandi admin untuk melanjutkan.</p>
            </div>

            <form id="adminLoginForm" onsubmit="handleAdminLogin(event)" class="space-y-2.5">
                <input type="password" id="adminPasswordInput" data-autofocus aria-label="Password admin atau moderator" placeholder="Password Admin / Moderator..." class="w-full bg-white/5 text-white text-base sm:text-xs p-2.5 rounded-xl focus:bg-white/10 transition text-center font-mono-custom">
                <button type="submit" class="w-full py-2.5 bg-white text-black text-xs font-black rounded-xl hover:bg-slate-200 active:scale-[0.98] transition-all shadow uppercase tracking-wider">
                    MASUK ADMIN
                </button>
            </form>
        </div>
    </div>`;
    while (holder.firstChild) document.body.appendChild(holder.firstChild);
}

// --- DETEKSI RPC BELUM TER-DEPLOY ---
// Dipakai semua halaman (feeds.js, landing.js, arcade.js).
function isMissingRpcError(err) {
    if (!err) return false;
    return err.code === '404' || err.code === 'PGRST202' ||
        /Could not find the function/i.test(err.message || '') ||
        /schema catalog/i.test(err.message || '');
}

function rpcErrorMessage(err) {
    if (isMissingRpcError(err)) {
        return 'Server belum siap. Jalankan supabase_upgrade.sql di Supabase, lalu coba lagi.';
    }
    return (err && err.message) || 'Periksa koneksi / RLS Supabase';
}

// --- PERSISTENSI SESI & BGM ---
// Situs ini multipage: pindah halaman = reload penuh, jadi state yang perlu
// bertahan disimpan di sessionStorage (terhapus saat tab ditutup).
const SESSION_KEY = 'pdftv_session_v1';
const BGM_KEY = 'pdftv_bgm_on';

// Menyimpan password di sessionStorage memperpanjang umur rahasia sampai tab
// ditutup (dan bisa dibaca skrip same-origin). Ini disengaja agar admin/
// moderator tidak perlu login ulang setiap pindah halaman.
function saveSession() {
    try {
        if (isAdminLoggedIn && adminPass) {
            sessionStorage.setItem(SESSION_KEY, JSON.stringify({ role: 'admin', pass: adminPass }));
        } else if (isModeratorLoggedIn && moderatorPass) {
            sessionStorage.setItem(SESSION_KEY, JSON.stringify({ role: 'moderator', pass: moderatorPass }));
        } else {
            sessionStorage.removeItem(SESSION_KEY);
        }
    } catch (e) { /* sessionStorage bisa diblokir; abaikan */ }
}

function restoreSession() {
    let raw = null;
    try { raw = sessionStorage.getItem(SESSION_KEY); } catch (e) { return; }
    if (!raw) return;
    try {
        const s = JSON.parse(raw);
        if (s.role === 'admin' && s.pass) {
            isAdminLoggedIn = true;
            isModeratorLoggedIn = false;
            adminPass = s.pass;
        } else if (s.role === 'moderator' && s.pass) {
            isModeratorLoggedIn = true;
            isAdminLoggedIn = false;
            moderatorPass = s.pass;
        }
    } catch (e) { /* data rusak; abaikan */ }
}

function saveBgmPreference() {
    try { sessionStorage.setItem(BGM_KEY, isBgmPlaying ? '1' : '0'); } catch (e) { /* abaikan */ }
}

// Browser melarang audio autoplay, jadi BGM dinyalakan pada interaksi pertama.
function resumeBgmIfEnabled() {
    let wanted = false;
    try { wanted = sessionStorage.getItem(BGM_KEY) === '1'; } catch (e) { return; }
    if (!wanted) return;

    const start = () => {
        window.removeEventListener('pointerdown', start);
        window.removeEventListener('keydown', start);
        if (!isBgmPlaying) toggleBGM();
    };
    window.addEventListener('pointerdown', start);
    window.addEventListener('keydown', start);
}

window.addEventListener('DOMContentLoaded', () => {
    restoreSession();
    if (typeof updateAdminUI === 'function') updateAdminUI();
    resumeBgmIfEnabled();
});
