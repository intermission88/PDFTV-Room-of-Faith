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
// Panjang badan yang dibawa antar floor naik seiring floor, dengan plafon ini.
const SNAKE_CARRY_CAP = 24;
const SNAKE_FREEZE_MS = 3000;
// Jeda "siap-siap" sebelum ular mulai bergerak; bisa dilewati pemain.
const SNAKE_COUNTDOWN_MS = 3000;
// Jarak geser minimum sebelum swipe dianggap sebagai belokan.
const SNAKE_SWIPE_PX = 18;
// Gacha relic: peluang drop dari boss + tempo animasi gulungannya.
const SNAKE_GACHA_DROP_RATE = 0.6;
const SNAKE_GACHA_TICK_MS = 90;
const SNAKE_GACHA_TICKS = 16;
const SNAKE_GACHA_BONUS = 150;

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

// Pool relic: tiap relic maksimal sekali per run, didapat lewat gacha boss.
const SNAKE_RELICS = [
    { id: 'magnet',     icon: '🧲', name: 'Magnet Fruit',  desc: 'Dua apel aktif sekaligus di papan.' },
    { id: 'ghost',      icon: '👻', name: 'Ghost Phase',   desc: 'Boleh menembus hazard (badan sendiri tetap mematikan).' },
    { id: 'golden',     icon: '🍎', name: 'Golden Apple',  desc: 'Nilai tiap apel menjadi 3x.' },
    { id: 'slow',       icon: '🐌', name: 'Time Dilation', desc: 'Gerak ular melambat.' },
    { id: 'overclock',  icon: '⚡', name: 'Overclock',     desc: '+1 skor per apel, tapi ular bergerak lebih cepat.' },
    { id: 'demolition', icon: '🧱', name: 'Demolition',    desc: 'Menghapus 2 hazard setiap awal floor.' },
    { id: 'chrono',     icon: '⏱️', name: 'Chrono Bank',   desc: '+1 Freeze setiap naik floor.' }
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
let snakeGachaTimer = null;

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
        gachaResult: null,
        countdownMs: 0,
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
// Floor 1-4 adalah pemanasan supaya pemain sempat sampai boss pertama di
// floor 5. Sejak floor 5 kurvanya TIDAK dilunakkan: angkanya sama seperti
// sebelum pemanasan ditambahkan.
const SNAKE_WARMUP_FLOOR = 4;

function snakeSpeedMs(floor) {
    if (floor <= SNAKE_WARMUP_FLOOR + 1) return 150 - 13 * (floor - 1);
    return 138 - 8 * floor;
}

function snakeFloorApples(floor) {
    if (floor <= SNAKE_WARMUP_FLOOR) return 3 + floor;
    return 5 + floor * 2;
}

function snakeHazardCount(floor) {
    if (floor <= SNAKE_WARMUP_FLOOR) return Math.max(0, floor - 1);
    return Math.min(20, 2 * floor - 2);
}

function recomputeSnakeSpeed() {
    let ms = Math.max(35, snakeSpeedMs(snake.floor));
    if (hasRelic('slow')) ms += 25;
    if (hasRelic('overclock')) ms -= 15;
    const bossSpeed = snake.isBoss && snake.boss ? snake.boss.speed : 1;
    snake.tickMs = Math.max(30, Math.round(ms / bossSpeed));
}

// Badan diletakkan serpentine (baris 10 ke kiri, lalu turun ke baris 11 dan
// balik ke kanan, dst). Satu baris saja tidak cukup sejak panjang bawaan
// badan bisa mencapai 24 segmen.
function snakePlaceBodyAtCenter(maxSegments) {
    const keep = Math.max(1, Math.min(snake.body.length, maxSegments));
    snake.body = [];

    let x = 10;
    let y = 10;
    let step = -1;
    for (let i = 0; i < keep; i++) {
        snake.body.push({ x, y });
        const next = x + step;
        if (next < 0 || next >= SNAKE_GRID) {
            y += 1;
            step = -step;
        } else {
            x = next;
        }
    }

    snake.dir = 'right';
    snake.nextDir = 'right';
}

function snakeSetupHazards() {
    snake.hazards = [];
    snake.movingHazards = [];
    snake.hazardTick = 0;

    const count = snakeHazardCount(snake.floor);
    for (let i = 0; i < count; i++) {
        const cell = snakeRandomEmptyCell();
        if (cell) snake.hazards.push(cell);
    }

    if (hasRelic('demolition')) {
        for (let i = 0; i < 2 && snake.hazards.length; i++) {
            snake.hazards.splice(Math.floor(Math.random() * snake.hazards.length), 1);
        }
    }

    // Hazard statis mentok di floor 11, jadi mulai floor 12 tekanan baru
    // datang dari dinding yang bergerak. Boss mengambil alih, tidak menumpuk.
    const rows = [4, 15];
    if (snake.isBoss && snake.boss) {
        if (snake.boss.moving) {
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
        return;
    }

    const sweepers = snake.floor >= 18 ? 2 : (snake.floor >= 12 ? 1 : 0);
    if (!sweepers) return;

    snake.hazards = snake.hazards.filter((h) => rows.indexOf(h.y) === -1);
    snake.movingHazards.push({ x: 3, y: rows[0], vx: 1 });
    if (sweepers > 1) snake.movingHazards.push({ x: 16, y: rows[1], vx: -1 });
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
        ? 6 + snake.floor
        : snakeFloorApples(snake.floor);
    snake.bossMaxHp = snake.isBoss ? snake.applesNeeded : 0;
    snake.bossHp = snake.bossMaxHp;
    snake.food = [];

    snakePlaceBodyAtCenter(Math.min(10 + snake.floor, SNAKE_CARRY_CAP));
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
        if (snake.countdownMs > 0) {
            snakeRunCountdown(dt);
        } else {
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

// --- COUNTDOWN SEBELUM MULAI ---
// Ular baru bergerak setelah jeda ini habis, supaya pemain sempat melihat
// posisi awal arena. Pemain boleh melewatinya lewat tombol "mulai sekarang".
function snakeShowCountdown() {
    if (!snake || snake.countdownMs <= 0) return;
    snakeUpdateCountdownUI();
    const el = document.getElementById('snakeCountdown');
    if (el) el.classList.remove('hidden');
}

function snakeStartCountdown() {
    if (!snake) return;
    snake.countdownMs = SNAKE_COUNTDOWN_MS;
    snakeAccumulator = 0;
    snakeShowCountdown();
}

function snakeHideCountdown() {
    const el = document.getElementById('snakeCountdown');
    if (el) el.classList.add('hidden');
}

function snakeUpdateCountdownUI() {
    const seconds = Math.max(1, Math.ceil(snake.countdownMs / 1000));
    snakeSetText('snakeCountdownText', String(seconds));
    snakeSetText('snakeCountdownLabel', `FLOOR ${snake.floor} • ${snake.isBoss ? 'BOSS' : snake.applesNeeded + ' APEL'}`);
}

function snakeRunCountdown(dt) {
    const before = Math.ceil(snake.countdownMs / 1000);
    snake.countdownMs = Math.max(0, snake.countdownMs - dt);

    if (snake.countdownMs > 0) {
        if (Math.ceil(snake.countdownMs / 1000) !== before) playGachaTickSound();
        snakeUpdateCountdownUI();
        return;
    }

    snakeHideCountdown();
    playBossAlertSound();
    snakeSetStatus(`FLOOR ${snake.floor} DIMULAI!`);
}

function snakeSkipCountdown() {
    if (!snake || snake.countdownMs <= 0) return;
    snake.countdownMs = 0;
    snakeAccumulator = 0;
    snakeHideCountdown();
    playClickSound();
    triggerHaptic('light');
    snakeSetStatus(`FLOOR ${snake.floor} DIMULAI!`);
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

    // Tepi arena tembus: keluar lewat kanan muncul di kiri, dan sebaliknya.
    // Jadi tidak ada lagi kematian karena menabrak dinding.
    if (next.x < 0) next.x = SNAKE_GRID - 1;
    else if (next.x >= SNAKE_GRID) next.x = 0;
    if (next.y < 0) next.y = SNAKE_GRID - 1;
    else if (next.y >= SNAKE_GRID) next.y = 0;

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
    snakeSetStatus(`FLOOR ${snake.floor} SELESAI!`);

    snake.pendingModal = 'floor';
    snake.awaitingChoice = true;
    refreshSnakeUI();
    saveSnakeRun();
    triggerSnakeFloorModal();
}

function snakeStartNextFloor() {
    snake.floor++;
    snake.paused = false;
    snakeAccumulator = 0;
    snakeSetupFloor();
    if (hasRelic('chrono')) snake.freeze = Math.min(SNAKE_MAX_ITEMS, snake.freeze + 1);
    snakeSetStatus(`FLOOR ${snake.floor} • ${snake.isBoss ? 'BOSS' : snake.applesNeeded + ' APEL'}`);

    if (snake.isBoss) {
        snake.pendingModal = 'boss';
        snake.awaitingChoice = true;
    }
    saveSnakeRun();
    // Jeda siap-siap dihitung loop, dan otomatis tertahan selama modal boss terbuka.
    snakeStartCountdown();
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
    snake.over = true;
    snake.paused = true;
    snake.deathReason = reason;
    snakeHideCountdown();
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
    snakeSetText('snakeRelicCount', `💎 ${snake ? snake.relics.length : 0}/${SNAKE_RELICS.length}`);
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
    if (snake.paused) {
        // Overlay jeda dan hitungan siap-siap tidak boleh tampil bersamaan.
        snakeHideCountdown();
        snakeShowOverlay('JEDA', 'Run ditahan sementara.');
    } else {
        snakeHideOverlay();
        snakeShowCountdown();
    }
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

    // Satu-satunya kontrol arah di HP: geser jari di arena.
    const readSwipe = (t) => {
        if (!snakeTouchStart) return;
        const dx = t.clientX - snakeTouchStart.x;
        const dy = t.clientY - snakeTouchStart.y;
        if (Math.abs(dx) < SNAKE_SWIPE_PX && Math.abs(dy) < SNAKE_SWIPE_PX) return;

        if (Math.abs(dx) > Math.abs(dy)) snakeTurn(dx > 0 ? 'right' : 'left');
        else snakeTurn(dy > 0 ? 'down' : 'up');

        // Titik acuan digeser supaya swipe berikutnya tidak perlu angkat jari.
        snakeTouchStart = { x: t.clientX, y: t.clientY };
    };

    canvas.addEventListener('touchstart', (e) => {
        const t = e.changedTouches[0];
        snakeTouchStart = { x: t.clientX, y: t.clientY };
    }, { passive: true });

    // Dibaca saat touchmove, bukan touchend: belokan terasa langsung dan
    // pemain tidak perlu mengangkat jari di game yang makin cepat.
    canvas.addEventListener('touchmove', (e) => {
        readSwipe(e.changedTouches[0]);
    }, { passive: true });

    canvas.addEventListener('touchend', (e) => {
        readSwipe(e.changedTouches[0]);
        snakeTouchStart = null;
    }, { passive: true });

    canvas.addEventListener('touchcancel', () => {
        snakeTouchStart = null;
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

// --- POPUP ANTAR-FLOOR (+ gacha relic di floor boss) ---
// Satu popup per floor: ringkasan floor yang baru selesai, dan di floor boss
// ditambah gulungan gacha. Digabung supaya floor boss tidak menghasilkan dua
// popup beruntun.
function snakeNextFloorTarget() {
    const next = snake.floor + 1;
    return next % 5 === 0 ? 6 + next : snakeFloorApples(next);
}

// Hasil gacha diundi sekali lalu disimpan di state, supaya reload di tengah
// popup tidak mengubah hadiah — dan hadiah tidak terterap dua kali.
function snakeRollGacha() {
    const pool = SNAKE_RELICS.filter((r) => snake.relics.indexOf(r.id) === -1);
    if (!pool.length) return { relicId: null, bonus: true, applied: false };
    if (Math.random() >= SNAKE_GACHA_DROP_RATE) return { relicId: null, bonus: false, applied: false };

    const relic = pool[Math.floor(Math.random() * pool.length)];
    return { relicId: relic.id, bonus: false, applied: false };
}

function snakeEnsureGachaRolled() {
    if (!snake.isBoss || snake.gachaResult) return;
    snake.gachaResult = snakeRollGacha();
    saveSnakeRun();
}

function snakeStopGachaReel() {
    if (snakeGachaTimer === null) return;
    clearInterval(snakeGachaTimer);
    snakeGachaTimer = null;
}

function triggerSnakeFloorModal(animate) {
    if (!snake) return;
    snakeStopGachaReel();

    const modal = document.getElementById('snakeFloorModal');
    if (!modal) return;

    snakeEnsureGachaRolled();

    const gachaSection = document.getElementById('snakeGachaSection');
    if (gachaSection) gachaSection.classList.toggle('hidden', !snake.isBoss);

    const nextIsBoss = (snake.floor + 1) % 5 === 0;
    snakeSetText('snakeFloorModalTitle', `FLOOR ${snake.floor} SELESAI!`);
    snakeSetText('snakeFloorModalSub', snake.isBoss
        ? `${snake.boss.icon} ${snake.boss.name} tumbang.`
        : 'Bersiap ke floor berikutnya.');
    snakeSetText('snakeFloorSummary', `🍎 ${snake.applesNeeded} • 📏 ${snake.body.length} segmen • 🏆 ${snake.score.toLocaleString()}`);
    snakeSetText('snakeFloorNextTarget', `Floor ${snake.floor + 1}: ${snakeNextFloorTarget()} ${nextIsBoss ? 'orb boss' : 'apel'}`);
    snakeSetText('btnSnakeFloorContinue', `LANJUT KE FLOOR ${snake.floor + 1} ➔`);

    // Tombol LANJUT default aktif; hanya gulungan gacha yang menguncinya.
    // Kalau ini tertinggal terkunci, pemain tidak punya jalan keluar dari popup.
    const continueBtn = document.getElementById('btnSnakeFloorContinue');
    if (continueBtn) continueBtn.disabled = false;

    if (!snake.isBoss) {
        snakeStopGachaReel();
    } else if (animate === false) {
        // Dipulihkan dari sessionStorage: langsung tampilkan hasil, tanpa undi ulang.
        snakeRevealGacha();
    } else {
        playModalSound();
        snakeSpinGachaReel();
    }

    modal.classList.remove('hidden-modal');
    modal.classList.add('show-modal');
}

function snakeSpinGachaReel() {
    const reel = document.getElementById('snakeGachaReel');
    const resultEl = document.getElementById('snakeGachaResult');
    const btn = document.getElementById('btnSnakeFloorContinue');

    if (resultEl) resultEl.classList.add('hidden');
    if (btn) btn.disabled = true;

    let ticks = 0;
    snakeGachaTimer = setInterval(() => {
        ticks++;
        playGachaTickSound();
        if (reel) {
            reel.textContent = SNAKE_RELICS[Math.floor(Math.random() * SNAKE_RELICS.length)].icon;
        }
        if (ticks >= SNAKE_GACHA_TICKS) {
            snakeStopGachaReel();
            snakeRevealGacha();
        }
    }, SNAKE_GACHA_TICK_MS);
}

function snakeRevealGacha() {
    snakeStopGachaReel();

    const result = snake.gachaResult || { relicId: null, bonus: false, applied: true };
    const relic = result.relicId ? SNAKE_RELICS.find((r) => r.id === result.relicId) : null;

    // `applied` menjaga hadiah tidak diberikan dua kali saat run dipulihkan.
    if (!result.applied) {
        result.applied = true;
        if (relic) {
            snake.relics.push(relic.id);
            snake.stats.relics = snake.relics.length;
            snakeApplyRelic(relic.id);
        } else if (result.bonus) {
            snake.score += SNAKE_GACHA_BONUS;
        }
    }

    const reel = document.getElementById('snakeGachaReel');
    const resultEl = document.getElementById('snakeGachaResult');
    const btn = document.getElementById('btnSnakeFloorContinue');

    if (reel) reel.textContent = relic ? relic.icon : (result.bonus ? '🏆' : '🚫');

    if (resultEl) {
        if (relic) {
            resultEl.innerHTML = `<div class="text-xs font-black text-emerald-400">${escapeHtml(relic.name)}</div>
                <div class="text-[10px] text-slate-400 mt-0.5">${escapeHtml(relic.desc)}</div>`;
        } else if (result.bonus) {
            resultEl.innerHTML = `<div class="text-xs font-black text-amber-400">Semua relic sudah dikantongi</div>
                <div class="text-[10px] text-slate-400 mt-0.5">Bonus +${SNAKE_GACHA_BONUS} skor.</div>`;
        } else {
            resultEl.innerHTML = `<div class="text-xs font-black text-rose-400">ZONK!</div>
                <div class="text-[10px] text-slate-400 mt-0.5">Bos tidak menjatuhkan relic kali ini.</div>`;
        }
        resultEl.classList.remove('hidden');
    }

    if (btn) btn.disabled = false;
    if (relic || result.bonus) playJackpotSound(); else playBustSound();
    triggerHaptic(relic ? 'heavy' : 'light');

    refreshSnakeUI();
    saveSnakeRun();
}

function closeSnakeFloorModal() {
    // Gulungan harus selesai dulu; tombol memang disabled selama berputar.
    if (!snake || snakeGachaTimer !== null) return;
    playClickSound();
    snakeStopGachaReel();

    const modal = document.getElementById('snakeFloorModal');
    if (modal) {
        modal.classList.remove('show-modal');
        modal.classList.add('hidden-modal');
    }

    snake.gachaResult = null;
    snake.awaitingChoice = false;
    snake.pendingModal = null;
    // snakeStartNextFloor() juga memulai jeda siap-siap floor berikutnya.
    snakeStartNextFloor();
}

function snakeApplyRelic(id) {
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
    const retryBtn = document.getElementById('btnRetrySnakeRun');
    const warningEl = document.getElementById('snakeMinScoreWarning');
    const nameInput = document.getElementById('snakePlayerName');
    const canSubmit = snakeScoreToSubmit >= SNAKE_MIN_SCORE;

    if (canSubmit) {
        if (warningEl) warningEl.classList.add('hidden');
        if (container) container.classList.remove('hidden');
        if (submitBtn) submitBtn.classList.remove('hidden');
        if (nameInput) { nameInput.required = true; nameInput.value = ''; }
    } else {
        if (warningEl) warningEl.classList.remove('hidden');
        if (container) container.classList.add('hidden');
        if (submitBtn) submitBtn.classList.add('hidden');
        if (nameInput) nameInput.required = false;
    }

    // Elemen display:none tidak bisa difokus, jadi penanda autofocus dipindah
    // ke tombol MAIN LAGI saat input nama ikut disembunyikan. Diubah SEBELUM
    // kelas show-modal supaya observer a11y di core.js membaca nilai terbaru.
    if (nameInput) nameInput.removeAttribute('data-autofocus');
    if (retryBtn) retryBtn.removeAttribute('data-autofocus');
    const autofocusTarget = canSubmit ? nameInput : retryBtn;
    if (autofocusTarget) autofocusTarget.setAttribute('data-autofocus', '');

    const modal = document.getElementById('snakeScoreSubmitModal');
    if (!modal) return;
    modal.classList.remove('hidden-modal');
    modal.classList.add('show-modal');
}

function hideSnakeScoreModal() {
    const modal = document.getElementById('snakeScoreSubmitModal');
    if (!modal) return;
    modal.classList.remove('show-modal');
    modal.classList.add('hidden-modal');
}

function closeSnakeScoreModal() {
    playClickSound();
    triggerHaptic('light');
    hideSnakeScoreModal();
}

// "MAIN LAGI": mulai run baru tanpa harus lewat lobby.
function retrySnakeRun() {
    hideSnakeScoreModal();
    playJackpotSound();
    triggerHaptic('heavy');

    snakeStopGachaReel();
    snake = createSnakeState();
    snakeSetupFloor();
    snakeFrozenUntil = 0;
    snakeHideOverlay();
    snakeBindInput();
    startSnakeLoop();
    snakeSetStatus(`FLOOR 1 • ${snake.applesNeeded} APEL`);
    refreshSnakeUI();
    saveSnakeRun();
    snakeStartCountdown();
    showToast('🔄 Run baru dimulai!');
}

function snakeBackToLobby() {
    hideSnakeScoreModal();
    exitSnakeGame();
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
        freeze: snake.freeze,
        sever: snake.sever,
        bossHp: snake.bossHp,
        bossMaxHp: snake.bossMaxHp,
        isBoss: snake.isBoss,
        pendingModal: snake.pendingModal,
        gachaResult: snake.gachaResult,
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
        freeze: Number(saved.freeze) || 0,
        sever: Number(saved.sever) || 0,
        bossHp: Number(saved.bossHp) || 0,
        bossMaxHp: Number(saved.bossMaxHp) || 0,
        isBoss: !!saved.isBoss,
        pendingModal: saved.pendingModal || null,
        gachaResult: saved.gachaResult || null,
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
    // Sisa jeda Freeze dari sesi sebelumnya tidak boleh ikut terbawa.
    snakeFrozenUntil = 0;

    if (!snake || snake.over) {
        snake = createSnakeState();
        snakeSetupFloor();
        snakeSetStatus(`FLOOR 1 • ${snake.applesNeeded} APEL`);
    }

    snake.paused = false;
    snakeHideOverlay();
    snakeBindInput();
    startSnakeLoop();
    refreshSnakeUI();
    saveSnakeRun();
    snakeStartCountdown();
}

function exitSnakeGame() {
    playClickSound();
    triggerHaptic('light');

    stopSnakeLoop();
    snakeUnbindInput();
    snakeStopGachaReel();
    snakeHideOverlay();
    snakeHideCountdown();
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

    if (snake.pendingModal === 'floor') {
        snake.awaitingChoice = true;
        triggerSnakeFloorModal(false);
    } else if (snake.pendingModal === 'boss') {
        snake.awaitingChoice = true;
        triggerSnakeBossModal();
    } else {
        snake.awaitingChoice = false;
    }
    snakeStartCountdown();
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
