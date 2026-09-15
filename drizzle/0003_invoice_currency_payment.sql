ALTER TABLE invoices
  ADD COLUMN exchangeRate DECIMAL(20,8) NOT NULL DEFAULT 1 AFTER currencyCode,
  ADD COLUMN paymentMethod VARCHAR(24) NOT NULL DEFAULT 'CASH' AFTER status,
  ADD COLUMN paidAmount DECIMAL(20,6) NOT NULL DEFAULT 0 AFTER paymentMethod,
  ADD COLUMN remainingAmount DECIMAL(20,6) NOT NULL DEFAULT 0 AFTER paidAmount,
  ADD COLUMN paymentReference VARCHAR(160) NULL AFTER remainingAmount,
  ADD COLUMN autoVoucherId INT NULL AFTER paymentReference,
  ADD COLUMN notes TEXT NULL AFTER autoVoucherId;
