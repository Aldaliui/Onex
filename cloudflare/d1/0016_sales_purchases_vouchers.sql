-- ONEX D1 production migration 0016
-- Receipts and payments with invoice allocation for AR/AP settlement.
CREATE TABLE IF NOT EXISTS receipt_vouchers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voucherNo TEXT NOT NULL UNIQUE,
  companyId INTEGER NOT NULL,
  customerId INTEGER NOT NULL,
  cashAccountCode TEXT NOT NULL,
  currencyCode TEXT NOT NULL DEFAULT 'SAR',
  amount TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','POSTED','REVERSED')),
  idempotencyKey TEXT NOT NULL UNIQUE,
  reference TEXT,
  actor TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  postedAt TEXT
);
CREATE TABLE IF NOT EXISTS receipt_allocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receiptId INTEGER NOT NULL,
  invoiceId INTEGER NOT NULL,
  amount TEXT NOT NULL,
  UNIQUE(receiptId, invoiceId)
);
CREATE INDEX IF NOT EXISTS receipt_allocations_invoice_idx ON receipt_allocations(invoiceId);

CREATE TABLE IF NOT EXISTS payment_vouchers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voucherNo TEXT NOT NULL UNIQUE,
  companyId INTEGER NOT NULL,
  supplierId INTEGER NOT NULL,
  cashAccountCode TEXT NOT NULL,
  currencyCode TEXT NOT NULL DEFAULT 'SAR',
  amount TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','POSTED','REVERSED')),
  idempotencyKey TEXT NOT NULL UNIQUE,
  reference TEXT,
  actor TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  postedAt TEXT
);
CREATE TABLE IF NOT EXISTS payment_allocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  paymentId INTEGER NOT NULL,
  invoiceId INTEGER NOT NULL,
  amount TEXT NOT NULL,
  UNIQUE(paymentId, invoiceId)
);
CREATE INDEX IF NOT EXISTS payment_allocations_invoice_idx ON payment_allocations(invoiceId);

INSERT OR IGNORE INTO _onex_migration_log(name) VALUES ('0016_sales_purchases_vouchers');
