ALTER TABLE `invoices`
  ADD COLUMN `companyId` int NOT NULL DEFAULT 1,
  ADD COLUMN `branchId` int NULL,
  ADD COLUMN `fiscalPeriodId` int NULL,
  ADD INDEX `invoice_context_idx` (`companyId`, `branchId`, `fiscalPeriodId`);
