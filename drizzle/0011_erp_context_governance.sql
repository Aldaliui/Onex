CREATE TABLE `erp_user_contexts` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `userId` int NOT NULL UNIQUE,
  `companyId` int NOT NULL,
  `branchId` int NULL,
  `warehouseId` int NULL,
  `fiscalPeriodId` int NULL,
  `currencyCode` varchar(3) NOT NULL DEFAULT 'SAR',
  `languageCode` varchar(10) NOT NULL DEFAULT 'ar',
  `updatedBy` varchar(100) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE INDEX `erp_context_company_idx` ON `erp_user_contexts` (`companyId`);
CREATE INDEX `erp_context_period_idx` ON `erp_user_contexts` (`fiscalPeriodId`);

CREATE TABLE `erp_context_events` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `userId` int NOT NULL,
  `contextId` int NULL,
  `actionCode` varchar(40) NOT NULL,
  `previousJson` text NULL,
  `nextJson` text NULL,
  `actor` varchar(100) NOT NULL,
  `requestId` varchar(160) NOT NULL UNIQUE,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX `erp_context_event_user_created_idx` ON `erp_context_events` (`userId`, `createdAt`);
