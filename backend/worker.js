// ── Cloudflare Worker for Ushoti Style ──────────────────────
// Handles:
//   GET    /api/products              → active products for the shop
//   GET    /api/settings              → shop settings shoppers need (delivery fee, banner messages)
//   GET    /api/images/:id            → product photo uploaded from the admin page
//   GET    /api/orders/:ref           → receipt for one order (the ref is an unguessable UUID)
//   POST   /api/sign-payment          → creates a PENDING order, returns signed PayFast fields
//   POST   /api/notify                → PayFast payment notification (marks order PAID)
//   Admin (Authorization: Bearer ADMIN_KEY):
//   GET    /api/admin/summary         → sales totals and best sellers
//   GET    /api/admin/orders          → orders (?status=PAID|PENDING|FAILED|ALL)
//   PATCH  /api/admin/orders/:id      → update fulfilment status
//   GET    /api/admin/products        → all products, including hidden ones
//   POST   /api/admin/products        → create product
//   PUT    /api/admin/products/:id    → update product
//   DELETE /api/admin/products/:id    → delete product
//   POST   /api/admin/images          → upload a product photo (raw image body), returns its url
//   PUT    /api/admin/settings        → update shop settings (delivery fee, banner messages)

const PAYFAST_SANDBOX = true; // set to false when going live

const PF_HOST = PAYFAST_SANDBOX
  ? 'sandbox.payfast.co.za'
  : 'www.payfast.co.za';

const DEFAULT_SHIPPING_FEE = 80; // used until the admin sets one
const MAX_SHIPPING_FEE = 10000;
const DEFAULT_BANNER = ['Premium Sneakers', 'Hair Extensions & Wigs', 'Secure PayFast Checkout', 'Nationwide Delivery', 'New Arrivals Weekly'];
const MAX_BANNER_MESSAGES = 12;
const MAX_BANNER_LENGTH = 80;
const CATEGORIES   = ['sneakers', 'hair'];
const FULFILMENT   = ['NEW', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'];
const IMAGE_TYPES  = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_BYTES = 1500000; // D1 rows top out at 2 MB
const MAX_PHOTOS   = 10;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    // CORS headers for all responses
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    try {
      // ── Public routes ──────────────────────────────────────
      if (pathname === '/api/products' && method === 'GET') {
        return await handleGetProducts(env, cors);
      }

      if (pathname === '/api/settings' && method === 'GET') {
        return await handleGetSettings(env, cors);
      }

      if (pathname.startsWith('/api/images/') && method === 'GET') {
        return await handleGetImage(pathname.split('/')[3], env, cors);
      }

      if (pathname.startsWith('/api/orders/') && method === 'GET') {
        return await handleGetReceipt(pathname.split('/')[3], env, cors);
      }

      if (pathname === '/api/sign-payment' && method === 'POST') {
        return await handleSignPayment(request, env, cors);
      }

      if (pathname === '/api/notify' && method === 'POST') {
        return await handleNotify(request, env, cors);
      }

      // ── Admin routes ───────────────────────────────────────
      if (pathname.startsWith('/api/admin/')) {
        if (!isAdmin(request, env)) {
          return json({ error: 'Unauthorized' }, cors, 401);
        }

        const [, , , resource, id] = pathname.split('/'); // '', 'api', 'admin', resource, id

        if (resource === 'summary' && method === 'GET')            return await handleSummary(env, cors);
        if (resource === 'orders' && !id && method === 'GET')       return await handleAdminOrders(url, env, cors);
        if (resource === 'orders' && id && method === 'PATCH')      return await handleUpdateOrder(id, request, env, cors);
        if (resource === 'products' && !id && method === 'GET')     return await handleAdminProducts(env, cors);
        if (resource === 'products' && !id && method === 'POST')    return await handleSaveProduct(null, request, env, cors);
        if (resource === 'products' && id && method === 'PUT')      return await handleSaveProduct(id, request, env, cors);
        if (resource === 'products' && id && method === 'DELETE')   return await handleDeleteProduct(id, env, cors);
        if (resource === 'images' && !id && method === 'POST')      return await handleUploadImage(request, url, env, cors);
        if (resource === 'settings' && !id && method === 'PUT')     return await handleSaveSettings(request, env, cors);
      }

      return new Response('Not Found', { status: 404, headers: cors });

    } catch (e) {
      return json({ error: e.message }, cors, 500);
    }
  }
};

// ── Products (public) ────────────────────────────────────────
async function handleGetProducts(env, cors) {
  const { results } = await env.DB.prepare(
    'SELECT id, category, name, price, sale_price, badge, description, image, images, options FROM products WHERE active = 1 ORDER BY category, sort_order, created_at'
  ).all();

  // Shoppers see the price they pay; was_price is set only while on sale
  const shop = results.map(parseProduct).map(p => {
    const { sale_price, ...rest } = p;
    return onSale(p) ? { ...rest, price: sale_price, was_price: p.price } : rest;
  });

  return json(shop, {
    ...cors,
    'Cache-Control': 'no-cache' // admin changes show on the next page load
  });
}

// ── Settings ─────────────────────────────────────────────────
async function getSettings(env) {
  let rows = [];
  try {
    ({ results: rows } = await env.DB.prepare('SELECT key, value FROM settings').all());
  } catch { /* settings table not created yet — use the defaults */ }
  const stored = Object.fromEntries(rows.map(r => [r.key, r.value]));

  const fee = Number(stored.shipping_fee);
  const banner = safeJson(stored.banner, null);
  return {
    shipping_fee: stored.shipping_fee !== undefined && Number.isFinite(fee) ? fee : DEFAULT_SHIPPING_FEE,
    banner: Array.isArray(banner) ? banner : DEFAULT_BANNER,
  };
}

async function getShippingFee(env) {
  return (await getSettings(env)).shipping_fee;
}

async function handleGetSettings(env, cors) {
  return json(await getSettings(env), {
    ...cors,
    'Cache-Control': 'no-cache'
  });
}

// Saves whichever settings are sent; the others are left as they are
async function handleSaveSettings(request, env, cors) {
  const body = await request.json();
  const updates = {};

  if (body.shipping_fee !== undefined) {
    const fee = Number(body.shipping_fee);
    if (!(Number.isInteger(fee) && fee >= 0 && fee <= MAX_SHIPPING_FEE)) {
      return json({ error: `Delivery fee must be a whole number of rands from 0 to ${MAX_SHIPPING_FEE}` }, cors, 400);
    }
    updates.shipping_fee = String(fee);
  }

  if (body.banner !== undefined) {
    if (!Array.isArray(body.banner)) return json({ error: 'Banner must be a list of messages' }, cors, 400);
    const banner = body.banner.map(m => String(m || '').trim()).filter(Boolean);
    if (banner.length > MAX_BANNER_MESSAGES) {
      return json({ error: `Use at most ${MAX_BANNER_MESSAGES} banner messages` }, cors, 400);
    }
    if (banner.some(m => m.length > MAX_BANNER_LENGTH)) {
      return json({ error: `Each banner message must be ${MAX_BANNER_LENGTH} characters or fewer` }, cors, 400);
    }
    updates.banner = JSON.stringify(banner);
  }

  const now = new Date().toISOString();
  const save = env.DB.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);
  const writes = Object.entries(updates).map(([key, value]) => save.bind(key, value, now));
  if (writes.length) await env.DB.batch(writes);

  return json(await getSettings(env), cors);
}

// ── Sign Payment ─────────────────────────────────────────────
// Prices come from the database, never from the browser.
async function handleSignPayment(request, env, cors) {
  const body = await request.json();

  const required = ['name_first', 'name_last', 'email_address', 'street', 'city', 'postal_code', 'province'];
  for (const field of required) {
    if (!sanitize(body[field])) return json({ error: `Missing ${field}` }, cors, 400);
  }

  const items = await priceCartItems(body.items, env);
  if (items.error) return json({ error: items.error }, cors, 400);

  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const shipping = await getShippingFee(env);
  const total    = subtotal + shipping;
  const orderRef = crypto.randomUUID();
  const itemName = items.map(i => `${i.name} x${i.qty}`).join(', ');
  const now      = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO orders (
      order_ref, status, items, item_name, subtotal, shipping, total,
      name_first, name_last, email, phone, street, city, postal_code, province,
      created_at, updated_at
    ) VALUES (?, 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    orderRef, JSON.stringify(items), itemName, subtotal, shipping, total,
    sanitize(body.name_first), sanitize(body.name_last), sanitize(body.email_address),
    sanitize(body.cell_number), sanitize(body.street), sanitize(body.city),
    sanitize(body.postal_code), sanitize(body.province), now, now
  ).run();

  // Field order matters — PayFast signs them in this documented order
  const pfData = {
    merchant_id:   env.PAYFAST_MERCHANT_ID,
    merchant_key:  env.PAYFAST_MERCHANT_KEY,
    return_url:    env.RETURN_URL,
    cancel_url:    env.CANCEL_URL,
    notify_url:    env.NOTIFY_URL,
    name_first:    sanitize(body.name_first),
    name_last:     sanitize(body.name_last),
    email_address: sanitize(body.email_address),
    cell_number:   sanitize(body.cell_number).replace(/\D/g, ''),
    m_payment_id:  orderRef,
    amount:        total.toFixed(2),
    item_name:     sanitize(itemName).slice(0, 100).trim(), // PayFast limit
  };

  // Remove empty fields
  Object.keys(pfData).forEach(k => {
    if (!pfData[k]) delete pfData[k];
  });

  const signature = await generateSignature(pfData, env.PAYFAST_PASSPHRASE);

  return json({
    ...pfData,
    signature,
    order_ref: orderRef,
    payfast_url: `https://${PF_HOST}/eng/process`
  }, cors);
}

// ── Receipt ──────────────────────────────────────────────────
// Only someone who has the order's UUID (the buyer, via PayFast's return link) can see it.
async function handleGetReceipt(ref, env, cors) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(ref || '')) {
    return json({ error: 'Order not found' }, cors, 404);
  }
  const o = await env.DB.prepare(`
    SELECT order_ref, status, items, subtotal, shipping, total, amount_paid, payment_id,
           name_first, name_last, email, street, city, postal_code, province, created_at, paid_at
    FROM orders WHERE order_ref = ?
  `).bind(ref).first();
  if (!o) return json({ error: 'Order not found' }, cors, 404);

  return new Response(JSON.stringify({
    ...o,
    order_number: o.order_ref.slice(0, 8).toUpperCase(),
    items: safeJson(o.items, []),
  }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors } });
}

// Turns cart lines like { id: 'snk1-9-#ffffff', qty: 1 } into priced items,
// checking that the product exists and the chosen option is offered.
async function priceCartItems(cartItems, env) {
  if (!Array.isArray(cartItems) || cartItems.length === 0) return { error: 'Cart is empty' };
  if (cartItems.length > 50) return { error: 'Too many items' };

  const { results } = await env.DB.prepare('SELECT * FROM products WHERE active = 1').all();
  const products = Object.fromEntries(results.map(p => [p.id, parseProduct(p)]));

  const priced = [];
  for (const line of cartItems) {
    const qty = parseInt(line.qty, 10);
    if (!(qty >= 1 && qty <= 20)) return { error: 'Invalid quantity' };

    const [productId, ...rest] = String(line.id || '').split('-');
    const p = products[productId];
    if (!p) return { error: 'A product in your cart is no longer available' };

    let option;
    if (p.category === 'sneakers') {
      const size   = Number(rest[0]);
      const colour = (p.options.colours || []).find(c => c.hex.toLowerCase() === rest.slice(1).join('-').toLowerCase());
      if (!(p.options.sizes || []).includes(size) || !colour) return { error: `Please re-select options for ${p.name}` };
      option = `Size ${size}, ${colour.name}`;
    } else {
      const length = parseInt(rest[0], 10);
      if (!(p.options.lengths || []).includes(length)) return { error: `Please re-select options for ${p.name}` };
      option = `${length}"`;
    }

    priced.push({ product_id: p.id, name: p.name, option, price: onSale(p) ? p.sale_price : p.price, qty });
  }
  return priced;
}

// ── Handle PayFast ITN Notification ─────────────────────────
async function handleNotify(request, env, cors) {
  const rawBody = await request.text();
  const params = new URLSearchParams(rawBody);
  const data = Object.fromEntries(params);

  // 1. Verify signature
  const receivedSig = data.signature;
  delete data.signature;
  const expectedSig = await generateSignature(data, env.PAYFAST_PASSPHRASE);

  if (receivedSig !== expectedSig) {
    return new Response('INVALID_SIGNATURE', { status: 400, headers: cors });
  }

  // 2. Verify with PayFast server
  const pfValid = await verifyWithPayFast(rawBody, PF_HOST);
  if (!pfValid) {
    return new Response('PAYFAST_VERIFY_FAILED', { status: 400, headers: cors });
  }

  const order = await env.DB.prepare('SELECT id, total FROM orders WHERE order_ref = ?')
    .bind(data.m_payment_id || '').first();
  if (!order) {
    return new Response('UNKNOWN_ORDER', { status: 200, headers: cors });
  }

  const now = new Date().toISOString();

  if (data.payment_status !== 'COMPLETE') {
    await env.DB.prepare(`UPDATE orders SET status = 'FAILED', updated_at = ? WHERE id = ? AND status = 'PENDING'`)
      .bind(now, order.id).run();
    return new Response('OK', { status: 200, headers: cors });
  }

  // 3. Make sure the amount paid matches what we charged
  const paid = parseFloat(data.amount_gross);
  if (Math.abs(paid - order.total) > 0.01) {
    return new Response('AMOUNT_MISMATCH', { status: 400, headers: cors });
  }

  // 4. Mark the order as paid
  await env.DB.prepare(`
    UPDATE orders SET status = 'PAID', payment_id = ?, amount_paid = ?, paid_at = ?, updated_at = ?
    WHERE id = ?
  `).bind(data.pf_payment_id, paid, now, now, order.id).run();

  return new Response('OK', { status: 200, headers: cors });
}

// ── Admin: Summary ───────────────────────────────────────────
async function handleSummary(env, cors) {
  const { results: paid } = await env.DB.prepare(
    `SELECT total, items, fulfilment, paid_at, created_at FROM orders WHERE status = 'PAID'`
  ).all();

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const byFulfilment = Object.fromEntries(FULFILMENT.map(f => [f, 0]));
  const sellers = {};
  let revenue = 0, monthRevenue = 0, monthOrders = 0;

  for (const o of paid) {
    revenue += o.total;
    byFulfilment[o.fulfilment] = (byFulfilment[o.fulfilment] || 0) + 1;
    if ((o.paid_at || o.created_at) >= monthStart.toISOString()) {
      monthRevenue += o.total;
      monthOrders++;
    }
    for (const item of safeJson(o.items, [])) {
      const s = sellers[item.product_id] ||= { product_id: item.product_id, name: item.name, qty: 0, revenue: 0 };
      s.qty += item.qty;
      s.revenue += item.price * item.qty;
    }
  }

  return json({
    paid_orders: paid.length,
    revenue,
    average_order: paid.length ? revenue / paid.length : 0,
    month_orders: monthOrders,
    month_revenue: monthRevenue,
    to_ship: byFulfilment.NEW + byFulfilment.PROCESSING,
    by_fulfilment: byFulfilment,
    best_sellers: Object.values(sellers).sort((a, b) => b.qty - a.qty).slice(0, 5)
  }, cors);
}

// ── Admin: Orders ────────────────────────────────────────────
async function handleAdminOrders(url, env, cors) {
  const status = (url.searchParams.get('status') || 'PAID').toUpperCase();
  const query = status === 'ALL'
    ? env.DB.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 200')
    : env.DB.prepare('SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC LIMIT 200').bind(status);

  const { results } = await query.all();
  return json(results.map(o => ({ ...o, items: safeJson(o.items, []) })), cors);
}

async function handleUpdateOrder(id, request, env, cors) {
  const { fulfilment } = await request.json();
  if (!FULFILMENT.includes(fulfilment)) return json({ error: 'Invalid status' }, cors, 400);

  const result = await env.DB.prepare('UPDATE orders SET fulfilment = ?, updated_at = ? WHERE id = ?')
    .bind(fulfilment, new Date().toISOString(), id).run();
  if (!result.meta.changes) return json({ error: 'Order not found' }, cors, 404);

  return json({ ok: true }, cors);
}

// ── Admin: Products ──────────────────────────────────────────
async function handleAdminProducts(env, cors) {
  const { results } = await env.DB.prepare(
    'SELECT * FROM products ORDER BY category, sort_order, created_at'
  ).all();
  return json(results.map(parseProduct), cors);
}

async function handleSaveProduct(id, request, env, cors) {
  const body = await request.json();
  const p = validateProduct(body);
  if (p.error) return json({ error: p.error }, cors, 400);

  const now = new Date().toISOString();

  if (id) {
    const result = await env.DB.prepare(`
      UPDATE products SET category = ?, name = ?, price = ?, sale_price = ?, badge = ?, description = ?, image = ?,
             images = ?, options = ?, active = ?, sort_order = ?, updated_at = ?
      WHERE id = ?
    `).bind(p.category, p.name, p.price, p.sale_price, p.badge, p.description, p.image, JSON.stringify(p.images),
            JSON.stringify(p.options), p.active, p.sort_order, now, id).run();
    if (!result.meta.changes) return json({ error: 'Product not found' }, cors, 404);
    return json({ id }, cors);
  }

  // Ids must not contain dashes — cart item ids are "<productId>-<option>"
  const newId = (p.category === 'sneakers' ? 'snk' : 'hr') + crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  await env.DB.prepare(`
    INSERT INTO products (id, category, name, price, sale_price, badge, description, image, images, options, active, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(newId, p.category, p.name, p.price, p.sale_price, p.badge, p.description, p.image, JSON.stringify(p.images),
          JSON.stringify(p.options), p.active, p.sort_order, now, now).run();

  return json({ id: newId }, cors, 201);
}

async function handleDeleteProduct(id, env, cors) {
  const result = await env.DB.prepare('DELETE FROM products WHERE id = ?').bind(id).run();
  if (!result.meta.changes) return json({ error: 'Product not found' }, cors, 404);
  return json({ ok: true }, cors);
}

async function handleUploadImage(request, url, env, cors) {
  const type = (request.headers.get('Content-Type') || '').split(';')[0].trim();
  if (!IMAGE_TYPES.includes(type)) return json({ error: 'Photo must be a JPEG, PNG or WebP image' }, cors, 400);

  const data = await request.arrayBuffer();
  if (!data.byteLength) return json({ error: 'The photo is empty' }, cors, 400);
  if (data.byteLength > MAX_IMAGE_BYTES) return json({ error: 'Photo is too large (max 1.5 MB)' }, cors, 413);

  const id = crypto.randomUUID().replace(/-/g, '');
  await env.DB.prepare('INSERT INTO images (id, content_type, data) VALUES (?, ?, ?)')
    .bind(id, type, data).run();
  return json({ url: `${url.origin}/api/images/${id}` }, cors, 201);
}

async function handleGetImage(id, env, cors) {
  if (!/^[0-9a-f]{32}$/.test(id || '')) return new Response('Not Found', { status: 404, headers: cors });
  const row = await env.DB.prepare('SELECT content_type, data FROM images WHERE id = ?').bind(id).first();
  if (!row) return new Response('Not Found', { status: 404, headers: cors });
  return new Response(new Uint8Array(row.data), {
    headers: {
      'Content-Type': row.content_type,
      // Each upload gets a new id, so the bytes behind a url never change
      'Cache-Control': 'public, max-age=31536000, immutable',
      ...cors
    }
  });
}

function validateProduct(body) {
  const category = String(body.category || '');
  if (!CATEGORIES.includes(category)) return { error: 'Category must be sneakers or hair' };

  const name = String(body.name || '').trim();
  if (!name) return { error: 'Name is required' };

  const price = Math.round(Number(body.price));
  if (!(price > 0)) return { error: 'Price must be more than 0' };

  // Blank sale price = not on sale
  let sale_price = null;
  if (body.sale_price !== null && body.sale_price !== undefined && String(body.sale_price).trim() !== '') {
    sale_price = Math.round(Number(body.sale_price));
    if (!(sale_price > 0)) return { error: 'Sale price must be more than 0' };
    if (sale_price >= price) return { error: 'Sale price must be lower than the normal price' };
  }

  // The first photo is the cover shown on product cards
  const list = Array.isArray(body.images) ? body.images : [body.image];
  const images = [...new Set(list.map(u => String(u || '').trim()).filter(Boolean))];
  if (!images.length) return { error: 'Add at least one photo' };
  if (images.length > MAX_PHOTOS) return { error: `Add at most ${MAX_PHOTOS} photos` };
  if (!images.every(isImageUrl)) return { error: 'Photo links must start with https://' };
  const image = images[0];

  const opts = body.options || {};
  let options;
  if (category === 'sneakers') {
    const sizes = toNumberList(opts.sizes);
    const colours = (Array.isArray(opts.colours) ? opts.colours : [])
      .map(c => ({ name: String(c.name || '').trim(), hex: String(c.hex || '').toLowerCase() }))
      .filter(c => c.name && /^#[0-9a-f]{6}$/.test(c.hex));
    if (!sizes.length)   return { error: 'Add at least one size' };
    if (!colours.length) return { error: 'Add at least one colour' };
    options = { sizes, colours };
  } else {
    const lengths = toNumberList(opts.lengths);
    if (!lengths.length) return { error: 'Add at least one length' };
    options = { lengths };
  }

  return {
    category, name, price, sale_price, image, images, options,
    badge:       String(body.badge || '').trim().slice(0, 30),
    description: String(body.description || '').trim().slice(0, 1000),
    active:      body.active === false || body.active === 0 ? 0 : 1,
    sort_order:  parseInt(body.sort_order, 10) || 0,
  };
}

// ── Helpers ──────────────────────────────────────────────────

function json(data, cors, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors }
  });
}

// http:// is only allowed for photos uploaded to a local `wrangler dev` backend
function isImageUrl(url) {
  return /^https:\/\//.test(url) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url);
}

function isAdmin(request, env) {
  if (!env.ADMIN_KEY) return false;
  const expected = `Bearer ${env.ADMIN_KEY}`;
  const given = request.headers.get('Authorization') || '';
  if (given.length !== expected.length) return false;
  // Constant-time comparison so the key can't be guessed from response timing
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

function onSale(p) {
  return p.sale_price > 0 && p.sale_price < p.price;
}

function parseProduct(p) {
  const images = safeJson(p.images, []);
  return { ...p, options: safeJson(p.options, {}), images: images.length ? images : [p.image] };
}

function safeJson(text, fallback) {
  try { return JSON.parse(text); } catch { return fallback; }
}

function toNumberList(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(list.map(Number).filter(n => n > 0))].sort((a, b) => a - b);
}

// Generate PayFast MD5 signature
// PayFast signs fields in the order they're sent (its documented attribute
// order), NOT alphabetically — so keep the object's insertion order.
async function generateSignature(data, passphrase) {
  const ordered = Object.keys(data)
    .filter(k => k !== 'signature')
    .map(k => `${k}=${pfEncode(String(data[k]).trim())}`)
    .join('&');

  const str = passphrase ? `${ordered}&passphrase=${pfEncode(passphrase.trim())}` : ordered;

  // crypto.subtle doesn't support MD5 natively — use manual MD5
  return md5(str);
}

// Matches PHP's urlencode(), which PayFast uses to build its signature
function pfEncode(value) {
  return encodeURIComponent(value)
    .replace(/[!'()*~]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())
    .replace(/%20/g, '+');
}

// Verify payment with PayFast server
async function verifyWithPayFast(rawBody, host) {
  try {
    const res = await fetch(`https://${host}/eng/query/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: rawBody
    });
    const text = await res.text();
    return text.trim() === 'VALID';
  } catch {
    return false;
  }
}

function sanitize(str) {
  return String(str || '').replace(/[<>"']/g, '').trim();
}

// MD5 implementation (required since crypto.subtle doesn't support MD5)
function md5(str) {
  function safeAdd(x, y) {
    const lsw = (x & 0xffff) + (y & 0xffff);
    return (((x >> 16) + (y >> 16) + (lsw >> 16)) << 16) | (lsw & 0xffff);
  }
  function bitRotateLeft(num, cnt) { return (num << cnt) | (num >>> (32 - cnt)); }
  function md5cmn(q, a, b, x, s, t) { return safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b); }
  function md5ff(a, b, c, d, x, s, t) { return md5cmn((b & c) | (~b & d), a, b, x, s, t); }
  function md5gg(a, b, c, d, x, s, t) { return md5cmn((b & d) | (c & ~d), a, b, x, s, t); }
  function md5hh(a, b, c, d, x, s, t) { return md5cmn(b ^ c ^ d, a, b, x, s, t); }
  function md5ii(a, b, c, d, x, s, t) { return md5cmn(c ^ (b | ~d), a, b, x, s, t); }

  const utf8 = unescape(encodeURIComponent(str));
  const bytes = Array.from(utf8).map(c => c.charCodeAt(0));
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const bitLen = (utf8.length * 8);
  bytes.push(bitLen & 0xff, (bitLen >> 8) & 0xff, (bitLen >> 16) & 0xff, (bitLen >> 24) & 0xff, 0, 0, 0, 0);

  let a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476;

  for (let i = 0; i < bytes.length; i += 64) {
    const M = [];
    for (let j = 0; j < 16; j++) {
      M[j] = bytes[i + j*4] | (bytes[i + j*4+1] << 8) | (bytes[i + j*4+2] << 16) | (bytes[i + j*4+3] << 24);
    }
    let [aa, bb, cc, dd] = [a, b, c, d];
    a = md5ff(a,b,c,d,M[0],7,-680876936);   d = md5ff(d,a,b,c,M[1],12,-389564586);
    c = md5ff(c,d,a,b,M[2],17,606105819);   b = md5ff(b,c,d,a,M[3],22,-1044525330);
    a = md5ff(a,b,c,d,M[4],7,-176418897);   d = md5ff(d,a,b,c,M[5],12,1200080426);
    c = md5ff(c,d,a,b,M[6],17,-1473231341); b = md5ff(b,c,d,a,M[7],22,-45705983);
    a = md5ff(a,b,c,d,M[8],7,1770035416);   d = md5ff(d,a,b,c,M[9],12,-1958414417);
    c = md5ff(c,d,a,b,M[10],17,-42063);     b = md5ff(b,c,d,a,M[11],22,-1990404162);
    a = md5ff(a,b,c,d,M[12],7,1804603682);  d = md5ff(d,a,b,c,M[13],12,-40341101);
    c = md5ff(c,d,a,b,M[14],17,-1502002290);b = md5ff(b,c,d,a,M[15],22,1236535329);
    a = md5gg(a,b,c,d,M[1],5,-165796510);   d = md5gg(d,a,b,c,M[6],9,-1069501632);
    c = md5gg(c,d,a,b,M[11],14,643717713);  b = md5gg(b,c,d,a,M[0],20,-373897302);
    a = md5gg(a,b,c,d,M[5],5,-701558691);   d = md5gg(d,a,b,c,M[10],9,38016083);
    c = md5gg(c,d,a,b,M[15],14,-660478335); b = md5gg(b,c,d,a,M[4],20,-405537848);
    a = md5gg(a,b,c,d,M[9],5,568446438);    d = md5gg(d,a,b,c,M[14],9,-1019803690);
    c = md5gg(c,d,a,b,M[3],14,-187363961);  b = md5gg(b,c,d,a,M[8],20,1163531501);
    a = md5gg(a,b,c,d,M[13],5,-1444681467); d = md5gg(d,a,b,c,M[2],9,-51403784);
    c = md5gg(c,d,a,b,M[7],14,1735328473);  b = md5gg(b,c,d,a,M[12],20,-1926607734);
    a = md5hh(a,b,c,d,M[5],4,-378558);      d = md5hh(d,a,b,c,M[8],11,-2022574463);
    c = md5hh(c,d,a,b,M[11],16,1839030562); b = md5hh(b,c,d,a,M[14],23,-35309556);
    a = md5hh(a,b,c,d,M[1],4,-1530992060);  d = md5hh(d,a,b,c,M[4],11,1272893353);
    c = md5hh(c,d,a,b,M[7],16,-155497632);  b = md5hh(b,c,d,a,M[10],23,-1094730640);
    a = md5hh(a,b,c,d,M[13],4,681279174);   d = md5hh(d,a,b,c,M[0],11,-358537222);
    c = md5hh(c,d,a,b,M[3],16,-722521979);  b = md5hh(b,c,d,a,M[6],23,76029189);
    a = md5hh(a,b,c,d,M[9],4,-640364487);   d = md5hh(d,a,b,c,M[12],11,-421815835);
    c = md5hh(c,d,a,b,M[15],16,530742520);  b = md5hh(b,c,d,a,M[2],23,-995338651);
    a = md5ii(a,b,c,d,M[0],6,-198630844);   d = md5ii(d,a,b,c,M[7],10,1126891415);
    c = md5ii(c,d,a,b,M[14],15,-1416354905);b = md5ii(b,c,d,a,M[5],21,-57434055);
    a = md5ii(a,b,c,d,M[12],6,1700485571);  d = md5ii(d,a,b,c,M[3],10,-1894986606);
    c = md5ii(c,d,a,b,M[10],15,-1051523);   b = md5ii(b,c,d,a,M[1],21,-2054922799);
    a = md5ii(a,b,c,d,M[8],6,1873313359);   d = md5ii(d,a,b,c,M[15],10,-30611744);
    c = md5ii(c,d,a,b,M[6],15,-1560198380); b = md5ii(b,c,d,a,M[13],21,1309151649);
    a = md5ii(a,b,c,d,M[4],6,-145523070);   d = md5ii(d,a,b,c,M[11],10,-1120210379);
    c = md5ii(c,d,a,b,M[2],15,718787259);   b = md5ii(b,c,d,a,M[9],21,-343485551);
    a = safeAdd(a, aa); b = safeAdd(b, bb); c = safeAdd(c, cc); d = safeAdd(d, dd);
  }

  return [a, b, c, d].map(n => {
    const hex = (n >>> 0).toString(16).padStart(8, '0');
    return hex.match(/../g).reverse().join('');
  }).join('');
}
