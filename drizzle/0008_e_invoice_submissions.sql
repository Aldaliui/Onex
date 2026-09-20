CREATE TABLE `e_invoice_submissions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `invoiceId` int NOT NULL,
  `provider` varchar(80) NOT NULL,
  `status` enum('QUEUED','SUBMITTED','ACCEPTED','REJECTED','FAILED') NOT NULL DEFAULT 'QUEUED',
  `externalId` varchar(160),
  `idempotencyKey` varchar(160) NOT NULL,
  `payloadJson` text NOT NULL,
  `responseJson` text,
  `errorCode` varchar(80),
  `errorMessage` varchar(500),
  `submittedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `e_invoice_submissions_id` PRIMARY KEY(`id`),
  CONSTRAINT `e_invoice_submissions_idempotencyKey_unique` UNIQUE(`idempotencyKey`)
);
CREATE INDEX `e_invoice_submission_invoice_idx` ON `e_invoice_submissions` (`invoiceId`);
CREATE INDEX `e_invoice_submission_status_idx` ON `e_invoice_submissions` (`status`);
