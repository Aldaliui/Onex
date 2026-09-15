ALTER TABLE items ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE items ADD COLUMN stockFlag INTEGER NOT NULL DEFAULT 1;
ALTER TABLE items ADD COLUMN unitCost TEXT NOT NULL DEFAULT '0';
ALTER TABLE items ADD COLUMN revenueAccount TEXT NOT NULL DEFAULT '4100';
ALTER TABLE items ADD COLUMN inventoryAccount TEXT NOT NULL DEFAULT '1300';
ALTER TABLE items ADD COLUMN cogsAccount TEXT NOT NULL DEFAULT '5100';

UPDATE items SET description = name WHERE description = '';

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  companyId INTEGER NOT NULL,
  code TEXT NOT NULL,
  legalName TEXT NOT NULL,
  currencyCode TEXT NOT NULL DEFAULT 'SAR',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  UNIQUE(companyId, code)
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  docNo TEXT NOT NULL UNIQUE,
  customerId INTEGER NOT NULL,
  warehouseId INTEGER NOT NULL,
  currencyCode TEXT NOT NULL DEFAULT 'SAR',
  subtotal TEXT NOT NULL DEFAULT '0',
  taxTotal TEXT NOT NULL DEFAULT '0',
  grandTotal TEXT NOT NULL DEFAULT '0',
  status TEXT NOT NULL DEFAULT 'DRAFT',
  idempotencyKey TEXT NOT NULL UNIQUE,
  sourceForm TEXT NOT NULL DEFAULT 'ARST004',
  createdBy TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  postedAt TEXT
);

CREATE TABLE IF NOT EXISTS invoice_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoiceId INTEGER NOT NULL,
  itemId INTEGER NOT NULL,
  quantity TEXT NOT NULL,
  unitPrice TEXT NOT NULL,
  taxAmount TEXT NOT NULL DEFAULT '0',
  lineTotal TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  itemId INTEGER NOT NULL,
  warehouseId INTEGER NOT NULL,
  sourceInvoiceId INTEGER,
  movementType TEXT NOT NULL,
  quantityIn TEXT NOT NULL DEFAULT '0',
  quantityOut TEXT NOT NULL DEFAULT '0',
  unitCost TEXT NOT NULL DEFAULT '0',
  totalCost TEXT NOT NULL DEFAULT '0',
  balanceAfter TEXT NOT NULL DEFAULT '0',
  createdBy TEXT NOT NULL DEFAULT 'cloudflare-worker',
  reference TEXT,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  actionCode TEXT NOT NULL,
  entityType TEXT NOT NULL,
  entityId TEXT NOT NULL,
  requestId TEXT,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS invoice_status_idx ON invoices(status);
CREATE INDEX IF NOT EXISTS invoice_customer_idx ON invoices(customerId);
CREATE INDEX IF NOT EXISTS stock_movement_item_idx ON stock_movements(itemId, warehouseId);

INSERT OR IGNORE INTO customers(id, companyId, code, legalName, currencyCode, status)
VALUES (1, 1, 'CUST-001', 'عميل تجريبي', 'SAR', 'ACTIVE');

INSERT OR IGNORE INTO items(id, companyId, code, name, description, itemType, unitCode, stockFlag, unitCost, revenueAccount, inventoryAccount, cogsAccount, active)
VALUES (1, 1, 'ITEM-001', 'صنف تجريبي', 'صنف تجريبي', 'STOCK', 'EA', 1, '100', '4100', '1300', '5100', 1);
