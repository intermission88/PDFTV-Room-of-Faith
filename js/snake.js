// ============================================================
// PDFTV | EXPERIENCE ROOM - SNAKE ROGUELITE (arcade/index.html)
// Game kedua di halaman arcade. Hanya dimuat di halaman arcade,
// SETELAH core.js dan arcade.js.
// Arena digambar di <canvas> (tidak seperti blackjack yang DOM),
// jadi file ini membawa game loop dan handler keyboard sendiri.
// ============================================================

// --- KONSTANTA ---
const SNAKE_RUN_KEY = 'pdftv_snake_run_v1';
const SNAKE_MIN_SCORE = 100;
const SNAKE_MAX_ITEMS = 2;
const SNAKE_GRID = 20;
const SNAKE_CELL = 20;
const SNAKE_PX = SNAKE_GRID * SNAKE_CELL;
const SNAKE_MAX_SEGMENTS = 10;
const SNAKE_FREEZE_MS = 3000;

const SNAKE_COLORS = {
    lcd: '#9bbc0f',
    lcdDark: '#8aa807',
    ink: '#0f380f'
};

const SNAKE_DIRS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 }
};
const SNAKE_OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

// Pool relic: tiap relic maksimal sekali per run. Selesai floor = pilih 1 dari 3.
const SNAKE_RELICS = [
    { id: 'magnet',     icon: '🧲', name: 'Magnet Fruit',  desc: 'Dua apel aktif sekaligus di papan.' },
    { id: 'ghost',      icon: '👻', name: 'Ghost Phase',   desc: 'Boleh menembus hazard (badan sendiri tetap mematikan).' },
    { id: 'aegis',      icon: '🛡️', name: 'Aegis Scale',   desc: 'Menahan 1 kematian.' },
    { id: 'golden',     icon: '🍎', name: 'Golden Apple',  desc: 'Nilai tiap apel menjadi 3x.' },
    { id: 'slow',       icon: '🐌', name: 'Time Dilation', desc: 'Gerak ular melambat.' },
    { id: 'overclock',  icon: '⚡', name: 'Overclock',     desc: '+1 skor per apel, tapi ular bergerak lebih cepat.' },
    { id: 'demolition', icon: '🧱', name: 'Demolition',    desc: 'Menghapus 2 hazard setiap awal floor.' },
    { id: 'chrono',     icon: '⏱️', name: 'Chrono Bank',   desc: '+1 Freeze setiap naik floor.' },
    { id: 'gem',        icon: '💎', name: 'Gem Tissue',    desc: 'Setiap 5 apel, +1 Aegis.' }
];

// Siklus boss: floor kelipatan 5. Boss menentukan bentuk hazard arena.
const SNAKE_BOSSES = [
    { id: 'wall',        icon: '🧱', name: 'THE WALL',      perk: 'Dua dinding melintasi arena tanpa henti.', moving: true,  speed: 1 },
    { id: 'overclocker', icon: '⚡', name: 'OVERCLOCKER',   perk: 'Ular bergerak dua kali lebih cepat.',      speed: 2 },
    { id: 'void',        icon: '🕳️', name: 'THE VOID',      perk: 'Tiga lubang berpindah tempat tiap 10 tick.', shifting: true, speed: 1 },
    { id: 'faith',       icon: '👑', name: 'ROOM OF FAITH', perk: 'Dinding bergerak dan kecepatan naik 20%.', moving: true,  speed: 1.2 }
];

// --- STATE ---
let snake = null;
let snakeCtx = null;
let snakeLoopId = null;
let snakeLastFrame = 0;
let snakeAccumulator = 0;
let snakeFrozenUntil = 0;
let snakeInputBound = false;
let snakeTouchStart = null;
let snakeScoreToSubmit = 0;

function createSnakeState() {
    return {
        body: [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }],
        dir: 'right',
        nextDir: 'right',
        food: [],
        hazards: [],
        movingHazards: [],
        hazardTick: 0,
        score: 0,
        floor: 1,
        apples: 0,
        applesNeeded: 0,
        tickMs: 150,
        relics: [],
        aegis: 0,
        freeze: 1,
        sever: 1,
        boss: null,
        bossHp: 0,
        bossMaxHp: 0,
        isBoss: false,
        paused: false,
        over: false,
        awaitingChoice: false,
        pendingModal: null,
        deathReason: '',
        stats: { apples: 0, maxLength: 3, relics: 0, bosses: 0, maxFloor: 1 }
    };
}

// --- UTIL ---
function snakeSetText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function snakeSetStatus(text) {
    const el = document.getElementById('snakeStatus');
    if (el) el.textContent = text;
}

function hasRelic(id) {
    return !!snake && snake.relics.indexOf(id) !== -1;
}

function snakeCellTaken(x, y) {
    return snake.body.concat(snake.food, snake.hazards, snake.movingHazards)
        .some((c) => c.x === x && c.y === y);
}

function snakeRandomEmptyCell() {
    const free = [];
    for (let y = 0; y < SNAKE_GRID; y++) {
        for (let x = 0; x < SNAKE_GRID; x++) {
            if (!snakeCellTaken(x, y)) free.push({ x, y });
        }
    }
    if (!free.length) return null;
    return free[Math.floor(Math.random() * free.length)];
}

// --- SETUP FLOOR ---
function snakeFloorApples(floor) {
    return 4 + floor;
}

function recomputeSnakeSpeed() {
    let ms = Math.max(60, 150 - snake.floor * 8);
    if (hasRelic('slow')) ms += 25;
    if (hasRelic('overclock')) ms -= 15;
    const bossSpeed = snake.isBoss && snake.boss ? snake.boss.speed : 1;
    snake.tickMs = Math.max(45, Math.round(ms / bossSpeed));
}

function snakePlaceBodyAtCenter(maxSegments) {
    const keep = Math.max(1, Math.min(snake.body.length, maxSegments));
    snake.body = [];
    for (let i = 0; i < keep; i++) snake.body.push({ x: 10 - i, y: 10 });
    snake.dir = 'right';
    snake.nextDir = 'right';
}

function snakeSetupHazards() {
    snake.hazards = [];
    snake.movingHazards = [];
    snake.hazardTick = 0;

    const count = Math.min(12, Math.max(0, snake.floor - 1));
    for (let i = 0; i < count; i++) {
        const cell = snakeRandomEmptyCell();
        if (cell) snake.hazards.push(cell);
    }

    if (hasRelic('demolition')) {
        for (let i = 0; i < 2 && snake.hazards.length; i++) {
            snake.hazards.splice(Math.floor(Math.random() * snake.hazards.length), 1);
        }
    }

    if (!snake.isBoss || !snake.boss) return;

    if (snake.boss.moving) {
        const rows = [4, 15];
        snake.hazards = snake.hazards.filter((h) => rows.indexOf(h.y) === -1);
        snake.movingHazards.push({ x: 3, y: rows[0], vx: 1 });
        snake.movingHazards.push({ x: 16, y: rows[1], vx: -1 });
    }
    if (snake.boss.shifting) {
        for (let i = 0; i < 3; i++) {
            const cell = snakeRandomEmptyCell();
            if (cell) snake.movingHazards.push({ x: cell.x, y: cell.y, vx: 0, teleport: true });
        }
    }
}

function snakeEnsureFood() {
    const want = hasRelic('magnet') ? 2 : 1;
    while (snake.food.length < want) {
        const cell = snakeRandomEmptyCell();
        if (!cell) return;
        snake.food.push(cell);
    }
}

// Boss ditentukan oleh floor, bukan oleh penghitung terpisah:
// floor 5 = boss pertama, floor 10 = boss kedua, dan seterusnya.
function syncSnakeBossFromState() {
    if (!snake.isBoss) { snake.boss = null; return; }
    const index = Math.max(0, Math.floor(snake.floor / 5) - 1);
    snake.boss = SNAKE_BOSSES[index % SNAKE_BOSSES.length];
}

function snakeSetupFloor() {
    snake.isBoss = snake.floor % 5 === 0;
    syncSnakeBossFromState();

    snake.apples = 0;
    snake.applesNeeded = snake.isBoss
        ? 5 + Math.floor(snake.floor / 5)
        : snakeFloorApples(snake.floor);
    snake.bossMaxHp = snake.isBoss ? snake.applesNeeded : 0;
    snake.bossHp = snake.bossMaxHp;
    snake.food = [];

    snakePlaceBodyAtCenter(SNAKE_MAX_SEGMENTS);
    recomputeSnakeSpeed();
    snakeSetupHazards();
    snakeEnsureFood();
    refreshSnakeUI();
}

// --- GAME LOOP ---
function snakeLoop(timestamp) {
    if (!snake) { snakeLoopId = null; return; }

    if (!snakeLastFrame) snakeLastFrame = timestamp;
    const dt = Math.min(timestamp - snakeLastFrame, 250);
    snakeLastFrame = timestamp;

    if (!snake.paused && !snake.over && !snake.awaitingChoice) {
        snakeAccumulator += dt;
        let guard = 0;
        while (snakeAccumulator >= snake.tickMs && guard < 8) {
            snakeAccumulator -= snake.tickMs;
            guard++;
            snakeTick();
            if (snake.over || snake.paused || snake.awaitingChoice) break;
        }
        if (snakeAccumulator > snake.tickMs) snakeAccumulator = 0;
    }

    snakeDraw();
    snakeLoopId = requestAnimationFrame(snakeLoop);
}

function startSnakeLoop() {
    if (snakeLoopId) return;
    snakeLastFrame = 0;
    snakeAccumulator = 0;
    snakeLoopId = requestAnimationFrame(snakeLoop);
}

function stopSnakeLoop() {
    if (!snakeLoopId) return;
    cancelAnimationFrame(snakeLoopId);
    snakeLoopId = null;
}

// --- TICK ---
function snakeMoveHazards() {
    if (!snake.movingHazards.length) return;

    snake.hazardTick++;
    if (snake.boss && snake.boss.shifting && snake.hazardTick % 10 === 0) {
        snake.movingHazards.forEach((h) => {
            if (!h.teleport) return;
            const cell = snakeRandomEmptyCell();
            if (cell) { h.x = cell.x; h.y = cell.y; }
        });
    }

    snake.movingHazards.forEach((h) => {
        if (h.teleport || !h.vx) return;
        let nx = h.x + h.vx;
        if (nx < 0 || nx >= SNAKE_GRID) { h.vx = -h.vx; nx = h.x + h.vx; }
        // Dinding tidak pernah bergerak menembus ular: pemain hanya mati
        // kalau memang menabraknya sendiri.
        const blocked = snake.body.some((s) => s.x === nx && s.y === h.y);
        if (!blocked) h.x = nx;
    });
}

function snakeHitsHazard(cell) {
    if (hasRelic('ghost')) return false;
    return snake.hazards.some((h) => h.x === cell.x && h.y === cell.y)
        || snake.movingHazards.some((h) => h.x === cell.x && h.y === cell.y);
}

function snakeTick() {
    if (!snake || snake.over || snake.paused || snake.awaitingChoice) return;
    if (Date.now() < snakeFrozenUntil) return;

    snakeMoveHazards();

    snake.dir = snake.nextDir;
    const d = SNAKE_DIRS[snake.dir];
    const head = snake.body[0];
    const next = { x: head.x + d.x, y: head.y + d.y };

    if (next.x < 0 || next.y < 0 || next.x >= SNAKE_GRID || next.y >= SNAKE_GRID) {
        snakeDie('menabrak dinding');
        return;
    }
    // Ekor akan bergeser, jadi sel terakhir tidak dihitung sebagai tabrakan.
    if (snake.body.slice(0, -1).some((s) => s.x === next.x && s.y === next.y)) {
        snakeDie('menabrak badan sendiri');
        return;
    }
    if (snakeHitsHazard(next)) {
        snakeDie('menabrak hazard');
        return;
    }

    snake.body.unshift(next);

    const foodIdx = snake.food.findIndex((f) => f.x === next.x && f.y === next.y);
    if (foodIdx !== -1) {
        snake.food.splice(foodIdx, 1);
        snakeEatFood();
    } else {
        snake.body.pop();
    }
}

function snakeEatFood() {
    snake.apples++;
    snake.stats.apples++;

    let gain = snake.isBoss ? 25 : 10 * snake.floor;
    if (hasRelic('overclock')) gain += 1;
    if (hasRelic('golden')) gain *= 3;
    snake.score += gain;

    if (hasRelic('gem') && snake.stats.apples % 5 === 0) snake.aegis += 1;
    if (snake.body.length > snake.stats.maxLength) snake.stats.maxLength = snake.body.length;

    playCardSound();
    refreshSnakeUI();

    if (snake.isBoss) {
        snake.bossHp = Math.max(0, snake.bossHp - 1);
        updateSnakeBossBanner();
        if (snake.bossHp === 0) { snakeBossDefeated(); return; }
    } else if (snake.apples >= snake.applesNeeded) {
        snakeAdvanceFloor();
        return;
    }

    snakeEnsureFood();
}

function snakeAdvanceFloor() {
    playJackpotSound();
    triggerHaptic('heavy');

    snake.stats.maxFloor = Math.max(snake.stats.maxFloor, snake.floor);
    snake.pendingModal = 'relic';
    snake.awaitingChoice = true;
    snakeSetStatus(`FLOOR ${snake.floor} SELESAI!`);
    refreshSnakeUI();
    saveSnakeRun();
    triggerSnakeRelicModal();
}

function snakeStartNextFloor() {
    snake.floor++;
    snake.paused = false;
    snakeSetupFloor();
    if (hasRelic('chrono')) snake.freeze = Math.min(SNAKE_MAX_ITEMS, snake.freeze + 1);
    snakeSetStatus(`FLOOR ${snake.floor} • ${snake.isBoss ? 'BOSS' : snake.applesNeeded + ' APEL'}`);

    if (snake.isBoss) {
        snake.pendingModal = 'boss';
        snake.awaitingChoice = true;
    }
    saveSnakeRun();
    if (snake.isBoss) triggerSnakeBossModal();
}

function snakeBossDefeated() {
    playBossDefeatSound();
    triggerHaptic('heavy');

    snake.stats.bosses++;
    const bonus = 100 * snake.floor;
    snake.score += bonus;
    showToast(`⚔️ ${snake.boss.name} dikalahkan! +${bonus} skor`);
    refreshSnakeUI();
    snakeAdvanceFloor();
}

function snakeDie(reason) {
    if (snake.aegis > 0) {
        snake.aegis--;
        playShieldSound();
        triggerHaptic('heavy');
        snakePlaceBodyAtCenter(5);
        // Bersihkan hazard di sekitar titik muncul agar tidak mati beruntun.
        snake.hazards = snake.hazards.filter((h) => Math.abs(h.x - 10) + Math.abs(h.y - 10) > 4);
        snake.movingHazards = [];
        snakeEnsureFood();
        snakeSetStatus(`🛡️ AEGIS MENYELAMATKANMU • SISA ${snake.aegis}`);
        refreshSnakeUI();
        saveSnakeRun();
        return;
    }

    snake.over = true;
    snake.paused = true;
    snake.deathReason = reason;
    playBustSound();
    triggerHaptic('heavy');
    triggerScreenShake();
    snakeShowOverlay('GAME OVER', `Kamu ${reason}.`);
    refreshSnakeUI();
    saveSnakeRun();

    setTimeout(() => {
        const ui = document.getElementById('snakeGameUI');
        if (!snake || !snake.over) return;
        // Jangan munculkan modal kalau pemain sudah kembali ke lobby.
        if (ui && ui.classList.contains('hidden')) return;
        showSnakeScoreModal();
    }, 700);
}

// --- RENDER ---
function snakeDrawHazard(ctx, cell) {
    const x = cell.x * SNAKE_CELL;
    const y = cell.y * SNAKE_CELL;
    ctx.fillStyle = SNAKE_COLORS.ink;
    ctx.fillRect(x + 2, y + 2, SNAKE_CELL - 4, SNAKE_CELL - 4);
    ctx.fillStyle = SNAKE_COLORS.lcd;
    ctx.fillRect(x + 7, y + 7, SNAKE_CELL - 14, SNAKE_CELL - 14);
}

function snakeDrawFood(ctx, cell) {
    const x = cell.x * SNAKE_CELL;
    const y = cell.y * SNAKE_CELL;
    const s = SNAKE_CELL;
    ctx.fillStyle = SNAKE_COLORS.ink;
    ctx.fillRect(x + s * 0.28, y + s * 0.12, s * 0.44, s * 0.76);
    ctx.fillRect(x + s * 0.12, y + s * 0.28, s * 0.76, s * 0.44);
}

function snakeDrawOrb(ctx, cell) {
    const x = cell.x * SNAKE_CELL;
    const y = cell.y * SNAKE_CELL;
    const s = SNAKE_CELL;
    ctx.fillStyle = SNAKE_COLORS.ink;
    ctx.fillRect(x + 1, y + 1, s - 2, s - 2);
    ctx.fillStyle = SNAKE_COLORS.lcd;
    ctx.fillRect(x + 5, y + 5, s - 10, s - 10);
    ctx.fillStyle = SNAKE_COLORS.ink;
    ctx.fillRect(x + 8, y + 8, s - 16, s - 16);
}

function snakeDrawSegment(ctx, seg, isHead) {
    const x = seg.x * SNAKE_CELL;
    const y = seg.y * SNAKE_CELL;
    const inset = isHead ? 1 : 2;
    ctx.fillStyle = SNAKE_COLORS.ink;
    ctx.fillRect(x + inset, y + inset, SNAKE_CELL - inset * 2, SNAKE_CELL - inset * 2);

    if (!isHead) return;

    const d = SNAKE_DIRS[snake.dir];
    const cx = x + SNAKE_CELL / 2 + d.x * 3;
    const cy = y + SNAKE_CELL / 2 + d.y * 3;
    ctx.fillStyle = SNAKE_COLORS.lcd;
    if (d.x !== 0) {
        ctx.fillRect(cx - 1, cy - 4, 2, 2);
        ctx.fillRect(cx - 1, cy + 2, 2, 2);
    } else {
        ctx.fillRect(cx - 4, cy - 1, 2, 2);
        ctx.fillRect(cx + 2, cy - 1, 2, 2);
    }
}

function snakeDraw() {
    if (!snakeCtx) return;
    const ctx = snakeCtx;

    ctx.drawImage(snakeBuildBackground(), 0, 0);

    if (!snake) return;

    snake.hazards.forEach((h) => snakeDrawHazard(ctx, h));
    snake.movingHazards.forEach((h) => snakeDrawHazard(ctx, h));
    snake.food.forEach((f) => (snake.isBoss ? snakeDrawOrb(ctx, f) : snakeDrawFood(ctx, f)));
    snake.body.forEach((seg, i) => snakeDrawSegment(ctx, seg, i === 0));
}

function initSnakeCanvas() {
    const canvas = document.getElementById('snakeCanvas');
    if (!canvas) return null;

    // Sengaja tetap 1:1 (400x400). Pembesaran ke layar diserahkan ke CSS
    // `image-rendering: pixelated`, jadi pixel tetap tajam di layar retina.
    canvas.width = SNAKE_PX;
    canvas.height = SNAKE_PX;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;
    return ctx;
}

// Latar LCD + titik grid tidak berubah, jadi digambar sekali lalu di-blit.
// Menggambar ulang 400 titik tiap frame terlalu berat untuk HP.
let snakeBgCanvas = null;

function snakeBuildBackground() {
    if (snakeBgCanvas) return snakeBgCanvas;

    const canvas = document.createElement('canvas');
    canvas.width = SNAKE_PX;
    canvas.height = SNAKE_PX;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = SNAKE_COLORS.lcd;
    ctx.fillRect(0, 0, SNAKE_PX, SNAKE_PX);

    ctx.fillStyle = SNAKE_COLORS.lcdDark;
    for (let y = 0; y < SNAKE_GRID; y++) {
        for (let x = 0; x < SNAKE_GRID; x++) {
            ctx.fillRect(x * SNAKE_CELL + SNAKE_CELL / 2 - 1, y * SNAKE_CELL + SNAKE_CELL / 2 - 1, 2, 2);
        }
    }

    snakeBgCanvas = canvas;
    return canvas;
}

// --- UI ---
function updateSnakeHUD() {
    if (!snake) return;
    snakeSetText('snakeScoreText', snake.score.toLocaleString());
    snakeSetText('snakeFloorText', String(snake.floor));
    snakeSetText('snakeAppleText', `${snake.apples}/${snake.applesNeeded}`);
    snakeSetText('snakeLengthText', String(snake.body.length));
    snakeSetText('snakeHeaderTitle', `🐍 FLOOR ${snake.floor}`);
}

function updateSnakeConsumables() {
    if (!snake) return;
    snakeSetText('countSnakeFreeze', `${snake.freeze}/${SNAKE_MAX_ITEMS}`);
    snakeSetText('countSnakeSever', `${snake.sever}/${SNAKE_MAX_ITEMS}`);

    const freezeBtn = document.getElementById('btnSnakeFreeze');
    const severBtn = document.getElementById('btnSnakeSever');
    if (freezeBtn) freezeBtn.disabled = snake.freeze <= 0 || snake.over;
    if (severBtn) severBtn.disabled = snake.sever <= 0 || snake.over;
}

function renderSnakeRelics() {
    const list = document.getElementById('snakeRelicList');
    if (list) {
        if (!snake || !snake.relics.length) {
            list.innerHTML = '<span class="snake-relic-chip">Belum ada relic</span>';
        } else {
            list.innerHTML = snake.relics.map((id) => {
                const relic = SNAKE_RELICS.find((r) => r.id === id);
                if (!relic) return '';
                return `<span class="snake-relic-chip snake-relic-active" title="${escapeHtml(relic.desc)}">${relic.icon} ${escapeHtml(relic.name)}</span>`;
            }).join('');
        }
    }
    snakeSetText('snakeAegisText', `🛡️ Aegis: ${snake ? snake.aegis : 0}`);
}

function updateSnakeBossBanner() {
    const banner = document.getElementById('snakeBossAlertBanner');
    if (!banner) return;
    if (!snake || !snake.isBoss || !snake.boss || snake.over) {
        banner.classList.add('hidden');
        return;
    }
    banner.classList.remove('hidden');
    snakeSetText('snakeBossNameTitle', `${snake.boss.icon} ${snake.boss.name}`);
    snakeSetText('snakeBossPerkDescription', `Perk: ${snake.boss.perk}`);
    snakeSetText('snakeBossHpText', `ORB ${snake.bossHp}/${snake.bossMaxHp}`);
}

function refreshSnakeUI() {
    updateSnakeHUD();
    updateSnakeConsumables();
    renderSnakeRelics();
    updateSnakeBossBanner();
}

function snakeShowOverlay(title, text) {
    const el = document.getElementById('snakeOverlay');
    if (!el) return;
    snakeSetText('snakeOverlayTitle', title);
    snakeSetText('snakeOverlayText', text);
    const btn = el.querySelector('button');
    if (btn) btn.classList.toggle('hidden', !!(snake && snake.over));
    el.classList.remove('hidden');
}

function snakeHideOverlay() {
    const el = document.getElementById('snakeOverlay');
    if (el) el.classList.add('hidden');
}

function toggleSnakeRules() {
    playClickSound();
    triggerHaptic('light');
    const el = document.getElementById('snakeRulesAccordion');
    if (el) el.classList.toggle('hidden');
}

function toggleSnakePause() {
    if (!snake || snake.over || snake.awaitingChoice) return;
    snake.paused = !snake.paused;
    playClickSound();
    if (snake.paused) snakeShowOverlay('JEDA', 'Run ditahan sementara.');
    else snakeHideOverlay();
}

// --- KONTROL ---
function snakeTurn(dir) {
    if (!snake || snake.over || snake.paused || snake.awaitingChoice) return;
    if (!SNAKE_DIRS[dir]) return;
    // Ular tidak boleh berbalik 180 derajat dalam satu tick.
    if (SNAKE_OPPOSITE[dir] === snake.dir || SNAKE_OPPOSITE[dir] === snake.nextDir) return;
    if (dir === snake.nextDir) return;
    snake.nextDir = dir;
    playClickSound();
}

function snakeIsTypingTarget(el) {
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

function snakeOnKeyDown(e) {
    if (snakeIsTypingTarget(document.activeElement)) return;

    const map = {
        ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
        w: 'up', a: 'left', s: 'down', d: 'right'
    };
    const dir = map[e.key] || map[e.key.toLowerCase()];
    if (dir) {
        e.preventDefault();
        snakeTurn(dir);
        return;
    }
    if (e.key === ' ' || e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        toggleSnakePause();
    }
}

function snakeBindInput() {
    if (snakeInputBound) return;
    document.addEventListener('keydown', snakeOnKeyDown);
    snakeInputBound = true;
}

function snakeUnbindInput() {
    if (!snakeInputBound) return;
    document.removeEventListener('keydown', snakeOnKeyDown);
    snakeInputBound = false;
}

function snakeBindCanvasTouch() {
    const canvas = document.getElementById('snakeCanvas');
    if (!canvas || canvas._snakeTouchBound) return;
    canvas._snakeTouchBound = true;

    canvas.addEventListener('touchstart', (e) => {
        const t = e.changedTouches[0];
        snakeTouchStart = { x: t.clientX, y: t.clientY };
    }, { passive: true });

    canvas.addEventListener('touchend', (e) => {
        if (!snakeTouchStart) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - snakeTouchStart.x;
        const dy = t.clientY - snakeTouchStart.y;
        snakeTouchStart = null;
        if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
        if (Math.abs(dx) > Math.abs(dy)) snakeTurn(dx > 0 ? 'right' : 'left');
        else snakeTurn(dy > 0 ? 'down' : 'up');
    }, { passive: true });
}

// --- CONSUMABLE ---
function useSnakeFreeze() {
    if (!snake || snake.over || snake.freeze <= 0) return;
    snake.freeze--;
    snakeFrozenUntil = Date.now() + SNAKE_FREEZE_MS;
    playShieldSound();
    triggerHaptic('medium');
    snakeSetStatus('🧊 FREEZE AKTIF • 3 DETIK');
    updateSnakeConsumables();
    saveSnakeRun();
}

function useSnakeSever() {
    if (!snake || snake.over || snake.sever <= 0) return;
    snake.sever--;
    snake.body = snake.body.slice(0, Math.min(snake.body.length, 5));
    playDiscardSound();
    triggerHaptic('medium');
    snakeSetStatus('✂️ BADAN DIPOTONG JADI 5 SEGMEN');
    refreshSnakeUI();
    saveSnakeRun();
}

// --- MODAL RELIC ---
function triggerSnakeRelicModal() {
    if (!snake) return;
    playModalSound();

    const pool = SNAKE_RELICS.filter((r) => snake.relics.indexOf(r.id) === -1);
    const picks = [];
    while (picks.length < 3 && pool.length) {
        picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    // Pool relic habis: tawarkan bonus skor sebagai opsi pengganti.
    while (picks.length < 3) {
        picks.push({ id: 'bonus-score', icon: '🏆', name: 'Bonus Skor', desc: '+150 skor langsung.' });
    }

    const box = document.getElementById('snakeRelicOptions');
    if (box) {
        box.innerHTML = picks.map((r, i) => `
            <button type="button" onclick="selectSnakeRelic('${r.id}')" ${i === 0 ? 'data-autofocus' : ''} class="snake-relic-option w-full text-left p-3 rounded-2xl bg-white/5   flex items-start gap-2">
                <span class="text-lg" aria-hidden="true">${r.icon}</span>
                <span>
                    <span class="block text-[11px] font-black text-white">${escapeHtml(r.name)}</span>
                    <span class="block text-[10px] text-slate-400">${escapeHtml(r.desc)}</span>
                </span>
            </button>
        `).join('');
    }

    const modal = document.getElementById('snakeRelicModal');
    if (!modal) return;
    modal.classList.remove('hidden-modal');
    modal.classList.add('show-modal');
}

function selectSnakeRelic(id) {
    if (!snake) return;

    const modal = document.getElementById('snakeRelicModal');
    if (modal) {
        modal.classList.remove('show-modal');
        modal.classList.add('hidden-modal');
    }
    playJackpotSound();
    triggerHaptic('medium');

    if (id === 'bonus-score') {
        snake.score += 150;
        snakeSetStatus('🏆 BONUS SKOR +150');
    } else {
        snake.relics.push(id);
        snake.stats.relics = snake.relics.length;
        snakeApplyRelic(id);
    }

    snake.awaitingChoice = false;
    snake.pendingModal = null;
    snakeStartNextFloor();
}

function snakeApplyRelic(id) {
    if (id === 'aegis') snake.aegis += 1;
    if (id === 'chrono') snake.freeze = Math.min(SNAKE_MAX_ITEMS, snake.freeze + 1);
    recomputeSnakeSpeed();
    refreshSnakeUI();
}

// --- MODAL BOSS ---
function triggerSnakeBossModal() {
    if (!snake || !snake.boss) return;
    playBossAlertSound();
    triggerHaptic('heavy');

    snakeSetText('snakeBossModalName', `${snake.boss.icon} ${snake.boss.name}`);
    snakeSetText('snakeBossModalPerk', `Perk: ${snake.boss.perk}`);
    snakeSetText('snakeBossModalTarget', String(snake.applesNeeded));

    const modal = document.getElementById('snakeBossModal');
    if (!modal) return;
    modal.classList.remove('hidden-modal');
    modal.classList.add('show-modal');
}

function closeSnakeBossModal() {
    playClickSound();
    const modal = document.getElementById('snakeBossModal');
    if (modal) {
        modal.classList.remove('show-modal');
        modal.classList.add('hidden-modal');
    }
    if (!snake) return;
    snake.awaitingChoice = false;
    snake.pendingModal = null;
    saveSnakeRun();
}

// --- SKOR & LEADERBOARD ---
function showSnakeScoreModal() {
    if (!snake) return;
    playModalSound();

    snakeScoreToSubmit = snake.score;
    snakeSetText('snakeFinalScore', snake.score.toLocaleString());
    snakeSetText('snakeFinalFloor', `Floor ${snake.stats.maxFloor}`);
    snakeSetText('snakeDeathReason', snake.deathReason || 'run berakhir');
    snakeSetText('statSnakeApples', String(snake.stats.apples));
    snakeSetText('statSnakeLength', String(snake.stats.maxLength));
    snakeSetText('statSnakeRelics', String(snake.stats.relics));
    snakeSetText('statSnakeBoss', String(snake.stats.bosses));
    snakeSetText('statSnakeFloor', String(snake.stats.maxFloor));

    const container = document.getElementById('snakeNameInputContainer');
    const submitBtn = document.getElementById('btnSubmitSnakeScore');
    const warningEl = document.getElementById('snakeMinScoreWarning');
    const nameInput = document.getElementById('snakePlayerName');

    if (snakeScoreToSubmit < SNAKE_MIN_SCORE) {
        if (warningEl) warningEl.classList.remove('hidden');
        if (container) container.classList.add('hidden');
        if (submitBtn) submitBtn.classList.add('hidden');
        if (nameInput) nameInput.required = false;
    } else {
        if (warningEl) warningEl.classList.add('hidden');
        if (container) container.classList.remove('hidden');
        if (submitBtn) submitBtn.classList.remove('hidden');
        if (nameInput) { nameInput.required = true; nameInput.value = ''; }
    }

    const modal = document.getElementById('snakeScoreSubmitModal');
    if (!modal) return;
    modal.classList.remove('hidden-modal');
    modal.classList.add('show-modal');
}

function closeSnakeScoreModal() {
    playClickSound();
    triggerHaptic('light');
    const modal = document.getElementById('snakeScoreSubmitModal');
    if (!modal) return;
    modal.classList.remove('show-modal');
    modal.classList.add('hidden-modal');
}

async function submitSnakeScore(e) {
    e.preventDefault();
    if (!snake || snakeScoreToSubmit < SNAKE_MIN_SCORE) return;

    playWinSound();
    triggerHaptic('heavy');
    const nameInput = document.getElementById('snakePlayerName');
    const name = nameInput ? nameInput.value.trim() : '';

    if (name) {
        try {
            // Skor dikirim lewat RPC: validasi rentang + rate limit di server.
            const { error } = await supabaseClient.rpc('submit_snake_score', {
                p_name: name,
                p_score: Number(snakeScoreToSubmit),
                p_floor: Number(snake.stats.maxFloor),
                p_length: Number(snake.stats.maxLength)
            });
            if (error) throw error;

            showToast('🏆 Rekor Snake berhasil dicatat!');
            await fetchSnakeLeaderboard();
        } catch (err) {
            console.error('Error submitting snake score:', err);
            alert('Gagal mencatat rekor: ' + rpcErrorMessage(err));
        }
    }

    closeSnakeScoreModal();
    exitSnakeGame();
}

async function fetchSnakeLeaderboard() {
    const listEl = document.getElementById('snakeLeaderboardList');
    if (!listEl) return;

    try {
        const { data, error } = await supabaseClient
            .from(SNAKE_LEADERBOARD_TABLE)
            .select('*')
            .order('score', { ascending: false })
            .limit(5);

        if (error) throw error;

        if (!data || data.length === 0) {
            listEl.innerHTML = `
                <div class="relative overflow-hidden p-4 rounded-2xl    bg-gradient-to-b from-emerald-500/10 via-black/40 to-transparent text-center space-y-2">
                    <div class="text-2xl animate-bounce">🐍</div>
                    <div class="text-xs font-black text-emerald-400 font-mono-custom uppercase">Papan Peringkat Kosong!</div>
                    <p class="text-[10px] text-slate-400 max-w-xs mx-auto">Jadilah pemain pertama yang mencatatkan rekor <i>Snake Roguelite</i>!</p>
                </div>
            `;
            return;
        }

        const rankIcons = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
        listEl.innerHTML = data.map((item, index) => {
            const isTop1 = index === 0;
            return `
                <div class="flex items-center justify-between p-2 rounded-xl ${isTop1 ? 'gold-rank' : 'bg-white/[0.06]'} transition-all">
                    <div class="flex items-center gap-2">
                        <span class="text-base">${rankIcons[index] || '🎖️'}</span>
                        <span class="text-xs font-black ${isTop1 ? 'text-amber-300' : 'text-white'} font-mono-custom">${escapeHtml(item.player_name)}</span>
                    </div>
                    <div class="text-right">
                        <div class="text-xs font-black text-emerald-400 font-pixel">${Number(item.score || 0).toLocaleString()} 🍎</div>
                        <div class="text-[10px] text-slate-500 font-mono-custom">F${Number(item.max_floor || 1)} · L${Number(item.max_length || 3)}</div>
                    </div>
                </div>
            `;
        }).join('');
    } catch (err) {
        console.error('Gagal load leaderboard snake:', err);
        listEl.innerHTML = '<div class="text-center text-slate-500 text-xs py-3 italic">Gagal memuat leaderboard.</div>';
    }
}

async function adminResetSnakeLeaderboard() {
    playClickSound();
    if (!isAdminLoggedIn) return;

    if (confirm('⚠️ Yakin ingin menghapus seluruh Leaderboard Snake?')) {
        try {
            const result = await supabaseClient.rpc('admin_reset_snake_leaderboard', { p_pass: adminPass });
            if (result.error) throw result.error;
            showToast('🔄 Leaderboard Snake berhasil direset!');
            fetchSnakeLeaderboard();
        } catch (e) {
            alert('Gagal reset leaderboard: ' + e.message);
        }
    }
}

// --- PERSISTENSI RUN (multipage: pindah halaman = reload penuh) ---
function serializeSnakeRun() {
    return {
        body: snake.body,
        dir: snake.dir,
        nextDir: snake.nextDir,
        food: snake.food,
        hazards: snake.hazards,
        movingHazards: snake.movingHazards,
        hazardTick: snake.hazardTick,
        score: snake.score,
        floor: snake.floor,
        apples: snake.apples,
        applesNeeded: snake.applesNeeded,
        tickMs: snake.tickMs,
        relics: snake.relics,
        aegis: snake.aegis,
        freeze: snake.freeze,
        sever: snake.sever,
        bossHp: snake.bossHp,
        bossMaxHp: snake.bossMaxHp,
        isBoss: snake.isBoss,
        pendingModal: snake.pendingModal,
        stats: snake.stats
    };
}

function saveSnakeRun() {
    try {
        if (!snake || snake.over) {
            sessionStorage.removeItem(SNAKE_RUN_KEY);
            return;
        }
        sessionStorage.setItem(SNAKE_RUN_KEY, JSON.stringify(serializeSnakeRun()));
    } catch (err) {
        console.error('Gagal menyimpan run snake:', err);
    }
}

function clearStoredSnakeRun() {
    try {
        sessionStorage.removeItem(SNAKE_RUN_KEY);
    } catch (err) {
        console.error('Gagal menghapus run snake:', err);
    }
}

function restoreSnakeRun() {
    let raw = null;
    try {
        raw = sessionStorage.getItem(SNAKE_RUN_KEY);
    } catch (err) {
        return false;
    }
    if (!raw) return false;

    let saved = null;
    try {
        saved = JSON.parse(raw);
    } catch (err) {
        clearStoredSnakeRun();
        return false;
    }
    if (!saved || !Array.isArray(saved.body) || saved.body.length === 0) {
        clearStoredSnakeRun();
        return false;
    }

    const fresh = createSnakeState();
    snake = Object.assign(fresh, {
        body: saved.body,
        dir: SNAKE_DIRS[saved.dir] ? saved.dir : fresh.dir,
        nextDir: SNAKE_DIRS[saved.nextDir] ? saved.nextDir : fresh.dir,
        food: Array.isArray(saved.food) ? saved.food : [],
        hazards: Array.isArray(saved.hazards) ? saved.hazards : [],
        movingHazards: Array.isArray(saved.movingHazards) ? saved.movingHazards : [],
        hazardTick: saved.hazardTick || 0,
        score: Number(saved.score) || 0,
        floor: Number(saved.floor) || 1,
        apples: Number(saved.apples) || 0,
        applesNeeded: Number(saved.applesNeeded) || snakeFloorApples(1),
        relics: Array.isArray(saved.relics) ? saved.relics : [],
        aegis: Number(saved.aegis) || 0,
        freeze: Number(saved.freeze) || 0,
        sever: Number(saved.sever) || 0,
        bossHp: Number(saved.bossHp) || 0,
        bossMaxHp: Number(saved.bossMaxHp) || 0,
        isBoss: !!saved.isBoss,
        pendingModal: saved.pendingModal || null,
        stats: Object.assign(fresh.stats, saved.stats || {})
    });

    syncSnakeBossFromState();
    recomputeSnakeSpeed();
    return true;
}

// --- LIFECYCLE ---
function snakeEnterUI() {
    const lobby = document.getElementById('arcadeLobby');
    const ui = document.getElementById('snakeGameUI');
    if (!lobby || !ui) return;
    lobby.classList.add('hidden');
    ui.classList.remove('hidden');
    triggerPageAnimation(ui);
}

function enterSnakeGame() {
    playClickSound();
    triggerHaptic('medium');

    snakeEnterUI();
    snakeCtx = initSnakeCanvas();

    if (!snake || snake.over) {
        snake = createSnakeState();
        snakeSetupFloor();
        snakeSetStatus('FLOOR 1 • 5 APEL');
    }

    snake.paused = false;
    snakeHideOverlay();
    snakeBindInput();
    startSnakeLoop();
    refreshSnakeUI();
    saveSnakeRun();
}

function exitSnakeGame() {
    playClickSound();
    triggerHaptic('light');

    stopSnakeLoop();
    snakeUnbindInput();
    snakeHideOverlay();
    if (snake) snake.paused = true;
    saveSnakeRun();

    const lobby = document.getElementById('arcadeLobby');
    const ui = document.getElementById('snakeGameUI');
    if (ui) ui.classList.add('hidden');
    if (lobby) lobby.classList.remove('hidden');
    if (lobby) triggerPageAnimation(lobby);

    fetchSnakeLeaderboard();
}

// --- CHEAT ADMIN ---
function snakeCheatAddScore(amount) {
    if (!snake) { showToast('🐍 Mulai run Snake dulu.'); return; }
    playWinSound();
    snake.score += amount;
    refreshSnakeUI();
    saveSnakeRun();
    showToast(`🏆 Cheat: +${amount} skor`);
}

function snakeCheatGrantRelic() {
    if (!snake) { showToast('🐍 Mulai run Snake dulu.'); return; }
    const pool = SNAKE_RELICS.filter((r) => snake.relics.indexOf(r.id) === -1);
    if (!pool.length) { showToast('💎 Semua relic sudah dimiliki.'); return; }

    const relic = pool[Math.floor(Math.random() * pool.length)];
    snake.relics.push(relic.id);
    snake.stats.relics = snake.relics.length;
    snakeApplyRelic(relic.id);
    saveSnakeRun();
    showToast(`💎 Cheat: ${relic.name} didapat!`);
}

function snakeCheatSkipFloor() {
    if (!snake) { showToast('🐍 Mulai run Snake dulu.'); return; }
    if (snake.awaitingChoice) { showToast('💎 Selesaikan pilihan dulu.'); return; }

    snake.apples = snake.applesNeeded;
    if (snake.isBoss) snake.bossHp = 0;
    snakeAdvanceFloor();
    showToast('⏭️ Cheat: floor diselesaikan.');
}

function snakeCheatKillBoss() {
    if (!snake) { showToast('🐍 Mulai run Snake dulu.'); return; }
    if (!snake.isBoss) { showToast('⚔️ Ini bukan floor boss.'); return; }
    if (snake.awaitingChoice) { showToast('💎 Selesaikan pilihan dulu.'); return; }

    snake.bossHp = 0;
    snakeBossDefeated();
}

function snakeCheatAddAegis(amount) {
    if (!snake) { showToast('🐍 Mulai run Snake dulu.'); return; }
    playShieldSound();
    snake.aegis += amount;
    refreshSnakeUI();
    saveSnakeRun();
    showToast(`🛡️ Cheat: Aegis +${amount}`);
}

function snakeCheatFillConsumables() {
    if (!snake) { showToast('🐍 Mulai run Snake dulu.'); return; }
    playClickSound();
    snake.freeze = SNAKE_MAX_ITEMS;
    snake.sever = SNAKE_MAX_ITEMS;
    refreshSnakeUI();
    saveSnakeRun();
    showToast('🧪 Cheat: tactical items penuh.');
}

// --- INIT ---
window.addEventListener('DOMContentLoaded', () => {
    fetchSnakeLeaderboard();
    snakeCtx = initSnakeCanvas();
    snakeBindCanvasTouch();
    snakeDraw();

    if (!restoreSnakeRun()) return;

    snakeEnterUI();
    snakeCtx = initSnakeCanvas();
    snake.paused = false;
    snakeBindInput();
    startSnakeLoop();
    refreshSnakeUI();
    showToast('🐍 Run Snake dipulihkan.');

    if (snake.pendingModal === 'relic') {
        snake.awaitingChoice = true;
        triggerSnakeRelicModal();
    } else if (snake.pendingModal === 'boss') {
        snake.awaitingChoice = true;
        triggerSnakeBossModal();
    } else {
        snake.awaitingChoice = false;
    }
});

window.addEventListener('pagehide', () => {
    if (snake) saveSnakeRun();
});

document.addEventListener('visibilitychange', () => {
    if (!document.hidden || !snake) return;
    saveSnakeRun();
    // Tab tidak aktif: tahan run supaya ular tidak mati di belakang layar.
    if (!snake.over && !snake.paused && !snake.awaitingChoice) {
        snake.paused = true;
        snakeShowOverlay('JEDA', 'Tab tidak aktif — run ditahan.');
    }
});
