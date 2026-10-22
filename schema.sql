-- Ushoti Style — Cloudflare D1 Database Schema
-- Run this in Cloudflare Dashboard → D1 → your database → Console
-- OR via CLI: wrangler d1 execute ushoti-db --file=schema.sql

CREATE TABLE IF NOT EXISTS orders (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_id   TEXT    NOT NULL UNIQUE,   -- PayFast pf_payment_id
  merchant_id  TEXT    NOT NULL,
  amount       TEXT    NOT NULL,          -- amount_gross from PayFast
  item_name    TEXT    NOT NULL,
  name_first   TEXT,
  name_last    TEXT,
  email        TEXT,
  status       TEXT    DEFAULT 'PENDING', -- PENDING | PAID | FAILED
  created_at   TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_email  ON orders(email);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
