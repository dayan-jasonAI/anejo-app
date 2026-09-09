-- Complete existing sauce card without changing its live price or availability.
UPDATE menu_items SET image='menu-launch/food-dip-signature-bulk.webp' WHERE id='sauce_extra' AND image IS NULL;
