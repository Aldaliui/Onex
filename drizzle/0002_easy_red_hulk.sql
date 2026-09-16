ALTER TABLE `invoices` ADD `exchangeRate` decimal(20,8) DEFAULT '1' NOT NULL;
--> statement-breakpoint
ALTER TABLE `invoices` ADD `paymentMethod` varchar(24) DEFAULT 'CASH' NOT NULL;
--> statement-breakpoint
ALTER TABLE `invoices` ADD `paidAmount` decimal(20,6) DEFAULT '0' NOT NULL;
--> statement-breakpoint
ALTER TABLE `invoices` ADD `remainingAmount` decimal(20,6) DEFAULT '0' NOT NULL;
--> statement-breakpoint
ALTER TABLE `invoices` ADD `paymentReference` varchar(160);
--> statement-breakpoint
ALTER TABLE `invoices` ADD `autoVoucherId` int;
--> statement-breakpoint
ALTER TABLE `invoices` ADD `notes` text;
--> statement-breakpoint
CREATE TABLE `window_contracts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `legacyForm` varchar(160) NOT NULL,
  `domainCode` varchar(80) NOT NULL,
  `coreApi` varchar(160) NOT NULL,
  `actionsJson` text NOT NULL,
  `evidenceJson` text NOT NULL,
  `rebuildLevel` varchar(60) NOT NULL DEFAULT 'catalog_specification',
  `verificationStatus` varchar(60) NOT NULL DEFAULT 'CATALOG_ONLY',
  `active` int NOT NULL DEFAULT 1,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `window_contracts_id` PRIMARY KEY(`id`),
  CONSTRAINT `window_contracts_legacyForm_unique` UNIQUE(`legacyForm`)
);
--> statement-breakpoint
CREATE INDEX `window_contract_domain_idx` ON `window_contracts` (`domainCode`);
--> statement-breakpoint
CREATE TABLE `window_executions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `legacyForm` varchar(160) NOT NULL,
  `actionCode` varchar(80) NOT NULL,
  `invoiceId` int,
  `requestId` varchar(160) NOT NULL,
  `actor` varchar(100) NOT NULL,
  `mode` varchar(40) NOT NULL DEFAULT 'DATABASE_CONTRACT',
  `status` varchar(40) NOT NULL,
  `responseJson` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `window_executions_id` PRIMARY KEY(`id`),
  CONSTRAINT `window_executions_requestId_unique` UNIQUE(`requestId`)
);
--> statement-breakpoint
CREATE INDEX `window_execution_action_idx` ON `window_executions` (`legacyForm`,`actionCode`,`createdAt`);
