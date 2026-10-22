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
