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
        items:         cart.map(i => ({ id: i.id, qty: i.qty }))
      })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.payment_url) throw new Error(data.error || 'Could not start payment');

    // The success page uses this to show the receipt when Paystack sends the customer back
    try { localStorage.setItem('ushoti_last_order', data.order_ref); } catch { /* ignore */ }
    window.location.href = data.payment_url; // Paystack's secure checkout page

  } catch (err) {
    btn.textContent = 'Pay Securely with Paystack';
    btn.disabled = false;
    alert('Payment error: ' + err.message);
  }
}
