-- ONEX D1 production migration 0017
-- Inventory units, locations, batches, serials, settings, and atomic transfers.
CREATE TABLE IF NOT EXISTS item_units (id INTEGER PRIMARY KEY AUTOINCREMENT, itemId INTEGER NOT NULL, unitCode TEXT NOT NULL, unitName TEXT NOT NULL, conversionToBase TEXT NOT NULL DEFAULT '1', isBase INTEGER NOT NULL DEFAULT 0, barcode TEXT, active INTEGER NOT NULL DEFAULT 1, UNIQUE(itemId, unitCode));
CREATE TABLE IF NOT EXISTS warehouse_locations (id INTEGER PRIMARY KEY AUTOINCREMENT, warehouseId INTEGER NOT NULL, code TEXT NOT NULL, name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, UNIQUE(warehouseId, code));
CREATE TABLE IF NOT EXISTS inventory_settings (id INTEGER PRIMARY KEY AUTOINCREMENT, companyId INTEGER NOT NULL UNIQUE, costingType TEXT NOT NULL DEFAULT 'MOVING_AVERAGE', allowNegativeStock INTEGER NOT NULL DEFAULT 0, useBatchNo INTEGER NOT NULL DEFAULT 0, useExpireDate INTEGER NOT NULL DEFAULT 0, useSerialNo INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS inventory_batches (id INTEGER PRIMARY KEY AUTOINCREMENT, itemId INTEGER NOT NULL, warehouseId INTEGER NOT NULL, batchNo TEXT NOT NULL, expireDate TEXT, quantity TEXT NOT NULL DEFAULT '0', unitCost TEXT NOT NULL DEFAULT '0', UNIQUE(itemId, warehouseId, batchNo));
CREATE TABLE IF NOT EXISTS inventory_serials (id INTEGER PRIMARY KEY AUTOINCREMENT, itemId INTEGER NOT NULL, warehouseId INTEGER NOT NULL, serialNo TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK(status IN ('AVAILABLE','SOLD','DAMAGED','TRANSFERRED')), UNIQUE(itemId, serialNo));
CREATE TABLE IF NOT EXISTS inventory_transfers (id INTEGER PRIMARY KEY AUTOINCREMENT, transferNo TEXT NOT NULL UNIQUE, sourceWarehouseId INTEGER NOT NULL, destinationWarehouseId INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','POSTED','CANCELLED')), actor TEXT NOT NULL, idempotencyKey TEXT NOT NULL UNIQUE, createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, postedAt TEXT);
CREATE TABLE IF NOT EXISTS inventory_transfer_lines (id INTEGER PRIMARY KEY AUTOINCREMENT, transferId INTEGER NOT NULL, itemId INTEGER NOT NULL, quantity TEXT NOT NULL, unitCost TEXT NOT NULL DEFAULT '0');
CREATE INDEX IF NOT EXISTS inventory_transfer_line_idx ON inventory_transfer_lines(transferId);
CREATE INDEX IF NOT EXISTS inventory_batch_stock_idx ON inventory_batches(itemId, warehouseId);
INSERT OR IGNORE INTO inventory_settings(companyId) VALUES (1);
INSERT OR IGNORE INTO _onex_migration_log(name) VALUES ('0017_inventory_engine');
