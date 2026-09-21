import { validateJournal, type JournalLineInput, type NormalizedJournal, EPSILON } from "../accounting/journal";

export type InvoiceLineInput = { itemId: number; quantity: string | number; unitPrice: string | number; taxAmount?: string | number; discountAmount?: string | number; unitCost?: string | number };

const numeric = (value: string | number | undefined | null, field: string) => {
  const result = Number(value ?? 0);
  if (!Number.isFinite(result)) throw new Error(`${field}_INVALID`);
  return result;
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
    const netAmount = gross - discountAmount;
    return { itemId: line.itemId, quantity, unitPrice, taxAmount, discountAmount, unitCost, netAmount, lineTotal: netAmount + taxAmount };
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

export function buildSaleJournal(input: { total: number; subtotal: number; taxTotal: number; totalCogs: number; revenueAccount?: string; receivableAccount?: string; taxAccount?: string; cogsAccount?: string; inventoryAccount?: string }): NormalizedJournal {
  const lines: JournalLineInput[] = [
    { accountCode: input.receivableAccount || "1200", debit: input.total, credit: 0, description: "ذمم العميل من فاتورة المبيعات" },
    { accountCode: input.revenueAccount || "4100", debit: 0, credit: input.subtotal, description: "إيراد المبيعات" },
  ];
  if (input.taxTotal > EPSILON) lines.push({ accountCode: input.taxAccount || "2200", debit: 0, credit: input.taxTotal, description: "ضريبة المبيعات" });
  lines.push({ accountCode: input.cogsAccount || "5100", debit: input.totalCogs, credit: 0, description: "تكلفة البضاعة المباعة" }, { accountCode: input.inventoryAccount || "1300", debit: 0, credit: input.totalCogs, description: "إخراج البضاعة من المخزون" });
  return validateJournal({ description: "ترحيل فاتورة مبيعات", source: "SALE_INVOICE", lines });
}
