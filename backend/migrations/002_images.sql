-- Product photos uploaded from the admin page (resized in the browser first)
CREATE TABLE IF NOT EXISTS images (
  id           TEXT PRIMARY KEY,
  content_type TEXT NOT NULL,
  data         BLOB NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
