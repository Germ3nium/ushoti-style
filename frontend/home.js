// ── Slideshow (slides are set on the admin Settings tab) ──
let currentSlide = 0;
let autoplayTimer;
const SLIDE_DURATION = 5000;
const progressBar = document.getElementById('slide-progress');
let slides = document.querySelectorAll('.slide');
let dots   = document.querySelectorAll('.dot');

function goToSlide(n) {
  slides[currentSlide].classList.remove('active');
  dots[currentSlide].classList.remove('active');
  currentSlide = (n + slides.length) % slides.length;
  slides[currentSlide].classList.add('active');
  dots[currentSlide].classList.add('active');
  resetAutoplay();
}

function moveSlide(dir) { goToSlide(currentSlide + dir); }

function startProgress() {
  if (!progressBar) return;
  progressBar.style.transition = 'none';
  progressBar.style.width = '0%';
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      progressBar.style.transition = `width ${SLIDE_DURATION}ms linear`;
      progressBar.style.width = '100%';
    });
  });
}

function resetAutoplay() {
  clearInterval(autoplayTimer);
  if (slides.length < 2) return;
  startProgress();
  autoplayTimer = setInterval(() => moveSlide(1), SLIDE_DURATION);
}

// ── Slide photos ──
// Finds the product in each picture and places it clear of the slide's text, so
// any photo works without editing it first. Phones and tablets stack the photo above the text.
const STACKED_SLIDES = window.matchMedia('(max-width: 1024px)');
const MAX_PHOTO_ZOOM = 1.5;

function loadImageForAnalysis(url) {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // lets us read the pixels of photos stored on the backend
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// The middle 94% of a row or column of detail, as fractions of its length
function detailRange(totals) {
  const sum = totals.reduce((a, b) => a + b, 0);
  if (!sum) return [0, 1];
  let seen = 0, from = 0, to = totals.length - 1;
  totals.forEach((v, i) => {
    if (seen < sum * 0.03) from = i;
    seen += v;
    if (seen <= sum * 0.97) to = i;
  });
  return [from / totals.length, (to + 1) / totals.length];
}

// The product is where the fine detail is: plain or blurred backgrounds have almost none
function analysePhoto(img) {
  const w = 96, h = Math.max(8, Math.round(96 * img.naturalHeight / img.naturalWidth));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const pen = c.getContext('2d', { willReadFrequently: true });
  pen.drawImage(img, 0, 0, w, h);
  const px = pen.getImageData(0, 0, w, h).data; // throws for outside photos that forbid it
  const light = i => px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11;

  const cols = new Array(w).fill(0), rows = new Array(h).fill(0);
  const ring = [0, 0, 0];
  let ringCount = 0, ringLight = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
        ring[0] += px[i]; ring[1] += px[i + 1]; ring[2] += px[i + 2];
        ringCount++;
        ringLight.push(light(i));
      }
      if (x < w - 1 && y < h - 1) {
        const detail = Math.abs(light(i) - light(i + 4)) + Math.abs(light(i) - light(i + w * 4));
        if (detail > 12) { cols[x] += detail; rows[y] += detail; }
      }
    }
  }
  const avgLight = ringLight.reduce((a, b) => a + b, 0) / ringCount;
  const spread = ringLight.reduce((a, b) => a + Math.abs(b - avgLight), 0) / ringCount;
  // The range drops a little at each end, so add a margin to keep toes and heels in the box
  const [left, right] = detailRange(cols);
  const [top, bottom] = detailRange(rows);
  const padX = (right - left) * 0.07, padY = (bottom - top) * 0.07;
  return {
    w: img.naturalWidth,
    h: img.naturalHeight,
    box: {
      left: Math.max(0, left - padX), right: Math.min(1, right + padX),
      top: Math.max(0, top - padY), bottom: Math.min(1, bottom + padY)
    },
    studio: spread < 14, // an even background can be extended, so the photo may shrink to fit
    pale: avgLight > 150,
    colour: `rgb(${ring.map(v => Math.round(v / ringCount)).join(',')})`
  };
}

function placePhoto(el) {
  const info = el.photo;
  if (!info) return;
  const area = el.getBoundingClientRect();
  const W = area.width, H = area.height;
  const contentEl = el.querySelector('.slide-content');
  const content = contentEl.getBoundingClientRect();
  const textTop = content.top - area.top;
  el.style.setProperty('--text-top', `${textTop}px`); // the shading starts just above the text

  // The free space beside (or above) the text
  const stacked = STACKED_SLIDES.matches;
  const zone = stacked
    ? { l: W * 0.05, r: W * 0.95, t: 16, b: Math.max(textTop - 40, H * 0.3) }
    : { l: content.right - area.left - parseFloat(getComputedStyle(contentEl).paddingRight) + 24, r: W - 72, t: H * 0.12, b: H * 0.88 };

  const { box } = info;
  const cx = (box.left + box.right) / 2, cy = (box.top + box.bottom) / 2;
  const cover = Math.max(W / info.w, H / info.h);
  const scale = info.studio
    ? Math.min((zone.r - zone.l) / ((box.right - box.left) * info.w), (zone.b - zone.t) / ((box.bottom - box.top) * info.h), MAX_PHOTO_ZOOM)
    : cover;
  const pw = info.w * scale, ph = info.h * scale;
  let x = (zone.l + zone.r) / 2 - cx * pw;
  let y = (zone.t + zone.b) / 2 - cy * ph;

  // A busy background can't be extended: keep it filling the slide, apart from
  // sliding right on large screens to clear the text
  if (!info.studio) {
    x = Math.max(Math.min(x, stacked ? 0 : W * 0.35), W - pw);
    y = Math.max(Math.min(y, 0), H - ph);
  }

  el.style.setProperty('--photo-x', `${x}px`);
  el.style.setProperty('--photo-y', `${y}px`);
  el.style.setProperty('--photo-w', `${pw}px`);
  el.style.setProperty('--photo-h', `${ph}px`);
  el.style.backgroundColor = info.colour;
  el.classList.add('photo-placed');
  // A plain background needs no dark shading: the text sits straight on it
  el.classList.toggle('photo-plain', info.studio);
  el.classList.toggle('photo-pale', info.studio && info.pale);
  el.classList.toggle('photo-fade', x > 0 || y > 0 || x + pw < W || y + ph < H);
}

async function setSlidePhoto(el, url) {
  const img = await loadImageForAnalysis(url);
  try {
    if (img) el.photo = analysePhoto(img);
  } catch { /* an outside photo we can't read just fills the slide */ }
  placePhoto(el);
  el.style.backgroundImage = `url(${JSON.stringify(url)})`;
  el.classList.add('photo-ready');
}

function slideHtml(slide, i) {
  const buttons = (slide.buttons || []).map((b, n) =>
    `<a href="${escapeHtml(b.link)}" class="btn${n ? ' btn-outline' : ''}">${escapeHtml(b.label)}</a>`).join('');
  // Only the first slide's heading is the page's main heading
  const tag = i === 0 ? 'h1' : 'h2';
  return `
    <div class="slide${i === 0 ? ' active' : ''}" data-image="${escapeHtml(slide.image)}">
      <div class="slide-overlay"></div>
      <div class="slide-content">
        ${slide.eyebrow ? `<p class="hero-eyebrow">${escapeHtml(slide.eyebrow)}</p>` : ''}
        <${tag} class="slide-title">${escapeHtml(slide.title)}${slide.accent ? `<br/><span>${escapeHtml(slide.accent)}</span>` : ''}</${tag}>
        ${slide.text ? `<p>${escapeHtml(slide.text)}</p>` : ''}
        ${buttons ? `<div class="hero-actions">${buttons}</div>` : ''}
      </div>
    </div>`;
}

function renderSlides(list) {
  const slider = document.querySelector('.hero-slider');
  if (!slider || !list.length) return;
  slides.forEach(el => el.remove());
  slider.querySelector('.slider-arrow').insertAdjacentHTML('beforebegin', list.map(slideHtml).join(''));
  slides = slider.querySelectorAll('.slide');

  slider.querySelector('.slider-dots').innerHTML = list.map((_, i) =>
    `<button class="dot${i === 0 ? ' active' : ''}" onclick="goToSlide(${i})" aria-label="Show slide ${i + 1}"></button>`).join('');
  dots = slider.querySelectorAll('.dot');
  slider.classList.toggle('single-slide', list.length < 2);

  currentSlide = 0;
}

// The hero stays empty until the real slides arrive, so the backup slides
// written into the page never flash up first
function showSlides() {
  document.querySelector('.hero-slider').classList.remove('hero-loading');
  slides.forEach(el => setSlidePhoto(el, el.dataset.image));
  resetAutoplay();
}

Promise.race([
  loadSettings(),
  new Promise((_, reject) => setTimeout(reject, 6000))
])
  .then(settings => renderSlides(settings.slides || []))
  .catch(() => { /* keep the slides written into the page */ })
  .finally(showSlides);

window.addEventListener('resize', () => slides.forEach(placePhoto));
if (document.fonts) document.fonts.ready.then(() => slides.forEach(placePhoto)); // text widths change as fonts arrive

// ── Particles ────────────────────────────────────────────
const canvas = document.getElementById('particles-canvas');
const ctx    = canvas.getContext('2d');
let particles = [];

function resizeCanvas() {
  canvas.width  = document.documentElement.clientWidth; // excludes the scrollbar, so no sideways scroll
  canvas.height = window.innerHeight;
}

function createParticles() {
  particles = [];
  for (let i = 0; i < 55; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.5 + 0.3,
      dx: (Math.random() - 0.5) * 0.3,
      dy: (Math.random() - 0.5) * 0.3,
      alpha: Math.random() * 0.5 + 0.1
    });
  }
}

function drawParticles() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  particles.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(184,146,42,${p.alpha})`;
    ctx.fill();
    p.x += p.dx;
    p.y += p.dy;
    if (p.x < 0 || p.x > canvas.width)  p.dx *= -1;
    if (p.y < 0 || p.y > canvas.height) p.dy *= -1;
  });
  requestAnimationFrame(drawParticles);
}

resizeCanvas();
createParticles();
drawParticles();
window.addEventListener('resize', () => { resizeCanvas(); createParticles(); });

// ── Scroll Reveal ────────────────────────────────────────
const revealEls = document.querySelectorAll('.reveal, .reveal-left, .reveal-right');
const observer  = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); } });
}, { threshold: 0.12 });
revealEls.forEach(el => observer.observe(el));

// ── Trending Footwear photos (set on the admin Settings tab) ──
function storyHtml(story) {
  return `
    <a href="sneakers.html" class="story">
      <div class="story-img">
        <img src="${escapeHtml(story.image)}" alt="${escapeHtml(story.title)}" loading="lazy" onerror="${IMG_ONERROR}"/>
      </div>
      <h3 class="story-title">${escapeHtml(story.title)}</h3>
    </a>`;
}

function renderStories() {
  const box = document.getElementById('stories');
  if (!box) return;

  loadSettings().then(settings => {
    const stories = settings.stories || [];
    box.closest('.stories').hidden = !stories.length;
    box.innerHTML = stories.map(storyHtml).join('');
  }).catch(() => { /* keep the photos written into the page */ });
}

renderStories();

// ── Newsletter Subscription ──────────────────────────────
function subscribeNewsletter(e) {
  e.preventDefault();
  const input = document.getElementById('newsletter-email');
  if (input && input.value) {
    if (typeof showToast === 'function') {
      showToast(`Welcome! ${input.value} is now subscribed to Ushoti VIP Drops.`);
    }
    input.value = '';
  }
}

// ── Active nav link ──────────────────────────────────────
document.querySelectorAll('.nav-links a').forEach(link => {
  link.addEventListener('click', function() {
    document.querySelectorAll('.nav-links a').forEach(l => l.classList.remove('active'));
    this.classList.add('active');
  });
});
