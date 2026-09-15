ALTER TABLE `customers` ADD `accountId` int NULL;
ALTER TABLE `suppliers` ADD `accountId` int NULL;
CREATE TABLE `cash_boxes` (
  `id` int AUTO_INCREMENT NOT NULL,
  `companyId` int NOT NULL,
  `accountId` int NULL,
  `code` varchar(50) NOT NULL,
  `name` varchar(250) NOT NULL,
  `currencyCode` varchar(3) NOT NULL DEFAULT 'SAR',
  `status` enum('ACTIVE','BLOCKED','CLOSED') NOT NULL DEFAULT 'ACTIVE',
  CONSTRAINT `cash_boxes_id` PRIMARY KEY(`id`),
  CONSTRAINT `cash_box_company_code` UNIQUE(`companyId`,`code`)
);
CREATE TABLE `banks` (
  `id` int AUTO_INCREMENT NOT NULL,
  `companyId` int NOT NULL,
  `accountId` int NULL,
  `code` varchar(50) NOT NULL,
  `name` varchar(250) NOT NULL,
  `accountNumber` varchar(100),
  `currencyCode` varchar(3) NOT NULL DEFAULT 'SAR',
  `status` enum('ACTIVE','BLOCKED','CLOSED') NOT NULL DEFAULT 'ACTIVE',
  CONSTRAINT `banks_id` PRIMARY KEY(`id`),
  CONSTRAINT `bank_company_code` UNIQUE(`companyId`,`code`)
);
INSERT INTO accounts (`companyId`,`code`,`name`,`accountType`,`parentCode`,`currencyCode`,`active`)
SELECT c.companyId, CONCAT('1200-', LPAD(c.id, 4, '0')), c.legalName, 'ASSET', '1200', c.currencyCode, 1 FROM customers c WHERE c.accountId IS NULL;
UPDATE customers c JOIN accounts a ON a.companyId = c.companyId AND a.code = CONCAT('1200-', LPAD(c.id, 4, '0')) SET c.accountId = a.id WHERE c.accountId IS NULL;
INSERT INTO accounts (`companyId`,`code`,`name`,`accountType`,`parentCode`,`currencyCode`,`active`)
SELECT s.companyId, CONCAT('2100-', LPAD(s.id, 4, '0')), s.legalName, 'LIABILITY', '2100', s.currencyCode, 1 FROM suppliers s WHERE s.accountId IS NULL;
UPDATE suppliers s JOIN accounts a ON a.companyId = s.companyId AND a.code = CONCAT('2100-', LPAD(s.id, 4, '0')) SET s.accountId = a.id WHERE s.accountId IS NULL;
