-- ONEX D1 migration 0020
-- Live chart-of-accounts defaults, subledger links, cash boxes and multi-currency controls.
ALTER TABLE customers ADD COLUMN accountId INTEGER;
ALTER TABLE suppliers ADD COLUMN accountId INTEGER;
ALTER TABLE items ADD COLUMN currencyCode TEXT NOT NULL DEFAULT 'SAR';

CREATE TABLE IF NOT EXISTS cash_boxes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  companyId INTEGER NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  accountId INTEGER,
  currencyCode TEXT NOT NULL DEFAULT 'SAR',
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  UNIQUE(companyId, code)
);
CREATE TABLE IF NOT EXISTS banks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  companyId INTEGER NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  accountId INTEGER,
  accountNumber TEXT,
  currencyCode TEXT NOT NULL DEFAULT 'SAR',
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  UNIQUE(companyId, code)
);
CREATE TABLE IF NOT EXISTS accounting_defaults (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  companyId INTEGER NOT NULL UNIQUE,
  baseCurrency TEXT NOT NULL DEFAULT 'SAR',
  customerControlCode TEXT NOT NULL DEFAULT '1210',
  supplierControlCode TEXT NOT NULL DEFAULT '2100',
  cashControlCode TEXT NOT NULL DEFAULT '1100',
  bankControlCode TEXT NOT NULL DEFAULT '1110',
  walletControlCode TEXT NOT NULL DEFAULT '1120',
  inventoryControlCode TEXT NOT NULL DEFAULT '1300',
  salesRevenueCode TEXT NOT NULL DEFAULT '4100',
  salesReturnCode TEXT NOT NULL DEFAULT '4200',
  cogsCode TEXT NOT NULL DEFAULT '5100',
  taxPayableCode TEXT NOT NULL DEFAULT '2200',
  fxGainCode TEXT NOT NULL DEFAULT '7100',
  fxLossCode TEXT NOT NULL DEFAULT '7200',
  updatedBy TEXT NOT NULL DEFAULT 'system',
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO accounting_defaults(id, companyId) VALUES(1, 1);
INSERT OR IGNORE INTO accounts(companyId, code, name, accountType, parentCode, currencyCode, active) VALUES
  (1, '1100-0001', 'الصندوق الرئيسي', 'ASSET', '1100', 'SAR', 1),
  (1, '1110-0001', 'البنك الرئيسي', 'ASSET', '1110', 'SAR', 1),
  (1, '1120-0001', 'المحفظة الإلكترونية الرئيسية', 'ASSET', '1120', 'SAR', 1),
  (1, '2200-0001', 'ضريبة المبيعات المستحقة', 'LIABILITY', '2200', 'SAR', 1);

INSERT OR IGNORE INTO accounts(companyId, code, name, accountType, parentCode, currencyCode, active)
SELECT companyId, '1210-' || printf('%04d', id), legalName, 'ASSET', '1210', currencyCode, 1
FROM customers;
INSERT OR IGNORE INTO accounts(companyId, code, name, accountType, parentCode, currencyCode, active)
SELECT companyId, '2100-' || printf('%04d', id), legalName, 'LIABILITY', '2100', currencyCode, 1
FROM suppliers;
UPDATE customers SET accountId = (SELECT id FROM accounts WHERE accounts.companyId = customers.companyId AND accounts.code = '1210-' || printf('%04d', customers.id)) WHERE accountId IS NULL;
UPDATE suppliers SET accountId = (SELECT id FROM accounts WHERE accounts.companyId = suppliers.companyId AND accounts.code = '2100-' || printf('%04d', suppliers.id)) WHERE accountId IS NULL;
UPDATE items SET currencyCode = COALESCE(NULLIF(currencyCode, ''), 'SAR'), revenueAccount = COALESCE(NULLIF(revenueAccount, ''), '4100'), inventoryAccount = COALESCE(NULLIF(inventoryAccount, ''), '1300'), cogsAccount = COALESCE(NULLIF(cogsAccount, ''), '5100');

INSERT OR IGNORE INTO cash_boxes(companyId, code, name, accountId, currencyCode, active)
SELECT 1, 'MAIN-CASH', 'الصندوق الرئيسي', id, 'SAR', 1 FROM accounts WHERE companyId = 1 AND code = '1100-0001';
INSERT OR IGNORE INTO banks(companyId, code, name, accountId, currencyCode, active)
SELECT 1, 'MAIN-BANK', 'البنك الرئيسي', id, 'SAR', 1 FROM accounts WHERE companyId = 1 AND code = '1110-0001';
UPDATE cash_boxes SET accountId = (SELECT id FROM accounts WHERE accounts.code = '1100-0001') WHERE accountId IS NULL;
UPDATE banks SET accountId = (SELECT id FROM accounts WHERE accounts.code = '1110-0001') WHERE accountId IS NULL;

CREATE INDEX IF NOT EXISTS customers_account_idx ON customers(accountId);
CREATE INDEX IF NOT EXISTS suppliers_account_idx ON suppliers(accountId);
CREATE INDEX IF NOT EXISTS cash_boxes_account_idx ON cash_boxes(accountId);
CREATE INDEX IF NOT EXISTS banks_account_idx ON banks(accountId);
INSERT OR IGNORE INTO _onex_migration_log(name) VALUES ('0020_accounting_links_multicurrency');
