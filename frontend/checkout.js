document.addEventListener('DOMContentLoaded', () => {
  const cart = JSON.parse(localStorage.getItem('ushoti_cart')) || [];
  if (cart.length === 0) window.location.href = 'products.html';
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
        street:        field('street'),
        city:          field('city'),
        postal_code:   field('postal_code'),
        province:      field('province'),
        items:         cart.map(i => ({ id: i.id, qty: i.qty }))
      })
    });

    const pfData = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(pfData.error || 'Could not start payment');

    const form = document.createElement('form');
    form.method = 'POST';
    form.action = pfData.payfast_url;
    delete pfData.payfast_url;
    // The success page uses this to show the receipt when PayFast sends the customer back
    try { localStorage.setItem('ushoti_last_order', pfData.order_ref); } catch { /* ignore */ }
    delete pfData.order_ref;

    Object.entries(pfData).forEach(([key, val]) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = key;
      input.value = val;
      form.appendChild(input);
    });

    document.body.appendChild(form);
    form.submit();

  } catch (err) {
    btn.textContent = 'Pay Securely with PayFast';
    btn.disabled = false;
    alert('Payment error: ' + err.message);
  }
}
