CREATE TABLE grni_postings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  goodsReceiptId INT NOT NULL UNIQUE,
  purchaseOrderId INT NOT NULL,
  supplierId INT NOT NULL,
  journalId INT NULL,
  amount DECIMAL(20,6) NOT NULL,
  status ENUM('OPEN','SETTLED','CANCELLED') NOT NULL DEFAULT 'OPEN',
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  settledAt TIMESTAMP NULL,
  INDEX grni_supplier_status_idx (supplierId, status)
);
