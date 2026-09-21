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

export type NormalizedJournal = {
  description: string;
  source: string;
  lines: Array<JournalLineInput & { accountCode: string; debit: number; credit: number }>;
  totalDebit: number;
  totalCredit: number;
};

export function validateJournal(input: { description?: string; source?: string; lines: JournalLineInput[] }): NormalizedJournal {
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

export type InvoiceLineInput = {
  itemId: number;
  quantity: string | number;
  unitPrice: string | number;
  taxAmount?: string | number;
  discountAmount?: string | number;
  unitCost?: string | number;
};

export function calculateInvoice(lines: InvoiceLineInput[], paidAmount: string | number = 0) {
  if (!Array.isArray(lines) || lines.length === 0) throw new Error("INVOICE_NEEDS_LINES");
  const normalized = lines.map((line, index) => {
    const quantity = numeric(line.quantity, `QUANTITY_LINE_${index + 1}`);
    const unitPrice = numeric(line.unitPrice, `PRICE_LINE_${index + 1}`);
    const taxAmount = numeric(line.taxAmount, `TAX_LINE_${index + 1}`);
    const discountAmount = numeric(line.discountAmount, `DISCOUNT_LINE_${index + 1}`);
    const unitCost = numeric(line.unitCost, `COST_LINE_${index + 1}`);
    if (!Number.isInteger(line.itemId) || line.itemId <= 0) throw new Error("INVOICE_ITEM_REQUIRED");
    if (quantity <= EPSILON) throw new Error("INVOICE_QUANTITY_MUST_BE_POSITIVE");
    if (unitPrice < -EPSILON || taxAmount < -EPSILON || discountAmount < -EPSILON || unitCost < -EPSILON) throw new Error("INVOICE_NEGATIVE_AMOUNT");
    const gross = quantity * unitPrice;
    if (discountAmount - gross > EPSILON) throw new Error("DISCOUNT_EXCEEDS_LINE_TOTAL");
    const net = gross - discountAmount;
    return { itemId: line.itemId, quantity, unitPrice, taxAmount, discountAmount, unitCost, netAmount: net, lineTotal: net + taxAmount };
  });
  const subtotal = normalized.reduce((sum, line) => sum + line.netAmount, 0);
  const discountTotal = normalized.reduce((sum, line) => sum + line.discountAmount, 0);
  const taxTotal = normalized.reduce((sum, line) => sum + line.taxAmount, 0);
  const grandTotal = subtotal + taxTotal;
  const paid = numeric(paidAmount, "PAID_AMOUNT");
  if (paid < -EPSILON || paid - grandTotal > EPSILON) throw new Error("PAID_AMOUNT_EXCEEDS_INVOICE");
  const costTotal = normalized.reduce((sum, line) => sum + line.quantity * line.unitCost, 0);
  return { lines: normalized, subtotal, discountTotal, taxTotal, grandTotal, paidAmount: paid, remainingAmount: grandTotal - paid, costTotal };
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

export function buildPurchaseJournal(input: { total: number; subtotal: number; taxTotal: number; inventoryAccount?: string; payableAccount?: string; taxAccount?: string }) {
  const lines: JournalLineInput[] = [
    { accountCode: input.inventoryAccount || "1300", debit: input.subtotal, credit: 0, description: "إدخال المشتريات إلى المخزون" },
  ];
  if (input.taxTotal > EPSILON) lines.push({ accountCode: input.taxAccount || "1400", debit: input.taxTotal, credit: 0, description: "ضريبة المشتريات" });
  lines.push({ accountCode: input.payableAccount || "2100", debit: 0, credit: input.total, description: "ذمم المورد من فاتورة المشتريات" });
  return validateJournal({ description: "ترحيل فاتورة مشتريات", source: "PURCHASE_INVOICE", lines });
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

/** Builds the balanced year-end closing entry ported from mido's accounting core. */
export function closeFiscalYear(input: { revenue?: string | number; expenses?: string | number; retainedEarningsAccount?: string; openingYear?: string; date?: string }) {
  const revenue = numeric(input.revenue, "REVENUE");
  const expenses = numeric(input.expenses, "EXPENSES");
  if (revenue < 0 || expenses < 0) throw new Error("YEAR_CLOSE_NEGATIVE_AMOUNT");
  const retainedEarningsAccount = input.retainedEarningsAccount || "3201";
  const lines: JournalLineInput[] = [
    { accountCode: "4101", debit: revenue, credit: 0, description: "إقفال حسابات الإيرادات" },
    { accountCode: "3900", debit: 0, credit: revenue, description: "ترحيل الإيرادات إلى ملخص الدخل" },
    { accountCode: "3900", debit: expenses, credit: 0, description: "إقفال ملخص الدخل بالمصروفات" },
    { accountCode: "5101", debit: 0, credit: expenses, description: "إقفال حسابات المصروفات" },
  ];
  const net = revenue - expenses;
  if (net >= 0) {
    lines.push({ accountCode: "3900", debit: net, credit: 0, description: "إقفال صافي الربح من ملخص الدخل" });
    lines.push({ accountCode: retainedEarningsAccount, debit: 0, credit: net, description: "ترحيل صافي ربح العام" });
  } else {
    lines.push({ accountCode: retainedEarningsAccount, debit: Math.abs(net), credit: 0, description: "ترحيل صافي خسارة العام" });
    lines.push({ accountCode: "3900", debit: 0, credit: Math.abs(net), description: "إقفال صافي الخسارة من ملخص الدخل" });
  }
  return validateJournal({ description: `إقفال السنة المالية وترحيل نتيجة العام إلى ${input.openingYear || ""}`.trim(), source: "YEAR_CLOSE", lines });
}

/** Builds opening balances while excluding temporary revenue and expense accounts. */
export function buildOpeningBalances(accounts: Array<{ code: string; type?: string; balance?: string | number }>) {
  const lines = accounts
    .filter((account) => !["إيراد", "مصروف", "REVENUE", "EXPENSE"].includes(String(account.type || "").toUpperCase()) && Math.abs(Number(account.balance || 0)) > EPSILON)
    .map((account) => {
      const balance = numeric(account.balance, `BALANCE_${account.code}`);
      return balance >= 0
        ? { accountCode: account.code, debit: balance, credit: 0, description: "رصيد افتتاحي" }
        : { accountCode: account.code, debit: 0, credit: Math.abs(balance), description: "رصيد افتتاحي" };
    });
  const debit = lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
  const credit = lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
  if (Math.abs(debit - credit) > EPSILON) throw new Error("OPENING_BALANCES_NOT_BALANCED");
  return validateJournal({ description: "ترحيل الأرصدة الافتتاحية", source: "OPENING_BALANCE", lines });
}

export { EPSILON };
