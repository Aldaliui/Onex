-- ONEX D1 migration 0013
-- Repair and complete the advanced inventory schema that was recorded as applied
-- but is missing from the production database.
ALTER TABLE stock_movements ADD COLUMN inventoryDocumentId INTEGER;
ALTER TABLE stock_movements ADD COLUMN reference TEXT;
ALTER TABLE stock_balances ADD COLUMN reservedQuantity TEXT NOT NULL DEFAULT '0';

CREATE TABLE IF NOT EXISTS item_units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  itemId INTEGER NOT NULL,
  unitCode TEXT NOT NULL,
  unitName TEXT NOT NULL,
  conversionToBase TEXT NOT NULL DEFAULT '1',
  isBase INTEGER NOT NULL DEFAULT 0 CHECK (isBase IN (0,1)),
  barcode TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  UNIQUE(itemId, unitCode)
);
CREATE TABLE IF NOT EXISTS warehouse_locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  warehouseId INTEGER NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  UNIQUE(warehouseId, code)
);
CREATE TABLE IF NOT EXISTS inventory_settings (
  id INTEGER PRIMARY KEY CHECK (id=1),
  useBatchNo INTEGER NOT NULL DEFAULT 0 CHECK (useBatchNo IN (0,1)),
  useExpireDate INTEGER NOT NULL DEFAULT 0 CHECK (useExpireDate IN (0,1)),
  useSerialNo INTEGER NOT NULL DEFAULT 0 CHECK (useSerialNo IN (0,1)),
  costingType TEXT NOT NULL DEFAULT 'MOVING_AVERAGE' CHECK (costingType IN ('MOVING_AVERAGE','FIFO','STANDARD')),
  allowNegativeStock INTEGER NOT NULL DEFAULT 0 CHECK (allowNegativeStock IN (0,1)),
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO inventory_settings(id) VALUES (1);
CREATE TABLE IF NOT EXISTS inventory_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  companyId INTEGER NOT NULL,
  docNo TEXT NOT NULL,
  docType TEXT NOT NULL CHECK (docType IN ('RECEIPT','ISSUE','TRANSFER')),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','POSTED','REVERSED')),
  fromWarehouseId INTEGER,
  toWarehouseId INTEGER,
  idempotencyKey TEXT NOT NULL UNIQUE,
  referenceNo TEXT,
  description TEXT,
  createdBy TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  postedBy TEXT,
  postedAt TEXT,
  journalNo TEXT,
  UNIQUE(companyId, docNo)
);
CREATE TABLE IF NOT EXISTS inventory_document_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  documentId INTEGER NOT NULL,
  lineNo INTEGER NOT NULL,
  itemId INTEGER NOT NULL,
  quantity TEXT NOT NULL,
  unitCost TEXT NOT NULL DEFAULT '0',
  unitCode TEXT NOT NULL DEFAULT 'EA',
  batchNo TEXT,
  expireDate TEXT,
  serialNo TEXT,
  locationId INTEGER,
  appliedUnitCost TEXT NOT NULL DEFAULT '0',
  appliedTotalCost TEXT NOT NULL DEFAULT '0',
  UNIQUE(documentId, lineNo)
);
CREATE TABLE IF NOT EXISTS stock_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  itemId INTEGER NOT NULL,
  warehouseId INTEGER NOT NULL,
  batchNo TEXT NOT NULL,
  expireDate TEXT,
  quantity TEXT NOT NULL DEFAULT '0',
  unitCost TEXT NOT NULL DEFAULT '0',
  UNIQUE(itemId, warehouseId, batchNo)
);
CREATE TABLE IF NOT EXISTS stock_serials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  itemId INTEGER NOT NULL,
  warehouseId INTEGER NOT NULL,
  serialNo TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE','ISSUED','TRANSFERRED','BLOCKED')),
  sourceDocumentId INTEGER,
  UNIQUE(itemId, serialNo)
);
CREATE TABLE IF NOT EXISTS inventory_account_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  companyId INTEGER NOT NULL,
  docType TEXT NOT NULL CHECK (docType IN ('RECEIPT','ISSUE','TRANSFER')),
  debitAccountCode TEXT NOT NULL,
  creditAccountCode TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  UNIQUE(companyId, docType)
);
INSERT OR IGNORE INTO accounts(companyId, code, name, accountType, currencyCode, active)
VALUES (1, '2100', 'Goods Received Not Invoiced', 'LIABILITY', 'SAR', 1);
INSERT OR IGNORE INTO inventory_account_mappings(companyId, docType, debitAccountCode, creditAccountCode)
VALUES (1, 'RECEIPT', '1300', '2100'), (1, 'ISSUE', '5100', '1300'), (1, 'TRANSFER', '1300', '1300');
CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_inventory_doc_idx ON journal_entries(sourceInventoryDocumentId) WHERE sourceInventoryDocumentId IS NOT NULL;
CREATE INDEX IF NOT EXISTS inventory_documents_journal_idx ON inventory_documents(journalNo);
CREATE INDEX IF NOT EXISTS inventory_document_lines_doc_idx ON inventory_document_lines(documentId, lineNo);
CREATE INDEX IF NOT EXISTS stock_movements_inventory_doc_idx ON stock_movements(inventoryDocumentId);
CREATE INDEX IF NOT EXISTS stock_balances_item_warehouse_idx ON stock_balances(itemId, warehouseId);
INSERT OR IGNORE INTO _onex_migration_log(name) VALUES ('0013_inventory_advanced_repair');
