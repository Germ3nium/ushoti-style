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
let settingsPromise = null;

function loadSettings() {
  if (!settingsPromise) {
    settingsPromise = fetch(`${API_BASE}/api/settings`)
      .then(res => res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`)))
      .then(settings => {
        if (Number.isFinite(settings.shipping_fee)) shippingFee = settings.shipping_fee;
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

// was_price is only sent while a product is on sale
function isOnSale(p) {
  return p.was_price > p.price;
}

function priceHtml(p) {
  return isOnSale(p)
    ? `<s class="was-price">${formatRand(p.was_price)}</s> <span class="sale-price">${formatRand(p.price)}</span>`
    : formatRand(p.price);
}

function tagsHtml(p) {
  const sale = isOnSale(p)
    ? `<span class="sale-tag">Sale &minus;${Math.round((1 - p.price / p.was_price) * 100)}%</span>`
    : '';
  const badge = p.badge
    ? `<span class="product-badge${sale ? ' product-badge-below' : ''}">${escapeHtml(p.badge)}</span>`
    : '';
  return sale + badge;
}

function productCardHtml(p, { featured = false } = {}) {
  const name = escapeHtml(p.name);
  const label = p.category === 'sneakers' ? 'Footwear' : 'Hair &amp; Wigs';
  const photos = productPhotos(p);
  return `
    <div class="product-card" data-category="${p.category}" data-id="${escapeHtml(p.id)}" tabindex="0" role="button" aria-label="${name}, ${isOnSale(p) ? `on sale, was ${formatRand(p.was_price)}, now ` : ''}${formatRand(p.price)}${photos.length > 1 ? `, ${photos.length} photos` : ''}">
      <div class="product-card-img">
        <img src="${escapeHtml(sizedImage(p.image, 400, 260))}" alt="${name}" loading="lazy" onerror="${IMG_ONERROR}"/>
        ${photos.length > 1 ? `
        <img class="product-card-img-alt" src="${escapeHtml(sizedImage(photos[1], 400, 260))}" alt="" loading="lazy" onerror="this.remove()"/>
        <span class="photo-count" title="${photos.length} photos">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
          ${photos.length}
        </span>` : ''}
        ${tagsHtml(p)}
        ${featured ? `
        <button class="wishlist-btn" data-wishlist="${name}" title="Add to Wishlist" aria-label="Add to Wishlist">
          <svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
        </button>` : ''}
      </div>
      <div class="product-info">
        ${featured ? `<div class="product-meta-header"><span class="product-cat">${label}</span></div>` : ''}
        <h3>${name}</h3>
        ${featured
          ? `<div class="price-stock-row"><div class="price">${priceHtml(p)}</div></div>`
          : `<div class="price">${priceHtml(p)}</div>`}
      </div>
    </div>`;
}

// Cards open their product's options; works for mouse and keyboard
function bindProductCards(container) {
  container.addEventListener('click', e => {
    const wish = e.target.closest('.wishlist-btn');
    if (wish) {
      e.stopPropagation();
      if (typeof toggleWishlist === 'function') toggleWishlist(e, wish.dataset.wishlist);
      return;
    }
    const card = e.target.closest('.product-card');
    if (card) openProductModal(card.dataset.id);
  });
  container.addEventListener('keydown', e => {
    const card = e.target.closest('.product-card');
    if (card && e.target === card && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      openProductModal(card.dataset.id);
    }
  });
}

// Fills any <div data-products="sneakers|hair"> grid on the page;
// add data-sale to show only that category's sale items
function renderCategoryGrids() {
  const grids = document.querySelectorAll('[data-products]');
  if (!grids.length) return;

  grids.forEach(grid => {
    grid.innerHTML = '<p class="products-status">Loading products…</p>';
    bindProductCards(grid);
  });

  loadProducts().then(list => {
    grids.forEach(grid => {
      const saleOnly = grid.hasAttribute('data-sale');
      const items = list.filter(p => p.category === grid.dataset.products && (!saleOnly || isOnSale(p)));
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

function openProductModal(id) {
  loadProducts().then(() => {
    const p = productsById[id];
    if (!p) return showToast('Sorry, that product is no longer available.');
    if (p.category === 'sneakers') openSneakerModal(p);
    else openHairModal(p);
  }).catch(() => showToast('Couldn\'t load product details. Please try again.'));
}

// ── Modal photo gallery ─────────────────────────────────────
function productPhotos(p) {
  return p.images && p.images.length ? p.images : [p.image];
}

function modalGalleryHtml(p) {
  const photos = productPhotos(p);
  const name = escapeHtml(p.name);
  const many = photos.length > 1;
  return `
    <img class="modal-main-img" src="${escapeHtml(sizedImage(photos[0], 600, 500))}" alt="${name}, photo 1 of ${photos.length}" onerror="${IMG_ONERROR}"/>
    ${tagsHtml(p)}
    ${many ? `
    <button type="button" class="modal-nav modal-nav-prev" aria-label="Previous photo">&#8249;</button>
    <button type="button" class="modal-nav modal-nav-next" aria-label="Next photo">&#8250;</button>
    <span class="modal-counter" aria-live="polite">1 / ${photos.length}</span>
    <div class="modal-thumbs">
      ${photos.map((url, i) => `
        <button type="button" class="modal-thumb${i === 0 ? ' active' : ''}" data-index="${i}"
                aria-label="Show photo ${i + 1} of ${photos.length}"${i === 0 ? ' aria-current="true"' : ''}>
          <img src="${escapeHtml(sizedImage(url, 96, 96))}" alt="" onerror="${IMG_ONERROR}"/>
        </button>`).join('')}
    </div>` : ''}`;
}

// Arrows, thumbnails, swipe and the ← → keys all move through the same photos
function bindModalGallery(overlay, p) {
  const photos = productPhotos(p);
  if (photos.length < 2) return;
  const main = overlay.querySelector('.modal-main-img');
  const counter = overlay.querySelector('.modal-counter');
  const thumbs = [...overlay.querySelectorAll('.modal-thumb')];
  let current = 0;

  const show = i => {
    current = (i + photos.length) % photos.length;
    main.setAttribute('onerror', IMG_ONERROR);
    main.src = sizedImage(photos[current], 600, 500);
    main.alt = `${p.name}, photo ${current + 1} of ${photos.length}`;
    counter.textContent = `${current + 1} / ${photos.length}`;
    thumbs.forEach((t, n) => {
      t.classList.toggle('active', n === current);
      t.toggleAttribute('aria-current', n === current);
    });
    thumbs[current].scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  overlay.querySelector('.modal-nav-prev').addEventListener('click', () => show(current - 1));
  overlay.querySelector('.modal-nav-next').addEventListener('click', () => show(current + 1));
  thumbs.forEach(t => t.addEventListener('click', () => show(Number(t.dataset.index))));

  let touchX = null;
  main.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; }, { passive: true });
  main.addEventListener('touchend', e => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) > 40) show(current + (dx < 0 ? 1 : -1));
  });

  const onKey = e => {
    if (!document.body.contains(overlay)) return document.removeEventListener('keydown', onKey);
    if (e.key === 'ArrowLeft')  show(current - 1);
    if (e.key === 'ArrowRight') show(current + 1);
  };
  document.addEventListener('keydown', onKey);
}

// ── Hair Modal ──────────────────────────────────────────────
function openHairModal(p) {
  const id = p.id;
  let selectedInch = null;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-img">
        <button class="modal-close" aria-label="Close">&times;</button>
        ${modalGalleryHtml(p)}
      </div>
      <div class="modal-body">
        <div>
          <div class="modal-title">${escapeHtml(p.name)}</div>
          <div class="modal-price">${priceHtml(p)}</div>
          ${p.description ? `<p style="font-size:0.82rem;color:var(--text-muted);line-height:1.6;margin-top:0.6rem;">${escapeHtml(p.description)}</p>` : ''}
        </div>
        <div>
          <div class="modal-label">Length (inches)</div>
          <div class="size-grid">
            ${(p.options.lengths || []).map(i => `<button class="size-btn" data-inch="${i}">${i}"</button>`).join('')}
          </div>
        </div>
        <div class="modal-selection-info" id="modal-sel-info">Select a length</div>
        <button class="btn" id="modal-add-btn" style="width:100%" disabled>Add to Cart</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  bindModalGallery(overlay, p);
  requestAnimationFrame(() => overlay.classList.add('open'));

  const infoEl = overlay.querySelector('#modal-sel-info');
  const addBtn = overlay.querySelector('#modal-add-btn');

  overlay.querySelectorAll('.size-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      overlay.querySelectorAll('.size-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedInch = btn.dataset.inch;
      infoEl.textContent = `${selectedInch}" selected`;
      addBtn.disabled = false;
    });
  });

  addBtn.addEventListener('click', () => {
    const itemId   = `${id}-${selectedInch}in`;
    const itemName = `${p.name} (${selectedInch}")`;
    const thumbUrl = sizedImage(p.image, 80, 80);
    closeModal(overlay);
    setTimeout(() => addToCart(itemId, itemName, p.price, thumbUrl), 320);
  });

  overlay.querySelector('.modal-close').addEventListener('click', () => closeModal(overlay));
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(overlay); });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { closeModal(overlay); document.removeEventListener('keydown', esc); }
  });
}

// ── Sneaker Modal ────────────────────────────────────────────
function openSneakerModal(p) {
  const id = p.id;
  const colours = p.options.colours || [];
  const colourName = hex => (colours.find(c => c.hex === hex) || {}).name || hex;

  let selectedSize = null;
  let selectedColour = null;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-img">
        <button class="modal-close" aria-label="Close">&times;</button>
        ${modalGalleryHtml(p)}
      </div>
      <div class="modal-body">
        <div>
          <div class="modal-title">${escapeHtml(p.name)}</div>
          <div class="modal-price">${priceHtml(p)}</div>
          ${p.description ? `<p style="font-size:0.82rem;color:var(--text-muted);line-height:1.6;margin-top:0.6rem;">${escapeHtml(p.description)}</p>` : ''}
        </div>

        <div>
          <div class="modal-label">Size (SA)</div>
          <div class="size-grid">
            ${(p.options.sizes || []).map(s => `<button class="size-btn" data-size="${s}">${s}</button>`).join('')}
          </div>
        </div>

        <div>
          <div class="modal-label">Colour</div>
          <div class="colour-grid">
            ${colours.map(c => `<button class="colour-swatch" data-colour="${escapeHtml(c.hex)}" style="background:${escapeHtml(c.hex)};" title="${escapeHtml(c.name)}" aria-label="${escapeHtml(c.name)}"></button>`).join('')}
          </div>
        </div>

        <div class="modal-selection-info" id="modal-sel-info">Select a size and colour</div>

        <button class="btn" id="modal-add-btn" style="width:100%" disabled>Add to Cart</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  bindModalGallery(overlay, p);
  requestAnimationFrame(() => overlay.classList.add('open'));

  const infoEl  = overlay.querySelector('#modal-sel-info');
  const addBtn  = overlay.querySelector('#modal-add-btn');

  function updateInfo() {
    if (selectedSize && selectedColour) {
      infoEl.textContent = `Size ${selectedSize} · ${colourName(selectedColour)}`;
      addBtn.disabled = false;
    } else if (selectedSize) {
      infoEl.textContent = `Size ${selectedSize} selected — pick a colour`;
    } else if (selectedColour) {
      infoEl.textContent = `${colourName(selectedColour)} selected — pick a size`;
    } else {
      infoEl.textContent = 'Select a size and colour';
    }
  }

  overlay.querySelectorAll('.size-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      overlay.querySelectorAll('.size-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedSize = btn.dataset.size;
      updateInfo();
    });
  });

  overlay.querySelectorAll('.colour-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      overlay.querySelectorAll('.colour-swatch').forEach(s => s.classList.remove('selected'));
      sw.classList.add('selected');
      selectedColour = sw.dataset.colour;
      updateInfo();
    });
  });

  addBtn.addEventListener('click', () => {
    const itemId   = `${id}-${selectedSize}-${selectedColour}`;
    const itemName = `${p.name} (Size ${selectedSize}, ${colourName(selectedColour)})`;
    const thumbUrl = sizedImage(p.image, 80, 80);
    closeModal(overlay);
    setTimeout(() => addToCart(itemId, itemName, p.price, thumbUrl), 320);
  });

  overlay.querySelector('.modal-close').addEventListener('click', () => closeModal(overlay));
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(overlay); });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { closeModal(overlay); document.removeEventListener('keydown', esc); }
  });
}

function closeModal(overlay) {
  overlay.classList.remove('open');
  setTimeout(() => overlay.remove(), 300);
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
  const total = subtotal + shipping;

  if (summaryEl) {
    summaryEl.style.display = 'block';
    summaryEl.innerHTML = `
      <div class="summary-line"><span>Subtotal</span><span>R${subtotal.toFixed(2)}</span></div>
      <div class="summary-line"><span>Shipping</span><span>R${shipping.toFixed(2)}</span></div>
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
  const shipping = shippingFee;
  const total = subtotal + shipping;

  box.innerHTML = `
    ${cart.map(i => `
      <div class="summary-line">
        <span>${escapeHtml(i.name)} × ${i.qty}</span>
        <span>R${(i.price * i.qty).toFixed(2)}</span>
      </div>`).join('')}
    <div class="summary-line"><span>Shipping</span><span>R${shipping.toFixed(2)}</span></div>
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
  renderCategoryGrids();
  syncPromoProducts();
});
