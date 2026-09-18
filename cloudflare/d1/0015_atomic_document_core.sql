-- ONEX D1 production migration 0015
-- Shared atomic document lifecycle, posting batches, and reliable outbox events.
CREATE TABLE IF NOT EXISTS document_sequences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  companyId INTEGER NOT NULL,
  branchId INTEGER,
  periodId INTEGER,
  documentType TEXT NOT NULL,
  prefix TEXT NOT NULL DEFAULT '',
  nextNumber INTEGER NOT NULL DEFAULT 1,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(companyId, branchId, periodId, documentType)
);

CREATE TABLE IF NOT EXISTS document_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  documentType TEXT NOT NULL,
  documentId INTEGER NOT NULL,
  fromState TEXT,
  toState TEXT NOT NULL,
  actor TEXT NOT NULL,
  reason TEXT,
  requestId TEXT NOT NULL UNIQUE,
  occurredAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS document_events_document_idx ON document_events(documentType, documentId, occurredAt);

CREATE TABLE IF NOT EXISTS posting_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  documentType TEXT NOT NULL,
  documentId INTEGER NOT NULL,
  idempotencyKey TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'STARTED' CHECK(status IN ('STARTED','COMPLETED','FAILED')),
  actor TEXT NOT NULL,
  errorCode TEXT,
  startedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completedAt TEXT
);
CREATE INDEX IF NOT EXISTS posting_batches_document_idx ON posting_batches(documentType, documentId, status);

CREATE TABLE IF NOT EXISTS posting_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  postingBatchId INTEGER NOT NULL,
  documentLineId INTEGER,
  effectType TEXT NOT NULL,
  sourceTable TEXT NOT NULL,
  sourceId INTEGER NOT NULL,
  amount TEXT NOT NULL DEFAULT '0',
  quantity TEXT NOT NULL DEFAULT '0'
);
CREATE INDEX IF NOT EXISTS posting_lines_batch_idx ON posting_lines(postingBatchId);

CREATE TABLE IF NOT EXISTS outbox_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  eventType TEXT NOT NULL,
  aggregateType TEXT NOT NULL,
  aggregateId INTEGER NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PUBLISHED','FAILED')),
  attempts INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  publishedAt TEXT
);
CREATE INDEX IF NOT EXISTS outbox_pending_idx ON outbox_events(status, createdAt);

INSERT OR IGNORE INTO _onex_migration_log(name) VALUES ('0015_atomic_document_core');
