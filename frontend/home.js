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
  canvas.width  = window.innerWidth;
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

// ── Featured Products (Sneakers vs Hair) ─────────────────
const featuredGrid = document.getElementById('featured-grid');
let featuredCounts = { sneakers: 0, hair: 0 };

function renderFeatured() {
  featuredGrid.innerHTML = '<p class="products-status">Loading products…</p>';
  bindProductCards(featuredGrid);

  loadProducts().then(list => {
    featuredCounts = {
      sneakers: list.filter(p => p.category === 'sneakers').length,
      hair:     list.filter(p => p.category === 'hair').length
    };
    document.querySelectorAll('.filter-btn[data-filter]').forEach(btn => {
      const label = btn.dataset.filter === 'sneakers' ? 'Sneakers' : 'Hair &amp; Wigs';
      btn.innerHTML = `${label} (${featuredCounts[btn.dataset.filter]})`;
    });
    featuredGrid.innerHTML = list.map(p => productCardHtml(p, { featured: true })).join('');
    filterFeatured('sneakers', document.querySelector('.filter-btn[data-filter="sneakers"]'));
  }).catch(() => {
    featuredGrid.innerHTML = '<p class="products-status">We couldn\'t load products right now. Please refresh the page.</p>';
  });
}

function filterFeatured(category, btn) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  const labelEl = document.getElementById('featured-label');
  const titleEl = document.getElementById('featured-title');
  const viewAllLink = document.getElementById('section-view-all');
  const arrow = '<svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>';

  if (category === 'sneakers') {
    if (labelEl) labelEl.textContent = 'The Sneaker Vault';
    if (titleEl) titleEl.textContent = 'Trending Footwear';
    if (viewAllLink) {
      viewAllLink.href = 'sneakers.html';
      viewAllLink.innerHTML = `View All Sneakers (${featuredCounts.sneakers}) ${arrow}`;
    }
  } else if (category === 'hair') {
    if (labelEl) labelEl.textContent = 'Crown & Glory Boutique';
    if (titleEl) titleEl.textContent = 'Luxury Extensions & Wigs';
    if (viewAllLink) {
      viewAllLink.href = 'hair.html';
      viewAllLink.innerHTML = `View All Hair (${featuredCounts.hair}) ${arrow}`;
    }
  }

  featuredGrid.querySelectorAll('.product-card').forEach(card => {
    card.style.display = card.dataset.category === category ? 'block' : 'none';
  });
}

renderFeatured();

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
