-- ONEX D1 migration 0009
-- Purchase AP posting receives stock at local moving-average cost.

ALTER TABLE purchase_invoices ADD COLUMN inventoryJournalNo TEXT;
ALTER TABLE purchase_invoices ADD COLUMN inventoryPostedAt TEXT;
ALTER TABLE purchase_lines ADD COLUMN appliedUnitCost TEXT NOT NULL DEFAULT '0';
ALTER TABLE purchase_lines ADD COLUMN appliedCostTotal TEXT NOT NULL DEFAULT '0';
ALTER TABLE journal_entries ADD COLUMN sourcePurchaseInvoiceId INTEGER;
ALTER TABLE stock_movements ADD COLUMN sourcePurchaseInvoiceId INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS ap_inventory_source_idx
  ON journal_entries(sourcePurchaseInvoiceId)
  WHERE sourcePurchaseInvoiceId IS NOT NULL AND entryType = 'AP_PURCHASE';
CREATE INDEX IF NOT EXISTS purchase_lines_applied_cost_idx
  ON purchase_lines(purchaseInvoiceId, itemId);
CREATE INDEX IF NOT EXISTS stock_movements_source_purchase_idx
  ON stock_movements(sourcePurchaseInvoiceId, movementType);

INSERT OR IGNORE INTO _onex_migration_log(name)
VALUES ('0009_ap_inventory_posting');
