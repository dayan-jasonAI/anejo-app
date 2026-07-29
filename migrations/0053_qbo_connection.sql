-- QuickBooks Online connection: ONE row, holding the OAuth tokens for one company file.
--
-- `contract_accounts.qbo_customer_id` and `contract_invoices.qbo_invoice_id` have existed since
-- the contract schema was written; this is the piece that was missing, so the mapping columns had
-- nothing to fill them.
--
-- WHY A SINGLE ROW: Añejo is one company file. A per-user token table would invite a second
-- connection whose tokens silently disagree with the first, and Intuit's refresh-token ROTATION
-- makes that actively dangerous — refreshing on one row invalidates the other, and invoicing
-- starts failing for reasons nobody can see. `id` is pinned to 'qbo' by a CHECK so a second
-- connection cannot be created by accident.
--
-- These are live credentials in D1. That is the same place Square's customer/card ids already
-- live, and the table is only ever read by owner-gated code — but it is the reason `disconnect`
-- deletes the row outright rather than flagging it inactive.
CREATE TABLE IF NOT EXISTS qbo_connection (
  id                 TEXT PRIMARY KEY CHECK (id = 'qbo'),
  realm_id           TEXT NOT NULL,          -- the QuickBooks company id
  access_token       TEXT NOT NULL,          -- ~1 hour
  refresh_token      TEXT NOT NULL,          -- ~100 days, and ROTATED on most refreshes
  expires_at         INTEGER NOT NULL,       -- epoch ms, access token
  refresh_expires_at INTEGER,                -- epoch ms, refresh token
  environment        TEXT NOT NULL DEFAULT 'production',  -- production | sandbox
  connected_by       TEXT,
  connected_at       INTEGER NOT NULL,
  refreshed_at       INTEGER,
  -- Why the last call failed, kept so the HUB can say "reconnect" instead of "something broke".
  last_error         TEXT,
  updated_at         INTEGER NOT NULL
);
