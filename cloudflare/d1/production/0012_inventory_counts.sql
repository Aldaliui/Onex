-- ONEX D1 production migration 0012
-- Periodic and cycle inventory counting with GL variance posting.
CREATE TABLE IF NOT EXISTS inventory_counts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  countNo TEXT NOT NULL UNIQUE,
  warehouseId INTEGER NOT NULL,
  countMode TEXT NOT NULL DEFAULT 'PERIODIC' CHECK (countMode IN ('PERIODIC','CYCLE')),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','POSTED','CANCELLED')),
  countedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  postedAt TEXT,
  actor TEXT NOT NULL DEFAULT 'workbench.user',
  notes TEXT
);
CREATE TABLE IF NOT EXISTS inventory_count_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  countId INTEGER NOT NULL,
  itemId INTEGER NOT NULL,
  systemQuantity TEXT NOT NULL DEFAULT '0',
  countedQuantity TEXT NOT NULL DEFAULT '0',
  unitCost TEXT NOT NULL DEFAULT '0',
  varianceQuantity TEXT NOT NULL DEFAULT '0',
  varianceValue TEXT NOT NULL DEFAULT '0',
  UNIQUE(countId, itemId)
);
CREATE INDEX IF NOT EXISTS inventory_counts_warehouse_idx ON inventory_counts(warehouseId);
CREATE INDEX IF NOT EXISTS inventory_count_lines_count_idx ON inventory_count_lines(countId);
INSERT OR IGNORE INTO accounts(companyId, code, name, accountType, currencyCode, active)
VALUES (1, '4300', 'Inventory Count Gains', 'REVENUE', 'SAR', 1);
INSERT OR IGNORE INTO accounts(companyId, code, name, accountType, currencyCode, active)
VALUES (1, '5300', 'Inventory Count Losses', 'EXPENSE', 'SAR', 1);
INSERT OR IGNORE INTO _onex_migration_log(name) VALUES ('0012_inventory_counts');
