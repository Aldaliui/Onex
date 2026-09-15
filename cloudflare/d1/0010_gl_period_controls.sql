-- ONEX D1 migration 0010
-- General Ledger controls, fiscal-period posting, reversal, and closing.

ALTER TABLE journal_entries ADD COLUMN periodId INTEGER;
ALTER TABLE journal_entries ADD COLUMN reversedJournalId INTEGER;
ALTER TABLE journal_entries ADD COLUMN postedAt TEXT;
ALTER TABLE journal_entries ADD COLUMN description TEXT;

CREATE TABLE IF NOT EXISTS fiscal_period_closures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  periodId INTEGER NOT NULL UNIQUE,
  companyId INTEGER NOT NULL,
  closedBy TEXT NOT NULL,
  closedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  journalCount INTEGER NOT NULL DEFAULT 0,
  debitTotal TEXT NOT NULL DEFAULT '0',
  creditTotal TEXT NOT NULL DEFAULT '0',
  notes TEXT
);

CREATE INDEX IF NOT EXISTS journal_entries_period_idx
  ON journal_entries(periodId, status, createdAt);
CREATE INDEX IF NOT EXISTS journal_entries_source_ref_idx
  ON journal_entries(sourceRef);
CREATE INDEX IF NOT EXISTS fiscal_period_closures_company_idx
  ON fiscal_period_closures(companyId, closedAt);

INSERT OR IGNORE INTO _onex_migration_log(name)
VALUES ('0010_gl_period_controls');
