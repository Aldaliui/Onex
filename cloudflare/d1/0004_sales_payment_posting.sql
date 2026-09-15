ALTER TABLE invoices ADD COLUMN paymentMethod TEXT NOT NULL DEFAULT 'CASH';
ALTER TABLE invoices ADD COLUMN paidAmount TEXT NOT NULL DEFAULT '0';
ALTER TABLE invoices ADD COLUMN remainingAmount TEXT NOT NULL DEFAULT '0';
ALTER TABLE invoices ADD COLUMN paymentReference TEXT;
ALTER TABLE invoices ADD COLUMN autoVoucherId INTEGER;

CREATE TABLE IF NOT EXISTS journal_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  journalNo TEXT NOT NULL UNIQUE,
  entryType TEXT NOT NULL,
  sourceRef TEXT,
  sourceInvoiceId INTEGER,
  totalDebit TEXT NOT NULL DEFAULT '0',
  totalCredit TEXT NOT NULL DEFAULT '0',
  status TEXT NOT NULL DEFAULT 'POSTED',
  createdBy TEXT NOT NULL DEFAULT 'cloudflare-worker',
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS journal_entry_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  journalNo TEXT NOT NULL,
  accountCode TEXT NOT NULL,
  debit TEXT NOT NULL DEFAULT '0',
  credit TEXT NOT NULL DEFAULT '0',
  description TEXT
);

CREATE INDEX IF NOT EXISTS journal_line_no_idx ON journal_entry_lines(journalNo);
