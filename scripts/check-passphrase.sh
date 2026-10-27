#!/usr/bin/env bash
# Checks whether the PayFast passphrase stored in Cloudflare matches the one
# you type (copy it from PayFast sandbox → Settings). Nothing is sent anywhere
# except a normal test checkout request to your own backend.
set -euo pipefail
cd "$(dirname "$0")/../backend"

read -rsp "Paste the passphrase exactly as it is in PayFast: " PF_PASS; echo
export PF_PASS

node --input-type=module - <<'EOF'
import { readFileSync } from 'node:fs';

// Reuse the backend's own signing code
const src = readFileSync('worker.js', 'utf8');
const { generateSignature } = await import(
  'data:text/javascript,' + encodeURIComponent(src + '\nexport { generateSignature };')
);

const res = await fetch('https://ushoti-style-worker.sihlek56.workers.dev/api/sign-payment', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name_first: 'Passphrase', name_last: 'Check', email_address: 'check@example.com',
    street: '1 Test St', city: 'Johannesburg', postal_code: '2000', province: 'Gauteng',
    items: [{ id: 'hr1-18in', qty: 1 }]
  })
});
const data = await res.json();
if (!res.ok) { console.log('Backend error:', data.error); process.exit(1); }

const { signature, payfast_url, ...fields } = data;
const typed = process.env.PF_PASS;

if (await generateSignature(fields, typed) === signature) {
  console.log('\n✅ MATCH — Cloudflare has the same passphrase you typed.');
} else if (await generateSignature(fields, typed.trim()) === signature) {
  console.log('\n⚠️  Almost — they only differ by spaces at the start/end.');
} else {
  console.log('\n❌ NO MATCH — Cloudflare has a different passphrase.');
  console.log('   Fix: cd backend && npx wrangler secret put PAYFAST_PASSPHRASE');
}
EOF
