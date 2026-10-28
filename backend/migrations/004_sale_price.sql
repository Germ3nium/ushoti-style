-- Ushoti Style — migration 004: sale prices
-- Run once against the live database BEFORE deploying the backend, from the backend/ folder:
--   npx wrangler d1 execute ushoti-db --remote --file=migrations/004_sale_price.sql

-- Whole rands; NULL = not on sale. Must be lower than price to count.
ALTER TABLE products ADD COLUMN sale_price INTEGER;
