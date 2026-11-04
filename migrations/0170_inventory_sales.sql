-- An owner/staff declared count of exact, finished sale units. This ledger is separate from
-- ingredient stock and does not infer conversions between differently packaged menu SKUs.
CREATE TABLE inventory_sale_offers (
  menu_item_id TEXT PRIMARY KEY,
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 0 AND 9999),
  revision INTEGER NOT NULL CHECK (revision > 0),
  counted_at INTEGER NOT NULL,
  sale_expires_at INTEGER NOT NULL,
  inventory_revision INTEGER NOT NULL CHECK (inventory_revision >= 0),
  enabled INTEGER NOT NULL CHECK (enabled IN (0,1)),
  change_id TEXT NOT NULL UNIQUE,
  actor_id TEXT,
  CHECK (sale_expires_at > counted_at)
);

-- A reservation is durable for its order and offer revision. Time alone never releases capacity.
CREATE TABLE inventory_sale_reservations (
  order_id TEXT NOT NULL,
  menu_item_id TEXT NOT NULL,
  offer_revision INTEGER NOT NULL CHECK (offer_revision > 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  reserved_at INTEGER NOT NULL,
  PRIMARY KEY (order_id, menu_item_id)
);
CREATE INDEX inventory_sale_reservations_offer
  ON inventory_sale_reservations(menu_item_id, offer_revision);

-- Each accepted row is an atomic capacity claim. The CHECK deliberately aborts the surrounding
-- D1 batch when the live offer changed, expired, or no longer has enough units.
CREATE TABLE inventory_sale_checkout_claims (
  order_id TEXT NOT NULL,
  menu_item_id TEXT NOT NULL,
  offer_revision INTEGER NOT NULL CHECK (offer_revision > 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  accepted INTEGER NOT NULL CHECK (accepted = 1),
  claimed_at INTEGER NOT NULL,
  PRIMARY KEY (order_id, menu_item_id)
);
