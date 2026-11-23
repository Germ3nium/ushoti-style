// ── Cloudflare Worker for Ushoti Style ──────────────────────
// Handles:
//   GET    /api/products              → active products for the shop
//   GET    /api/settings              → shop settings shoppers need (delivery fee, banner, slideshow, trending sneakers)
//   GET    /api/images/:id            → product photo uploaded from the admin page
//   GET    /api/orders/:ref           → receipt for one order (the ref is an unguessable UUID)
//   POST   /api/sign-payment          → creates a PENDING order and a Paystack payment, returns its checkout link
//   POST   /api/verify-payment        → asks Paystack about an order's payment (the success page calls it)
//   POST   /api/paystack-webhook      → Paystack payment notification (marks order PAID, emails the buyer)
//   POST   /api/admin/login           → swaps the admin PIN (or the admin key) for a session token
//   Admin (Authorization: Bearer <session token or ADMIN_KEY>):
//   GET    /api/admin/pin             → whether a PIN has been set
//   PUT    /api/admin/pin             → set or change the PIN
//   GET    /api/admin/summary         → sales totals and best sellers
//   GET    /api/admin/orders          → orders (?status=PAID|AWAITING_EFT|PENDING|FAILED|ALL)
//   PATCH  /api/admin/orders/:id      → update fulfilment status, or mark an EFT order paid / cancelled
//   GET    /api/admin/products        → all products, including hidden ones
//   POST   /api/admin/products        → create product
//   PUT    /api/admin/products/:id    → update product
//   DELETE /api/admin/products/:id    → delete product
//   POST   /api/admin/images          → upload a product photo (raw image body), returns its url
//   PUT    /api/admin/settings        → update shop settings (delivery fee, banner, slideshow, trending sneakers)

// Paystack: test or live is decided by which secret key is set (sk_test_... or sk_live_...).
// PAYSTACK_API_BASE only exists so local tests can point at a stand-in server.
const PAYSTACK_API = 'https://api.paystack.co';
const paystackApi = env => env.PAYSTACK_API_BASE || PAYSTACK_API;

const EMAIL_FROM = 'Ushoti Style <orders@ushotistyle.co.za>';

const DEFAULT_SHIPPING_FEE = 80; // used until the admin sets one
const DEFAULT_PAXI_FEE = 150;
const MAX_SHIPPING_FEE = 10000;
// How customers can pay: Paystack (card), EFT (bank transfer to the shop's account), or a choice of both.
// EFT orders wait as AWAITING_EFT until the admin sees the money and marks them paid.
const PAYMENT_METHODS = ['paystack', 'eft', 'both'];
const BANK_FIELDS = ['account_holder', 'bank', 'account_number', 'branch_code', 'account_type'];
// Combo deals for products ticked "Combo eligible", e.g. two R1100 sneakers for R1500.
// Each deal is for one category (its group) and only counts products from that category.
const MAX_COMBO_DEALS = 20;
const MAX_COMBO_ITEMS = 6;
const DEFAULT_BANNER = ['Premium Sneakers', 'Hair Extensions & Wigs', 'Secure Paystack Checkout', 'Nationwide Delivery', 'New Arrivals Weekly'];
const MAX_BANNER_MESSAGES = 12;
const MAX_BANNER_LENGTH = 80;
// Home page "Trending Footwear" stories: a photo beside a sneaker's style and history.
// Images may be site files (images/...) or uploaded photo links.
const MAX_STORIES = 2;
const MAX_STORY_FACTS = 4;
// Home page slideshow. Buttons may only lead to shop pages or home page sections.
const MAX_SLIDES = 6;
const SLIDE_LINKS = ['sneakers.html', 'kids.html', 'hair.html', 'clothes.html', 'makeup.html', 'handbags.html', 'waist-trainers.html', 'sale.html', 'products.html', '#collections', '#featured-section'];
const SLIDE_FOCUS = ['left', 'center', 'right'];
const DEFAULT_SLIDES = [
  {
    image: 'images/hero/air-force-1-white.jpg', focus: 'right',
    eyebrow: 'Sneakers & Hair — New Season', title: 'Air Force 1', accent: 'White',
    text: 'The icon. Reimagined for the streets of South Africa.',
    buttons: [{ label: 'Shop Featured', link: '#featured-section' }, { label: 'All Sneakers', link: 'sneakers.html' }],
  },
  {
    image: 'images/hero/hair-curly-natural.jpg', focus: 'right',
    eyebrow: '22” 13x4 Full Frontal SDD', title: 'Jerry', accent: 'Curls',
    text: 'Super double drawn for fullness from root to tip.',
    buttons: [{ label: 'Shop Hair', link: 'hair.html' }, { label: 'All Collections', link: '#collections' }],
  },
  {
    image: 'images/hero/nike-p6000-silver.jpg', focus: 'right',
    eyebrow: 'Fresh Drop', title: 'Nike P-6000', accent: 'Silver',
    text: 'Y2K runner energy. Chrome finish. Built for everyday wear.',
    buttons: [{ label: 'Shop Sneakers', link: 'sneakers.html' }, { label: 'Shop Featured', link: '#featured-section' }],
  },
  {
    image: 'images/hero/adidas-campus-00s.jpg', focus: 'right',
    eyebrow: 'Just Landed', title: 'Adidas', accent: 'Campus 00s',
    text: 'Chunky suede. Gum sole. Grey or black — why not both?',
    buttons: [{ label: 'Shop Sneakers', link: 'sneakers.html' }, { label: 'Shop Featured', link: '#featured-section' }],
  },
];
const DEFAULT_STORIES = [
  {
    image: 'images/stories/air-force-1.jpg',
    product_id: 'snk24f2e92a',
    eyebrow: 'Since 1982',
    title: 'Nike Air Force 1',
    description: 'Designed by Bruce Kilgore and released in 1982, the Air Force 1 was the first basketball shoe with Nike Air cushioning. It soon moved from the court to the street and never left — the all-white low is still one of the most worn sneakers in the world.',
    facts: [
      { label: 'First released', value: '1982' },
      { label: 'Designer', value: 'Bruce Kilgore' },
      { label: 'Style', value: 'Low-top court classic' },
      { label: 'Upper', value: 'Leather' },
    ],
  },
  {
    image: 'images/stories/adidas-campus.jpg',
    product_id: 'snke740a0a6',
    eyebrow: 'Since 1983',
    title: 'Adidas Campus 00s',
    description: 'The Campus began on basketball courts as the Tournament before taking its name in 1983. Hip-hop and skate culture turned the suede low into a street staple, and the Campus 00s brings it back with a chunkier sole and fat laces.',
    facts: [
      { label: 'First released', value: '1983' },
      { label: 'This version', value: 'Campus 00s, 2023' },
      { label: 'Style', value: 'Suede low-top' },
      { label: 'Upper', value: 'Suede' },
    ],
  },
];
const CATEGORIES   = ['sneakers', 'kids', 'hair', 'clothes', 'makeup', 'handbags', 'waisttrainers'];
const ID_PREFIXES  = { sneakers: 'snk', kids: 'kid', hair: 'hr', clothes: 'clo', makeup: 'mku', handbags: 'bag', waisttrainers: 'wst' };
// Sneakers need a size and a colour. Clothes, makeup, handbags and waist trainers have sizes and
// colours (shades for makeup) only if the admin adds them: sizes are text like S, M, L.
const SHOE_CATEGORIES = ['sneakers', 'kids'];
const MAX_TEXT_SIZES = 20;
const FULFILMENT   = ['NEW', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'];
const IMAGE_TYPES  = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_BYTES = 1500000; // D1 rows top out at 2 MB
const MAX_PHOTOS   = 10;
const MAX_LENGTHS  = 20;
const MAX_LENGTH_INCHES = 60;
// Admin sign-in. The PIN is stored hashed in the settings table; the ADMIN_KEY
// secret always works too, so a forgotten PIN or a lockout can be undone.
const PIN_PATTERN = /^\d{6,12}$/;
const PIN_ITERATIONS = 100000; // the most PBKDF2 rounds Workers allows
const MAX_PIN_FAILURES = 5;
const PIN_LOCK_MINUTES = 15;
const SESSION_HOURS = 12;

export default {
  async fetch(request, env, ctx) {
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
        return await handleSignPayment(request, env, cors, ctx);
      }

      if (pathname === '/api/verify-payment' && method === 'POST') {
        return await handleVerifyPayment(request, env, cors, ctx);
      }

      if (pathname === '/api/paystack-webhook' && method === 'POST') {
        return await handlePaystackWebhook(request, env, cors, ctx);
      }

      // ── Admin routes ───────────────────────────────────────
      if (pathname === '/api/admin/login' && method === 'POST') {
        return await handleAdminLogin(request, env, cors);
      }

      if (pathname.startsWith('/api/admin/')) {
        const auth = await adminAuth(request, env);
        if (!auth) {
          return json({ error: 'Unauthorized' }, cors, 401);
        }

        const [, , , resource, id] = pathname.split('/'); // '', 'api', 'admin', resource, id

        if (resource === 'summary' && method === 'GET')            return await handleSummary(env, cors);
        if (resource === 'orders' && !id && method === 'GET')       return await handleAdminOrders(url, env, cors);
        if (resource === 'orders' && id && method === 'PATCH')      return await handleUpdateOrder(id, request, env, cors, ctx);
        if (resource === 'products' && !id && method === 'GET')     return await handleAdminProducts(env, cors);
        if (resource === 'products' && !id && method === 'POST')    return await handleSaveProduct(null, request, env, cors);
        if (resource === 'products' && id && method === 'PUT')      return await handleSaveProduct(id, request, env, cors);
        if (resource === 'products' && id && method === 'DELETE')   return await handleDeleteProduct(id, env, cors);
        if (resource === 'images' && !id && method === 'POST')      return await handleUploadImage(request, url, env, cors);
        if (resource === 'settings' && !id && method === 'PUT')     return await handleSaveSettings(request, env, cors);
        if (resource === 'pin' && !id && method === 'GET')          return await handlePinStatus(env, cors);
        if (resource === 'pin' && !id && method === 'PUT')          return await handleChangePin(auth, request, env, cors);
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

  const shop = results.map(parseProduct).map(shopProduct);

  return json(shop, {
    ...cors,
    'Cache-Control': 'no-cache' // admin changes show on the next page load
  });
}

// Shoppers see the price they pay; was_price is set only while on sale.
// Hair priced per length shows its cheapest length as the product's price.
function shopProduct(p) {
  const { sale_price, ...rest } = p;
  const variants = p.options.variants;
  if (!variants?.length) {
    return onSale(p) ? { ...rest, price: sale_price, was_price: p.price } : rest;
  }
  const shopVariants = variants.map(v => {
    const price = variantPrice(v);
    return { length: v.length, price, ...(price < v.price ? { was_price: v.price } : {}) };
  });
  const cheapest = shopVariants.reduce((a, b) => (b.price < a.price ? b : a));
  return {
    ...rest,
    price: cheapest.price,
    ...(cheapest.was_price ? { was_price: cheapest.was_price } : {}),
    options: { ...p.options, variants: shopVariants },
  };
}

// ── Settings ─────────────────────────────────────────────────
async function getSettings(env) {
  let rows = [];
  try {
    ({ results: rows } = await env.DB.prepare('SELECT key, value FROM settings').all());
  } catch { /* settings table not created yet — use the defaults */ }
  const stored = Object.fromEntries(rows.map(r => [r.key, r.value]));

  const fee = Number(stored.shipping_fee);
  const paxiFee = Number(stored.paxi_fee);
  const banner = safeJson(stored.banner, null);
  const stories = safeJson(stored.stories, null);
  const slides = safeJson(stored.slides, null);
  return {
    shipping_fee: stored.shipping_fee !== undefined && Number.isFinite(fee) ? fee : DEFAULT_SHIPPING_FEE,
    paxi_fee: stored.paxi_fee !== undefined && Number.isFinite(paxiFee) ? paxiFee : DEFAULT_PAXI_FEE,
    // Express shows at checkout only once the admin has set a fee and a time
    express_fee: stored.express_fee ? Number(stored.express_fee) : null,
    express_time: stored.express_time || '',
    combo_deals: Array.isArray(safeJson(stored.combo_deals, null)) ? safeJson(stored.combo_deals, null) : [],
    banner: Array.isArray(banner) ? banner : DEFAULT_BANNER,
    stories: Array.isArray(stories) ? stories : DEFAULT_STORIES,
    slides: Array.isArray(slides) && slides.length ? slides : DEFAULT_SLIDES,
    payment_methods: PAYMENT_METHODS.includes(stored.payment_methods) ? stored.payment_methods : 'paystack',
    bank_details: bankDetails(safeJson(stored.bank_details, {})),
  };
}

function bankDetails(raw) {
  return Object.fromEntries(BANK_FIELDS.map(k => [k, String(raw?.[k] || '').trim().slice(0, 60)]));
}

const eftEnabled = settings => settings.payment_methods !== 'paystack';
const paystackEnabled = settings => settings.payment_methods !== 'eft';

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

  if (body.paxi_fee !== undefined) {
    const fee = Number(body.paxi_fee);
    if (!(Number.isInteger(fee) && fee >= 0 && fee <= MAX_SHIPPING_FEE)) {
      return json({ error: `PAXI fee must be a whole number of rands from 0 to ${MAX_SHIPPING_FEE}` }, cors, 400);
    }
    updates.paxi_fee = String(fee);
  }

  if (body.express_fee !== undefined || body.express_time !== undefined) {
    const blank = body.express_fee === null || body.express_fee === '';
    const fee = Number(body.express_fee);
    const time = String(body.express_time || '').trim().slice(0, 60);
    if (!blank && !(Number.isInteger(fee) && fee > 0 && fee <= MAX_SHIPPING_FEE)) {
      return json({ error: `Express fee must be a whole number of rands from 1 to ${MAX_SHIPPING_FEE}, or blank to turn Express off` }, cors, 400);
    }
    if (!blank && !time) return json({ error: 'Add the Express delivery time, for example 3 to 5 business days' }, cors, 400);
    updates.express_fee = blank ? '' : String(fee);
    updates.express_time = blank ? '' : time;
  }

  if (body.payment_methods !== undefined || body.bank_details !== undefined) {
    const current = await getSettings(env);
    const methods = body.payment_methods !== undefined ? String(body.payment_methods) : current.payment_methods;
    const bank = body.bank_details !== undefined ? bankDetails(body.bank_details) : current.bank_details;
    if (!PAYMENT_METHODS.includes(methods)) return json({ error: 'Choose how customers can pay' }, cors, 400);
    if (bank.account_number && !/^[0-9 ]{5,20}$/.test(bank.account_number)) {
      return json({ error: 'The account number can only have numbers' }, cors, 400);
    }
    if (methods !== 'paystack' && !(bank.account_holder && bank.bank && bank.account_number)) {
      return json({ error: 'For EFT, add the account holder, bank and account number' }, cors, 400);
    }
    updates.payment_methods = methods;
    updates.bank_details = JSON.stringify(bank);
  }

  if (body.combo_deals !== undefined) {
    const deals = validateComboDeals(body.combo_deals);
    if (deals.error) return json({ error: deals.error }, cors, 400);
    updates.combo_deals = JSON.stringify(deals);
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

  if (body.slides !== undefined) {
    const slides = validateSlides(body.slides);
    if (slides.error) return json({ error: slides.error }, cors, 400);
    updates.slides = JSON.stringify(slides);
  }

  if (body.stories !== undefined) {
    const stories = validateStories(body.stories);
    if (stories.error) return json({ error: stories.error }, cors, 400);
    updates.stories = JSON.stringify(stories);
  }

  await saveSettingRows(env, updates);
  return json(await getSettings(env), cors);
}

async function saveSettingRows(env, updates) {
  const now = new Date().toISOString();
  const save = env.DB.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);
  const writes = Object.entries(updates).map(([key, value]) => save.bind(key, value, now));
  if (writes.length) await env.DB.batch(writes);
}

// ── Admin sign-in ────────────────────────────────────────────
// These rows are never sent to shoppers: getSettings only returns the shop settings.
async function readPinState(env) {
  const { results } = await env.DB.prepare(
    "SELECT key, value FROM settings WHERE key IN ('admin_pin', 'pin_failures', 'pin_locked_until')"
  ).all();
  return Object.fromEntries(results.map(r => [r.key, r.value]));
}

async function handleAdminLogin(request, env, cors) {
  if (!env.ADMIN_KEY) return json({ error: 'Admin sign-in is not set up' }, cors, 503);
  const body = await request.json().catch(() => ({}));
  const given = String(body.pin || '').trim();
  if (!given) return json({ error: 'Enter your PIN' }, cors, 400);

  const state = await readPinState(env);
  if (safeEqual(given, env.ADMIN_KEY)) {
    return json({ token: await makeSession(env, 'key', state.admin_pin), pin_set: !!state.admin_pin }, cors);
  }
  if (!state.admin_pin) {
    return json({ error: 'No PIN has been set yet. Sign in with the admin key, then set a PIN in Settings.' }, cors, 401);
  }

  const now = Date.now();
  const lockedUntil = Number(state.pin_locked_until) || 0;
  if (lockedUntil > now) {
    const minutes = Math.ceil((lockedUntil - now) / 60000);
    return json({ error: `Too many wrong PINs. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.` }, cors, 429);
  }

  if (await verifyPin(given, state.admin_pin)) {
    if (state.pin_failures && state.pin_failures !== '0') await saveSettingRows(env, { pin_failures: '0' });
    return json({ token: await makeSession(env, 'pin', state.admin_pin), pin_set: true }, cors);
  }

  const failures = (Number(state.pin_failures) || 0) + 1;
  if (failures >= MAX_PIN_FAILURES) {
    await saveSettingRows(env, { pin_failures: '0', pin_locked_until: String(now + PIN_LOCK_MINUTES * 60000) });
    return json({ error: `Too many wrong PINs. Sign-in is locked for ${PIN_LOCK_MINUTES} minutes.` }, cors, 429);
  }
  await saveSettingRows(env, { pin_failures: String(failures) });
  const left = MAX_PIN_FAILURES - failures;
  return json({ error: `Wrong PIN. ${left} more tr${left === 1 ? 'y' : 'ies'} before sign-in locks for ${PIN_LOCK_MINUTES} minutes.` }, cors, 401);
}

async function handlePinStatus(env, cors) {
  const state = await readPinState(env);
  return json({ pin_set: !!state.admin_pin }, cors);
}

// Changing the PIN signs out every other session, so the caller gets a fresh token
async function handleChangePin(auth, request, env, cors) {
  const body = await request.json().catch(() => ({}));
  const newPin = String(body.new_pin || '').trim();
  if (!PIN_PATTERN.test(newPin)) return json({ error: 'The new PIN must be 6 to 12 digits' }, cors, 400);

  const state = await readPinState(env);
  // Someone signed in with the admin key can reset a forgotten PIN
  if (state.admin_pin && auth !== 'key' && !(await verifyPin(String(body.current_pin || '').trim(), state.admin_pin))) {
    return json({ error: 'Your current PIN is wrong' }, cors, 400);
  }

  const hash = await hashPin(newPin);
  await saveSettingRows(env, { admin_pin: hash, pin_failures: '0', pin_locked_until: '0' });
  return json({ token: await makeSession(env, auth, hash), pin_set: true }, cors);
}

// Tokens look like "pin.<expiry>.<signature>". The signature covers the stored PIN hash,
// so changing the PIN (or the ADMIN_KEY secret) ends every session.
async function makeSession(env, mode, pinHash) {
  const exp = Date.now() + SESSION_HOURS * 3600000;
  return `${mode}.${exp}.${await sessionSignature(env, mode, exp, pinHash)}`;
}

async function sessionSignature(env, mode, exp, pinHash) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(env.ADMIN_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${mode}.${exp}.${pinHash || ''}`));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Returns how the request signed in ('key' or 'pin'), or null
async function adminAuth(request, env) {
  if (!env.ADMIN_KEY) return null;
  const given = (request.headers.get('Authorization') || '').replace(/^Bearer /, '');
  if (!given) return null;
  if (safeEqual(given, env.ADMIN_KEY)) return 'key';

  const [mode, exp, sig, extra] = given.split('.');
  if (extra !== undefined || !['key', 'pin'].includes(mode) || !(Number(exp) > Date.now()) || !sig) return null;
  const state = await readPinState(env);
  return safeEqual(sig, await sessionSignature(env, mode, exp, state.admin_pin)) ? mode : null;
}

async function hashPin(pin, salt = crypto.getRandomValues(new Uint8Array(16)), iterations = PIN_ITERATIONS) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  const b64 = bytes => btoa(String.fromCharCode(...bytes));
  return `pbkdf2$${iterations}$${b64(salt)}$${b64(new Uint8Array(bits))}`;
}

async function verifyPin(pin, stored) {
  const [scheme, iterations, salt] = String(stored).split('$');
  if (scheme !== 'pbkdf2' || !salt) return false;
  const saltBytes = Uint8Array.from(atob(salt), c => c.charCodeAt(0));
  return safeEqual(await hashPin(pin, saltBytes, Number(iterations)), stored);
}

function validateComboDeals(list) {
  if (!Array.isArray(list)) return { error: 'Combo deals must be a list' };
  if (list.length > MAX_COMBO_DEALS) return { error: `Use at most ${MAX_COMBO_DEALS} combo deals` };
  const seen = new Set();
  const deals = [];
  for (const [i, raw] of list.entries()) {
    const n = i + 1;
    const items = (Array.isArray(raw.items) ? raw.items : String(raw.items || '').split(','))
      .map(v => String(v).trim()).filter(Boolean).map(Number);
    if (items.length < 2 || items.length > MAX_COMBO_ITEMS) return { error: `Combo deal ${n}: list 2 to ${MAX_COMBO_ITEMS} product prices` };
    if (!items.every(p => Number.isInteger(p) && p > 0)) return { error: `Combo deal ${n}: product prices must be whole rands, like 1100, 1350` };
    items.sort((a, b) => a - b);
    const price = Number(raw.price);
    if (!(Number.isInteger(price) && price > 0)) return { error: `Combo deal ${n}: add the deal price` };
    if (price >= items.reduce((s, p) => s + p, 0)) return { error: `Combo deal ${n}: the deal price must be less than buying them separately` };
    const key = items.join(',');
    const group = CATEGORIES.includes(raw.group) ? raw.group : 'sneakers';
    if (seen.has(`${group}:${key}`)) return { error: `Combo deal ${n}: the same prices are already in another deal for that category` };
    seen.add(`${group}:${key}`);
    deals.push({ group, items, price });
  }
  return deals;
}

function validateSlides(list) {
  if (!Array.isArray(list) || !list.length) return { error: 'Keep at least one slide' };
  if (list.length > MAX_SLIDES) return { error: `Use at most ${MAX_SLIDES} slides` };
  const text = (value, max) => String(value || '').trim().slice(0, max);
  const slides = [];
  for (const [i, raw] of list.entries()) {
    const n = i + 1;
    const image = text(raw.image, 500);
    if (!image) return { error: `Slide ${n}: add a picture` };
    if (!isImageUrl(image) && !/^images\/[\w./-]+$/.test(image)) return { error: `Slide ${n}: that picture link isn't allowed` };
    const title = text(raw.title, 40);
    if (!title) return { error: `Slide ${n}: add a heading` };
    const buttons = [];
    for (const b of (Array.isArray(raw.buttons) ? raw.buttons : []).slice(0, 2)) {
      const label = text(b.label, 30);
      const link = text(b.link, 60);
      if (!label && !link) continue;
      if (!label) return { error: `Slide ${n}: give each button some text` };
      if (!SLIDE_LINKS.includes(link)) return { error: `Slide ${n}: choose where the "${label}" button goes` };
      buttons.push({ label, link });
    }
    slides.push({
      image, title, buttons,
      focus:   SLIDE_FOCUS.includes(raw.focus) ? raw.focus : 'right',
      eyebrow: text(raw.eyebrow, 60),
      accent:  text(raw.accent, 40),
      text:    text(raw.text, 200),
    });
  }
  return slides;
}

function validateStories(list) {
  if (!Array.isArray(list) || list.length > MAX_STORIES) return { error: `Add at most ${MAX_STORIES} trending sneakers` };
  const text = (value, max) => String(value || '').trim().slice(0, max);
  const stories = [];
  for (const [i, raw] of list.entries()) {
    const n = i + 1;
    const image = text(raw.image, 500);
    if (!image) return { error: `Trending sneaker ${n}: add a photo` };
    if (!isImageUrl(image) && !/^images\/[\w./-]+$/.test(image)) return { error: `Trending sneaker ${n}: that photo link isn't allowed` };
    const title = text(raw.title, 80);
    if (!title) return { error: `Trending sneaker ${n}: add a name` };
    const product_id = text(raw.product_id, 40);
    if (product_id && !/^[a-z0-9]+$/.test(product_id)) return { error: `Trending sneaker ${n}: pick a product from the list` };
    const facts = (Array.isArray(raw.facts) ? raw.facts : [])
      .map(f => ({ label: text(f.label, 30), value: text(f.value, 60) }))
      .filter(f => f.label && f.value)
      .slice(0, MAX_STORY_FACTS);
    stories.push({
      image, product_id, title, facts,
      eyebrow:     text(raw.eyebrow, 40),
      description: text(raw.description, 600),
    });
  }
  return stories;
}

// ── Sign Payment ─────────────────────────────────────────────
// Prices come from the database, never from the browser.
async function handleSignPayment(request, env, cors, ctx) {
  const body = await request.json();

  const method = body.delivery_method || 'courier';
  if (!['courier', 'express', 'paxi'].includes(method)) return json({ error: 'Please choose a delivery option' }, cors, 400);
  const paxi = method === 'paxi';
  const express = method === 'express';

  const required = ['name_first', 'name_last', 'email_address', ...(paxi
    ? ['paxi_point', 'cell_number']
    : ['street', 'city', 'postal_code', 'province'])];
  for (const field of required) {
    if (!sanitize(body[field])) return json({ error: `Missing ${field}` }, cors, 400);
  }

  const items = await priceCartItems(body.items, env);
  if (items.error) return json({ error: items.error }, cors, 400);

  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const settings = await getSettings(env);
  if (express && settings.express_fee === null) return json({ error: 'Express delivery is not available right now' }, cors, 400);
  // EFT when the customer chose it, or when it's the only way to pay
  const eft = settings.payment_methods === 'eft' || (settings.payment_methods === 'both' && body.payment_method === 'eft');
  if (!eft && !env.PAYSTACK_SECRET_KEY) return json({ error: 'Payments are not set up yet' }, cors, 503);
  const shipping = paxi ? settings.paxi_fee : express ? settings.express_fee : settings.shipping_fee;
  // The order keeps subtotal and total, so the discount is always subtotal + shipping - total
  const discount = comboDiscount(items, settings.combo_deals);
  const total    = subtotal - discount + shipping;
  const orderRef = crypto.randomUUID();
  const itemName = items.map(i => `${i.name} x${i.qty}`).join(', ');
  const now      = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO orders (
      order_ref, status, items, item_name, subtotal, shipping, total,
      name_first, name_last, email, phone, street, city, postal_code, province,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    orderRef, eft ? 'AWAITING_EFT' : 'PENDING', JSON.stringify(items), itemName, subtotal, shipping, total,
    sanitize(body.name_first), sanitize(body.name_last), sanitize(body.email_address),
    sanitize(body.cell_number),
    // The delivery option goes in the address, so admin, receipts and emails all show it
    paxi ? `PAXI: ${sanitize(body.paxi_point).slice(0, 120)}` : `${express ? 'EXPRESS: ' : ''}${sanitize(body.street)}`,
    paxi ? '' : sanitize(body.city),
    paxi ? '' : sanitize(body.postal_code),
    paxi ? '' : sanitize(body.province),
    now, now
  ).run();

  // EFT: the order waits for the customer's bank transfer; the success page shows the bank details
  if (eft) {
    const order = await env.DB.prepare('SELECT id FROM orders WHERE order_ref = ?').bind(orderRef).first();
    ctx.waitUntil(sendEftOrderEmails(order.id, env));
    return json({ order_ref: orderRef, eft: true }, cors);
  }

  // Ask Paystack for a checkout page for this order. The order's ref is the payment's
  // reference, so Paystack's notification and the verify call both lead back to it.
  let checkout;
  try {
    const res = await fetch(`${paystackApi(env)}/transaction/initialize`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email:        sanitize(body.email_address),
        amount:       Math.round(total * 100), // Paystack takes cents
        currency:     'ZAR',
        reference:    orderRef,
        callback_url: `${env.RETURN_URL}?order=${orderRef}`,
        metadata: {
          order_number: orderRef.slice(0, 8).toUpperCase(),
          cancel_action: env.CANCEL_URL, // where "Cancel payment" on Paystack's page goes
          custom_fields: [
            { display_name: 'Order', variable_name: 'order_number', value: orderRef.slice(0, 8).toUpperCase() },
            { display_name: 'Items', variable_name: 'items', value: sanitize(itemName).slice(0, 200) },
          ],
        },
      }),
    });
    checkout = await res.json().catch(() => ({}));
    if (!res.ok || !checkout.status || !checkout.data?.authorization_url) throw new Error(checkout.message || `HTTP ${res.status}`);
  } catch (err) {
    console.error('Paystack initialize failed:', err.message);
    await env.DB.prepare(`UPDATE orders SET status = 'FAILED', updated_at = ? WHERE order_ref = ?`)
      .bind(new Date().toISOString(), orderRef).run();
    return json({ error: 'We could not start the payment. Please try again in a moment.' }, cors, 502);
  }

  return json({ payment_url: checkout.data.authorization_url, order_ref: orderRef }, cors);
}

// ── Receipt ──────────────────────────────────────────────────
// Only someone who has the order's UUID (the buyer, via Paystack's return link) can see it.
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
  const bank = o.status === 'AWAITING_EFT' ? (await getSettings(env)).bank_details : null;

  return new Response(JSON.stringify({
    ...o,
    ...(bank ? { bank_details: bank } : {}),
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
    let price = onSale(p) ? p.sale_price : p.price;
    if (p.category !== 'hair') { // id is product-size-colour; size or colour is blank when the product has none
      const sizes   = p.options.sizes || [];
      const colours = p.options.colours || [];
      const sizeText = rest[0] || '';
      const hex      = rest.slice(1).join('-').toLowerCase();
      const size   = sizes.find(s => String(s) === sizeText);
      const colour = colours.find(c => c.hex.toLowerCase() === hex);
      const sizeOk   = sizes.length ? size !== undefined : !sizeText;
      const colourOk = colours.length ? !!colour : !hex;
      if (!sizeOk || !colourOk) return { error: `Please re-select options for ${p.name}` };
      option = [size !== undefined ? `Size ${size}` : '', colour ? colour.name : ''].filter(Boolean).join(', ');
    } else {
      const length = parseInt(rest[0], 10);
      if (!(p.options.lengths || []).includes(length)) return { error: `Please re-select options for ${p.name}` };
      option = `${length}"`;
      const variant = (p.options.variants || []).find(v => v.length === length);
      if (variant) price = variantPrice(variant);
    }

    priced.push({ product_id: p.id, name: p.name, option, price, qty, ...(p.options.combo ? { combo: p.category } : {}) });
  }
  return priced;
}

// Each category's deals are worked out separately, on that category's eligible items.
// items: [{ combo: category | undefined, price, qty }]
function comboDiscount(items, deals) {
  return CATEGORIES.reduce((saving, group) => saving + comboSaving(
    items.filter(i => i.combo === group).flatMap(i => Array(i.qty).fill(i.price)),
    deals.filter(d => (d.group || 'sneakers') === group)
  ), 0);
}

// The same comboSaving runs in the browser (app.js) to show the discount before paying.
// Combo deals, e.g. { items: [1100, 1100], price: 1500 }: those sneaker prices together cost the
// deal price. Finds the cheapest way to cover the eligible pairs with any mix of deals; pairs no
// deal fits pay their own price. Returns the saving.
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

// ── Paystack payments ────────────────────────────────────────
// Two ways an order gets marked paid, and either is enough:
//  1. Paystack's webhook, signed with our secret key (arrives even if the buyer closes the tab)
//  2. The success page asking us to check, which we do by asking Paystack ourselves
// Both end in applyPaystackResult, which checks the amount and currency.

async function handlePaystackWebhook(request, env, cors, ctx) {
  if (!env.PAYSTACK_SECRET_KEY) return new Response('NOT_SET_UP', { status: 503, headers: cors });
  const rawBody = await request.text();
  const expected = await hmacSha512Hex(env.PAYSTACK_SECRET_KEY, rawBody);
  if (!safeEqual(request.headers.get('x-paystack-signature') || '', expected)) {
    return new Response('INVALID_SIGNATURE', { status: 401, headers: cors });
  }

  const event = safeJson(rawBody, {});
  if (event.event === 'charge.success' && event.data?.reference) {
    await applyPaystackResult(event.data, env, ctx);
  }
  return new Response('OK', { status: 200, headers: cors }); // anything else is acknowledged and ignored
}

async function handleVerifyPayment(request, env, cors, ctx) {
  const body = await request.json().catch(() => ({}));
  const ref = String(body.order_ref || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(ref)) return json({ error: 'Order not found' }, cors, 404);
  const order = await env.DB.prepare('SELECT status FROM orders WHERE order_ref = ?').bind(ref).first();
  if (!order) return json({ error: 'Order not found' }, cors, 404);
  if (order.status !== 'PENDING' || !env.PAYSTACK_SECRET_KEY) return json({ status: order.status }, cors);

  try {
    const res = await fetch(`${paystackApi(env)}/transaction/verify/${encodeURIComponent(ref)}`, {
      headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}` },
    });
    const result = await res.json().catch(() => ({}));
    if (res.ok && result.status && result.data) await applyPaystackResult(result.data, env, ctx);
  } catch (err) {
    console.error('Paystack verify failed:', err.message); // the webhook can still mark it paid
  }
  const now = await env.DB.prepare('SELECT status FROM orders WHERE order_ref = ?').bind(ref).first();
  return json({ status: now.status }, cors);
}

// tx is Paystack's transaction: { reference, status, amount (cents), currency, id }
async function applyPaystackResult(tx, env, ctx) {
  const order = await env.DB.prepare('SELECT id, total FROM orders WHERE order_ref = ?')
    .bind(String(tx.reference || '')).first();
  if (!order) return;
  const now = new Date().toISOString();

  if (tx.status === 'failed') {
    await env.DB.prepare(`UPDATE orders SET status = 'FAILED', updated_at = ? WHERE id = ? AND status = 'PENDING'`)
      .bind(now, order.id).run();
    return;
  }
  if (tx.status !== 'success') return; // still in progress or abandoned: leave it pending

  // Make sure the amount paid matches what we charged
  if (tx.currency !== 'ZAR' || Number(tx.amount) !== Math.round(order.total * 100)) {
    console.error(`Paystack amount mismatch on order ${order.id}: ${tx.amount} ${tx.currency}`);
    return;
  }

  // Mark the order as paid (the webhook and the verify call can both arrive, so skip orders already paid)
  const update = await env.DB.prepare(`
    UPDATE orders SET status = 'PAID', payment_id = ?, amount_paid = ?, paid_at = ?, updated_at = ?
    WHERE id = ? AND status != 'PAID'
  `).bind(String(tx.id || tx.reference), Number(tx.amount) / 100, now, now, order.id).run();

  // Email the buyer and the shop once, without keeping Paystack waiting
  if (update.meta.changes) ctx.waitUntil(sendOrderEmails(order.id, env));
}

async function hmacSha512Hex(secret, text) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(text));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
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

  const waiting = await env.DB.prepare(`SELECT COUNT(*) AS n FROM orders WHERE status = 'AWAITING_EFT'`).first();

  return json({
    awaiting_eft: waiting?.n || 0,
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

async function handleUpdateOrder(id, request, env, cors, ctx) {
  const { fulfilment, payment } = await request.json();

  // EFT orders: the admin confirms the money arrived (which emails the customer), or cancels
  if (payment !== undefined) {
    const now = new Date().toISOString();
    const order = await env.DB.prepare('SELECT id, order_ref, total, status FROM orders WHERE id = ?').bind(id).first();
    if (!order) return json({ error: 'Order not found' }, cors, 404);
    if (order.status !== 'AWAITING_EFT') return json({ error: 'Only orders awaiting EFT can be changed this way' }, cors, 400);
    if (payment === 'PAID') {
      await env.DB.prepare(`
        UPDATE orders SET status = 'PAID', payment_id = ?, amount_paid = ?, paid_at = ?, updated_at = ?
        WHERE id = ? AND status = 'AWAITING_EFT'
      `).bind(`EFT-${order.order_ref.slice(0, 8).toUpperCase()}`, order.total, now, now, order.id).run();
      ctx.waitUntil(sendOrderEmails(order.id, env));
    } else if (payment === 'CANCELLED') {
      await env.DB.prepare(`UPDATE orders SET status = 'FAILED', fulfilment = 'CANCELLED', updated_at = ? WHERE id = ? AND status = 'AWAITING_EFT'`)
        .bind(now, order.id).run();
    } else {
      return json({ error: 'Invalid payment status' }, cors, 400);
    }
    return json({ ok: true }, cors);
  }

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
  const newId = ID_PREFIXES[p.category] + crypto.randomUUID().replace(/-/g, '').slice(0, 8);
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
  if (!CATEGORIES.includes(category)) return { error: 'Please choose a category' };

  const name = String(body.name || '').trim();
  if (!name) return { error: 'Name is required' };

  // Hair priced per length keeps its prices in options.variants;
  // the product's own price is just its cheapest length
  const opts = body.options || {};
  const variants = category === 'hair' && Array.isArray(opts.variants) ? validateVariants(opts.variants) : null;
  if (variants?.error) return variants;

  const price = variants ? Math.min(...variants.map(v => v.price)) : Math.round(Number(body.price));
  if (!(price > 0)) return { error: 'Price must be more than 0' };

  // Blank sale price = not on sale
  let sale_price = null;
  if (!variants && body.sale_price !== null && body.sale_price !== undefined && String(body.sale_price).trim() !== '') {
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

  const combo = opts.combo === true ? { combo: true } : {};
  let options;
  if (category !== 'hair') { // sneakers, kids sneakers, clothes, makeup and handbags
    const shoes = SHOE_CATEGORIES.includes(category);
    // Kids sizes run 10-13 then start again at 1, so keep the order the admin typed
    const sizes = shoes ? toNumberList(opts.sizes, { sorted: category !== 'kids' }) : toTextList(opts.sizes);
    if (sizes.error) return sizes;
    const colours = (Array.isArray(opts.colours) ? opts.colours : [])
      .map(c => ({
        name: String(c.name || '').trim(),
        hex: String(c.hex || '').toLowerCase(),
        // The photo shown when a shopper picks this colour: one of this product's own photos
        ...(images.includes(c.image) ? { image: c.image } : {}),
      }))
      .filter(c => c.name && /^#[0-9a-f]{6}$/.test(c.hex));
    if (shoes && !sizes.length)   return { error: 'Add at least one size' };
    if (shoes && !colours.length) return { error: 'Add at least one colour' };
    options = { sizes, colours, ...combo };
  } else if (variants) {
    options = { lengths: variants.map(v => v.length), variants, ...combo };
  } else {
    const lengths = toNumberList(opts.lengths);
    if (!lengths.length) return { error: 'Add at least one length' };
    options = { lengths, ...combo };
  }

  return {
    category, name, price, sale_price, image, images, options,
    badge:       String(body.badge || '').trim().slice(0, 30),
    description: String(body.description || '').trim().slice(0, 1000),
    active:      body.active === false || body.active === 0 ? 0 : 1,
    sort_order:  parseInt(body.sort_order, 10) || 0,
  };
}

function validateVariants(list) {
  if (!list.length) return { error: 'Add at least one length' };
  if (list.length > MAX_LENGTHS) return { error: `Add at most ${MAX_LENGTHS} lengths` };
  const seen = new Set();
  const variants = [];
  for (const raw of list) {
    const length = Number(raw.length);
    if (!(Number.isInteger(length) && length > 0 && length <= MAX_LENGTH_INCHES)) {
      return { error: `Each length must be a whole number of inches from 1 to ${MAX_LENGTH_INCHES}` };
    }
    if (seen.has(length)) return { error: `${length}" is listed twice` };
    seen.add(length);

    const price = Math.round(Number(raw.price));
    if (!(price > 0)) return { error: `Add a price for ${length}"` };

    const blankSale = raw.sale_price === null || raw.sale_price === undefined || String(raw.sale_price).trim() === '';
    const sale_price = blankSale ? null : Math.round(Number(raw.sale_price));
    if (!blankSale && !(sale_price > 0)) return { error: `The sale price for ${length}" must be more than 0` };
    if (!blankSale && sale_price >= price) return { error: `The sale price for ${length}" must be lower than its normal price` };

    variants.push({ length, price, sale_price });
  }
  return variants.sort((a, b) => a.length - b.length);
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

// Constant-time comparison so secrets can't be guessed from response timing
function safeEqual(given, expected) {
  given = String(given);
  expected = String(expected);
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

function onSale(p) {
  return p.sale_price > 0 && p.sale_price < p.price;
}

function variantPrice(v) {
  return v.sale_price > 0 && v.sale_price < v.price ? v.sale_price : v.price;
}

function parseProduct(p) {
  const images = safeJson(p.images, []);
  return { ...p, options: safeJson(p.options, {}), images: images.length ? images : [p.image] };
}

function safeJson(text, fallback) {
  try { return JSON.parse(text); } catch { return fallback; }
}

// Clothing sizes such as "S, M, L, XL" or "32, 34": kept in the order typed
function toTextList(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(',');
  const sizes = [...new Set(list.map(v => String(v).trim()).filter(Boolean))];
  if (sizes.length > MAX_TEXT_SIZES) return { error: `Add at most ${MAX_TEXT_SIZES} sizes` };
  // A dash would break the cart's item id, which is product-size-colour
  if (!sizes.every(s => /^[\w ./+]{1,12}$/.test(s))) return { error: 'Sizes can use letters, numbers, spaces, / and . (up to 12 characters each)' };
  return sizes;
}

function toNumberList(value, { sorted = true } = {}) {
  const list = Array.isArray(value) ? value : String(value || '').split(',');
  const numbers = [...new Set(list.map(Number).filter(n => n > 0))];
  return sorted ? numbers.sort((a, b) => a - b) : numbers;
}

// ── Order emails ─────────────────────────────────────────────
// A failed email is only logged: the order is already paid and shows in admin.
async function sendOrderEmails(orderId, env) {
  if (!env.RESEND_API_KEY) return; // email isn't set up
  try {
    const o = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first();
    const items = safeJson(o.items, []);
    const number = o.order_ref.slice(0, 8).toUpperCase();
    const receiptUrl = `${env.RETURN_URL}?order=${o.order_ref}`;
    const address = [o.street, o.city, o.province, o.postal_code].filter(Boolean);
    const discount = Math.round(o.subtotal + o.shipping - o.total);

    const jobs = [sendEmail(env, {
      to: o.email,
      reply_to: env.ORDER_ALERT_EMAIL,
      subject: `Your Ushoti Style order #${number}`,
      html: orderEmailHtml(o, items, number, receiptUrl, address, discount),
      text: [
        `Hi ${o.name_first}, thank you for your order. Your payment has been received.`,
        `Order #${number}`,
        ...items.map(i => `${i.qty} x ${i.name}${i.option ? ` (${i.option})` : ''}: ${emailRand(i.price * i.qty)}`),
        ...(discount > 0 ? [`Combo deal: -${emailRand(discount)}`] : []),
        `Delivery: ${emailRand(o.shipping)}`,
        `Total paid: ${emailRand(o.total)}`,
        `Delivering to: ${address.join(', ')}`,
        `Your receipt: ${receiptUrl}`,
      ].join('\n'),
    })];

    if (env.ORDER_ALERT_EMAIL) {
      jobs.push(sendEmail(env, {
        to: env.ORDER_ALERT_EMAIL,
        reply_to: o.email,
        subject: `New paid order #${number}: ${emailRand(o.total)}`,
        text: [
          `${o.name_first} ${o.name_last} paid ${emailRand(o.total)}.`,
          ...items.map(i => `${i.qty} x ${i.name}${i.option ? ` (${i.option})` : ''}`),
          `Deliver to: ${address.join(', ')}`,
          `Phone: ${o.phone || 'not given'}`,
          `Email: ${o.email}`,
        ].join('\n'),
      }));
    }
    await Promise.all(jobs);
  } catch (e) {
    console.error(`Order email failed for order ${orderId}: ${e.message}`);
  }
}

// EFT order placed: tell the customer how to pay, and let the shop know one is coming.
// The customer's email uses the Resend template named in RESEND_EFT_TEMPLATE when it's set
// (so it can be edited on resend.com), and the built-in design otherwise or if the template fails.
async function sendEftOrderEmails(orderId, env) {
  if (!env.RESEND_API_KEY) return; // email isn't set up
  try {
    const o = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first();
    const items = safeJson(o.items, []);
    const number = o.order_ref.slice(0, 8).toUpperCase();
    const bank = (await getSettings(env)).bank_details;
    const receiptUrl = `${env.RETURN_URL}?order=${o.order_ref}`;
    const address = [o.street, o.city, o.province, o.postal_code].filter(Boolean);
    const discount = Math.round(o.subtotal + o.shipping - o.total);
    const itemLine = i => `${i.qty} x ${i.name}${i.option ? ` (${i.option})` : ''}: ${emailRand(i.price * i.qty)}`;
    const subject = `Your Ushoti Style order #${number}: please pay by EFT`;

    const builtIn = {
      to: o.email,
      reply_to: env.ORDER_ALERT_EMAIL,
      subject,
      html: eftEmailHtml(o, items, number, receiptUrl, address, discount, bank),
      text: [
        `Hi ${o.name_first}, thank you for your order.`,
        `To complete it, please pay ${emailRand(o.total)} by EFT into this account:`,
        '',
        `Account holder: ${bank.account_holder}`,
        `Bank: ${bank.bank}`,
        `Account number: ${bank.account_number}`,
        ...(bank.branch_code ? [`Branch code: ${bank.branch_code}`] : []),
        ...(bank.account_type ? [`Account type: ${bank.account_type}`] : []),
        `Reference: ${number}`,
        '',
        'Please use the reference so we can match your payment. We start on your order once the money reflects in our account.',
        '',
        ...items.map(itemLine),
        ...(discount > 0 ? [`Combo deal: -${emailRand(discount)}`] : []),
        `Delivery: ${emailRand(o.shipping)}`,
        `Total to pay: ${emailRand(o.total)}`,
        `Your order: ${receiptUrl}`,
      ].join('\n'),
    };

    const customerEmail = async () => {
      if (env.RESEND_EFT_TEMPLATE) {
        try {
          // Every value is text; blanks become "-" because Resend refuses a template variable left empty
          const v = value => String(value ?? '').trim() || '-';
          return await sendEmail(env, {
            to: o.email,
            reply_to: env.ORDER_ALERT_EMAIL,
            subject,
            template: {
              id: env.RESEND_EFT_TEMPLATE.trim(),
              variables: {
                CUSTOMER_NAME: v(o.name_first),
                ORDER_NUMBER: v(number),
                AMOUNT_TO_PAY: v(emailRand(o.total)),
                ACCOUNT_HOLDER: v(bank.account_holder),
                BANK: v(bank.bank),
                ACCOUNT_NUMBER: v(bank.account_number),
                BRANCH_CODE: v(bank.branch_code),
                ACCOUNT_TYPE: v(bank.account_type),
                ITEMS: v(items.map(itemLine).join('\n')),
                COMBO_DEAL: discount > 0 ? `-${emailRand(discount)}` : 'R0',
                DELIVERY: v(emailRand(o.shipping)),
                DELIVERING_TO: v(address.join(', ')),
                ORDER_LINK: v(receiptUrl),
              },
            },
          });
        } catch (err) {
          console.error('EFT email template failed, sending the built-in email instead:', err.message);
        }
      }
      return sendEmail(env, builtIn);
    };

    const jobs = [customerEmail()];
    if (env.ORDER_ALERT_EMAIL) {
      jobs.push(sendEmail(env, {
        to: env.ORDER_ALERT_EMAIL,
        reply_to: o.email,
        subject: `New EFT order #${number}: ${emailRand(o.total)} (awaiting payment)`,
        text: [
          `${o.name_first} ${o.name_last} placed an order and will pay ${emailRand(o.total)} by EFT with reference ${number}.`,
          'When the money reflects, open the order in admin and click "Mark as paid".',
          ...items.map(i => `${i.qty} x ${i.name}${i.option ? ` (${i.option})` : ''}`),
          `Phone: ${o.phone || 'not given'}`,
          `Email: ${o.email}`,
        ].join('\n'),
      }));
    }
    const results = await Promise.allSettled(jobs);
    results.filter(r => r.status === 'rejected').forEach(r => console.error('EFT order email failed:', r.reason));
  } catch (err) {
    console.error('EFT order emails failed:', err);
  }
}

async function sendEmail(env, message) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: EMAIL_FROM, ...message }),
  });
  if (!res.ok) throw new Error(`Resend answered ${res.status}: ${await res.text()}`);
}

function emailRand(amount) {
  return 'R' + Number(amount).toLocaleString('en-US');
}

function emailEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
}

// Both customer emails share one look: dark header, white card, gold button
function emailRow(label, value, style = '') {
  return `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #e0d5c0;${style}">${label}</td>
      <td align="right" style="padding:10px 0;border-bottom:1px solid #e0d5c0;white-space:nowrap;${style}">${value}</td>
    </tr>`;
}

function emailLayout(content) {
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:24px 12px;background:#faf7f2;font-family:Arial,Helvetica,sans-serif;color:#1a1208;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;">
    <tr><td align="center" style="padding:24px;background:#1a1208;font-family:Georgia,serif;font-size:22px;font-weight:bold;letter-spacing:3px;color:#b8922a;">USHOTI STYLE</td></tr>
    <tr><td style="padding:28px 24px;">${content}
    </td></tr>
    <tr><td align="center" style="padding:16px 24px;font-size:12px;color:#6b5f4f;">Ushoti Style &middot; Proudly South African</td></tr>
  </table>
</body></html>`;
}

function emailItemRows(items, discount, o) {
  return `
        ${items.map(i => emailRow(`${i.qty} &times; ${emailEscape(i.name)}<br/><span style="font-size:12px;color:#6b5f4f;">${emailEscape(i.option)}</span>`, emailRand(i.price * i.qty))).join('')}
        ${discount > 0 ? emailRow('Combo deal', `-${emailRand(discount)}`) : ''}
        ${emailRow('Delivery', emailRand(o.shipping))}`;
}

function emailButton(url, label) {
  return `<a href="${emailEscape(url)}" style="display:inline-block;padding:12px 24px;background:#b8922a;color:#ffffff;text-decoration:none;font-size:13px;font-weight:bold;letter-spacing:1px;">${label}</a>`;
}

function orderEmailHtml(o, items, number, receiptUrl, address, discount) {
  return emailLayout(`
      <h1 style="margin:0 0 8px;font-family:Georgia,serif;font-size:22px;">Thank you, ${emailEscape(o.name_first)}</h1>
      <p style="margin:0 0 20px;line-height:1.6;">We've received your payment and we're getting your order ready.</p>
      <p style="margin:0 0 8px;font-size:13px;color:#6b5f4f;">Order #${number}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
        ${emailItemRows(items, discount, o)}
        ${emailRow('Total paid', emailRand(o.total), 'font-weight:bold;')}
      </table>
      <p style="margin:20px 0 4px;font-size:13px;color:#6b5f4f;">Delivering to</p>
      <p style="margin:0 0 24px;line-height:1.5;font-size:14px;">${address.map(emailEscape).join('<br/>')}</p>
      ${emailButton(receiptUrl, 'VIEW YOUR RECEIPT')}`);
}

function eftEmailHtml(o, items, number, receiptUrl, address, discount, bank) {
  const bankRows = [
    ['Amount to pay', emailRand(o.total)],
    ['Reference', number],
    ['Account holder', bank.account_holder],
    ['Bank', bank.bank],
    ['Account number', bank.account_number],
    ['Branch code', bank.branch_code],
    ['Account type', bank.account_type],
  ].filter(([, value]) => value)
    .map(([label, value]) => emailRow(`<span style="color:#6b5f4f;">${label}</span>`, `<strong>${emailEscape(value)}</strong>`))
    .join('');
  return emailLayout(`
      <h1 style="margin:0 0 8px;font-family:Georgia,serif;font-size:22px;">Thank you, ${emailEscape(o.name_first)}</h1>
      <p style="margin:0 0 20px;line-height:1.6;">Your order is reserved. To complete it, please pay <strong>${emailRand(o.total)}</strong> by EFT into the account below.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;border:1px solid #b8922a;">
        <tr><td style="padding:16px 18px;">
          <p style="margin:0 0 6px;font-family:Georgia,serif;font-size:17px;font-weight:bold;">Pay by EFT</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${bankRows}</table>
          <p style="margin:12px 0 0;font-size:12px;line-height:1.6;color:#6b5f4f;">Please use the reference exactly as shown so we can match your payment. We start on your order once the money reflects in our account.</p>
        </td></tr>
      </table>
      <p style="margin:24px 0 8px;font-size:13px;color:#6b5f4f;">Order #${number}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
        ${emailItemRows(items, discount, o)}
        ${emailRow('Total to pay', emailRand(o.total), 'font-weight:bold;')}
      </table>
      <p style="margin:20px 0 4px;font-size:13px;color:#6b5f4f;">Delivering to</p>
      <p style="margin:0 0 24px;line-height:1.5;font-size:14px;">${address.map(emailEscape).join('<br/>')}</p>
      ${emailButton(receiptUrl, 'VIEW YOUR ORDER')}`);
}

function sanitize(str) {
  return String(str || '').replace(/[<>"']/g, '').trim();
}

