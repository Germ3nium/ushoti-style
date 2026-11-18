// ── Order confirmation + receipt ─────────────────────────────
// Uses API_BASE, escapeHtml and formatRand from app.js

try { localStorage.removeItem('ushoti_cart'); } catch { /* ignore */ }

const ORDER_REF_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const STATUS_LABELS = { PAID: 'Paid', PENDING: 'Confirming…', FAILED: 'Not paid', AWAITING_EFT: 'Awaiting EFT' };

function receiptOrderRef() {
  const fromLink = new URLSearchParams(location.search).get('order');
  if (ORDER_REF_PATTERN.test(fromLink || '')) return fromLink;
  try {
    const saved = localStorage.getItem('ushoti_last_order');
    return ORDER_REF_PATTERN.test(saved || '') ? saved : '';
  } catch { return ''; }
}

function formatDate(iso) {
  return new Date(iso).toLocaleString('en-ZA', { dateStyle: 'long', timeStyle: 'short' });
}

function renderReceipt(o) {
  const $ = id => document.getElementById(id);
  $('r-number').textContent = o.order_number;
  $('r-date').textContent = formatDate(o.paid_at || o.created_at);
  $('r-status').textContent = STATUS_LABELS[o.status] || o.status;

  $('r-items').innerHTML = o.items.map(i => `
    <tr>
      <td>${escapeHtml(i.name)}<span class="receipt-option">${escapeHtml(i.option || '')}</span></td>
      <td class="num">${i.qty}</td>
      <td class="num">${formatRand(i.price)}</td>
      <td class="num">${formatRand(i.price * i.qty)}</td>
    </tr>`).join('');
  $('r-subtotal').textContent = formatRand(o.subtotal);
  const discount = Math.round(o.subtotal + o.shipping - o.total); // orders keep no separate discount
  $('r-discount-row').hidden = !(discount > 0);
  $('r-discount').textContent = `−${formatRand(discount)}`;
  $('r-shipping').textContent = formatRand(o.shipping);
  $('r-total').textContent = formatRand(o.total);

  $('r-customer').innerHTML = `${escapeHtml(`${o.name_first} ${o.name_last}`)}<br>${escapeHtml(o.email)}`;
  $('r-address').innerHTML = [o.street, o.city, `${o.province} ${o.postal_code}`.trim()]
    .filter(Boolean).map(escapeHtml).join('<br>'); // PAXI orders only have a collection point
  $('r-payment-ref').textContent = o.payment_id ? `Paystack reference: ${o.payment_id}` : '';

  $('eft-box').hidden = o.status !== 'AWAITING_EFT';
  if (o.status === 'AWAITING_EFT') {
    const b = o.bank_details || {};
    const rows = [
      ['Amount to pay', formatRand(o.total)],
      ['Reference', o.order_number],
      ['Account holder', b.account_holder],
      ['Bank', b.bank],
      ['Account number', b.account_number],
      ['Branch code', b.branch_code],
      ['Account type', b.account_type],
    ].filter(([, v]) => v);
    $('eft-details').innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${escapeHtml(String(v))}</dd></div>`).join('');
    $('receipt-label').textContent = 'Order Received';
    $('receipt-heading').textContent = 'Almost Done: Please Pay by EFT';
    $('receipt-message').textContent = `Your order is reserved. Pay ${formatRand(o.total)} into the account below to complete it. We've also emailed you these details.`;
  } else if (o.status === 'FAILED') {
    $('receipt-label').textContent = 'Payment Not Completed';
    $('receipt-heading').textContent = 'Payment Unsuccessful';
    $('receipt-message').textContent = 'Your payment did not go through, so you have not been charged. Please try checking out again.';
  } else if (o.status === 'PENDING') {
    $('receipt-message').textContent = 'We are waiting for Paystack to confirm your payment. This page will update in a moment.';
  } else {
    $('receipt-message').textContent = 'Standard delivery takes about 2 weeks from payment. Express orders arrive sooner. Keep this receipt for your records.';
  }

  $('receipt').hidden = false;
  $('print-receipt').hidden = false;
}

// Paystack can send the customer back a few seconds before its notification reaches us,
// so ask the backend to check with Paystack directly while the order still shows pending
async function loadReceipt(ref, attempt = 0) {
  try {
    await fetch(`${API_BASE}/api/verify-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_ref: ref })
    }).catch(() => { /* the receipt still loads */ });
    const res = await fetch(`${API_BASE}/api/orders/${ref}`);
    if (!res.ok) return;
    const order = await res.json();
    renderReceipt(order);
    if (order.status === 'PENDING' && attempt < 10) {
      setTimeout(() => loadReceipt(ref, attempt + 1), 3000);
    }
  } catch { /* leave the plain confirmation message showing */ }
}

document.getElementById('print-receipt').addEventListener('click', () => window.print());

const orderRef = receiptOrderRef();
if (orderRef) loadReceipt(orderRef);
