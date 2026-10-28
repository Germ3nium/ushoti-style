// ── Slideshow ────────────────────────────────────────────
let currentSlide = 0;
let autoplayTimer;
let progressTimer;
const SLIDE_DURATION = 5000;
const slides = document.querySelectorAll('.slide');
const dots   = document.querySelectorAll('.dot');
const progressBar = document.getElementById('slide-progress');

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
  startProgress();
  autoplayTimer = setInterval(() => moveSlide(1), SLIDE_DURATION);
}

resetAutoplay();

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

// ── Animated Counters ────────────────────────────────────
const counters = document.querySelectorAll('.stat-number[data-target]');
const counterObserver = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (!e.isIntersecting) return;
    const el     = e.target;
    const target = parseInt(el.dataset.target);
    const suffix = target >= 500 ? '+' : (target === 9 ? '' : '+');
    let current  = 0;
    const step   = Math.ceil(target / 60);
    const timer  = setInterval(() => {
      current += step;
      if (current >= target) { current = target; clearInterval(timer); }
      el.textContent = current + suffix;
    }, 25);
    counterObserver.unobserve(el);
  });
}, { threshold: 0.5 });
counters.forEach(c => counterObserver.observe(c));

// ── Trending Footwear stories (set on the admin Settings tab) ──
function storyHtml(story, i) {
  const facts = (story.facts || []).map(f =>
    `<div><dt>${escapeHtml(f.label)}</dt><dd>${escapeHtml(f.value)}</dd></div>`).join('');
  return `
    <article class="story${i % 2 ? ' story-reverse' : ''}">
      <div class="story-img">
        <img src="${escapeHtml(story.image)}" alt="${escapeHtml(story.title)}" loading="lazy" onerror="${IMG_ONERROR}"/>
      </div>
      <div class="story-body">
        ${story.eyebrow ? `<span class="story-eyebrow">${escapeHtml(story.eyebrow)}</span>` : ''}
        <h3 class="story-title">${escapeHtml(story.title)}</h3>
        ${story.description ? `<p class="story-desc">${escapeHtml(story.description)}</p>` : ''}
        ${facts ? `<dl class="story-facts">${facts}</dl>` : ''}
        <div class="story-buy" data-story-product="${escapeHtml(story.product_id || '')}" hidden>
          <span class="story-price"></span>
          <button class="btn" type="button">Shop Now</button>
        </div>
      </div>
    </article>`;
}

function renderStories() {
  const box = document.getElementById('stories');
  if (!box) return;

  loadSettings().then(settings => {
    const stories = settings.stories || [];
    box.closest('.stories').hidden = !stories.length;
    box.innerHTML = stories.map(storyHtml).join('');
    return loadProducts();
  }).then(() => {
    // Price and button only show for products still in the shop
    box.querySelectorAll('[data-story-product]').forEach(buy => {
      const p = productsById[buy.dataset.storyProduct];
      if (!p) return;
      buy.querySelector('.story-price').innerHTML = priceHtml(p);
      buy.querySelector('button').addEventListener('click', () => openProductModal(p.id));
      buy.hidden = false;
    });
  }).catch(() => { /* keep the stories written into the page */ });
}

renderStories();

// ── Wishlist Toggle ──────────────────────────────────────
function toggleWishlist(e, name) {
  e.stopPropagation();
  const btn = e.target.closest('.wishlist-btn');
  const isFilled = btn.classList.toggle('active');
  if (typeof showToast === 'function') {
    showToast(isFilled ? `${name} added to your wishlist!` : `${name} removed from your wishlist.`);
  }
}

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
