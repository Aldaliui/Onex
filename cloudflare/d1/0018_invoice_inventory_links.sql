-- ONEX D1 production migration 0018
-- Invoice-line inventory traceability: units, batches, serials, and storage locations.
ALTER TABLE invoice_lines ADD COLUMN unitCode TEXT NOT NULL DEFAULT 'EA';
ALTER TABLE invoice_lines ADD COLUMN batchNo TEXT;
ALTER TABLE invoice_lines ADD COLUMN expireDate TEXT;
ALTER TABLE invoice_lines ADD COLUMN locationId INTEGER;
ALTER TABLE invoice_lines ADD COLUMN serialsJson TEXT;
CREATE TABLE IF NOT EXISTS stock_location_balances (id INTEGER PRIMARY KEY AUTOINCREMENT, itemId INTEGER NOT NULL, warehouseId INTEGER NOT NULL, locationId INTEGER NOT NULL, quantity TEXT NOT NULL DEFAULT '0', totalCost TEXT NOT NULL DEFAULT '0', unitCost TEXT NOT NULL DEFAULT '0', versionNo INTEGER NOT NULL DEFAULT 1, UNIQUE(itemId, warehouseId, locationId));
ALTER TABLE inventory_batches ADD COLUMN locationId INTEGER;
CREATE INDEX IF NOT EXISTS invoice_lines_batch_idx ON invoice_lines(itemId, batchNo);
CREATE INDEX IF NOT EXISTS invoice_lines_location_idx ON invoice_lines(locationId);
CREATE INDEX IF NOT EXISTS stock_location_balance_idx ON stock_location_balances(itemId, warehouseId, locationId);
INSERT OR IGNORE INTO _onex_migration_log(name) VALUES ('0018_invoice_inventory_links');
