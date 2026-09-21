import { buildSaleJournal as buildCoreSaleJournal, calculateInvoice, closeFiscalYear, EPSILON, validateJournal, type JournalLineInput, type NormalizedJournal } from "../packages/erp-domain-core";
import { canPostToPeriod } from "../packages/erp-domain-core/accounting/fiscal-period";

export { calculateInvoice, closeFiscalYear, EPSILON, validateJournal, canPostToPeriod };
export type { JournalLineInput, NormalizedJournal };

export function buildSaleJournal(input: { total: number; subtotal: number; taxTotal: number; totalCogs: number; revenueAccount?: string; receivableAccount?: string; taxAccount?: string; cogsAccount?: string; inventoryAccount?: string }) {
  return buildCoreSaleJournal(input);
}

export function buildPurchaseJournal(input: { total: number; subtotal: number; taxTotal: number; inventoryAccount?: string; payableAccount?: string; taxAccount?: string }) {
  const lines: JournalLineInput[] = [{ accountCode: input.inventoryAccount || "1300", debit: input.subtotal, credit: 0, description: "إدخال المشتريات إلى المخزون" }];
  if (input.taxTotal > EPSILON) lines.push({ accountCode: input.taxAccount || "1400", debit: input.taxTotal, credit: 0, description: "ضريبة المشتريات" });
  lines.push({ accountCode: input.payableAccount || "2100", debit: 0, credit: input.total, description: "ذمم المورد من فاتورة المشتريات" });
  return validateJournal({ description: "ترحيل فاتورة مشتريات", source: "PURCHASE_INVOICE", lines });
}

export function buildReversalJournal(input: { total: number; subtotal: number; taxTotal: number; totalCogs: number; revenueAccount?: string; receivableAccount?: string; taxAccount?: string; cogsAccount?: string; inventoryAccount?: string }) {
  const original = buildSaleJournal(input);
  return validateJournal({ description: "عكس فاتورة مبيعات", source: "SALE_INVOICE_REVERSAL", lines: original.lines.map((line) => ({ ...line, debit: line.credit, credit: line.debit, description: `عكس: ${line.description || ""}` })) });
}

export function buildOpeningBalances(accounts: Array<{ code: string; type?: string; balance?: string | number }>) {
  const lines = accounts.filter((account) => !["إيراد", "مصروف", "REVENUE", "EXPENSE"].includes(String(account.type || "").toUpperCase()) && Math.abs(Number(account.balance || 0)) > EPSILON).map((account) => {
    const balance = Number(account.balance || 0);
    if (!Number.isFinite(balance)) throw new Error(`BALANCE_${account.code}_INVALID`);
    return balance >= 0 ? { accountCode: account.code, debit: balance, credit: 0, description: "رصيد افتتاحي" } : { accountCode: account.code, debit: 0, credit: Math.abs(balance), description: "رصيد افتتاحي" };
  });
  const debit = lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
  const credit = lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
  if (Math.abs(debit - credit) > EPSILON) throw new Error("OPENING_BALANCES_NOT_BALANCED");
  return validateJournal({ description: "ترحيل الأرصدة الافتتاحية", source: "OPENING_BALANCE", lines });
}
