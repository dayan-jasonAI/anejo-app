-- Inventory counterparties are not staff identities and cannot sign in.
CREATE TABLE inventory_suppliers (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1))
);
INSERT INTO inventory_suppliers(id,name) VALUES ('supplier_bjs','BJ''s Wholesale Club'),('supplier_restaurant_depot','Restaurant Depot');
ALTER TABLE inventory_items ADD COLUMN supplier_id TEXT REFERENCES inventory_suppliers(id);
-- Exact historical paid costs, distinct from today's physically counted stock.
CREATE TABLE inventory_purchase_costs (
 id TEXT PRIMARY KEY, supplier_id TEXT NOT NULL REFERENCES inventory_suppliers(id),
 purchased_on TEXT NOT NULL, receipt_reference TEXT NOT NULL, line_ordinal INTEGER NOT NULL,
 item_name TEXT NOT NULL, purchased_packs REAL NOT NULL, pack_quantity REAL, pack_unit TEXT,
 paid_line_cents INTEGER NOT NULL, source_path TEXT NOT NULL, source_type TEXT NOT NULL CHECK(source_type='paid_receipt'),
 UNIQUE(supplier_id,purchased_on,receipt_reference,line_ordinal)
);
