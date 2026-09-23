-- ONEX D1 migration 0021
-- Atomic, concurrency-safe document number allocation.
-- A sequence is scoped by company, branch, fiscal period, and document type.
CREATE TABLE IF NOT EXISTS document_sequences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  companyId INTEGER NOT NULL,
  branchId INTEGER NOT NULL DEFAULT 0,
  periodId INTEGER NOT NULL DEFAULT 0,
  documentType TEXT NOT NULL,
  prefix TEXT NOT NULL,
  nextNumber INTEGER NOT NULL DEFAULT 1 CHECK (nextNumber >= 1),
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(companyId, branchId, periodId, documentType)
);

-- Existing 0015 rows used nullable scope columns. Normalize them before the
-- allocator starts writing non-null scope values.
UPDATE document_sequences SET branchId = COALESCE(branchId, 0), periodId = COALESCE(periodId, 0);
CREATE UNIQUE INDEX IF NOT EXISTS document_sequences_scope_idx
  ON document_sequences(companyId, branchId, periodId, documentType);
CREATE INDEX IF NOT EXISTS document_sequences_updated_idx
  ON document_sequences(updatedAt);
INSERT OR IGNORE INTO _onex_migration_log(name) VALUES ('0021_atomic_document_number_generator');
