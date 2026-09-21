import { calculateInvoice, type InvoiceLineInput } from "../packages/erp-domain-core/sales/invoice";
import { buildPurchaseJournal, buildSaleJournal, type NormalizedJournal } from "./accountingCore";
import { assertAtomicPost } from "./documentLifecycle";
import { requireErpExecutionContext, type ErpExecutionContext } from "./erpContext";

export type InvoicePostingType = "SALE" | "PURCHASE";

export type InvoicePostingInput = {
  invoiceType: InvoicePostingType;
  docNo: string;
  invoiceId?: number;
  customerId?: number;
  supplierId?: number;
  context: ErpExecutionContext;
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
  context: ErpExecutionContext;
  warehouseId: number;
  currencyCode: string;
  exchangeRate: number;
  actor: string;
  requestId: string;
  calculated: ReturnType<typeof calculateInvoice>;
  journal: NormalizedJournal;
  stockMovements: Array<{
    itemId: number;
    companyId: number;
    branchId: number;
    fiscalPeriodId: number;
    warehouseId: number;
    quantity: number;
    unitCost: number;
    movementType: "SALE" | "PURCHASE" | "SALE_RETURN" | "PURCHASE_RETURN";
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

export type DraftInvoiceResult = {
  invoiceId: number;
  docNo: string;
  idempotencyKey: string;
  status: "DRAFT";
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
};

export type ReversedInvoiceResult = { invoiceId: number; reversalJournalId: number; status: "REVERSED"; idempotencyKey: string };
export type ExistingInvoiceForPosting = { invoiceId: number; status: "DRAFT" | "POSTED" | "REVERSED"; input: Omit<InvoicePostingInput, "invoiceId" | "actor" | "requestId"> };
export type InvoiceForReversal = { invoiceId: number; docNo: string; status: "POSTED" | "REVERSED"; context: ErpExecutionContext; lines: Array<{ itemId: number; quantity: number; unitCost: number }>; journal: NormalizedJournal };

export type InvoicePostingTransaction = {
  findPostedByIdempotencyKey(key: string): Promise<PostedInvoiceResult | undefined>;
  insertInvoice(input: {
    invoiceType: InvoicePostingType;
    docNo: string;
    customerId?: number;
    supplierId?: number;
    companyId: number;
    branchId: number;
    fiscalPeriodId: number;
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
    companyId: number;
    branchId: number;
    fiscalPeriodId: number;
    journal: NormalizedJournal;
    idempotencyKey: string;
    actor: string;
  }): Promise<{ journalId: number }>;
  insertStockMovement(input: InvoicePostingPlan["stockMovements"][number] & { invoiceId: number; actor: string }): Promise<void>;
  markInvoicePosted(invoiceId: number, postedAt: Date): Promise<void>;
  insertAuditEvent(input: { actor: string; actionCode: string; entityId: string; requestId: string }): Promise<void>;
  loadInvoiceForPosting?(invoiceId: number): Promise<ExistingInvoiceForPosting | undefined>;
  loadInvoiceForReversal?(invoiceId: number): Promise<InvoiceForReversal | undefined>;
  findReversedByIdempotencyKey?(key: string): Promise<ReversedInvoiceResult | undefined>;
  insertReversalJournal?(input: { invoiceId: number; docNo: string; companyId: number; branchId: number; fiscalPeriodId: number; journal: NormalizedJournal; idempotencyKey: string; actor: string }): Promise<{ journalId: number }>;
  markInvoiceReversed?(invoiceId: number, reversedAt: Date, actor: string): Promise<void>;
};

export type InvoicePostingRepository = {
  transaction<T>(callback: (tx: InvoicePostingTransaction) => Promise<T>): Promise<T>;
};

export async function createInvoiceDraftWithTransaction(repository: InvoicePostingRepository, input: InvoicePostingInput): Promise<DraftInvoiceResult> {
  const plan = buildInvoicePostingPlan(input);
  const idempotencyKey = `INVOICE:${plan.invoiceType}:${plan.docNo}:DRAFT:${plan.requestId}`;
  return repository.transaction(async (tx) => {
    const invoice = await tx.insertInvoice({
      invoiceType: plan.invoiceType,
      docNo: plan.docNo,
      companyId: plan.context.companyId,
      branchId: plan.context.branchId,
      fiscalPeriodId: plan.context.fiscalPeriodId,
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
      idempotencyKey,
      actor: plan.actor,
    });
    await tx.insertInvoiceLines(invoice.invoiceId, plan.calculated.lines);
    await tx.insertAuditEvent({ actor: plan.actor, actionCode: "CREATE_DRAFT", entityId: String(invoice.invoiceId), requestId: plan.requestId });
    return { invoiceId: invoice.invoiceId, docNo: plan.docNo, idempotencyKey, status: "DRAFT", subtotal: plan.calculated.subtotal, taxTotal: plan.calculated.taxTotal, grandTotal: plan.calculated.grandTotal };
  });
}

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
  const context = requireErpExecutionContext(input.context);
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
    context,
    warehouseId: context.warehouseId,
    currencyCode: String(input.currencyCode || "SAR").trim().toUpperCase(),
    exchangeRate,
    actor: input.actor.trim(),
    requestId: input.requestId.trim(),
    calculated,
    journal,
    stockMovements: calculated.lines.map((line) => ({
      itemId: line.itemId,
      companyId: context.companyId,
      branchId: context.branchId,
      fiscalPeriodId: context.fiscalPeriodId,
      warehouseId: context.warehouseId,
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
      companyId: plan.context.companyId,
      branchId: plan.context.branchId,
      fiscalPeriodId: plan.context.fiscalPeriodId,
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
    const journal = await tx.insertJournal({ invoiceId: invoice.invoiceId, docNo: plan.docNo, invoiceType: plan.invoiceType, companyId: plan.context.companyId, branchId: plan.context.branchId, fiscalPeriodId: plan.context.fiscalPeriodId, journal: plan.journal, idempotencyKey: `JOURNAL:${plan.idempotencyKey}`, actor: plan.actor });
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

export async function postExistingInvoiceWithTransaction(repository: InvoicePostingRepository, invoiceId: number, actor: string, requestId = `POST:INVOICE:${invoiceId}`): Promise<PostedInvoiceResult> {
  return repository.transaction(async (tx) => {
    if (!tx.loadInvoiceForPosting) throw new Error("TYPED_EXISTING_INVOICE_POSTING_UNAVAILABLE");
    const existing = await tx.loadInvoiceForPosting(invoiceId);
    if (!existing) throw new Error("INVOICE_NOT_FOUND");
    if (existing.status !== "DRAFT") throw new Error("INVOICE_ALREADY_POSTED_OR_REVERSED");
    const input: InvoicePostingInput = { ...existing.input, invoiceId, actor, requestId };
    const plan = buildInvoicePostingPlan(input);
    const alreadyPosted = await tx.findPostedByIdempotencyKey(plan.idempotencyKey);
    if (alreadyPosted) return alreadyPosted;
    assertAtomicPost({ documentType: `${plan.invoiceType}_INVOICE`, documentId: invoiceId, actor, requestId, from: "DRAFT" });
    const journal = await tx.insertJournal({ invoiceId, docNo: plan.docNo, invoiceType: plan.invoiceType, companyId: plan.context.companyId, branchId: plan.context.branchId, fiscalPeriodId: plan.context.fiscalPeriodId, journal: plan.journal, idempotencyKey: `JOURNAL:${plan.idempotencyKey}`, actor });
    for (const movement of plan.stockMovements) await tx.insertStockMovement({ ...movement, invoiceId, actor });
    await tx.markInvoicePosted(invoiceId, new Date());
    await tx.insertAuditEvent({ actor, actionCode: "POST", entityId: String(invoiceId), requestId });
    return { invoiceId, journalId: journal.journalId, idempotencyKey: plan.idempotencyKey, status: "POSTED", subtotal: plan.calculated.subtotal, taxTotal: plan.calculated.taxTotal, grandTotal: plan.calculated.grandTotal, costTotal: plan.calculated.costTotal };
  });
}

export async function reverseInvoiceWithTransaction(repository: InvoicePostingRepository, invoiceId: number, actor: string, requestId = `REV:INVOICE:${invoiceId}`): Promise<ReversedInvoiceResult> {
  return repository.transaction(async (tx) => {
    if (!tx.loadInvoiceForReversal || !tx.insertReversalJournal || !tx.markInvoiceReversed) throw new Error("TYPED_INVOICE_REVERSAL_UNAVAILABLE");
    const target = await tx.loadInvoiceForReversal(invoiceId);
    if (!target || target.status !== "POSTED") throw new Error("ONLY_POSTED_INVOICES_CAN_BE_REVERSED");
    const idempotencyKey = `JOURNAL:REVERSAL:${target.docNo}:${requestId}`;
    const existing = tx.findReversedByIdempotencyKey ? await tx.findReversedByIdempotencyKey(idempotencyKey) : undefined;
    if (existing) return existing;
    const journal: NormalizedJournal = { ...target.journal, description: "عكس فاتورة مبيعات", source: "SALE_INVOICE_REVERSAL", lines: target.journal.lines.map((line) => ({ ...line, debit: line.credit, credit: line.debit, description: `عكس: ${line.description || ""}` })) };
    const reversalJournal = await tx.insertReversalJournal({ invoiceId, docNo: target.docNo, companyId: target.context.companyId, branchId: target.context.branchId, fiscalPeriodId: target.context.fiscalPeriodId, journal, idempotencyKey, actor });
    for (const line of target.lines) await tx.insertStockMovement({ itemId: line.itemId, companyId: target.context.companyId, branchId: target.context.branchId, fiscalPeriodId: target.context.fiscalPeriodId, warehouseId: target.context.warehouseId, quantity: line.quantity, unitCost: line.unitCost, movementType: target.journal.source.includes("PURCHASE") ? "PURCHASE_RETURN" : "SALE_RETURN", invoiceId, actor });
    await tx.markInvoiceReversed(invoiceId, new Date(), actor);
    await tx.insertAuditEvent({ actor, actionCode: "REVERSE", entityId: String(invoiceId), requestId });
    return { invoiceId, reversalJournalId: reversalJournal.journalId, status: "REVERSED", idempotencyKey };
  });
}
