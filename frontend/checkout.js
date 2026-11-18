document.addEventListener('DOMContentLoaded', () => {
  const cart = JSON.parse(localStorage.getItem('ushoti_cart')) || [];
  if (cart.length === 0) window.location.href = 'products.html';
});

function deliveryMethod() {
  return document.querySelector('input[name="delivery_method"]:checked').value;
}

// PAXI needs a collection point and phone number instead of a street address
function syncDeliveryFields() {
  const paxi = deliveryMethod() === 'paxi';
  document.getElementById('paxi-fields').hidden = !paxi;
  document.getElementById('address-fields').hidden = paxi;
  document.getElementById('paxi_point').required = paxi;
  document.getElementById('cell_number').required = paxi;
  ['street', 'city', 'postal_code', 'province'].forEach(id => {
    document.getElementById(id).required = !paxi;
  });
  renderOrderSummary();
}

document.querySelectorAll('input[name="delivery_method"]').forEach(radio => {
  radio.addEventListener('change', syncDeliveryFields);
});

// ── How to pay: card (Paystack), EFT, or a choice (admin Settings tab) ──
let paymentMethods = 'paystack';

function paymentMethod() {
  if (paymentMethods !== 'both') return paymentMethods;
  return document.querySelector('input[name="payment_method"]:checked').value;
}

function payButtonText() {
  return paymentMethod() === 'eft' ? 'Place Order & Pay by EFT' : 'Pay Securely with Paystack';
}

function syncPaymentChoice() {
  document.getElementById('payment-choice').hidden = paymentMethods !== 'both';
  document.getElementById('card-soon').hidden = paymentMethods !== 'eft';
  document.getElementById('pay-btn').textContent = payButtonText();
  document.getElementById('pay-note-text').textContent = paymentMethod() === 'eft'
    ? "After you place the order you'll see our bank details. Use your order number as the reference."
    : 'Secured by Paystack — Cards, EFT & more';
}

document.querySelectorAll('input[name="payment_method"]').forEach(radio => {
  radio.addEventListener('change', syncPaymentChoice);
});

loadSettings().then(settings => {
  if (['paystack', 'eft', 'both'].includes(settings.payment_methods)) paymentMethods = settings.payment_methods;
  syncPaymentChoice();
}).catch(() => { /* card payment stays the default */ });

async function handleCheckout(e) {
  e.preventDefault();
  const btn = document.getElementById('pay-btn');
  btn.textContent = 'Processing...';
  btn.disabled = true;

  const cart = JSON.parse(localStorage.getItem('ushoti_cart')) || [];
  const field = id => document.getElementById(id).value;

  try {
    // The backend works out prices itself — we only send what was chosen
    const res = await fetch(`${API_BASE}/api/sign-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name_first:    field('name_first'),
        name_last:     field('name_last'),
        email_address: field('email_address'),
        cell_number:   field('cell_number'),
        delivery_method: deliveryMethod(),
        paxi_point:    field('paxi_point'),
        street:        field('street'),
        city:          field('city'),
        postal_code:   field('postal_code'),
        province:      field('province'),
        payment_method: paymentMethod(),
        items:         cart.map(i => ({ id: i.id, qty: i.qty }))
      })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !(data.payment_url || data.eft)) throw new Error(data.error || 'Could not start payment');

    // The success page uses this to show the receipt when Paystack sends the customer back
    try { localStorage.setItem('ushoti_last_order', data.order_ref); } catch { /* ignore */ }
    // EFT orders go straight to the order page with the bank details; card payments go to Paystack
    window.location.href = data.eft ? `success.html?order=${data.order_ref}` : data.payment_url;

  } catch (err) {
    btn.textContent = payButtonText();
    btn.disabled = false;
    alert('Payment error: ' + err.message);
  }
}
