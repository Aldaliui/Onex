CREATE TABLE IF NOT EXISTS currencies (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  decimalScale INTEGER NOT NULL DEFAULT 2,
  active INTEGER NOT NULL DEFAULT 1
);

INSERT OR IGNORE INTO currencies(code, name, decimalScale, active) VALUES
  ('SAR', 'Saudi Riyal', 2, 1),
  ('USD', 'US Dollar', 2, 1),
  ('EUR', 'Euro', 2, 1),
  ('CNY', 'Chinese Yuan', 2, 1),
  ('YER', 'Yemeni Rial', 2, 1);

ALTER TABLE invoices ADD COLUMN exchangeRate TEXT NOT NULL DEFAULT '1';
ALTER TABLE invoices ADD COLUMN notes TEXT;
ALTER TABLE invoices ADD COLUMN updatedAt TEXT;
ALTER TABLE items ADD COLUMN salePrice TEXT NOT NULL DEFAULT '0';

CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  companyId INTEGER NOT NULL,
  code TEXT NOT NULL,
  legalName TEXT NOT NULL,
  currencyCode TEXT NOT NULL DEFAULT 'SAR',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  UNIQUE(companyId, code)
);

CREATE TABLE IF NOT EXISTS purchase_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  docNo TEXT NOT NULL UNIQUE,
  supplierId INTEGER NOT NULL,
  warehouseId INTEGER NOT NULL,
  currencyCode TEXT NOT NULL DEFAULT 'SAR',
  exchangeRate TEXT NOT NULL DEFAULT '1',
  subtotal TEXT NOT NULL DEFAULT '0',
  taxTotal TEXT NOT NULL DEFAULT '0',
  grandTotal TEXT NOT NULL DEFAULT '0',
  status TEXT NOT NULL DEFAULT 'DRAFT',
  idempotencyKey TEXT NOT NULL UNIQUE,
  notes TEXT,
  createdBy TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  postedAt TEXT
);

CREATE TABLE IF NOT EXISTS purchase_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchaseInvoiceId INTEGER NOT NULL,
  itemId INTEGER NOT NULL,
  quantity TEXT NOT NULL,
  unitPrice TEXT NOT NULL,
  taxAmount TEXT NOT NULL DEFAULT '0',
  lineTotal TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payment_vouchers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voucherNo TEXT NOT NULL UNIQUE,
  direction TEXT NOT NULL,
  partyType TEXT NOT NULL,
  partyId INTEGER,
  currencyCode TEXT NOT NULL DEFAULT 'SAR',
  exchangeRate TEXT NOT NULL DEFAULT '1',
  amount TEXT NOT NULL,
  localAmount TEXT NOT NULL,
  accountCode TEXT,
  reference TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  createdBy TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS invoice_currency_idx ON invoices(currencyCode);
CREATE INDEX IF NOT EXISTS purchase_currency_idx ON purchase_invoices(currencyCode);
CREATE INDEX IF NOT EXISTS voucher_direction_idx ON payment_vouchers(direction);

INSERT OR IGNORE INTO suppliers(id, companyId, code, legalName, currencyCode, status)
VALUES (1, 1, 'SUP-001', 'مورد تجريبي', 'SAR', 'ACTIVE');
