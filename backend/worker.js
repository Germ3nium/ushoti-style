// ── Cloudflare Worker for Ushoti Style ──────────────────────
// Handles:
//   POST /api/sign-payment   → generates PayFast MD5 signature
//   POST /api/notify         → receives PayFast payment notification
//   GET  /api/orders         → lists all orders (admin)

const PAYFAST_SANDBOX = true; // set to false when going live

const PF_HOST = PAYFAST_SANDBOX
  ? 'sandbox.payfast.co.za'
  : 'www.payfast.co.za';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS headers for all responses
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    // ── Route: Generate PayFast Signature ─────────────────
    if (url.pathname === '/api/sign-payment' && request.method === 'POST') {
      return handleSignPayment(request, env, cors);
    }

    // ── Route: PayFast Payment Notification (ITN) ─────────
    if (url.pathname === '/api/notify' && request.method === 'POST') {
      return handleNotify(request, env, cors);
    }

    // ── Route: Get Orders (Admin) ──────────────────────────
    if (url.pathname === '/api/orders' && request.method === 'GET') {
      return handleGetOrders(request, env, cors);
    }

    return new Response('Not Found', { status: 404, headers: cors });
  }
};

// ── Sign Payment ─────────────────────────────────────────────
async function handleSignPayment(request, env, cors) {
  try {
    const body = await request.json();

    const pfData = {
      merchant_id:   env.PAYFAST_MERCHANT_ID,
      merchant_key:  env.PAYFAST_MERCHANT_KEY,
      return_url:    env.RETURN_URL,
      cancel_url:    env.CANCEL_URL,
      notify_url:    env.NOTIFY_URL,
      name_first:    sanitize(body.name_first),
      name_last:     sanitize(body.name_last),
      email_address: sanitize(body.email_address),
      cell_number:   sanitize(body.cell_number || ''),
      amount:        parseFloat(body.amount).toFixed(2),
      item_name:     sanitize(body.item_name),
    };

    // Remove empty fields
    Object.keys(pfData).forEach(k => {
      if (!pfData[k]) delete pfData[k];
    });

    const signature = await generateSignature(pfData, env.PAYFAST_PASSPHRASE);

    return new Response(JSON.stringify({
      ...pfData,
      signature,
      payfast_url: `https://${PF_HOST}/eng/process`
    }), {
      headers: { 'Content-Type': 'application/json', ...cors }
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...cors }
    });
  }
}

// ── Handle PayFast ITN Notification ─────────────────────────
async function handleNotify(request, env, cors) {
  try {
    const rawBody = await request.text();
    const params = new URLSearchParams(rawBody);
    const data = Object.fromEntries(params);

    // 1. Verify payment status
    if (data.payment_status !== 'COMPLETE') {
      return new Response('PAYMENT_NOT_COMPLETE', { status: 200, headers: cors });
    }

    // 2. Verify signature
    const receivedSig = data.signature;
    delete data.signature;
    const expectedSig = await generateSignature(data, env.PAYFAST_PASSPHRASE);

    if (receivedSig !== expectedSig) {
      return new Response('INVALID_SIGNATURE', { status: 400, headers: cors });
    }

    // 3. Verify with PayFast server (source IP validation)
    const pfValid = await verifyWithPayFast(rawBody, PF_HOST);
    if (!pfValid) {
      return new Response('PAYFAST_VERIFY_FAILED', { status: 400, headers: cors });
    }

    // 4. Save order to D1 database
    await env.DB.prepare(`
      INSERT INTO orders (
        payment_id, merchant_id, amount, item_name,
        name_first, name_last, email, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      data.pf_payment_id,
      data.merchant_id,
      data.amount_gross,
      data.item_name,
      data.name_first || '',
      data.name_last || '',
      data.email_address || '',
      'PAID',
      new Date().toISOString()
    ).run();

    return new Response('OK', { status: 200, headers: cors });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...cors }
    });
  }
}

// ── Get Orders (Admin) ───────────────────────────────────────
async function handleGetOrders(request, env, cors) {
  // Basic auth check using admin key
  const authHeader = request.headers.get('Authorization');
  if (!env.ADMIN_KEY || authHeader !== `Bearer ${env.ADMIN_KEY}`) {
    return new Response('Unauthorized', { status: 401, headers: cors });
  }

  const { results } = await env.DB.prepare(
    'SELECT * FROM orders ORDER BY created_at DESC LIMIT 100'
  ).all();

  return new Response(JSON.stringify(results), {
    headers: { 'Content-Type': 'application/json', ...cors }
  });
}

// ── Helpers ──────────────────────────────────────────────────

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
