-- Production compatibility patch for the pre-existing 0008 migration ledger.
-- This file is intentionally applied with `wrangler d1 execute --file`, not as a
-- numbered migration, because production's migration names differ from this repo.

ALTER TABLE journal_entries ADD COLUMN sourceRef TEXT;
ALTER TABLE journal_entries ADD COLUMN sourceInvoiceId INTEGER;
ALTER TABLE journal_entries ADD COLUMN sourcePurchaseInvoiceId INTEGER;
ALTER TABLE journal_entries ADD COLUMN sourceInventoryDocumentId INTEGER;
ALTER TABLE journal_entries ADD COLUMN periodId INTEGER;
ALTER TABLE journal_entries ADD COLUMN reversedJournalId INTEGER;
ALTER TABLE journal_entries ADD COLUMN postedAt TEXT;
ALTER TABLE journal_entries ADD COLUMN createdBy TEXT NOT NULL DEFAULT 'cloudflare-worker';

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
CREATE INDEX IF NOT EXISTS journal_entries_source_invoice_idx
  ON journal_entries(sourceInvoiceId);
CREATE INDEX IF NOT EXISTS journal_entries_source_purchase_idx
  ON journal_entries(sourcePurchaseInvoiceId);
CREATE INDEX IF NOT EXISTS journal_entries_source_inventory_idx
  ON journal_entries(sourceInventoryDocumentId);
CREATE INDEX IF NOT EXISTS fiscal_period_closures_company_idx
  ON fiscal_period_closures(companyId, closedAt);

INSERT OR IGNORE INTO _onex_migration_log(name)
VALUES ('0011_journal_compat_production');
