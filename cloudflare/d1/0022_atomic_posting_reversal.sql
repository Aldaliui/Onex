-- ONEX D1 migration 0022
-- At most one reversal journal can exist for each posted source document.
CREATE TABLE IF NOT EXISTS atomic_write_assertions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expected INTEGER NOT NULL CHECK (expected = 1),
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_ar_reversal_source_idx
  ON journal_entries(sourceInvoiceId)
  WHERE sourceInvoiceId IS NOT NULL AND entryType = 'AR_REVERSAL';
CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_ap_reversal_source_idx
  ON journal_entries(sourcePurchaseInvoiceId)
  WHERE sourcePurchaseInvoiceId IS NOT NULL AND entryType = 'AP_REVERSAL';
CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_inventory_reversal_source_idx
  ON journal_entries(sourceInventoryDocumentId)
  WHERE sourceInventoryDocumentId IS NOT NULL AND entryType = 'INVENTORY_REVERSAL';
INSERT OR IGNORE INTO _onex_migration_log(name) VALUES ('0022_atomic_posting_reversal');
