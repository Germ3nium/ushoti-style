// ── Sidebar ──────────────────────────────────────────────
function openSidebar() {
  document.getElementById('sidebar-overlay').classList.add('open');
}

function closeSidebar() {
  document.getElementById('sidebar-overlay').classList.remove('open');
}

function toggleSidebarSection(btn) {
  btn.closest('.sidebar-section').classList.toggle('open');
}

document.addEventListener('click', e => {
  const overlay = document.getElementById('sidebar-overlay');
  if (overlay && e.target === overlay) closeSidebar();
});

// ── Backend & Products ───────────────────────────────────────
// Local `wrangler dev` runs the backend on port 8787 ('' = page opened as a file)
const API_BASE = ['localhost', '127.0.0.1', ''].includes(location.hostname)
  ? 'http://localhost:8787'
  : 'https://ushoti-style-worker.sihlek56.workers.dev';

// Delivery fee and banner messages are set on the admin Settings tab.
// R80 shows until the real fee loads; the backend always charges its own stored fee.
let shippingFee = 80;
let paxiFee = 150;
let expressFee = null; // null until the admin turns Express on
let expressTime = '';
let comboDeals = []; // set on the admin Settings tab
let settingsPromise = null;

function loadSettings() {
  if (!settingsPromise) {
    settingsPromise = fetch(`${API_BASE}/api/settings`)
      .then(res => res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`)))
      .then(settings => {
        if (Number.isFinite(settings.shipping_fee)) shippingFee = settings.shipping_fee;
        if (Number.isFinite(settings.paxi_fee)) paxiFee = settings.paxi_fee;
        if (Number.isFinite(settings.express_fee)) expressFee = settings.express_fee;
        expressTime = settings.express_time || '';
        comboDeals = Array.isArray(settings.combo_deals) ? settings.combo_deals : [];
        return settings;
      });
  }
  return settingsPromise;
}

// The track holds the messages twice so the scroll loops without a gap
function renderBanner(messages) {
  const track = document.getElementById('marquee-track');
  if (!track) return;
  const strip = track.closest('.marquee-strip');
  strip.hidden = !messages.length;
  if (!messages.length) return;
  const once = messages
    .map(m => `<span>${escapeHtml(m)}</span><span class="dot-sep">&bull;</span>`)
    .join('');
  // Repeat short lists so the strip is always filled edge to edge
  const repeats = Math.max(1, Math.ceil(6 / messages.length));
  track.innerHTML = once.repeat(repeats * 2);
}

let productsPromise = null;
let productsById = {};

function loadProducts() {
  if (!productsPromise) {
    productsPromise = fetch(`${API_BASE}/api/products`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(list => {
        productsById = Object.fromEntries(list.map(p => [p.id, p]));
        return list;
      })
      .catch(err => {
        productsPromise = null; // allow a retry on the next call
        throw err;
      });
  }
  return productsPromise;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function formatRand(amount) {
  return `R${String(Math.round(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

// Shown when a product image link is broken
const IMAGE_FALLBACK = 'https://placehold.co/600x500/f2ede4/8a6f2e?text=Ushoti+Style';
const IMG_ONERROR = `this.onerror=null;this.src='${IMAGE_FALLBACK}'`;

// Resize Unsplash images; other image links are used as-is
function sizedImage(url, w, h) {
  return /images\.unsplash\.com/.test(url)
    ? url.replace(/w=\d+&h=\d+/, `w=${w}&h=${h}`)
    : url;
}

// Hair can have its own price per length: [{ length, price, was_price }]
function productVariants(p) {
  return p.options?.variants || [];
}

function hasPriceRange(p) {
  return new Set(productVariants(p).map(v => v.price)).size > 1;
}

function discountPercent(p) {
  return p.was_price > p.price ? Math.round((1 - p.price / p.was_price) * 100) : 0;
}

// was_price is only sent while a product (or one of its lengths) is on sale
function isOnSale(p) {
  return discountPercent(p) > 0 || productVariants(p).some(v => discountPercent(v) > 0);
}

function priceHtml(p) {
  const from = hasPriceRange(p) ? 'From ' : '';
  return from + (discountPercent(p) > 0
    ? `<s class="was-price">${formatRand(p.was_price)}</s> <span class="sale-price">${formatRand(p.price)}</span>`
    : formatRand(p.price));
}

// Deals this sneaker can be part of, at the price it sells for now
// Adult deals only count adult sneakers, kids deals only kids sneakers
function comboDealsFor(p) {
  return p?.options?.combo && p.category !== 'hair'
    ? comboDeals.filter(d => (d.group || 'sneakers') === p.category && d.items.includes(p.price))
    : [];
}

// e.g. "2 × R1,100 sneakers for R1,500" or "R1,100 + R1,350 sneakers for R1,800"
function comboDealText(deal) {
  const counts = {};
  deal.items.forEach(p => { counts[p] = (counts[p] || 0) + 1; });
  const parts = Object.entries(counts).map(([p, n]) => `${n > 1 ? `${n} × ` : ''}${formatRand(p)}`);
  return `${parts.join(' + ')} ${deal.group === 'kids' ? 'kids sneakers' : 'sneakers'} for ${formatRand(deal.price)}`;
}

// Cards get the tag; the product pop-up also lists the deals
function comboNoteHtml(p, { details = false } = {}) {
  const deals = comboDealsFor(p);
  if (!deals.length) return '';
  return `<div class="combo-note"><span class="combo-tag">Combo eligible</span>
    ${details ? `<ul class="combo-deals">${deals.map(d => `<li>${comboDealText(d)}</li>`).join('')}</ul>` : ''}</div>`;
}

function cartComboDiscount() {
  return ['sneakers', 'kids'].reduce((saving, group) => {
    const units = cart
      .filter(item => {
        const p = productsById[item.id.split('-')[0]];
        return p?.options?.combo && p.category === group;
      })
      .flatMap(item => Array(item.qty).fill(item.price));
    return saving + comboSaving(units, comboDeals.filter(d => (d.group || 'sneakers') === group));
  }, 0);
}

function comboLineHtml(discount) {
  return discount > 0
    ? `<div class="summary-line combo-line"><span>Combo deal</span><span>&minus;R${discount.toFixed(2)}</span></div>`
    : '';
}

// Same as the backend's comboSaving, so the checkout shows exactly what is charged
function comboSaving(unitPrices, deals) {
  if (!deals.length) return 0;
  const prices = [...new Set(deals.flatMap(d => d.items))];
  const counts = prices.map(p => unitPrices.filter(u => u === p).length);
  const needs = deals.map(d => prices.map(p => d.items.filter(i => i === p).length));
  const full = c => c.reduce((s, n, i) => s + n * prices[i], 0);
  const take = (c, k) => c.map((n, i) => n - needs[k][i]);
  const fits = (c, k) => needs[k].every((n, i) => n <= c[i]);

  // Trying every mix is quick for real carts; a huge cart falls back to the best deal each time
  const states = counts.reduce((s, n) => s * (n + 1), 1);
  if (states > 20000) {
    let c = counts, total = 0;
    for (;;) {
      let pick = -1, saved = 0;
      deals.forEach((d, k) => {
        const s = full(needs[k]) - d.price;
        if (fits(c, k) && s > saved) { pick = k; saved = s; }
      });
      if (pick < 0) return full(counts) - (total + full(c));
      total += deals[pick].price;
      c = take(c, pick);
    }
  }

  const memo = new Map();
  const best = c => {
    const key = c.join(',');
    if (!memo.has(key)) {
      let total = full(c);
      deals.forEach((d, k) => {
        if (fits(c, k)) total = Math.min(total, d.price + best(take(c, k)));
      });
      memo.set(key, total);
    }
    return memo.get(key);
  };
  return full(counts) - best(counts);
}

// Screen reader version of priceHtml
function priceText(p) {
  const sale = isOnSale(p) ? 'on sale, ' : '';
  const was = discountPercent(p) > 0 ? `was ${formatRand(p.was_price)}, now ` : '';
  return `${sale}${was}${hasPriceRange(p) ? 'from ' : ''}${formatRand(p.price)}`;
}

function tagsHtml(p) {
  // Only name a percentage if it's true of every length
  const percents = new Set((productVariants(p).length ? productVariants(p) : [p]).map(discountPercent));
  const percent = percents.size === 1 ? [...percents][0] : 0;
  const sale = isOnSale(p)
    ? `<span class="sale-tag">Sale${percent ? ` &minus;${percent}%` : ''}</span>`
    : '';
  const badge = p.badge
    ? `<span class="product-badge${sale ? ' product-badge-below' : ''}">${escapeHtml(p.badge)}</span>`
    : '';
  return sale + badge;
}

function productUrl(p) {
  return `product.html?id=${encodeURIComponent(p.id)}`;
}

// Each card is a link to the product's own page
function productCardHtml(p) {
  const name = escapeHtml(p.name);
  const photos = productPhotos(p);
  return `
    <a class="product-card" href="${productUrl(p)}" data-category="${p.category}" data-id="${escapeHtml(p.id)}" aria-label="${name}, ${priceText(p)}${photos.length > 1 ? `, ${photos.length} photos` : ''}">
      <div class="product-card-img">
        <img src="${escapeHtml(sizedImage(p.image, 400, 260))}" alt="${name}" loading="lazy" onerror="${IMG_ONERROR}"/>
        ${photos.length > 1 ? `
        <img class="product-card-img-alt" src="${escapeHtml(sizedImage(photos[1], 400, 260))}" alt="" loading="lazy" onerror="this.remove()"/>
        <span class="photo-count" title="${photos.length} photos">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
          ${photos.length}
        </span>` : ''}
        ${tagsHtml(p)}
      </div>
      <div class="product-info">
        <h3>${name}</h3>
        <div class="price">${priceHtml(p)}</div>
        ${comboNoteHtml(p)}
      </div>
    </a>`;
}

// Fills any <div data-products="sneakers|kids|hair"> grid on the page (list several
// categories with spaces); add data-sale to show only their sale items
function renderCategoryGrids() {
  const grids = document.querySelectorAll('[data-products]');
  if (!grids.length) return;

  grids.forEach(grid => {
    grid.innerHTML = '<p class="products-status">Loading products…</p>';
  });

  // Settings say whether the combo deal is on; the products still show without them
  Promise.all([loadProducts(), loadSettings().catch(() => null)]).then(([list]) => {
    grids.forEach(grid => {
      const saleOnly = grid.hasAttribute('data-sale');
      const categories = grid.dataset.products.split(' ');
      const items = list.filter(p => categories.includes(p.category) && (!saleOnly || isOnSale(p)));
      grid.innerHTML = items.length
        ? items.map(p => productCardHtml(p)).join('')
        : `<p class="products-status">${saleOnly
            ? 'Nothing on sale right now — check back soon.'
            : 'No products here yet — check back soon.'}</p>`;
    });
  }).catch(() => {
    grids.forEach(grid => {
      grid.innerHTML = '<p class="products-status">We couldn\'t load products right now. Please refresh the page.</p>';
    });
  });
}

// Keeps hand-written promo blocks in sync with admin: live prices, and the
// block is hidden if the product is removed or hidden from the shop
function syncPromoProducts() {
  const cards  = document.querySelectorAll('[data-product-card]');
  const prices = document.querySelectorAll('[data-product-price]');
  if (!cards.length && !prices.length) return;

  loadProducts().then(() => {
    prices.forEach(el => {
      const p = productsById[el.dataset.productPrice];
      if (p) el.innerHTML = priceHtml(p);
    });
    cards.forEach(el => {
      el.hidden = !productsById[el.dataset.productCard];
    });
  }).catch(() => { /* keep the written-in prices */ });
}

function productPhotos(p) {
  return p.images && p.images.length ? p.images : [p.image];
}

// ── Cart State ──────────────────────────────────────────────
let cart = JSON.parse(localStorage.getItem('ushoti_cart')) || [];

function saveCart() {
  localStorage.setItem('ushoti_cart', JSON.stringify(cart));
  updateCartBadge();
}

function updateCartBadge() {
  const badge = document.querySelector('.cart-count');
  if (badge) {
    const total = cart.reduce((sum, i) => sum + i.qty, 0);
    badge.textContent = total;
    badge.style.display = total > 0 ? 'flex' : 'none';
    if (total > 0) {
      badge.classList.remove('pulse');
      void badge.offsetWidth;
      badge.classList.add('pulse');
    }
  }
}

// ── Add to Cart ──────────────────────────────────────────────
function addToCart(id, name, price, image) {
  const existing = cart.find(i => i.id === id);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({ id, name, price, image, qty: 1 });
  }
  saveCart();
  showToast(`${name} added to cart!`);
}

// A saved cart can hold old prices; show what the backend will actually charge
function syncCartPrices() {
  if (!cart.length) return;
  loadProducts().then(() => {
    let changed = false;
    cart.forEach(item => {
      const [productId, option] = item.id.split('-');
      const p = productsById[productId];
      if (!p) return; // the backend reports unavailable products at checkout
      const variant = productVariants(p).find(v => v.length === parseInt(option, 10));
      const price = variant ? variant.price : p.price;
      if (price !== item.price) {
        item.price = price;
        changed = true;
      }
    });
    if (changed) saveCart();
    renderCart(); // the combo discount needs the products, so always redraw

    renderOrderSummary();
  }).catch(() => { /* the backend still charges the right price */ });
}

// ── Toast ────────────────────────────────────────────────────
function showToast(msg) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

// ── Cart Page ────────────────────────────────────────────────
function renderCart() {
  const container = document.getElementById('cart-items');
  const summaryEl = document.getElementById('cart-summary');
  if (!container) return;

  if (cart.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <h2>Your cart is empty</h2>
        <p>Browse our collection and add items to your cart.</p>
        <a href="products.html" class="btn" style="margin-top:1rem">Shop Now</a>
      </div>`;
    if (summaryEl) summaryEl.style.display = 'none';
    return;
  }

  container.innerHTML = cart.map(item => `
    <div class="cart-item">
      <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" onerror="this.src='https://placehold.co/80x80/1a1a1a/c9a84c?text=Item'">
      <div class="cart-item-info">
        <h4>${escapeHtml(item.name)}</h4>
        <div class="price">R${(item.price * item.qty).toFixed(2)}</div>
      </div>
      <div class="qty-controls">
        <button onclick="changeQty('${item.id}', -1)">−</button>
        <span>${item.qty}</span>
        <button onclick="changeQty('${item.id}', 1)">+</button>
      </div>
      <button class="remove-btn" onclick="removeItem('${item.id}')" title="Remove item">
        <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
      </button>
    </div>
  `).join('');

  const subtotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  const shipping = subtotal > 0 ? shippingFee : 0;
  const discount = cartComboDiscount();
  const total = subtotal - discount + shipping;

  if (summaryEl) {
    summaryEl.style.display = 'block';
    summaryEl.innerHTML = `
      <div class="summary-line"><span>Subtotal</span><span>R${subtotal.toFixed(2)}</span></div>
      ${comboLineHtml(discount)}
      <div class="summary-line"><span>Courier delivery</span><span>R${shipping.toFixed(2)}</span></div>
      <div class="summary-line total"><span>Total</span><span>R${total.toFixed(2)}</span></div>
      <a href="checkout.html" class="btn" style="margin-top:1rem;display:inline-block">Proceed to Checkout</a>
    `;
  }
}

function changeQty(id, delta) {
  const item = cart.find(i => i.id === id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) cart = cart.filter(i => i.id !== id);
  saveCart();
  renderCart();
}

function removeItem(id) {
  cart = cart.filter(i => i.id !== id);
  saveCart();
  renderCart();
}

// ── Checkout Page ────────────────────────────────────────────
function renderOrderSummary() {
  const box = document.getElementById('order-summary');
  if (!box) return;

  const subtotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  const method = document.querySelector('input[name="delivery_method"]:checked')?.value;
  const shipping = method === 'paxi' ? paxiFee : method === 'express' ? expressFee : shippingFee;
  const discount = cartComboDiscount();
  const total = subtotal - discount + shipping;

  document.getElementById('courier-price').textContent = `R${shippingFee.toFixed(2)}`;
  document.getElementById('paxi-price').textContent = `R${paxiFee.toFixed(2)}`;
  document.getElementById('express-option').hidden = expressFee === null;
  if (expressFee !== null) {
    document.getElementById('express-price').textContent = `R${expressFee.toFixed(2)}`;
    document.getElementById('express-time').textContent = expressTime;
  }

  box.innerHTML = `
    ${cart.map(i => `
      <div class="summary-line">
        <span>${escapeHtml(i.name)} × ${i.qty}</span>
        <span>R${(i.price * i.qty).toFixed(2)}</span>
      </div>`).join('')}
    ${comboLineHtml(discount)}
    <div class="summary-line"><span>${{ paxi: 'PAXI delivery', express: 'Express delivery' }[method] || 'Courier delivery'}</span><span>R${shipping.toFixed(2)}</span></div>
    <div class="summary-line total"><span>Total</span><span>R${total.toFixed(2)}</span></div>
  `;

  // Set hidden PayFast amount field
  const amountField = document.getElementById('pf_amount');
  if (amountField) amountField.value = total.toFixed(2);

  // Set item name summary
  const itemNameField = document.getElementById('pf_item_name');
  if (itemNameField) {
    itemNameField.value = cart.map(i => `${i.name} x${i.qty}`).join(', ');
  }
}

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  updateCartBadge();
  renderCart();
  renderOrderSummary();
  if (document.getElementById('cart-summary') || document.getElementById('order-summary') || document.getElementById('marquee-track')) {
    loadSettings()
      .then(settings => { renderCart(); renderOrderSummary(); renderBanner(settings.banner || []); })
      .catch(() => { /* keep the defaults written into the page */ });
  }
  if (document.getElementById('cart-summary') || document.getElementById('order-summary')) syncCartPrices();
  renderCategoryGrids();
  syncPromoProducts();
});
