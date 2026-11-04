-- Finished stock is a balance. Counts are baselines; paid sales are once-only movements.
ALTER TABLE menu_items ADD COLUMN stock_count_basis TEXT NOT NULL DEFAULT 'physical' CHECK(stock_count_basis IN ('physical','unreserved'));
ALTER TABLE orders ADD COLUMN inventory_paid_at INTEGER;
ALTER TABLE orders ADD COLUMN inventory_paid_basis TEXT;
CREATE TABLE inventory_sale_jobs (
 source_type TEXT NOT NULL CHECK(source_type IN ('order','quote')), source_id TEXT NOT NULL,
 snapshot_json TEXT NOT NULL, effective_at INTEGER, time_basis TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','done','review','error')),
 attempts INTEGER NOT NULL DEFAULT 0, error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 PRIMARY KEY(source_type,source_id)
);
CREATE TABLE inventory_sale_deductions (
 id TEXT PRIMARY KEY, source_type TEXT NOT NULL, source_id TEXT NOT NULL, sale_item_id TEXT NOT NULL,
 snapshot_hash TEXT NOT NULL, stock_item_id TEXT NOT NULL, unit_factor INTEGER NOT NULL CHECK(unit_factor>0),
 sale_qty INTEGER NOT NULL CHECK(sale_qty>0), requested_qty INTEGER NOT NULL CHECK(requested_qty>0),
 deducted_qty INTEGER NOT NULL CHECK(deducted_qty>=0), shortage_qty INTEGER NOT NULL CHECK(shortage_qty>=0),
 state TEXT NOT NULL CHECK(state IN ('applied','covered_by_recount','uncounted')),
 effective_at INTEGER NOT NULL, time_basis TEXT NOT NULL, counted_at INTEGER, before_count INTEGER, after_count INTEGER,
 before_revision INTEGER NOT NULL, after_revision INTEGER NOT NULL, actor_id TEXT, created_at INTEGER NOT NULL,
 UNIQUE(source_type,source_id,sale_item_id,snapshot_hash)
);
CREATE INDEX inventory_sale_deductions_source ON inventory_sale_deductions(source_type,source_id,sale_item_id);
CREATE INDEX inventory_sale_deductions_stock ON inventory_sale_deductions(stock_item_id,created_at);
CREATE TABLE inventory_sale_exceptions (
 source_type TEXT NOT NULL, source_id TEXT NOT NULL, line_key TEXT NOT NULL, snapshot_hash TEXT NOT NULL,
 reason TEXT NOT NULL, details_json TEXT NOT NULL, created_at INTEGER NOT NULL, resolved_at INTEGER,
 PRIMARY KEY(source_type,source_id,line_key,snapshot_hash)
);
-- Only future business transitions enqueue jobs. Existing orders are never blindly replayed.
CREATE TRIGGER inventory_sale_order_insert AFTER INSERT ON orders
WHEN NEW.status IN ('paid','prep','ready','fulfilled') BEGIN
 INSERT OR IGNORE INTO inventory_sale_jobs(source_type,source_id,snapshot_json,effective_at,time_basis,created_at,updated_at)
 VALUES('order',NEW.id,NEW.items,COALESCE(NEW.inventory_paid_at,NEW.created_at),COALESCE(NEW.inventory_paid_basis,'order_created_lower_bound'),NEW.created_at,NEW.updated_at);
END;
CREATE TRIGGER inventory_sale_order_update AFTER UPDATE OF status,items ON orders
WHEN NEW.status IN ('paid','prep','ready','fulfilled') AND (OLD.status NOT IN ('paid','prep','ready','fulfilled') OR NEW.items IS NOT OLD.items) BEGIN
 INSERT INTO inventory_sale_jobs(source_type,source_id,snapshot_json,effective_at,time_basis,created_at,updated_at)
 VALUES('order',NEW.id,NEW.items,CASE WHEN NEW.items IS NOT OLD.items THEN NEW.updated_at ELSE COALESCE(NEW.inventory_paid_at,NEW.created_at) END,CASE WHEN NEW.items IS NOT OLD.items THEN 'paid_items_update' ELSE COALESCE(NEW.inventory_paid_basis,'order_created_lower_bound') END,NEW.updated_at,NEW.updated_at)
 ON CONFLICT(source_type,source_id) DO UPDATE SET snapshot_json=excluded.snapshot_json,effective_at=excluded.effective_at,time_basis=excluded.time_basis,state='pending',error=NULL,updated_at=excluded.updated_at;
END;
CREATE TRIGGER inventory_sale_quote_paid AFTER UPDATE OF deposit_status,balance_status,quote_json ON catering_quotes
WHEN NEW.deposit_status='paid' AND (NEW.balance_status='paid' OR COALESCE(NEW.balance_cents,0)=0)
 AND (OLD.deposit_status!='paid' OR OLD.balance_status IS NOT NEW.balance_status OR NEW.quote_json IS NOT OLD.quote_json) BEGIN
 INSERT INTO inventory_sale_jobs(source_type,source_id,snapshot_json,effective_at,time_basis,created_at,updated_at)
 VALUES('quote',NEW.id,COALESCE(NEW.quote_json,'{}'),COALESCE(NEW.balance_paid_at,NEW.deposit_paid_at,NEW.updated_at),'quote_paid',NEW.updated_at,NEW.updated_at)
 ON CONFLICT(source_type,source_id) DO UPDATE SET snapshot_json=excluded.snapshot_json,effective_at=excluded.effective_at,time_basis=excluded.time_basis,state='pending',error=NULL,updated_at=excluded.updated_at;
END;

CREATE TRIGGER inventory_sale_quote_insert AFTER INSERT ON catering_quotes
WHEN NEW.deposit_status='paid' AND (NEW.balance_status='paid' OR COALESCE(NEW.balance_cents,0)=0) BEGIN
 INSERT OR IGNORE INTO inventory_sale_jobs(source_type,source_id,snapshot_json,effective_at,time_basis,created_at,updated_at)
 VALUES('quote',NEW.id,COALESCE(NEW.quote_json,'{}'),COALESCE(NEW.balance_paid_at,NEW.deposit_paid_at,NEW.created_at),'quote_paid',NEW.created_at,NEW.updated_at);
END;
