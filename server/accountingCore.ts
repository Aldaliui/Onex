const EPSILON = 0.000001;

function numeric(value: string | number | undefined | null, field: string): number {
  const result = Number(value ?? 0);
  if (!Number.isFinite(result)) throw new Error(`${field}_INVALID`);
  return result;
}

export type JournalLineInput = {
  accountCode: string;
  accountName?: string;
  description?: string;
  debit?: string | number;
  credit?: string | number;
};

export function validateJournal(input: { description?: string; source?: string; lines: JournalLineInput[] }) {
  const description = String(input.description || "").trim();
  if (!description) throw new Error("JOURNAL_DESCRIPTION_REQUIRED");
  if (!Array.isArray(input.lines) || input.lines.length < 2) throw new Error("JOURNAL_NEEDS_TWO_LINES");
  const lines = input.lines.map((line, index) => {
    const debit = numeric(line.debit, `DEBIT_LINE_${index + 1}`);
    const credit = numeric(line.credit, `CREDIT_LINE_${index + 1}`);
    if (debit < -EPSILON || credit < -EPSILON) throw new Error("JOURNAL_NEGATIVE_AMOUNT");
    if (debit > EPSILON && credit > EPSILON) throw new Error("JOURNAL_LINE_BOTH_SIDES");
    if (debit <= EPSILON && credit <= EPSILON) throw new Error("JOURNAL_EMPTY_LINE");
    if (!String(line.accountCode || "").trim()) throw new Error("JOURNAL_ACCOUNT_REQUIRED");
    return { ...line, accountCode: String(line.accountCode).trim(), debit, credit };
  });
  const totalDebit = lines.reduce((sum, line) => sum + line.debit, 0);
  const totalCredit = lines.reduce((sum, line) => sum + line.credit, 0);
  if (Math.abs(totalDebit - totalCredit) > EPSILON) throw new Error("JOURNAL_NOT_BALANCED");
  return { description, source: input.source || "MANUAL", lines, totalDebit, totalCredit };
}

export type InvoiceLineInput = { itemId: number; quantity: string | number; unitPrice: string | number; taxAmount?: string | number };

export function calculateInvoice(lines: InvoiceLineInput[], paidAmount: string | number = 0) {
  if (!Array.isArray(lines) || lines.length === 0) throw new Error("INVOICE_NEEDS_LINES");
  const normalized = lines.map((line, index) => {
    const quantity = numeric(line.quantity, `QUANTITY_LINE_${index + 1}`);
    const unitPrice = numeric(line.unitPrice, `PRICE_LINE_${index + 1}`);
    const taxAmount = numeric(line.taxAmount, `TAX_LINE_${index + 1}`);
    if (!Number.isInteger(line.itemId) || line.itemId <= 0) throw new Error("INVOICE_ITEM_REQUIRED");
    if (quantity <= EPSILON) throw new Error("INVOICE_QUANTITY_MUST_BE_POSITIVE");
    if (unitPrice < -EPSILON || taxAmount < -EPSILON) throw new Error("INVOICE_NEGATIVE_AMOUNT");
    const net = quantity * unitPrice;
    return { itemId: line.itemId, quantity, unitPrice, taxAmount, lineTotal: net + taxAmount };
  });
  const subtotal = normalized.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  const taxTotal = normalized.reduce((sum, line) => sum + line.taxAmount, 0);
  const grandTotal = subtotal + taxTotal;
  const paid = numeric(paidAmount, "PAID_AMOUNT");
  if (paid < -EPSILON || paid - grandTotal > EPSILON) throw new Error("PAID_AMOUNT_EXCEEDS_INVOICE");
  return { lines: normalized, subtotal, taxTotal, grandTotal, paidAmount: paid, remainingAmount: grandTotal - paid };
}

export function buildSaleJournal(input: { total: number; subtotal: number; taxTotal: number; totalCogs: number; revenueAccount?: string; receivableAccount?: string; taxAccount?: string; cogsAccount?: string; inventoryAccount?: string }) {
  const lines: JournalLineInput[] = [
    { accountCode: input.receivableAccount || "1200", debit: input.total, credit: 0, description: "ذمم العميل من فاتورة المبيعات" },
    { accountCode: input.revenueAccount || "4100", debit: 0, credit: input.subtotal, description: "إيراد المبيعات" },
  ];
  if (input.taxTotal > EPSILON) lines.push({ accountCode: input.taxAccount || "2200", debit: 0, credit: input.taxTotal, description: "ضريبة المبيعات" });
  lines.push(
    { accountCode: input.cogsAccount || "5100", debit: input.totalCogs, credit: 0, description: "تكلفة البضاعة المباعة" },
    { accountCode: input.inventoryAccount || "1300", debit: 0, credit: input.totalCogs, description: "إخراج البضاعة من المخزون" },
  );
  return validateJournal({ description: "ترحيل فاتورة مبيعات", source: "SALE_INVOICE", lines });
}

export function buildReversalJournal(input: { total: number; subtotal: number; taxTotal: number; totalCogs: number; revenueAccount?: string; receivableAccount?: string; taxAccount?: string; cogsAccount?: string; inventoryAccount?: string }) {
  const original = buildSaleJournal(input);
  return validateJournal({
    description: "عكس فاتورة مبيعات",
    source: "SALE_INVOICE_REVERSAL",
    lines: original.lines.map((line) => ({ ...line, debit: line.credit, credit: line.debit, description: `عكس: ${line.description || ""}` })),
  });
}

export function canPostToPeriod(period: { status?: string; startsOn?: Date | string; endsOn?: Date | string } | undefined, postingDate: Date | string = new Date()) {
  if (!period) return { allowed: false, reason: "PERIOD_NOT_FOUND" };
  const status = String(period.status || "").toUpperCase();
  if (status !== "OPEN" && status !== "REOPENED") return { allowed: false, reason: "PERIOD_CLOSED" };
  const date = new Date(postingDate).getTime();
  const start = new Date(period.startsOn || "").getTime();
  const end = new Date(period.endsOn || "").getTime();
  if (![date, start, end].every(Number.isFinite)) return { allowed: false, reason: "PERIOD_DATE_INVALID" };
  if (date < start || date > end) return { allowed: false, reason: "DATE_OUTSIDE_PERIOD" };
  return { allowed: true, reason: null };
}

export { EPSILON };
