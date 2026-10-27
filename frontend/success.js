// ── Order confirmation + receipt ─────────────────────────────
// Uses API_BASE, escapeHtml and formatRand from app.js

try { localStorage.removeItem('ushoti_cart'); } catch { /* ignore */ }

const ORDER_REF_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const STATUS_LABELS = { PAID: 'Paid', PENDING: 'Confirming…', FAILED: 'Not paid' };

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
  $('r-shipping').textContent = formatRand(o.shipping);
  $('r-total').textContent = formatRand(o.total);

  $('r-customer').innerHTML = `${escapeHtml(`${o.name_first} ${o.name_last}`)}<br>${escapeHtml(o.email)}`;
  $('r-address').innerHTML = [o.street, o.city, `${o.province} ${o.postal_code}`]
    .map(escapeHtml).join('<br>');
  $('r-payment-ref').textContent = o.payment_id ? `PayFast reference: ${o.payment_id}` : '';

  if (o.status === 'FAILED') {
    $('receipt-label').textContent = 'Payment Not Completed';
    $('receipt-heading').textContent = 'Payment Unsuccessful';
    $('receipt-message').textContent = 'Your payment did not go through, so you have not been charged. Please try checking out again.';
  } else if (o.status === 'PENDING') {
    $('receipt-message').textContent = 'We are waiting for PayFast to confirm your payment. This page will update in a moment.';
  } else {
    $('receipt-message').textContent = 'Your order will be dispatched within 1–2 business days. Keep this receipt for your records.';
  }

  $('receipt').hidden = false;
  $('print-receipt').hidden = false;
}

// PayFast can send the customer back a few seconds before it confirms the payment with us
async function loadReceipt(ref, attempt = 0) {
  try {
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
