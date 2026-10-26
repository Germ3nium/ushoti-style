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

// ── Hair Modal ──────────────────────────────────────────────
const hairData = {
  hr1: { name: 'Body Wave Wig 18"',     price: 1850, badge: 'Bestseller', img: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=600&h=500&fit=crop', inches: [10,12,14,16,18,20,22,24], desc: 'Soft, natural-looking body waves with a silky finish. Full lace construction for a seamless hairline. Perfect for everyday wear or special occasions.' },
  hr2: { name: 'Straight Bundles 3pcs', price: 2200, badge: '',           img: 'https://images.unsplash.com/photo-1560869713-7d0a29430803?w=600&h=500&fit=crop', inches: [12,14,16,18,20,22,24,26,28], desc: 'Sleek, tangle-free straight bundles made from 100% virgin hair. Comes as a 3-piece set — can be dyed, bleached and heat-styled.' },
  hr3: { name: 'Curly Lace Front Wig',  price: 2750, badge: 'Premium',    img: 'https://images.unsplash.com/photo-1595476108010-b4d1f102b1b1?w=600&h=500&fit=crop', inches: [10,12,14,16,18,20,22], desc: 'Bouncy, defined curls with a pre-plucked lace front for a natural hairline. Lightweight and breathable — ideal for all-day comfort.' },
  hr4: { name: '4x4 Lace Closure',      price: 950,  badge: '',           img: 'https://images.unsplash.com/photo-1519699047748-de8e457a634e?w=600&h=500&fit=crop', inches: [10,12,14,16,18], desc: 'Free-part 4x4 lace closure for a flawless finish. Pairs perfectly with any bundle. Pre-bleached knots for a realistic scalp appearance.' },
  hr5: { name: 'Deep Wave Bundles 2pcs',price: 1700,  badge: '',           img: 'https://images.unsplash.com/photo-1580618672591-eb180b1a973f?w=600&h=500&fit=crop', inches: [12,14,16,18,20,22,24,26], desc: 'Rich, deep wave pattern with a lustrous shine. 2-piece bundle set made from unprocessed virgin hair. Holds moisture well and minimal shedding.' },
  hr6: { name: 'Short Bob Wig',         price: 1350, badge: '',           img: 'https://images.unsplash.com/photo-1526045612212-70caf35c14df?w=600&h=500&fit=crop', inches: [8,10,12,14], desc: 'Chic and low-maintenance short bob cut. Full lace wig with adjustable straps for a secure fit. Great for a bold, confident everyday look.' },
};

function openHairModal(id) {
  const p = hairData[id];
  if (!p) return;

  let selectedInch = null;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-img">
        <button class="modal-close" aria-label="Close">&times;</button>
        <img src="${p.img}" alt="${p.name}"/>
        ${p.badge ? `<span class="product-badge">${p.badge}</span>` : ''}
      </div>
      <div class="modal-body">
        <div>
          <div class="modal-title">${p.name}</div>
          <div class="modal-price">R${p.price.toLocaleString()}</div>
          <p style="font-size:0.82rem;color:var(--text-muted);line-height:1.6;margin-top:0.6rem;">${p.desc}</p>
        </div>
        <div>
          <div class="modal-label">Length (inches)</div>
          <div class="size-grid">
            ${p.inches.map(i => `<button class="size-btn" data-inch="${i}">${i}"</button>`).join('')}
          </div>
        </div>
        <div class="modal-selection-info" id="modal-sel-info">Select a length</div>
        <button class="btn" id="modal-add-btn" style="width:100%" disabled>Add to Cart</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
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
    const thumbUrl = p.img.replace('w=600&h=500', 'w=80&h=80');
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
const sneakerData = {
  snk1: { name: 'Air Force 1 White',    price: 1299, badge: 'Classic', desc: 'The iconic low-top silhouette featuring crisp leather, encapsulated Air cushioning, and timeless street style.', img: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&h=500&fit=crop', colours: ['#ffffff','#000000','#c8a96e','#b0c4de'] },
  snk2: { name: 'Jordan 1 Retro High',  price: 2499, badge: 'Premium', desc: 'Court heritage silhouette with premium full-grain leather, padded ankle support, and unmistakable Wings branding.', img: 'https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?w=600&h=500&fit=crop', colours: ['#cc2200','#000000','#ffffff','#1a3a6b'] },
  snk3: { name: 'Yeezy Boost 350',      price: 3199, badge: 'Limited', desc: 'Sleek re-engineered Primeknit upper fitted with full-length adidas Boost technology for supreme cloud-like cushioning.', img: 'https://images.unsplash.com/photo-1608231387042-66d1773070a5?w=600&h=500&fit=crop', colours: ['#c8b89a','#3d3d3d','#000000','#f5f0e8'] },
  snk4: { name: 'Nike Dunk Low',        price: 1599, badge: '',        desc: 'Vintage collegiate styling with clean leather overlays, a low-cut padded collar, and durable rubber cupsole.', img: 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=600&h=500&fit=crop', colours: ['#ffffff','#2e5e2e','#8b0000','#000000'] },
  snk5: { name: 'Adidas Superstar OG',  price: 1450, badge: '',        desc: 'The original shell-toe legend featuring smooth coated leather, signature serrated 3-Stripes, and herringbone grip.', img: 'https://images.unsplash.com/photo-1584735175315-9d5df23be620?w=600&h=500&fit=crop', colours: ['#ffffff','#000000','#c8a96e'] },
  snk6: { name: 'Puma Suede Classic',   price: 1099, badge: '',        desc: 'Timeless street sneaker crafted with rich soft suede, iconic formstrip detailing, and effortless vintage appeal.', img: 'https://images.unsplash.com/photo-1556906781-9a412961a28c?w=600&h=500&fit=crop', colours: ['#1a1a6b','#cc2200','#2e5e2e','#000000','#c8a96e'] },
};

const SIZES = [4,5,6,7,8,9,10,11,12,13];

function openSneakerModal(id) {
  const p = sneakerData[id];
  if (!p) return;

  let selectedSize = null;
  let selectedColour = null;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-img">
        <button class="modal-close" aria-label="Close">&times;</button>
        <img src="${p.img}" alt="${p.name}"/>
        ${p.badge ? `<span class="product-badge">${p.badge}</span>` : ''}
      </div>
      <div class="modal-body">
        <div>
          <div class="modal-title">${p.name}</div>
          <div class="modal-price">R${p.price.toLocaleString()}</div>
          ${p.desc ? `<p style="font-size:0.82rem;color:var(--text-muted);line-height:1.6;margin-top:0.6rem;">${p.desc}</p>` : ''}
        </div>

        <div>
          <div class="modal-label">Size (SA)</div>
          <div class="size-grid">
            ${SIZES.map(s => `<button class="size-btn" data-size="${s}">${s}</button>`).join('')}
          </div>
        </div>

        <div>
          <div class="modal-label">Colour</div>
          <div class="colour-grid">
            ${p.colours.map(c => `<button class="colour-swatch" data-colour="${c}" style="background:${c};" title="${c}" aria-label="${c}"></button>`).join('')}
          </div>
        </div>

        <div class="modal-selection-info" id="modal-sel-info">Select a size and colour</div>

        <button class="btn" id="modal-add-btn" style="width:100%" disabled>Add to Cart</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
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
    const thumbUrl = p.img.replace('w=600&h=500', 'w=80&h=80');
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

function colourName(hex) {
  const map = { '#ffffff':'White','#000000':'Black','#c8a96e':'Tan','#b0c4de':'Steel Blue','#cc2200':'Red','#1a3a6b':'Navy','#c8b89a':'Sand','#3d3d3d':'Dark Grey','#f5f0e8':'Cream','#2e5e2e':'Green','#8b0000':'Dark Red','#1a1a6b':'Blue','#c8a96e':'Tan' };
  return map[hex.toLowerCase()] || hex;
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
      <img src="${item.image}" alt="${item.name}" onerror="this.src='https://placehold.co/80x80/1a1a1a/c9a84c?text=Item'">
      <div class="cart-item-info">
        <h4>${item.name}</h4>
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
  const shipping = subtotal > 0 ? 80 : 0;
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
  const shipping = 80;
  const total = subtotal + shipping;

  box.innerHTML = `
    ${cart.map(i => `
      <div class="summary-line">
        <span>${i.name} × ${i.qty}</span>
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
});
