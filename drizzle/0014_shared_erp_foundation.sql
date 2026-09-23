CREATE TABLE company_groups (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(30) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  baseCurrency VARCHAR(3) NOT NULL DEFAULT 'SAR',
  active TINYINT NOT NULL DEFAULT 1,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
CREATE TABLE company_group_members (
  id INT AUTO_INCREMENT PRIMARY KEY,
  groupId INT NOT NULL,
  companyId INT NOT NULL,
  consolidationCode VARCHAR(30) NULL,
  UNIQUE KEY company_group_membership (groupId, companyId)
);
CREATE TABLE currencies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(3) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  decimalScale INT NOT NULL DEFAULT 2,
  active TINYINT NOT NULL DEFAULT 1
);
INSERT IGNORE INTO currencies (code, name, decimalScale) VALUES ('SAR', 'الريال السعودي', 2), ('USD', 'الدولار الأمريكي', 2), ('EUR', 'اليورو', 2);
CREATE TABLE exchange_rates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  companyId INT NOT NULL,
  currencyCode VARCHAR(3) NOT NULL,
  rateDate TIMESTAMP NOT NULL,
  rate DECIMAL(20,8) NOT NULL,
  source VARCHAR(80) NOT NULL DEFAULT 'MANUAL',
  actor VARCHAR(100) NOT NULL,
  UNIQUE KEY exchange_rate_scope (companyId, currencyCode, rateDate)
);
CREATE TABLE tax_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  companyId INT NOT NULL,
  code VARCHAR(30) NOT NULL,
  name VARCHAR(160) NOT NULL,
  rate DECIMAL(9,4) NOT NULL DEFAULT 0,
  category VARCHAR(30) NOT NULL DEFAULT 'STANDARD',
  active TINYINT NOT NULL DEFAULT 1,
  UNIQUE KEY tax_code_company_code (companyId, code)
);
CREATE TABLE role_policies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  roleId INT NOT NULL,
  policyCode VARCHAR(100) NOT NULL,
  effect ENUM('ALLOW','DENY') NOT NULL DEFAULT 'ALLOW',
  scopeJson TEXT NOT NULL,
  active TINYINT NOT NULL DEFAULT 1,
  updatedBy VARCHAR(100) NOT NULL,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY role_policy_code (roleId, policyCode)
);
CREATE TABLE document_definitions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  companyId INT NOT NULL,
  documentType VARCHAR(40) NOT NULL,
  displayName VARCHAR(160) NOT NULL,
  prefix VARCHAR(30) NOT NULL,
  approvalRequired TINYINT NOT NULL DEFAULT 1,
  postingRequired TINYINT NOT NULL DEFAULT 1,
  active TINYINT NOT NULL DEFAULT 1,
  UNIQUE KEY document_definition_scope (companyId, documentType)
);
CREATE TABLE attachments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  companyId INT NOT NULL,
  entityType VARCHAR(80) NOT NULL,
  entityId VARCHAR(120) NOT NULL,
  fileName VARCHAR(255) NOT NULL,
  contentType VARCHAR(120) NOT NULL,
  storageKey VARCHAR(500) NOT NULL,
  checksum VARCHAR(128) NULL,
  uploadedBy VARCHAR(100) NOT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX attachment_entity_idx (entityType, entityId)
);
CREATE TABLE notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  companyId INT NULL,
  notificationType VARCHAR(60) NOT NULL,
  title VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
  entityType VARCHAR(80) NULL,
  entityId VARCHAR(120) NULL,
  readAt TIMESTAMP NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX notification_user_unread_idx (userId, readAt, createdAt)
);
CREATE TABLE master_data_imports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  companyId INT NOT NULL,
  entityType VARCHAR(40) NOT NULL,
  fileName VARCHAR(255) NOT NULL,
  status ENUM('PREVIEW','VALIDATED','COMMITTED','REVERTED','FAILED') NOT NULL DEFAULT 'PREVIEW',
  totalRows INT NOT NULL DEFAULT 0,
  validRows INT NOT NULL DEFAULT 0,
  invalidRows INT NOT NULL DEFAULT 0,
  actor VARCHAR(100) NOT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  committedAt TIMESTAMP NULL,
  INDEX master_import_company_status_idx (companyId, status, createdAt)
);
CREATE TABLE master_data_import_rows (
  id INT AUTO_INCREMENT PRIMARY KEY,
  importId INT NOT NULL,
  rowNo INT NOT NULL,
  rawJson TEXT NOT NULL,
  normalizedJson TEXT NULL,
  status ENUM('VALID','INVALID','COMMITTED','REVERTED') NOT NULL,
  errorsJson TEXT NULL,
  targetId INT NULL,
  INDEX master_import_row_idx (importId, rowNo)
);
