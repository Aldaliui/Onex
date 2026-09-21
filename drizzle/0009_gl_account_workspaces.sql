-- ONEX GL workspace schema: account hierarchy, lifecycle controls, journal workflow, and audit-ready lines.
-- This migration is intentionally additive and backfills legacy journal idempotency keys.

ALTER TABLE `accounts`
  ADD COLUMN `levelNo` int NOT NULL DEFAULT 0,
  ADD COLUMN `allowPosting` int NOT NULL DEFAULT 1,
  ADD COLUMN `normalBalance` enum('DEBIT','CREDIT') NOT NULL DEFAULT 'DEBIT',
  ADD COLUMN `isControlAccount` int NOT NULL DEFAULT 0,
  ADD COLUMN `cashFlowCategory` varchar(40),
  ADD COLUMN `salesAccount` int NOT NULL DEFAULT 0,
  ADD COLUMN `purchaseAccount` int NOT NULL DEFAULT 0,
  ADD COLUMN `inventoryAccount` int NOT NULL DEFAULT 0,
  ADD COLUMN `cogsAccount` int NOT NULL DEFAULT 0,
  ADD COLUMN `legacyCode` varchar(80),
  ADD COLUMN `legacySource` varchar(120),
  ADD COLUMN `status` enum('ACTIVE','BLOCKED','CLOSED') NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN `closedAt` timestamp NULL,
  ADD COLUMN `closedBy` varchar(100),
  ADD COLUMN `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  ADD INDEX `account_company_parent_idx` (`companyId`, `parentCode`),
  ADD INDEX `account_type_active_idx` (`companyId`, `accountType`, `active`),
  ADD INDEX `account_posting_idx` (`companyId`, `allowPosting`, `active`);

ALTER TABLE `journal_entries`
  ADD COLUMN `companyId` int NOT NULL DEFAULT 1,
  ADD COLUMN `branchId` int NULL,
  ADD COLUMN `fiscalPeriodId` int NULL,
  ADD COLUMN `sourceType` varchar(40) NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN `sourceDocumentNo` varchar(80) NULL,
  ADD COLUMN `journalDate` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN `description` text NULL,
  ADD COLUMN `validatedAt` timestamp NULL,
  ADD COLUMN `validatedBy` varchar(100) NULL,
  ADD COLUMN `approvedAt` timestamp NULL,
  ADD COLUMN `approvedBy` varchar(100) NULL,
  ADD COLUMN `postedAt` timestamp NULL,
  ADD COLUMN `reversedAt` timestamp NULL,
  ADD COLUMN `reversedBy` varchar(100) NULL,
  ADD COLUMN `idempotencyKey` varchar(160) NULL,
  ADD COLUMN `createdBy` varchar(100) NOT NULL DEFAULT 'system',
  ADD COLUMN `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

UPDATE `journal_entries`
SET `idempotencyKey` = CONCAT('LEGACY:JOURNAL:', `id`),
    `postedAt` = CASE WHEN `status` IN ('POSTED','REVERSED') THEN COALESCE(`postedAt`, `createdAt`) ELSE `postedAt` END
WHERE `idempotencyKey` IS NULL;

ALTER TABLE `journal_entries`
  MODIFY COLUMN `status` enum('DRAFT','VALIDATED','APPROVED','POSTED','REVERSED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
  MODIFY COLUMN `idempotencyKey` varchar(160) NOT NULL,
  ADD UNIQUE INDEX `journal_idempotency_key_unique` (`idempotencyKey`),
  ADD INDEX `journal_company_date_idx` (`companyId`, `journalDate`),
  ADD INDEX `journal_period_status_idx` (`fiscalPeriodId`, `status`),
  ADD INDEX `journal_source_idx` (`sourceType`, `sourceDocumentNo`);

ALTER TABLE `journal_entry_lines`
  ADD COLUMN `lineNo` int NOT NULL DEFAULT 1,
  ADD COLUMN `costCenterCode` varchar(80) NULL,
  ADD COLUMN `currencyCode` varchar(3) NOT NULL DEFAULT 'SAR',
  ADD COLUMN `exchangeRate` decimal(20,8) NOT NULL DEFAULT 1,
  ADD COLUMN `baseDebit` decimal(20,6) NOT NULL DEFAULT 0,
  ADD COLUMN `baseCredit` decimal(20,6) NOT NULL DEFAULT 0,
  ADD INDEX `journal_line_journal_idx` (`journalEntryId`, `lineNo`),
  ADD INDEX `journal_line_account_idx` (`accountCode`);

UPDATE `journal_entry_lines`
SET `baseDebit` = `debit`,
    `baseCredit` = `credit`
WHERE `baseDebit` = 0 AND `baseCredit` = 0;
