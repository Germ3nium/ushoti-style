-- Several photos per product. `image` stays as the cover (first photo) so
-- product cards and older code keep working.
ALTER TABLE products ADD COLUMN images TEXT NOT NULL DEFAULT '[]';
UPDATE products SET images = json_array(image) WHERE images = '[]';
