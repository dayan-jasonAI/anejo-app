-- 0043 — The menu becomes DATA.
--
-- Until now a bowl price lived in FOUR hardcoded places (functions/api/checkout.js BOWL_BASE =
-- what we charge, public/order.html CATALOG = what we display, public/index.html = the homepage
-- cards, functions/api/chat.js = what the AI assistant quotes). Changing a price meant a code edit
-- and a deploy, and the homepage had already drifted out of sync with the storefront.
--
-- After this, D1 is the source of truth and the owner can change a price from the HUB. The
-- hardcoded constants stay in checkout.js as a FALLBACK ONLY — if D1 is unreachable, checkout must
-- still take money at the last known-good price rather than fail.
--
-- Seeded with the exact values live on 2026-07-25, so applying this changes no price.

CREATE TABLE IF NOT EXISTS menu_items (
  id             TEXT PRIMARY KEY,             -- slug used by checkout + the order page ('vida')
  kind           TEXT NOT NULL,                -- 'bowl' | 'drink' | 'addon'
  name           TEXT NOT NULL,
  name_es        TEXT,
  price_cents    INTEGER NOT NULL,
  description    TEXT,
  description_es TEXT,
  image          TEXT,                         -- filename under /assets/img/
  sort           INTEGER NOT NULL DEFAULT 100,
  active         INTEGER NOT NULL DEFAULT 1,   -- 0 hides it everywhere without deleting history
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_menu_items_kind ON menu_items(kind, sort);

-- Modifier pricing (extras, sauces, per-bowl add-ons) — same story, one row per knob.
CREATE TABLE IF NOT EXISTS menu_modifier_prices (
  key         TEXT PRIMARY KEY,
  cents       INTEGER NOT NULL,
  label       TEXT,
  updated_at  INTEGER NOT NULL
);

-- Audit trail: a price change is a money change, so record who/when/old→new.
CREATE TABLE IF NOT EXISTS menu_price_log (
  id          TEXT PRIMARY KEY,
  item_id     TEXT NOT NULL,
  field       TEXT NOT NULL,                   -- 'price_cents' | modifier key
  old_cents   INTEGER,
  new_cents   INTEGER,
  changed_by  TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_menu_price_log_item ON menu_price_log(item_id, created_at);

-- ---- Seed: exactly what is live today (prices from checkout.js BOWL_BASE + CATALOG) ----
INSERT OR IGNORE INTO menu_items (id, kind, name, name_es, price_cents, description, description_es, image, sort, active, created_at, updated_at) VALUES
  ('vida',        'bowl',  'VIDA',     'VIDA',     1999, 'Tuna, mango, quinoa, chickpeas',            'Atún, mango, quinoa, garbanzos',                'bowl_vida.jpg',     10, 1, 1785000000000, 1785000000000),
  ('fuego',       'bowl',  'FUEGO',    'FUEGO',    2299, 'Grilled steak, chimichurri, quinoa',        'Bistec a la parrilla, chimichurri, quinoa',     'bowl_fuego.jpg',    20, 1, 1785000000000, 1785000000000),
  ('ligero',      'bowl',  'LIGERO',   'LIGERO',   1899, 'Grilled chicken, chimichurri, quinoa',      'Pollo a la parrilla, chimichurri, quinoa',      'bowl_ligero.jpg',   30, 1, 1785000000000, 1785000000000),
  ('mar',         'bowl',  'MAR',      'MAR',      2299, 'Omega-rich salmon, quinoa, greens',         'Salmón rico en omega, quinoa, verdes',          'bowl_mar.jpg',      40, 1, 1785000000000, 1785000000000),
  ('coco',        'bowl',  'COCO',     'COCO',     2299, 'Coconut-lime shrimp, quinoa-corn-edamame',  'Camarón coco-limón, quinoa-maíz-edamame',       'bowl_coco.jpg',     50, 1, 1785000000000, 1785000000000),
  ('congreen',    'bowl',  'CONGREEN', 'CONGREEN', 2099, 'Quinoa-blueberry congrí, tuna',             'Congrí de quinoa-arándano, atún',               'bowl_congreen.jpg', 60, 1, 1785000000000, 1785000000000),
  ('raiz',        'bowl',  'RAÍZ',     'RAÍZ',     1899, 'Crispy tofu, quinoa, slaw, sweet potato',   'Tofu crujiente, quinoa, ensalada, batata',      'bowl_raiz.jpg',     70, 1, 1785000000000, 1785000000000),
  ('fit_gold',     'drink', 'Gold Vitality',   'Gold Vitality',   999, 'Pineapple · ginger · turmeric',   'Piña · jengibre · cúrcuma',   'fit_gold.jpg',     10, 1, 1785000000000, 1785000000000),
  ('fit_hibiscus', 'drink', 'Hibiscus Zen',    'Hibiscus Zen',    999, 'Hibiscus · lime · ginger · mint', 'Hibisco · limón · jengibre · menta', 'fit_hibiscus.jpg', 20, 1, 1785000000000, 1785000000000),
  ('fit_emerald',  'drink', 'Emerald Hydrate', 'Emerald Hydrate', 999, 'Cucumber · mint · lemon · chia',  'Pepino · menta · limón · chía',      'fit_emerald.jpg',  30, 1, 1785000000000, 1785000000000),
  ('sauce_extra',  'addon', 'Extra Signature Sauce', 'Salsa Extra', 150, '2 oz · on the side', '2 oz · aparte', NULL, 10, 1, 1785000000000, 1785000000000);

INSERT OR IGNORE INTO menu_modifier_prices (key, cents, label, updated_at) VALUES
  ('extra_std',      150, 'Extra of a standard on-bowl ingredient',  1785000000000),
  ('extra_premium',  300, 'Extra of a protein/premium ingredient',   1785000000000),
  ('extra_sauce',    150, 'Each ADDITIONAL house sauce (first free)',1785000000000),
  ('avocado_half',   200, '½ avocado',                               1785000000000),
  ('extra_protein',  450, 'Extra protein (4 oz)',                    1785000000000),
  ('sweet_potato',   200, 'Sweet potato',                            1785000000000),
  ('sauce_cup',      150, 'Extra sauce cup (2 oz)',                  1785000000000);
