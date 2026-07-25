-- 0042 — Promo codes + influencer affiliate attribution.
--
-- Two code kinds share one table because they share one redemption path at checkout:
--   'customer'  — issued to a launch-list signup. BOUND to one account email, non-shareable.
--                 10% off every order for 30 days + 2x rewards points.
--   'affiliate' — issued to a PBC influencer/partner. Shareable by design (that's the point).
--                 Partner earns commission_pct of each sale; their followers get a first-order
--                 perk (free Añejo Fit drink) + 2x points.
--
-- Non-shareability for customer codes is enforced server-side in _lib/promo.js: the redeeming
-- session's email must equal bound_email. A shared code fails for anyone else, by construction.

CREATE TABLE IF NOT EXISTS promo_codes (
  code             TEXT PRIMARY KEY,               -- uppercase, e.g. 'FOUND-A7K2QX' / 'MARIA'
  kind             TEXT NOT NULL,                  -- 'customer' | 'affiliate'
  bound_email      TEXT,                           -- customer codes: the ONLY account that may use it
  partner_id       TEXT REFERENCES trainers(id),   -- affiliate codes: the influencer/partner
  pct_off          INTEGER NOT NULL DEFAULT 0,     -- % off subtotal (10)
  points_mult      REAL    NOT NULL DEFAULT 1,     -- rewards multiplier (2 = 2x)
  perk             TEXT,                           -- 'fit_drink' | NULL
  perk_first_order_only INTEGER NOT NULL DEFAULT 1,
  commission_pct   INTEGER NOT NULL DEFAULT 0,     -- affiliate: % of sale paid to partner (10)
  starts_at        INTEGER,
  expires_at       INTEGER,                        -- customer codes: issued_at + 30 days
  max_uses         INTEGER,                        -- NULL = unlimited
  uses             INTEGER NOT NULL DEFAULT 0,
  status           TEXT    NOT NULL DEFAULT 'active',  -- 'active' | 'disabled'
  note             TEXT,
  created_at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_promo_bound  ON promo_codes(bound_email);
CREATE INDEX IF NOT EXISTS idx_promo_partner ON promo_codes(partner_id);

-- One promo per order (UNIQUE order_id) → replay-safe and prevents stacking.
CREATE TABLE IF NOT EXISTS promo_redemptions (
  id              TEXT PRIMARY KEY,
  code            TEXT NOT NULL,
  order_id        TEXT NOT NULL UNIQUE,
  email           TEXT,
  discount_cents  INTEGER NOT NULL DEFAULT 0,
  points_mult     REAL,
  perk_granted    TEXT,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_promoredeem_code  ON promo_redemptions(code);
CREATE INDEX IF NOT EXISTS idx_promoredeem_email ON promo_redemptions(email);

-- Orders carry the applied code so the webhook can award the multiplier + pay commission.
ALTER TABLE orders ADD COLUMN promo_code TEXT;
ALTER TABLE orders ADD COLUMN promo_points_mult REAL;

-- rev_share_events was subscription-only; let it also record à-la-carte order commissions.
ALTER TABLE rev_share_events ADD COLUMN order_id TEXT;
CREATE INDEX IF NOT EXISTS idx_revshare_order ON rev_share_events(order_id);
