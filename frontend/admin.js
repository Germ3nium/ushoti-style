// ── Admin dashboard ──────────────────────────────────────────
// Uses API_BASE, escapeHtml, formatRand, sizedImage and showToast from app.js

const KEY_STORAGE = 'ushoti_admin_key';
const FULFILMENT_LABELS = {
  NEW: 'New', PROCESSING: 'Processing', SHIPPED: 'Shipped', DELIVERED: 'Delivered', CANCELLED: 'Cancelled'
};
const PAYMENT_LABELS = { PAID: 'Paid', PENDING: 'Not paid', FAILED: 'Failed' };

let adminKey = readKey();
let orders = [];
let products = [];
let photos = []; // photo urls for the product being edited; photos[0] is the cover

// ── Session ──────────────────────────────────────────────────
function readKey() {
  try { return sessionStorage.getItem(KEY_STORAGE) || ''; } catch { return ''; }
}

function storeKey(key) {
  try {
    if (key) sessionStorage.setItem(KEY_STORAGE, key);
    else sessionStorage.removeItem(KEY_STORAGE);
  } catch { /* private mode — key just won't survive a reload */ }
}

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}/api/admin/${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${adminKey}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    }
  });
  if (res.status === 401) {
    signOut('Your admin key was not accepted. Please sign in again.');
    throw new Error('Unauthorized');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function showView(signedIn) {
  document.getElementById('login-view').hidden = signedIn;
  document.getElementById('app-view').hidden = !signedIn;
}

function signOut(message = '') {
  adminKey = '';
  storeKey('');
  showView(false);
  document.getElementById('login-error').textContent = message;
  document.getElementById('admin-key').focus();
}

document.getElementById('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = e.submitter;
  const errorEl = document.getElementById('login-error');
  errorEl.textContent = '';
  btn.disabled = true;

  adminKey = document.getElementById('admin-key').value.trim();
  try {
    await loadOverview();
    storeKey(adminKey);
    document.getElementById('admin-key').value = '';
    showView(true);
  } catch (err) {
    if (err.message !== 'Unauthorized') errorEl.textContent = `Couldn't reach the server: ${err.message}`;
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('logout-btn').addEventListener('click', () => signOut());

// ── Tabs ─────────────────────────────────────────────────────
const loaders = { overview: loadOverview, orders: loadOrders, products: loadAllProducts, settings: loadSettings };

function switchTab(name) {
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.admin-panel').forEach(p => { p.hidden = p.id !== `tab-${name}`; });
  loaders[name]().catch(err => showToast(err.message));
}

document.querySelectorAll('.admin-tab').forEach(tab => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

document.querySelectorAll('[data-refresh]').forEach(btn => {
  btn.addEventListener('click', () => loaders[btn.dataset.refresh]().catch(err => showToast(err.message)));
});

// ── Settings ─────────────────────────────────────────────────
async function loadSettings() {
  const res = await fetch(`${API_BASE}/api/settings`);
  if (!res.ok) throw new Error(`Couldn't load settings (${res.status})`);
  const settings = await res.json();
  document.getElementById('set-shipping').value = settings.shipping_fee;
  document.getElementById('set-banner').value = (settings.banner || []).join('\n');
}

document.getElementById('settings-form').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = e.submitter;
  const errorEl = document.getElementById('settings-error');
  errorEl.textContent = '';
  btn.disabled = true;
  try {
    const saved = await api('settings', {
      method: 'PUT',
      body: JSON.stringify({
        shipping_fee: Number(document.getElementById('set-shipping').value),
        banner: document.getElementById('set-banner').value.split('\n').map(m => m.trim()).filter(Boolean)
      })
    });
    if (!Array.isArray(saved.banner)) {
      throw new Error('Delivery fee saved, but the server doesn\'t support banner messages yet — the backend needs to be deployed again.');
    }
    document.getElementById('set-banner').value = saved.banner.join('\n');
    showToast('Settings saved');
  } catch (err) {
    if (err.message !== 'Unauthorized') errorEl.textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});

// ── Overview ─────────────────────────────────────────────────
async function loadOverview() {
  const s = await api('summary');

  const stats = [
    ['Revenue (all time)', formatRand(s.revenue)],
    ['This month', `${formatRand(s.month_revenue)}`, `${s.month_orders} order${s.month_orders === 1 ? '' : 's'}`],
    ['Paid orders', s.paid_orders],
    ['Average order', formatRand(s.average_order)],
    ['To ship', s.to_ship, 'New + processing']
  ];
  document.getElementById('stats').innerHTML = stats.map(([label, value, note]) => `
    <div class="admin-stat">
      <div class="admin-stat-label">${label}</div>
      <div class="admin-stat-value">${value}</div>
      ${note ? `<div class="admin-stat-note">${note}</div>` : ''}
    </div>`).join('');

  document.getElementById('fulfilment-breakdown').innerHTML = Object.entries(s.by_fulfilment).map(([key, count]) => `
    <li><span class="admin-pill pill-${key.toLowerCase()}">${FULFILMENT_LABELS[key]}</span><strong>${count}</strong></li>`).join('');

  document.getElementById('best-sellers').innerHTML = s.best_sellers.length
    ? `<table class="admin-table admin-table-compact">
        <thead><tr><th>Product</th><th class="num">Sold</th><th class="num">Revenue</th></tr></thead>
        <tbody>${s.best_sellers.map(b => `
          <tr><td>${escapeHtml(b.name)}</td><td class="num">${b.qty}</td><td class="num">${formatRand(b.revenue)}</td></tr>`).join('')}
        </tbody>
      </table>`
    : '<p class="admin-muted">No sales yet.</p>';
}

// ── Orders ───────────────────────────────────────────────────
async function loadOrders() {
  const payment = document.getElementById('order-payment-filter').value;
  orders = await api(`orders?status=${payment}`);
  renderOrders();
}

function renderOrders() {
  const fulfilment = document.getElementById('order-fulfilment-filter').value;
  const search = document.getElementById('order-search').value.trim().toLowerCase();

  const visible = orders.filter(o => {
    if (fulfilment && o.fulfilment !== fulfilment) return false;
    if (!search) return true;
    return [o.name_first, o.name_last, o.email, o.item_name, o.order_ref]
      .some(v => String(v || '').toLowerCase().includes(search));
  });

  const body = document.getElementById('orders-body');
  if (!visible.length) {
    body.innerHTML = '<tr><td colspan="6" class="admin-empty">No orders match.</td></tr>';
    return;
  }

  body.innerHTML = visible.map(o => {
    const itemCount = o.items.reduce((n, i) => n + i.qty, 0);
    const itemsSummary = o.items.length
      ? `${itemCount} item${itemCount === 1 ? '' : 's'}`
      : escapeHtml(o.item_name);
    return `
      <tr class="admin-order-row" data-id="${o.id}" tabindex="0" aria-expanded="false">
        <td>${formatDate(o.created_at)}</td>
        <td>${escapeHtml(`${o.name_first || ''} ${o.name_last || ''}`.trim() || '—')}</td>
        <td>${itemsSummary}</td>
        <td class="num">${formatRand(o.total)}</td>
        <td><span class="admin-pill pill-pay-${o.status.toLowerCase()}">${PAYMENT_LABELS[o.status] || o.status}</span></td>
        <td>
          <select class="admin-status-select" data-id="${o.id}" aria-label="Order status">
            ${Object.entries(FULFILMENT_LABELS).map(([v, label]) =>
              `<option value="${v}" ${v === o.fulfilment ? 'selected' : ''}>${label}</option>`).join('')}
          </select>
        </td>
      </tr>
      <tr class="admin-order-detail" data-detail="${o.id}" hidden>
        <td colspan="6">${orderDetailHtml(o)}</td>
      </tr>`;
  }).join('');
}

function orderDetailHtml(o) {
  const address = [o.street, o.city, o.province, o.postal_code].filter(Boolean).map(escapeHtml).join(', ');
  const lines = o.items.length
    ? o.items.map(i => `
        <li><span>${escapeHtml(i.name)} — ${escapeHtml(i.option)} × ${i.qty}</span><span>${formatRand(i.price * i.qty)}</span></li>`).join('')
      + `<li class="admin-muted"><span>Shipping</span><span>${formatRand(o.shipping)}</span></li>`
    : `<li><span>${escapeHtml(o.item_name)}</span></li>`;

  return `
    <div class="admin-detail-grid">
      <div>
        <h4>Items</h4>
        <ul class="admin-lines">${lines}</ul>
      </div>
      <div>
        <h4>Deliver to</h4>
        <p>${escapeHtml(`${o.name_first || ''} ${o.name_last || ''}`)}<br/>${address || '<span class="admin-muted">No address on file</span>'}</p>
        <h4>Contact</h4>
        <p>${o.email ? `<a href="mailto:${escapeHtml(o.email)}">${escapeHtml(o.email)}</a>` : '—'}<br/>${o.phone ? `<a href="tel:${escapeHtml(o.phone)}">${escapeHtml(o.phone)}</a>` : ''}</p>
        <h4>Reference</h4>
        <p class="admin-mono">${escapeHtml(o.order_ref)}${o.payment_id ? `<br/>PayFast: ${escapeHtml(o.payment_id)}` : ''}</p>
      </div>
    </div>`;
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`);
  return d.toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const ordersBody = document.getElementById('orders-body');

function toggleOrderRow(row) {
  const detail = ordersBody.querySelector(`[data-detail="${row.dataset.id}"]`);
  detail.hidden = !detail.hidden;
  row.setAttribute('aria-expanded', String(!detail.hidden));
}

ordersBody.addEventListener('click', e => {
  if (e.target.closest('select, a')) return;
  const row = e.target.closest('.admin-order-row');
  if (row) toggleOrderRow(row);
});

ordersBody.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('admin-order-row')) {
    e.preventDefault();
    toggleOrderRow(e.target);
  }
});

ordersBody.addEventListener('change', async e => {
  const select = e.target.closest('.admin-status-select');
  if (!select) return;
  const order = orders.find(o => String(o.id) === select.dataset.id);
  const previous = order.fulfilment;
  select.disabled = true;
  try {
    await api(`orders/${order.id}`, { method: 'PATCH', body: JSON.stringify({ fulfilment: select.value }) });
    order.fulfilment = select.value;
    showToast(`Order marked as ${FULFILMENT_LABELS[select.value]}`);
  } catch (err) {
    select.value = previous;
    showToast(`Couldn't update: ${err.message}`);
  } finally {
    select.disabled = false;
  }
});

document.getElementById('order-payment-filter').addEventListener('change', () => loadOrders().catch(err => showToast(err.message)));
document.getElementById('order-fulfilment-filter').addEventListener('change', renderOrders);
document.getElementById('order-search').addEventListener('input', renderOrders);

// ── Products ─────────────────────────────────────────────────
// Not named loadProducts — that's app.js's shop loader, which skips hidden products
async function loadAllProducts() {
  products = await api('products');
  renderProducts();
}

function renderProducts() {
  const category = document.getElementById('product-category-filter').value;
  const visible = products.filter(p => !category || p.category === category);
  const body = document.getElementById('products-body');

  if (!visible.length) {
    body.innerHTML = '<tr><td colspan="6" class="admin-empty">No products yet.</td></tr>';
    return;
  }

  body.innerHTML = visible.map(p => `
    <tr class="${p.active ? '' : 'admin-row-muted'}">
      <td><img class="admin-thumb" src="${escapeHtml(sizedImage(p.image, 80, 80))}" alt="" onerror="${IMG_ONERROR}"/></td>
      <td>
        <strong>${escapeHtml(p.name)}</strong>
        ${p.badge ? `<span class="admin-pill">${escapeHtml(p.badge)}</span>` : ''}
        ${p.sale_price && p.sale_price < p.price ? '<span class="admin-pill admin-pill-sale">Sale</span>' : ''}
      </td>
      <td>${p.category === 'sneakers' ? 'Sneakers' : 'Hair'}</td>
      <td class="num">${p.sale_price && p.sale_price < p.price
        ? `<s class="admin-was">${formatRand(p.price)}</s> ${formatRand(p.sale_price)}`
        : formatRand(p.price)}</td>
      <td>
        <label class="admin-switch">
          <input type="checkbox" data-toggle="${escapeHtml(p.id)}" ${p.active ? 'checked' : ''} aria-label="Show ${escapeHtml(p.name)} in shop"/>
          <span></span>
        </label>
      </td>
      <td class="admin-actions">
        <button class="btn btn-ghost admin-btn-sm" data-edit="${escapeHtml(p.id)}">Edit</button>
        <button class="btn btn-ghost admin-btn-sm admin-danger" data-delete="${escapeHtml(p.id)}">Delete</button>
      </td>
    </tr>`).join('');
}

document.getElementById('product-category-filter').addEventListener('change', renderProducts);

const productsBody = document.getElementById('products-body');

productsBody.addEventListener('click', async e => {
  const editId = e.target.closest('[data-edit]')?.dataset.edit;
  const deleteId = e.target.closest('[data-delete]')?.dataset.delete;

  if (editId) openProductEditor(products.find(p => p.id === editId));

  if (deleteId) {
    const p = products.find(x => x.id === deleteId);
    if (!confirm(`Delete "${p.name}"? This can't be undone.\n\nTip: switch off "In shop" instead to hide it without deleting.`)) return;
    try {
      await api(`products/${encodeURIComponent(p.id)}`, { method: 'DELETE' });
      products = products.filter(x => x.id !== p.id);
      renderProducts();
      showToast(`${p.name} deleted`);
    } catch (err) {
      showToast(`Couldn't delete: ${err.message}`);
    }
  }
});

productsBody.addEventListener('change', async e => {
  const id = e.target.dataset.toggle;
  if (!id) return;
  const p = products.find(x => x.id === id);
  const active = e.target.checked;
  e.target.disabled = true;
  try {
    await api(`products/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ ...p, active }) });
    p.active = active ? 1 : 0;
    renderProducts();
    showToast(active ? `${p.name} is now in the shop` : `${p.name} is hidden from the shop`);
  } catch (err) {
    e.target.checked = !active;
    e.target.disabled = false;
    showToast(`Couldn't update: ${err.message}`);
  }
});

// ── Product editor ───────────────────────────────────────────
const dialog = document.getElementById('product-dialog');
const form = document.getElementById('product-form');
const $ = id => document.getElementById(id);
let editingId = null;

function addColourRow(name = '', hex = '#000000') {
  const row = document.createElement('div');
  row.className = 'admin-colour-row';
  row.innerHTML = `
    <input type="color" value="${escapeHtml(hex)}" aria-label="Colour"/>
    <input type="text" value="${escapeHtml(name)}" placeholder="Colour name, e.g. White" aria-label="Colour name"/>
    <button type="button" class="admin-icon-btn" aria-label="Remove colour">&times;</button>`;
  row.querySelector('button').addEventListener('click', () => row.remove());
  $('pf-colours').appendChild(row);
}

function syncCategoryFields() {
  const sneakers = $('pf-category').value === 'sneakers';
  $('pf-sneaker-fields').hidden = !sneakers;
  $('pf-hair-fields').hidden = sneakers;
}

const MAX_PHOTOS = 10;

function renderPhotos() {
  $('pf-photos').innerHTML = photos.map((url, i) => `
    <li class="admin-photo">
      <img src="${escapeHtml(sizedImage(url, 184, 184))}" alt="Photo ${i + 1}" onerror="${IMG_ONERROR}"/>
      ${i === 0 ? '<span class="admin-photo-cover">Cover</span>' : ''}
      <div class="admin-photo-actions">
        <button type="button" data-move="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move photo ${i + 1} earlier" title="Move earlier">&larr;</button>
        <button type="button" class="admin-photo-remove" data-remove="${i}" aria-label="Remove photo ${i + 1}" title="Remove">&times;</button>
      </div>
    </li>`).join('');
  $('pf-upload-btn').disabled = photos.length >= MAX_PHOTOS;
}

$('pf-photos').addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (!btn) return;
  if (btn.dataset.remove !== undefined) {
    photos.splice(Number(btn.dataset.remove), 1);
  } else {
    const i = Number(btn.dataset.move);
    [photos[i - 1], photos[i]] = [photos[i], photos[i - 1]];
  }
  renderPhotos();
});

function addPhoto(url) {
  if (photos.includes(url)) return;
  if (photos.length >= MAX_PHOTOS) throw new Error(`a product can have at most ${MAX_PHOTOS} photos`);
  photos.push(url);
  renderPhotos();
}

// Phone photos are often 4–10 MB; shrink to at most 1200px and re-encode as JPEG before uploading
async function resizePhoto(file, maxSide = 1200) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // transparent PNGs would otherwise turn black
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('Could not read that photo')), 'image/jpeg', 0.85));
}

async function uploadPhotos(files) {
  const status = $('pf-upload-status');
  const button = $('pf-upload-btn');
  const saveBtn = $('product-save');
  button.disabled = saveBtn.disabled = true;
  let done = 0;
  try {
    for (const file of files) {
      status.textContent = `Uploading ${done + 1} of ${files.length}…`;
      const blob = await resizePhoto(file);
      const { url } = await api('images', { method: 'POST', body: blob, headers: { 'Content-Type': 'image/jpeg' } });
      addPhoto(url);
      done++;
    }
    status.textContent = `${done === 1 ? 'Photo' : `${done} photos`} added. Click Save to keep ${done === 1 ? 'it' : 'them'}.`;
  } catch (err) {
    status.textContent = err.message === 'Unauthorized' ? ''
      : `${done ? `${done} added, then u` : 'U'}pload failed: ${err.message}`;
  } finally {
    saveBtn.disabled = false;
    renderPhotos();
  }
}

function openProductEditor(p = null) {
  editingId = p ? p.id : null;
  form.reset();
  $('product-error').textContent = '';
  $('pf-upload-status').textContent = '';
  $('pf-colours').innerHTML = '';
  $('product-dialog-title').textContent = p ? `Edit ${p.name}` : 'Add product';

  const opts = p ? p.options : {};
  $('pf-category').value    = p ? p.category : 'sneakers';
  $('pf-category').disabled = !!p; // switching category would break existing cart items
  $('pf-name').value        = p ? p.name : '';
  $('pf-price').value       = p ? p.price : '';
  $('pf-sale-price').value  = p && p.sale_price ? p.sale_price : '';
  $('pf-badge').value       = p ? p.badge : '';
  $('pf-sort').value        = p ? p.sort_order : '';
  $('pf-description').value = p ? p.description : '';
  $('pf-image-link').value  = '';
  photos = p ? [...(p.images || [p.image])] : [];
  $('pf-active').checked    = p ? !!p.active : true;
  $('pf-sizes').value       = (opts.sizes || (p ? [] : [4, 5, 6, 7, 8, 9, 10, 11, 12, 13])).join(', ');
  $('pf-lengths').value     = (opts.lengths || []).join(', ');
  (opts.colours || []).forEach(c => addColourRow(c.name, c.hex));
  if (!p) addColourRow();

  syncCategoryFields();
  renderPhotos();
  dialog.showModal();
  $('pf-name').focus();
}

$('add-product-btn').addEventListener('click', () => openProductEditor());
$('add-colour-btn').addEventListener('click', () => addColourRow());
$('pf-category').addEventListener('change', syncCategoryFields);
$('pf-upload-btn').addEventListener('click', () => $('pf-upload').click());
$('pf-upload').addEventListener('change', e => {
  const files = [...e.target.files].slice(0, MAX_PHOTOS - photos.length);
  e.target.value = ''; // let the same files be picked again
  if (files.length) uploadPhotos(files);
});

function addPhotoLink() {
  const input = $('pf-image-link');
  const url = input.value.trim();
  if (!url) return;
  if (!/^https:\/\//.test(url)) {
    $('pf-upload-status').textContent = 'Image links must start with https://';
    return;
  }
  try {
    addPhoto(url);
    input.value = '';
    $('pf-upload-status').textContent = '';
  } catch (err) {
    $('pf-upload-status').textContent = `Couldn't add it: ${err.message}`;
  }
}

$('pf-add-link').addEventListener('click', addPhotoLink);
$('pf-image-link').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); addPhotoLink(); } // don't submit the whole form
});
$('product-cancel').addEventListener('click', () => dialog.close());

form.addEventListener('submit', async e => {
  e.preventDefault();
  const saveBtn = $('product-save');
  const errorEl = $('product-error');
  errorEl.textContent = '';
  if (!photos.length) {
    errorEl.textContent = 'Add at least one photo';
    return;
  }

  const category = $('pf-category').value;
  const payload = {
    category,
    name:        $('pf-name').value.trim(),
    price:       Number($('pf-price').value),
    sale_price:  $('pf-sale-price').value.trim() || null,
    badge:       $('pf-badge').value.trim(),
    sort_order:  Number($('pf-sort').value) || 0,
    description: $('pf-description').value.trim(),
    images:      photos,
    active:      $('pf-active').checked,
    options: category === 'sneakers'
      ? {
          sizes: $('pf-sizes').value,
          colours: [...$('pf-colours').querySelectorAll('.admin-colour-row')].map(row => ({
            hex:  row.querySelector('input[type=color]').value,
            name: row.querySelector('input[type=text]').value.trim()
          }))
        }
      : { lengths: $('pf-lengths').value }
  };

  saveBtn.disabled = true;
  try {
    if (editingId) {
      await api(`products/${encodeURIComponent(editingId)}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      await api('products', { method: 'POST', body: JSON.stringify(payload) });
    }
    dialog.close();
    showToast(`${payload.name} saved`);
    await loadAllProducts();
  } catch (err) {
    errorEl.textContent = err.message;
  } finally {
    saveBtn.disabled = false;
  }
});

// ── Start ────────────────────────────────────────────────────
if (adminKey) {
  showView(true);
  loadOverview().catch(err => showToast(err.message));
} else {
  showView(false);
}
