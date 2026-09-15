INSERT OR IGNORE INTO customers(id, companyId, code, legalName, currencyCode, status)
VALUES (1, 1, 'CUST-001', 'العميل الأساسي', 'YER', 'ACTIVE');
UPDATE customers SET legalName = 'العميل الأساسي', currencyCode = 'YER', status = 'ACTIVE' WHERE companyId = 1 AND code = 'CUST-001';

INSERT OR IGNORE INTO items(id, companyId, code, name, description, itemType, unitCode, stockFlag, unitCost, salePrice, revenueAccount, inventoryAccount, cogsAccount, active)
VALUES (1, 1, 'ITEM-001', 'الصنف الأساسي', 'الصنف الأساسي للنظام', 'STOCK', 'EA', 1, '100', '150', '4100', '1300', '5100', 1);
UPDATE items SET name = 'الصنف الأساسي', description = 'الصنف الأساسي للنظام', unitCost = '100', salePrice = '150', active = 1 WHERE companyId = 1 AND code = 'ITEM-001';

INSERT OR IGNORE INTO suppliers(id, companyId, code, legalName, currencyCode, status)
VALUES (1, 1, 'SUP-001', 'المورد الأساسي', 'YER', 'ACTIVE');
UPDATE suppliers SET legalName = 'المورد الأساسي', currencyCode = 'YER', status = 'ACTIVE' WHERE companyId = 1 AND code = 'SUP-001';
