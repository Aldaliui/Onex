-- ONEX D1 migration 0008
-- Sales AR posting consumes stock and creates a COGS journal.

ALTER TABLE invoices ADD COLUMN cogsJournalNo TEXT;
ALTER TABLE invoices ADD COLUMN inventoryPostedAt TEXT;
ALTER TABLE invoice_lines ADD COLUMN appliedUnitCost TEXT NOT NULL DEFAULT '0';
ALTER TABLE invoice_lines ADD COLUMN appliedCostTotal TEXT NOT NULL DEFAULT '0';

CREATE UNIQUE INDEX IF NOT EXISTS ar_cogs_source_invoice_idx
  ON journal_entries(sourceInvoiceId)
  WHERE sourceInvoiceId IS NOT NULL AND entryType = 'AR_COGS';
CREATE INDEX IF NOT EXISTS invoice_lines_applied_cost_idx
  ON invoice_lines(invoiceId, itemId);
CREATE INDEX IF NOT EXISTS stock_movements_source_invoice_type_idx
  ON stock_movements(sourceInvoiceId, movementType);

INSERT OR IGNORE INTO _onex_migration_log(name)
VALUES ('0008_ar_inventory_posting');
