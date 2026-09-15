ALTER TABLE `invoices` ADD `invoiceType` enum('SALE','PURCHASE') NOT NULL DEFAULT 'SALE';
ALTER TABLE `invoices` MODIFY COLUMN `customerId` int NULL;
ALTER TABLE `invoices` ADD `supplierId` int NULL;
CREATE INDEX `invoice_type_idx` ON `invoices` (`invoiceType`);
CREATE INDEX `invoice_supplier_idx` ON `invoices` (`supplierId`);
