ALTER TABLE invoices ADD COLUMN purchaseOrderId INT NULL AFTER sourceForm;
ALTER TABLE invoices ADD COLUMN goodsReceiptId INT NULL AFTER purchaseOrderId;

CREATE TABLE purchase_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  orderNo VARCHAR(80) NOT NULL UNIQUE,
  supplierId INT NOT NULL,
  warehouseId INT NOT NULL,
  currencyCode VARCHAR(3) NOT NULL DEFAULT 'SAR',
  subtotal DECIMAL(20,6) NOT NULL DEFAULT 0,
  taxTotal DECIMAL(20,6) NOT NULL DEFAULT 0,
  grandTotal DECIMAL(20,6) NOT NULL DEFAULT 0,
  status ENUM('DRAFT','VALIDATED','APPROVED','PARTIALLY_RECEIVED','FULLY_RECEIVED','CLOSED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
  actor VARCHAR(100) NOT NULL,
  idempotencyKey VARCHAR(160) NOT NULL UNIQUE,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approvedAt TIMESTAMP NULL,
  closedAt TIMESTAMP NULL,
  INDEX purchase_order_supplier_status_idx (supplierId, status)
);

CREATE TABLE purchase_order_lines (
  id INT AUTO_INCREMENT PRIMARY KEY,
  purchaseOrderId INT NOT NULL,
  itemId INT NOT NULL,
  quantity DECIMAL(20,6) NOT NULL,
  receivedQuantity DECIMAL(20,6) NOT NULL DEFAULT 0,
  unitPrice DECIMAL(20,6) NOT NULL,
  taxAmount DECIMAL(20,6) NOT NULL DEFAULT 0,
  lineTotal DECIMAL(20,6) NOT NULL,
  INDEX purchase_order_line_order_idx (purchaseOrderId)
);

CREATE TABLE goods_receipts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  receiptNo VARCHAR(80) NOT NULL UNIQUE,
  purchaseOrderId INT NOT NULL,
  supplierId INT NOT NULL,
  warehouseId INT NOT NULL,
  status ENUM('DRAFT','VALIDATED','POSTED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
  actor VARCHAR(100) NOT NULL,
  idempotencyKey VARCHAR(160) NOT NULL UNIQUE,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  postedAt TIMESTAMP NULL,
  INDEX goods_receipt_order_idx (purchaseOrderId),
  INDEX goods_receipt_supplier_idx (supplierId)
);

CREATE TABLE goods_receipt_lines (
  id INT AUTO_INCREMENT PRIMARY KEY,
  goodsReceiptId INT NOT NULL,
  purchaseOrderLineId INT NOT NULL,
  itemId INT NOT NULL,
  quantity DECIMAL(20,6) NOT NULL,
  unitCost DECIMAL(20,6) NOT NULL,
  batchNo VARCHAR(100) NULL,
  expireDate TIMESTAMP NULL,
  serialsJson TEXT NULL,
  INDEX goods_receipt_line_receipt_idx (goodsReceiptId),
  INDEX goods_receipt_line_order_line_idx (purchaseOrderLineId)
);
