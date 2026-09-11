// ============================================================
// PDFTV | EXPERIENCE ROOM - LANDING (index.html)
// Typewriter + slider. Hanya dimuat di halaman utama.
// ============================================================

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

// --- SLIDER ENGINE ---
let currentSlide = 0;
const totalSlides = 4;
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

// --- STATISTIK PENGUNJUNG ---
// Hanya halaman landing yang mencatat kunjungan (permintaan pemilik situs).
// Server yang menentukan unik/tidak (hash IP), jadi panggilan berulang aman;
// flag sesi dipakai supaya tidak menembak RPC tiap kali halaman dimuat ulang.
const VISIT_FLAG = 'pdftv_visit_logged';

async function recordVisit() {
    try {
        if (sessionStorage.getItem(VISIT_FLAG)) return;
    } catch (e) {
        // sessionStorage diblokir: lanjut saja, server yang dedup
    }

    try {
        const { error } = await supabaseClient.rpc('record_visit');
        if (error) {
            console.warn('Gagal mencatat kunjungan:', rpcErrorMessage(error));
            return;
        }
        try { sessionStorage.setItem(VISIT_FLAG, '1'); } catch (e) { /* abaikan */ }
    } catch (err) {
        console.warn('Gagal mencatat kunjungan:', err);
    }
}

// --- INIT HALAMAN LANDING ---
window.addEventListener('DOMContentLoaded', () => {
    recordVisit();
    if (typeof loadPlatformStats === 'function') loadPlatformStats();
});
