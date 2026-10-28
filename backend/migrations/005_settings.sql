-- Ushoti Style — migration 005: shop settings editable from the admin page
-- Run once against the live database BEFORE deploying the backend, from the backend/ folder:
--   npx wrangler d1 execute ushoti-db --remote --file=migrations/005_settings.sql

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Delivery fee in whole rands, added once per order
INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES ('shipping_fee', '80', datetime('now'));
