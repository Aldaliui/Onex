CREATE TABLE `adjustment_notes` (
  `id` int AUTO_INCREMENT NOT NULL,
  `docNo` varchar(80) NOT NULL,
  `documentKind` enum('SALES_RETURN','PURCHASE_RETURN','SALES_DISCOUNT','SALES_ADDITION','PURCHASE_DISCOUNT','PURCHASE_ADDITION') NOT NULL,
  `originalInvoiceId` int NOT NULL,
  `customerId` int NULL,
  `supplierId` int NULL,
  `warehouseId` int NOT NULL,
  `subtotal` decimal(20,6) NOT NULL DEFAULT 0,
  `taxTotal` decimal(20,6) NOT NULL DEFAULT 0,
  `grandTotal` decimal(20,6) NOT NULL DEFAULT 0,
  `reason` varchar(500) NULL,
  `status` enum('DRAFT','POSTED','REVERSED') NOT NULL DEFAULT 'DRAFT',
  `idempotencyKey` varchar(160) NOT NULL,
  `createdBy` varchar(100) NOT NULL DEFAULT 'demo.user',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `postedAt` timestamp NULL,
  CONSTRAINT `adjustment_notes_id` PRIMARY KEY(`id`),
  CONSTRAINT `adjustment_notes_docNo_unique` UNIQUE(`docNo`),
  CONSTRAINT `adjustment_notes_idempotency_unique` UNIQUE(`idempotencyKey`)
);
CREATE INDEX `adjustment_original_idx` ON `adjustment_notes` (`originalInvoiceId`);
CREATE INDEX `adjustment_kind_idx` ON `adjustment_notes` (`documentKind`);
CREATE TABLE `adjustment_note_lines` (
  `id` int AUTO_INCREMENT NOT NULL,
  `adjustmentNoteId` int NOT NULL,
  `itemId` int NOT NULL,
  `quantity` decimal(20,6) NOT NULL,
  `unitPrice` decimal(20,6) NOT NULL,
  `taxAmount` decimal(20,6) NOT NULL DEFAULT 0,
  `lineTotal` decimal(20,6) NOT NULL,
  CONSTRAINT `adjustment_note_lines_id` PRIMARY KEY(`id`)
);
