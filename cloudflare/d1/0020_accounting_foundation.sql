-- Live accounting foundation for all windows and posting flows.
ALTER TABLE accounts ADD COLUMN levelNo INTEGER NOT NULL DEFAULT 1;
ALTER TABLE accounts ADD COLUMN allowPosting INTEGER NOT NULL DEFAULT 1;
ALTER TABLE accounts ADD COLUMN normalBalance TEXT NOT NULL DEFAULT 'DEBIT';
ALTER TABLE accounts ADD COLUMN controlType TEXT;
ALTER TABLE items ADD COLUMN taxCode TEXT;
ALTER TABLE items ADD COLUMN accountProfile TEXT NOT NULL DEFAULT 'STOCK_ITEM';

CREATE TABLE IF NOT EXISTS accounting_account_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  companyId INTEGER NOT NULL,
  branchId INTEGER,
  mappingKey TEXT NOT NULL,
  accountCode TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(companyId, branchId, mappingKey)
);

CREATE TABLE IF NOT EXISTS entity_account_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  companyId INTEGER NOT NULL,
  entityType TEXT NOT NULL CHECK(entityType IN ('CUSTOMER','SUPPLIER','ITEM','CASH_BOX','BANK','WAREHOUSE')),
  entityId INTEGER NOT NULL,
  roleCode TEXT NOT NULL,
  accountCode TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(companyId, entityType, entityId, roleCode)
);

CREATE TABLE IF NOT EXISTS cash_boxes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  companyId INTEGER NOT NULL,
  branchId INTEGER,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  currencyCode TEXT NOT NULL DEFAULT 'SAR',
  accountCode TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','BLOCKED','CLOSED')),
  UNIQUE(companyId, code)
);

CREATE TABLE IF NOT EXISTS banks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  companyId INTEGER NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  accountNumber TEXT,
  currencyCode TEXT NOT NULL DEFAULT 'SAR',
  accountCode TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','BLOCKED','CLOSED')),
  UNIQUE(companyId, code)
);

CREATE TABLE IF NOT EXISTS tax_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  companyId INTEGER NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  rate TEXT NOT NULL DEFAULT '0',
  purchaseAccountCode TEXT,
  salesAccountCode TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(companyId, code)
);

CREATE TABLE IF NOT EXISTS window_account_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  companyId INTEGER NOT NULL,
  windowCode TEXT NOT NULL,
  eventCode TEXT NOT NULL,
  debitMappingKey TEXT,
  creditMappingKey TEXT,
  taxMappingKey TEXT,
  inventoryMappingKey TEXT,
  cogsMappingKey TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(companyId, windowCode, eventCode)
);

UPDATE accounts SET levelNo = CASE WHEN parentCode IS NULL THEN 1 ELSE 2 END;
UPDATE accounts SET allowPosting = CASE WHEN code IN ('1000','1200','2000','3000','4000','5000','6000','7000') THEN 0 ELSE 1 END;
UPDATE accounts SET normalBalance = CASE WHEN accountType IN ('ASSET','EXPENSE') THEN 'DEBIT' ELSE 'CREDIT' END;
UPDATE accounts SET controlType = CASE code WHEN '1210' THEN 'CUSTOMER_CONTROL' WHEN '2100' THEN 'SUPPLIER_CONTROL' WHEN '1300' THEN 'INVENTORY_CONTROL' WHEN '2200' THEN 'OUTPUT_TAX' ELSE controlType END;

INSERT OR IGNORE INTO accounts(companyId, code, name, accountType, parentCode, currencyCode, active, levelNo, allowPosting, normalBalance, controlType) VALUES
  (1, '1101', 'الصندوق الرئيسي', 'ASSET', '1100', 'SAR', 1, 3, 1, 'DEBIT', 'CASH_BOX'),
  (1, '1111', 'البنك الرئيسي', 'ASSET', '1110', 'SAR', 1, 3, 1, 'DEBIT', 'BANK'),
  (1, '1130', 'دفعات العملاء المقدمة', 'LIABILITY', '2000', 'SAR', 1, 2, 1, 'CREDIT', 'CUSTOMER_ADVANCE'),
  (1, '2210', 'ضريبة القيمة المضافة - مخرجات', 'LIABILITY', '2200', 'SAR', 1, 3, 1, 'CREDIT', 'OUTPUT_TAX'),
  (1, '2220', 'ضريبة القيمة المضافة - مدخلات', 'ASSET', '1000', 'SAR', 1, 3, 1, 'DEBIT', 'INPUT_TAX'),
  (1, '4300', 'خصومات المبيعات', 'REVENUE', '4000', 'SAR', 1, 2, 1, 'DEBIT', 'SALES_DISCOUNT');

INSERT OR IGNORE INTO accounting_account_mappings(companyId, branchId, mappingKey, accountCode) VALUES
  (1, 1, 'CASH_DEFAULT', '1101'),
  (1, 1, 'BANK_DEFAULT', '1111'),
  (1, 1, 'WALLET_DEFAULT', '1120'),
  (1, 1, 'CUSTOMER_CONTROL', '1210'),
  (1, 1, 'SUPPLIER_CONTROL', '2100'),
  (1, 1, 'INVENTORY_CONTROL', '1300'),
  (1, 1, 'SALES_REVENUE', '4100'),
  (1, 1, 'SALES_RETURN', '4200'),
  (1, 1, 'SALES_DISCOUNT', '4300'),
  (1, 1, 'COGS', '5100'),
  (1, 1, 'OUTPUT_TAX', '2210'),
  (1, 1, 'INPUT_TAX', '2220'),
  (1, 1, 'RETAINED_EARNINGS', '3200');

INSERT OR IGNORE INTO entity_account_links(companyId, entityType, entityId, roleCode, accountCode)
  SELECT companyId, 'CUSTOMER', id, 'RECEIVABLE', '1210' FROM customers;
INSERT OR IGNORE INTO entity_account_links(companyId, entityType, entityId, roleCode, accountCode)
  SELECT companyId, 'SUPPLIER', id, 'PAYABLE', '2100' FROM suppliers;
INSERT OR IGNORE INTO cash_boxes(companyId, branchId, code, name, currencyCode, accountCode)
  VALUES (1, 1, 'CASH-001', 'الصندوق الرئيسي', 'SAR', '1101');
INSERT OR IGNORE INTO banks(companyId, code, name, currencyCode, accountCode)
  VALUES (1, 'BANK-001', 'البنك الرئيسي', 'SAR', '1111');
INSERT OR IGNORE INTO tax_codes(companyId, code, name, rate, purchaseAccountCode, salesAccountCode)
  VALUES (1, 'ZERO', 'ضريبة صفرية', '0', '2220', '2210'), (1, 'VAT15', 'ضريبة القيمة المضافة 15%', '15', '2220', '2210');

INSERT OR IGNORE INTO window_account_profiles(companyId, windowCode, eventCode, debitMappingKey, creditMappingKey, taxMappingKey, inventoryMappingKey, cogsMappingKey) VALUES
  (1, 'ARST004', 'POST', 'CUSTOMER_CONTROL', 'SALES_REVENUE', 'OUTPUT_TAX', 'INVENTORY_CONTROL', 'COGS'),
  (1, 'ARST007', 'POST', 'SALES_RETURN', 'CUSTOMER_CONTROL', 'OUTPUT_TAX', 'INVENTORY_CONTROL', 'COGS'),
  (1, 'APST003', 'POST', 'INVENTORY_CONTROL', 'SUPPLIER_CONTROL', 'INPUT_TAX', NULL, NULL),
  (1, 'APST007', 'POST', 'SUPPLIER_CONTROL', 'INVENTORY_CONTROL', 'INPUT_TAX', NULL, NULL),
  (1, 'GLST002', 'POST', NULL, NULL, NULL, NULL, NULL),
  (1, 'POST001', 'POST', 'CASH_DEFAULT', 'SALES_REVENUE', 'OUTPUT_TAX', 'INVENTORY_CONTROL', 'COGS');
