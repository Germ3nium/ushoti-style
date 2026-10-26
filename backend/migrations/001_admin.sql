-- Ushoti Style — migration 001: products table + richer orders (admin page)
-- Run once against the live database, from the backend/ folder:
--   npx wrangler d1 execute ushoti-db --remote --file=migrations/001_admin.sql

-- ── Products ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id          TEXT    PRIMARY KEY,          -- e.g. snk1, hr1 (no dashes — used in cart item ids)
  category    TEXT    NOT NULL,             -- sneakers | hair
  name        TEXT    NOT NULL,
  price       INTEGER NOT NULL,             -- whole rands
  badge       TEXT    DEFAULT '',
  description TEXT    DEFAULT '',
  image       TEXT    NOT NULL,
  options     TEXT    NOT NULL DEFAULT '{}',-- JSON: sneakers {sizes, colours:[{name,hex}]}, hair {lengths}
  active      INTEGER NOT NULL DEFAULT 1,   -- 0 = hidden from the shop
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category, active, sort_order);

-- Seed with the products that were hard-coded in the site
INSERT OR IGNORE INTO products (id, category, name, price, badge, description, image, options, sort_order, created_at, updated_at) VALUES
('snk1','sneakers','Air Force 1 White',1299,'Classic','The iconic low-top silhouette featuring crisp leather, encapsulated Air cushioning, and timeless street style.','https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&h=500&fit=crop','{"sizes":[4,5,6,7,8,9,10,11,12,13],"colours":[{"name":"White","hex":"#ffffff"},{"name":"Black","hex":"#000000"},{"name":"Tan","hex":"#c8a96e"},{"name":"Steel Blue","hex":"#b0c4de"}]}',1,datetime('now'),datetime('now')),
('snk2','sneakers','Jordan 1 Retro High',2499,'Premium','Court heritage silhouette with premium full-grain leather, padded ankle support, and unmistakable Wings branding.','https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?w=600&h=500&fit=crop','{"sizes":[4,5,6,7,8,9,10,11,12,13],"colours":[{"name":"Red","hex":"#cc2200"},{"name":"Black","hex":"#000000"},{"name":"White","hex":"#ffffff"},{"name":"Navy","hex":"#1a3a6b"}]}',2,datetime('now'),datetime('now')),
('snk3','sneakers','Yeezy Boost 350',3199,'Limited','Sleek re-engineered Primeknit upper fitted with full-length adidas Boost technology for supreme cloud-like cushioning.','https://images.unsplash.com/photo-1608231387042-66d1773070a5?w=600&h=500&fit=crop','{"sizes":[4,5,6,7,8,9,10,11,12,13],"colours":[{"name":"Sand","hex":"#c8b89a"},{"name":"Dark Grey","hex":"#3d3d3d"},{"name":"Black","hex":"#000000"},{"name":"Cream","hex":"#f5f0e8"}]}',3,datetime('now'),datetime('now')),
('snk4','sneakers','Nike Dunk Low',1599,'','Vintage collegiate styling with clean leather overlays, a low-cut padded collar, and durable rubber cupsole.','https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=600&h=500&fit=crop','{"sizes":[4,5,6,7,8,9,10,11,12,13],"colours":[{"name":"White","hex":"#ffffff"},{"name":"Green","hex":"#2e5e2e"},{"name":"Dark Red","hex":"#8b0000"},{"name":"Black","hex":"#000000"}]}',4,datetime('now'),datetime('now')),
('snk5','sneakers','Adidas Superstar OG',1450,'','The original shell-toe legend featuring smooth coated leather, signature serrated 3-Stripes, and herringbone grip.','https://images.unsplash.com/photo-1584735175315-9d5df23be620?w=600&h=500&fit=crop','{"sizes":[4,5,6,7,8,9,10,11,12,13],"colours":[{"name":"White","hex":"#ffffff"},{"name":"Black","hex":"#000000"},{"name":"Tan","hex":"#c8a96e"}]}',5,datetime('now'),datetime('now')),
('snk6','sneakers','Puma Suede Classic',1099,'','Timeless street sneaker crafted with rich soft suede, iconic formstrip detailing, and effortless vintage appeal.','https://images.unsplash.com/photo-1556906781-9a412961a28c?w=600&h=500&fit=crop','{"sizes":[4,5,6,7,8,9,10,11,12,13],"colours":[{"name":"Blue","hex":"#1a1a6b"},{"name":"Red","hex":"#cc2200"},{"name":"Green","hex":"#2e5e2e"},{"name":"Black","hex":"#000000"},{"name":"Tan","hex":"#c8a96e"}]}',6,datetime('now'),datetime('now')),
('hr1','hair','Body Wave Wig 18"',1850,'Bestseller','Soft, natural-looking body waves with a silky finish. Full lace construction for a seamless hairline. Perfect for everyday wear or special occasions.','https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=600&h=500&fit=crop','{"lengths":[10,12,14,16,18,20,22,24]}',1,datetime('now'),datetime('now')),
('hr2','hair','Straight Bundles 3pcs',2200,'','Sleek, tangle-free straight bundles made from 100% virgin hair. Comes as a 3-piece set — can be dyed, bleached and heat-styled.','https://images.unsplash.com/photo-1560869713-7d0a29430803?w=600&h=500&fit=crop','{"lengths":[12,14,16,18,20,22,24,26,28]}',2,datetime('now'),datetime('now')),
('hr3','hair','Curly Lace Front Wig',2750,'Premium','Bouncy, defined curls with a pre-plucked lace front for a natural hairline. Lightweight and breathable — ideal for all-day comfort.','https://images.unsplash.com/photo-1595476108010-b4d1f102b1b1?w=600&h=500&fit=crop','{"lengths":[10,12,14,16,18,20,22]}',3,datetime('now'),datetime('now')),
('hr4','hair','4x4 Lace Closure',950,'','Free-part 4x4 lace closure for a flawless finish. Pairs perfectly with any bundle. Pre-bleached knots for a realistic scalp appearance.','https://images.unsplash.com/photo-1519699047748-de8e457a634e?w=600&h=500&fit=crop','{"lengths":[10,12,14,16,18]}',4,datetime('now'),datetime('now')),
('hr5','hair','Deep Wave Bundles 2pcs',1700,'','Rich, deep wave pattern with a lustrous shine. 2-piece bundle set made from unprocessed virgin hair. Holds moisture well and minimal shedding.','https://images.unsplash.com/photo-1580618672591-eb180b1a973f?w=600&h=500&fit=crop','{"lengths":[12,14,16,18,20,22,24,26]}',5,datetime('now'),datetime('now')),
('hr6','hair','Short Bob Wig',1350,'','Chic and low-maintenance short bob cut. Full lace wig with adjustable straps for a secure fit. Great for a bold, confident everyday look.','https://images.unsplash.com/photo-1526045612212-70caf35c14df?w=600&h=500&fit=crop','{"lengths":[8,10,12,14]}',6,datetime('now'),datetime('now'));

-- ── Orders: rebuild with items, address and fulfilment status ──
-- Orders are now created as PENDING when checkout starts and marked PAID by
-- PayFast's notification, so payment_id can no longer be NOT NULL.
CREATE TABLE orders_new (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_ref    TEXT    NOT NULL UNIQUE,      -- sent to PayFast as m_payment_id
  payment_id   TEXT    UNIQUE,               -- PayFast pf_payment_id, set when paid
  status       TEXT    NOT NULL DEFAULT 'PENDING', -- payment: PENDING | PAID | FAILED
  fulfilment   TEXT    NOT NULL DEFAULT 'NEW',     -- NEW | PROCESSING | SHIPPED | DELIVERED | CANCELLED
  items        TEXT    NOT NULL DEFAULT '[]',      -- JSON snapshot: [{product_id,name,option,price,qty}]
  item_name    TEXT    NOT NULL DEFAULT '',
  subtotal     REAL    NOT NULL DEFAULT 0,
  shipping     REAL    NOT NULL DEFAULT 0,
  total        REAL    NOT NULL DEFAULT 0,
  amount_paid  REAL,
  name_first   TEXT,
  name_last    TEXT,
  email        TEXT,
  phone        TEXT,
  street       TEXT,
  city         TEXT,
  postal_code  TEXT,
  province     TEXT,
  created_at   TEXT    NOT NULL,
  paid_at      TEXT,
  updated_at   TEXT
);

INSERT INTO orders_new (order_ref, payment_id, status, item_name, total, amount_paid,
                        name_first, name_last, email, created_at, paid_at, updated_at)
SELECT 'legacy-' || id, payment_id, status, item_name, CAST(amount AS REAL), CAST(amount AS REAL),
       name_first, name_last, email, created_at,
       CASE WHEN status = 'PAID' THEN created_at END, created_at
FROM orders;

DROP TABLE orders;
ALTER TABLE orders_new RENAME TO orders;

CREATE INDEX IF NOT EXISTS idx_orders_email      ON orders(email);
CREATE INDEX IF NOT EXISTS idx_orders_status     ON orders(status, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_fulfilment ON orders(fulfilment);
