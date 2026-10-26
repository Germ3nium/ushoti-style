#!/usr/bin/env bash
# Sets the backend Worker's secrets with clearly labelled prompts,
# and removes any wrongly named secrets (anything not in CAPITAL_LETTERS).
set -euo pipefail
cd "$(dirname "$0")/../backend"

echo "Removing wrongly named secrets..."
npx wrangler secret list 2>/dev/null \
  | grep -o '"name": *"[^"]*"' | sed -E 's/"name": *"([^"]*)"/\1/' \
  | grep -vE '^[A-Z_]+$' \
  | while read -r name; do
      echo y | npx wrangler secret delete "$name" >/dev/null && echo "  removed one"
    done || true
echo "Done. Now enter your PayFast details."

set_secret() {
  local name="$1" label="$2" value
  read -rsp "$label: " value; echo
  printf '%s' "$value" | npx wrangler secret put "$name" >/dev/null && echo "  $name saved"
}

set_secret PAYFAST_MERCHANT_ID  "PayFast merchant ID (the number)"
set_secret PAYFAST_MERCHANT_KEY "PayFast merchant key"
set_secret PAYFAST_PASSPHRASE   "PayFast passphrase"

admin_key=$(openssl rand -hex 32)
printf '%s' "$admin_key" | npx wrangler secret put ADMIN_KEY >/dev/null && echo "  ADMIN_KEY saved"
echo
echo "Your new admin key (save it in a password manager, don't share it):"
echo "  $admin_key"
echo
echo "Deploying backend..."
npx wrangler deploy
