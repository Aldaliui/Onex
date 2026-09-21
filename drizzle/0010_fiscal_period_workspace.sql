CREATE TABLE `fiscal_period_closures` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `periodId` int NOT NULL UNIQUE,
  `companyId` int NOT NULL,
  `status` enum('STARTED','COMPLETED','REOPENED') NOT NULL DEFAULT 'STARTED',
  `checklistJson` text NOT NULL,
  `closingJournalId` int NULL,
  `actor` varchar(100) NOT NULL,
  `requestId` varchar(160) NOT NULL UNIQUE,
  `closedAt` timestamp NULL,
  `reopenedAt` timestamp NULL,
  `reopenedBy` varchar(100) NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX `fiscal_period_closure_company_idx` ON `fiscal_period_closures` (`companyId`, `status`);
