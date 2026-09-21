ALTER TABLE `stock_movements`
  ADD COLUMN `companyId` int NOT NULL DEFAULT 1,
  ADD COLUMN `branchId` int NULL,
  ADD COLUMN `fiscalPeriodId` int NULL;

CREATE INDEX `stock_movement_context_idx` ON `stock_movements` (`companyId`, `branchId`, `fiscalPeriodId`);
