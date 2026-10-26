const WORKER_URL = 'https://ushoti-style-worker.sihlek56.workers.dev';

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
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const total = (subtotal + 80).toFixed(2);

  try {
    const res = await fetch(`${WORKER_URL}/api/sign-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name_first:    document.getElementById('name_first').value,
        name_last:     document.getElementById('name_last').value,
        email_address: document.getElementById('email_address').value,
        cell_number:   document.getElementById('cell_number').value,
        amount:        total,
        item_name:     cart.map(i => `${i.name} x${i.qty}`).join(', ')
      })
    });

    if (!res.ok) throw new Error('Could not generate payment signature');
    const pfData = await res.json();

    const form = document.createElement('form');
    form.method = 'POST';
    form.action = pfData.payfast_url;
    delete pfData.payfast_url;

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
