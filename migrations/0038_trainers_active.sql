-- Owner can "remove" (deactivate) a trainer partner without losing their clients or commission
-- history. active=0 hides them from the live roster and blocks sign-in; the owner can restore them.
-- Additive + backward-compatible: existing code ignores the column (defaults to active).
ALTER TABLE trainers ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
