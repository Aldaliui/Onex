CREATE TABLE `inventory_counts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `countNo` varchar(80) NOT NULL,
  `warehouseId` int NOT NULL,
  `countMode` enum('PERIODIC','CYCLE') NOT NULL DEFAULT 'PERIODIC',
  `status` enum('DRAFT','POSTED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
  `countedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `postedAt` timestamp NULL,
  `actor` varchar(100) NOT NULL DEFAULT 'demo.user',
  `notes` text,
  CONSTRAINT `inventory_counts_id` PRIMARY KEY(`id`),
  CONSTRAINT `inventory_counts_countNo_unique` UNIQUE(`countNo`)
);
CREATE TABLE `inventory_count_lines` (
  `id` int AUTO_INCREMENT NOT NULL,
  `countId` int NOT NULL,
  `itemId` int NOT NULL,
  `systemQuantity` decimal(20,6) NOT NULL DEFAULT 0,
  `countedQuantity` decimal(20,6) NOT NULL DEFAULT 0,
  `unitCost` decimal(20,6) NOT NULL DEFAULT 0,
  `varianceQuantity` decimal(20,6) NOT NULL DEFAULT 0,
  `varianceValue` decimal(20,6) NOT NULL DEFAULT 0,
  CONSTRAINT `inventory_count_lines_id` PRIMARY KEY(`id`)
);
CREATE INDEX `inventory_count_warehouse_idx` ON `inventory_counts` (`warehouseId`);
CREATE INDEX `inventory_count_lines_count_idx` ON `inventory_count_lines` (`countId`);
