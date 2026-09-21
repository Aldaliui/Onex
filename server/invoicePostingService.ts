import { calculateInvoice, type InvoiceLineInput } from "../packages/erp-domain-core/sales/invoice";
import { buildPurchaseJournal, buildSaleJournal, type NormalizedJournal } from "./accountingCore";
import { assertAtomicPost } from "./documentLifecycle";

export type InvoicePostingType = "SALE" | "PURCHASE";

export type InvoicePostingInput = {
  invoiceType: InvoicePostingType;
  docNo: string;
  invoiceId?: number;
  customerId?: number;
  supplierId?: number;
  warehouseId: number;
  currencyCode?: string;
  exchangeRate?: string | number;
  paymentMethod?: string;
  paidAmount?: string | number;
  actor: string;
  requestId: string;
  lines: Array<InvoiceLineInput & {
    unitCode?: string;
    batchNo?: string;
    expireDate?: string;
    locationId?: number;
    serials?: string[];
  }>;
  accounts?: {
    receivableAccount?: string;
    payableAccount?: string;
    revenueAccount?: string;
    taxAccount?: string;
    cogsAccount?: string;
    inventoryAccount?: string;
  };
};

export type InvoicePostingPlan = {
  idempotencyKey: string;
  invoiceType: InvoicePostingType;
  docNo: string;
  warehouseId: number;
  currencyCode: string;
  exchangeRate: number;
  actor: string;
  requestId: string;
  calculated: ReturnType<typeof calculateInvoice>;
  journal: NormalizedJournal;
  stockMovements: Array<{
    itemId: number;
    quantity: number;
    unitCost: number;
    movementType: "SALE" | "PURCHASE";
  }>;
};

export type PostedInvoiceResult = {
  invoiceId: number;
  journalId: number;
  idempotencyKey: string;
  status: "POSTED";
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  costTotal: number;
};

export type InvoicePostingTransaction = {
  findPostedByIdempotencyKey(key: string): Promise<PostedInvoiceResult | undefined>;
  insertInvoice(input: {
    invoiceType: InvoicePostingType;
    docNo: string;
    customerId?: number;
    supplierId?: number;
    warehouseId: number;
    currencyCode: string;
    exchangeRate: number;
    paymentMethod: string;
    paidAmount: number;
    remainingAmount: number;
    subtotal: number;
    taxTotal: number;
    grandTotal: number;
    idempotencyKey: string;
    actor: string;
  }): Promise<{ invoiceId: number }>;
  insertInvoiceLines(invoiceId: number, lines: InvoicePostingPlan["calculated"]["lines"]): Promise<void>;
  insertJournal(input: {
    invoiceId: number;
    docNo: string;
    invoiceType: InvoicePostingType;
    journal: NormalizedJournal;
    idempotencyKey: string;
    actor: string;
  }): Promise<{ journalId: number }>;
  insertStockMovement(input: InvoicePostingPlan["stockMovements"][number] & { invoiceId: number; actor: string }): Promise<void>;
  markInvoicePosted(invoiceId: number, postedAt: Date): Promise<void>;
  insertAuditEvent(input: { actor: string; actionCode: string; entityId: string; requestId: string }): Promise<void>;
};

export type InvoicePostingRepository = {
  transaction<T>(callback: (tx: InvoicePostingTransaction) => Promise<T>): Promise<T>;
};

function positiveInteger(value: number | undefined, field: string): number {
  if (!Number.isInteger(value) || Number(value) <= 0) throw new Error(`${field}_REQUIRED`);
  return Number(value);
}

function nonNegativeNumber(value: string | number | undefined, field: string): number {
  const result = Number(value ?? 0);
  if (!Number.isFinite(result) || result < 0) throw new Error(`${field}_INVALID`);
  return result;
}

export function buildInvoicePostingPlan(input: InvoicePostingInput): InvoicePostingPlan {
  if (!input.docNo.trim()) throw new Error("INVOICE_DOCNO_REQUIRED");
  if (!input.actor.trim()) throw new Error("DOCUMENT_ACTOR_REQUIRED");
  if (!input.requestId.trim()) throw new Error("DOCUMENT_REQUEST_ID_REQUIRED");
  positiveInteger(input.warehouseId, "INVOICE_WAREHOUSE");
  if (input.invoiceType === "SALE") positiveInteger(input.customerId, "INVOICE_CUSTOMER");
  if (input.invoiceType === "PURCHASE") positiveInteger(input.supplierId, "INVOICE_SUPPLIER");

  const exchangeRate = nonNegativeNumber(input.exchangeRate ?? 1, "EXCHANGE_RATE");
  if (exchangeRate <= 0) throw new Error("EXCHANGE_RATE_INVALID");
  const paidAmount = nonNegativeNumber(input.paidAmount, "PAID_AMOUNT");
  const calculated = calculateInvoice(input.lines, paidAmount);
  const accounts = input.accounts || {};
  const journal = input.invoiceType === "SALE"
    ? buildSaleJournal({
        total: calculated.grandTotal,
        subtotal: calculated.subtotal,
        taxTotal: calculated.taxTotal,
        totalCogs: calculated.costTotal,
        revenueAccount: accounts.revenueAccount,
        receivableAccount: accounts.receivableAccount,
        taxAccount: accounts.taxAccount,
        cogsAccount: accounts.cogsAccount,
        inventoryAccount: accounts.inventoryAccount,
      })
    : buildPurchaseJournal({
        total: calculated.grandTotal,
        subtotal: calculated.subtotal,
        taxTotal: calculated.taxTotal,
        payableAccount: accounts.payableAccount,
        taxAccount: accounts.taxAccount,
        inventoryAccount: accounts.inventoryAccount,
      });

  return {
    idempotencyKey: `INVOICE:${input.invoiceType}:${input.docNo}:POST:${input.requestId}`,
    invoiceType: input.invoiceType,
    docNo: input.docNo.trim(),
    warehouseId: input.warehouseId,
    currencyCode: String(input.currencyCode || "SAR").trim().toUpperCase(),
    exchangeRate,
    actor: input.actor.trim(),
    requestId: input.requestId.trim(),
    calculated,
    journal,
    stockMovements: calculated.lines.map((line) => ({
      itemId: line.itemId,
      quantity: input.invoiceType === "SALE" ? -line.quantity : line.quantity,
      unitCost: input.invoiceType === "SALE" ? line.unitCost : line.unitPrice,
      movementType: input.invoiceType,
    })),
  };
}

export async function postInvoiceWithTransaction(repository: InvoicePostingRepository, input: InvoicePostingInput): Promise<PostedInvoiceResult> {
  const plan = buildInvoicePostingPlan(input);
  return repository.transaction(async (tx) => {
    const existing = await tx.findPostedByIdempotencyKey(plan.idempotencyKey);
    if (existing) return existing;

    const invoice = await tx.insertInvoice({
      invoiceType: plan.invoiceType,
      docNo: plan.docNo,
      customerId: input.customerId,
      supplierId: input.supplierId,
      warehouseId: plan.warehouseId,
      currencyCode: plan.currencyCode,
      exchangeRate: plan.exchangeRate,
      paymentMethod: input.paymentMethod || (plan.invoiceType === "SALE" ? "CASH" : "CREDIT"),
      paidAmount: plan.calculated.paidAmount,
      remainingAmount: plan.calculated.remainingAmount,
      subtotal: plan.calculated.subtotal,
      taxTotal: plan.calculated.taxTotal,
      grandTotal: plan.calculated.grandTotal,
      idempotencyKey: plan.idempotencyKey,
      actor: plan.actor,
    });

    assertAtomicPost({ documentType: `${plan.invoiceType}_INVOICE`, documentId: invoice.invoiceId, actor: plan.actor, requestId: plan.requestId, from: "DRAFT" });
    await tx.insertInvoiceLines(invoice.invoiceId, plan.calculated.lines);
    const journal = await tx.insertJournal({ invoiceId: invoice.invoiceId, docNo: plan.docNo, invoiceType: plan.invoiceType, journal: plan.journal, idempotencyKey: `JOURNAL:${plan.idempotencyKey}`, actor: plan.actor });
    for (const movement of plan.stockMovements) await tx.insertStockMovement({ ...movement, invoiceId: invoice.invoiceId, actor: plan.actor });
    await tx.markInvoicePosted(invoice.invoiceId, new Date());
    await tx.insertAuditEvent({ actor: plan.actor, actionCode: "POST", entityId: String(invoice.invoiceId), requestId: plan.requestId });

    return {
      invoiceId: invoice.invoiceId,
      journalId: journal.journalId,
      idempotencyKey: plan.idempotencyKey,
      status: "POSTED",
      subtotal: plan.calculated.subtotal,
      taxTotal: plan.calculated.taxTotal,
      grandTotal: plan.calculated.grandTotal,
      costTotal: plan.calculated.costTotal,
    };
  });
}
