import { and, eq } from "drizzle-orm";
import { accounts, auditEvents, customers, fiscalPeriods, invoiceLines, invoices, items, journalEntries, journalEntryLines, stockBalances, stockMovements, suppliers } from "../drizzle/schema";
import { createInvoiceDraftWithTransaction, postExistingInvoiceWithTransaction, postInvoiceWithTransaction, reverseInvoiceWithTransaction, type InvoicePostingRepository, type InvoicePostingTransaction, type InvoicePostingPlan, type InvoicePostingInput, type PostedInvoiceResult, type InvoiceForReversal } from "./invoicePostingService";

/**
 * The transaction type is intentionally structural. Drizzle's concrete transaction
 * type changes with the selected MySQL driver, while this adapter only needs the
 * query methods used below.
 */
export type DrizzleTransaction = any;

type DrizzleInvoicePostingOptions = {
  updateStock?: (tx: DrizzleTransaction, movement: InvoicePostingPlan["stockMovements"][number] & { invoiceId: number; actor: string }) => Promise<void>;
};

function toFixed(value: number): string {
  return Number(value || 0).toFixed(6);
}

function toResult(invoice: any, journal: any, key: string): PostedInvoiceResult {
  if (!invoice || !journal) throw new Error("POSTED_INVOICE_RESULT_INCOMPLETE");
  return {
    invoiceId: Number(invoice.id),
    journalId: Number(journal.id),
    idempotencyKey: key,
    status: "POSTED",
    subtotal: Number(invoice.subtotal),
    taxTotal: Number(invoice.taxTotal),
    grandTotal: Number(invoice.grandTotal),
    costTotal: Number(journal.totalCogs || 0),
  };
}

export function createDrizzleInvoicePostingRepository(transaction: DrizzleTransaction, options: DrizzleInvoicePostingOptions = {}): InvoicePostingRepository {
  const tx: InvoicePostingTransaction = {
    async findPostedByIdempotencyKey(key) {
      const journal = (await transaction.select().from(journalEntries).where(and(eq(journalEntries.idempotencyKey, `JOURNAL:${key}`), eq(journalEntries.status, "POSTED"))).limit(1))[0];
      if (!journal?.sourceInvoiceId) return undefined;
      const invoice = (await transaction.select().from(invoices).where(and(eq(invoices.id, journal.sourceInvoiceId), eq(invoices.status, "POSTED"))).limit(1))[0];
      if (!invoice) return undefined;
      const lines = await transaction.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoice.id));
      return { ...toResult(invoice, journal, key), costTotal: lines.reduce((sum: number, line: any) => sum + Number(line.quantity) * Number(line.unitPrice), 0) };
    },
    async loadInvoiceForPosting(invoiceId) {
      const invoice = (await transaction.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1))[0];
      if (!invoice) return undefined;
      if (!invoice.branchId || !invoice.fiscalPeriodId) throw new Error("INVOICE_EXECUTION_CONTEXT_REQUIRED");
      const period = (await transaction.select().from(fiscalPeriods).where(and(eq(fiscalPeriods.id, invoice.fiscalPeriodId), eq(fiscalPeriods.companyId, invoice.companyId))).limit(1))[0];
      if (!period || period.status !== "OPEN") throw new Error("INVOICE_PERIOD_NOT_OPEN");
      const rows = await transaction.select({ line: invoiceLines, item: items, balance: stockBalances }).from(invoiceLines).innerJoin(items, eq(invoiceLines.itemId, items.id)).leftJoin(stockBalances, and(eq(stockBalances.itemId, invoiceLines.itemId), eq(stockBalances.warehouseId, invoice.warehouseId))).where(eq(invoiceLines.invoiceId, invoiceId));
      const party = invoice.invoiceType === "SALE" && invoice.customerId ? (await transaction.select().from(customers).where(eq(customers.id, invoice.customerId)).limit(1))[0] : invoice.supplierId ? (await transaction.select().from(suppliers).where(eq(suppliers.id, invoice.supplierId)).limit(1))[0] : undefined;
      const partyAccount = party?.accountId ? (await transaction.select().from(accounts).where(eq(accounts.id, party.accountId)).limit(1))[0] : undefined;
      return { invoiceId, status: invoice.status, input: { invoiceType: invoice.invoiceType, docNo: invoice.docNo, customerId: invoice.customerId || undefined, supplierId: invoice.supplierId || undefined, context: { companyId: invoice.companyId, branchId: invoice.branchId, warehouseId: invoice.warehouseId, fiscalPeriodId: invoice.fiscalPeriodId, currencyCode: invoice.currencyCode, languageCode: "ar" }, currencyCode: invoice.currencyCode, exchangeRate: Number(invoice.exchangeRate), paymentMethod: invoice.paymentMethod, paidAmount: Number(invoice.paidAmount), lines: rows.map(({ line, item, balance }: any) => ({ itemId: line.itemId, quantity: Number(line.quantity), unitPrice: Number(line.unitPrice), taxAmount: Number(line.taxAmount), unitCost: Number(balance?.unitCost || item.unitCost || 0) })), accounts: invoice.invoiceType === "SALE" ? { receivableAccount: partyAccount?.code, revenueAccount: rows[0]?.item.revenueAccount, cogsAccount: rows[0]?.item.cogsAccount, inventoryAccount: rows[0]?.item.inventoryAccount } : { payableAccount: partyAccount?.code, inventoryAccount: rows[0]?.item.inventoryAccount } } };
    },
    async loadInvoiceForReversal(invoiceId) {
      const invoice = (await transaction.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1))[0];
      if (!invoice || !invoice.branchId || !invoice.fiscalPeriodId) return undefined;
      const originalJournal = (await transaction.select().from(journalEntries).where(and(eq(journalEntries.sourceInvoiceId, invoiceId), eq(journalEntries.status, "POSTED"))).limit(1))[0];
      if (!originalJournal) throw new Error("ORIGINAL_JOURNAL_NOT_FOUND");
      const journalRows = await transaction.select().from(journalEntryLines).where(eq(journalEntryLines.journalEntryId, originalJournal.id));
      const rows = await transaction.select({ line: invoiceLines, balance: stockBalances }).leftJoin(stockBalances, and(eq(stockBalances.itemId, invoiceLines.itemId), eq(stockBalances.warehouseId, invoice.warehouseId))).from(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId));
      const journal = { description: "ترحيل فاتورة", source: originalJournal.sourceType || "SALE_INVOICE", totalDebit: Number(originalJournal.totalDebit), totalCredit: Number(originalJournal.totalCredit), lines: journalRows.map((line: any) => ({ accountCode: line.accountCode, accountName: line.accountName || undefined, description: line.description || undefined, debit: Number(line.debit), credit: Number(line.credit) })) };
      return { invoiceId, docNo: invoice.docNo, status: invoice.status, context: { companyId: invoice.companyId, branchId: invoice.branchId, warehouseId: invoice.warehouseId, fiscalPeriodId: invoice.fiscalPeriodId, currencyCode: invoice.currencyCode, languageCode: "ar" }, lines: rows.map(({ line, balance }: any) => ({ itemId: line.itemId, quantity: Number(line.quantity), unitCost: Number(balance?.unitCost || 0) })), journal } satisfies InvoiceForReversal;
    },
    async findReversedByIdempotencyKey(key) {
      const journal = (await transaction.select().from(journalEntries).where(and(eq(journalEntries.idempotencyKey, key), eq(journalEntries.status, "REVERSED"))).limit(1))[0];
      return journal?.sourceInvoiceId ? { invoiceId: journal.sourceInvoiceId, reversalJournalId: journal.id, status: "REVERSED" as const, idempotencyKey: key } : undefined;
    },
    async insertInvoice(input) {
      const inserted = await transaction.insert(invoices).values({
        invoiceType: input.invoiceType,
        docNo: input.docNo,
        companyId: input.companyId,
        branchId: input.branchId,
        fiscalPeriodId: input.fiscalPeriodId,
        customerId: input.customerId || null,
        supplierId: input.supplierId || null,
        warehouseId: input.warehouseId,
        currencyCode: input.currencyCode,
        exchangeRate: toFixed(input.exchangeRate),
        subtotal: toFixed(input.subtotal),
        taxTotal: toFixed(input.taxTotal),
        grandTotal: toFixed(input.grandTotal),
        paymentMethod: input.paymentMethod,
        paidAmount: toFixed(input.paidAmount),
        remainingAmount: toFixed(input.remainingAmount),
        idempotencyKey: input.idempotencyKey,
        sourceForm: input.invoiceType === "SALE" ? "ARST004" : "APST003",
        createdBy: input.actor,
      }).$returningId();
      const invoiceId = Number(inserted[0]?.id);
      if (!invoiceId) throw new Error("INVOICE_CREATE_FAILED");
      return { invoiceId };
    },
    async insertInvoiceLines(invoiceId, lines) {
      await transaction.insert(invoiceLines).values(lines.map((line) => ({
        invoiceId,
        itemId: line.itemId,
        quantity: toFixed(line.quantity),
        unitPrice: toFixed(line.unitPrice),
        taxAmount: toFixed(line.taxAmount),
        lineTotal: toFixed(line.lineTotal),
        unitCode: "EA",
        batchNo: null,
        expireDate: null,
        locationId: null,
        serialsJson: null,
      })));
    },
    async insertJournal(input) {
      const totalCogs = input.journal.lines.filter((line) => Number(line.debit) > 0 && String(line.description || "").includes("تكلفة")).reduce((sum, line) => sum + Number(line.debit), 0);
      const inserted = await transaction.insert(journalEntries).values({
        journalNo: `${input.invoiceType === "SALE" ? "AR" : "AP"}-${input.docNo}`,
        companyId: input.companyId,
        branchId: input.branchId,
        fiscalPeriodId: input.fiscalPeriodId,
        sourceInvoiceId: input.invoiceId,
        sourceType: input.invoiceType === "SALE" ? "AR_SALE" : "AP_PURCHASE",
        sourceDocumentNo: input.docNo,
        entryType: input.invoiceType === "SALE" ? "AR_SALE" : "AP_PURCHASE",
        totalDebit: toFixed(input.journal.totalDebit),
        totalCredit: toFixed(input.journal.totalCredit),
        status: "POSTED",
        postedAt: new Date(),
        idempotencyKey: input.idempotencyKey,
        createdBy: input.actor,
      }).$returningId();
      const journalId = Number(inserted[0]?.id);
      if (!journalId) throw new Error("JOURNAL_CREATE_FAILED");
      await transaction.insert(journalEntryLines).values(input.journal.lines.map((line, index) => ({
        journalEntryId: journalId,
        lineNo: index + 1,
        accountCode: line.accountCode,
        accountName: line.accountName || null,
        description: line.description || null,
        currencyCode: "SAR",
        exchangeRate: "1",
        debit: toFixed(line.debit),
        credit: toFixed(line.credit),
        baseDebit: toFixed(line.debit),
        baseCredit: toFixed(line.credit),
      })));
      // The value is attached only for the adapter result; it is not persisted as a new schema field.
      void totalCogs;
      return { journalId };
    },
    async insertStockMovement(input) {
      if (options.updateStock) {
        await options.updateStock(transaction, input);
        return;
      }
      const quantity = Math.abs(input.quantity);
      const item = (await transaction.select().from(items).where(eq(items.id, input.itemId)).limit(1))[0];
      if (!item) throw new Error("INVOICE_ITEM_NOT_FOUND");
      if (!item.stockFlag) return;
      const balance = (await transaction.select().from(stockBalances).where(and(eq(stockBalances.itemId, input.itemId), eq(stockBalances.warehouseId, input.warehouseId))).limit(1))[0];
      const beforeQuantity = Number(balance?.quantity || 0);
      const beforeTotalCost = Number(balance?.totalCost || 0);
      const delta = input.quantity > 0 ? quantity : -quantity;
      const afterQuantity = beforeQuantity + delta;
      if (afterQuantity < -0.000001) throw new Error(`INSUFFICIENT_STOCK:${item.code}`);
      const totalCost = quantity * input.unitCost;
      const afterTotalCost = Math.max(0, beforeTotalCost + (input.quantity > 0 ? totalCost : -totalCost));
      if (balance) {
        await transaction.update(stockBalances).set({ quantity: toFixed(afterQuantity), totalCost: toFixed(afterTotalCost), unitCost: afterQuantity > 0 ? toFixed(afterTotalCost / afterQuantity) : "0", versionNo: balance.versionNo + 1 }).where(eq(stockBalances.id, balance.id));
      } else {
        await transaction.insert(stockBalances).values({ itemId: input.itemId, warehouseId: input.warehouseId, quantity: toFixed(afterQuantity), totalCost: toFixed(afterTotalCost), unitCost: afterQuantity > 0 ? toFixed(afterTotalCost / afterQuantity) : "0", versionNo: 1 });
      }
      await transaction.insert(stockMovements).values({
        itemId: input.itemId,
        warehouseId: input.warehouseId,
        companyId: input.companyId,
        branchId: input.branchId,
        fiscalPeriodId: input.fiscalPeriodId,
        sourceInvoiceId: input.invoiceId,
        movementType: input.movementType === "SALE" ? "SALES_ISSUE" : input.movementType === "SALE_RETURN" ? "SALES_RETURN" : input.movementType === "PURCHASE_RETURN" ? "PURCHASE_RETURN" : "PURCHASE_RECEIPT",
        quantityIn: input.quantity > 0 ? toFixed(quantity) : "0",
        quantityOut: input.quantity < 0 ? toFixed(quantity) : "0",
        unitCost: toFixed(input.unitCost),
        totalCost: toFixed(totalCost),
        balanceAfter: toFixed(afterQuantity),
        createdBy: input.actor,
      });
    },
    async markInvoicePosted(invoiceId, postedAt) {
      await transaction.update(invoices).set({ status: "POSTED", postedAt }).where(eq(invoices.id, invoiceId));
    },
    async insertReversalJournal(input) {
      const inserted = await transaction.insert(journalEntries).values({ journalNo: `REV-${input.docNo}`, companyId: input.companyId, branchId: input.branchId, fiscalPeriodId: input.fiscalPeriodId, sourceInvoiceId: input.invoiceId, sourceType: "REVERSAL", sourceDocumentNo: input.docNo, entryType: "REVERSAL", totalDebit: toFixed(input.journal.totalDebit), totalCredit: toFixed(input.journal.totalCredit), status: "REVERSED", reversedAt: new Date(), reversedBy: input.actor, idempotencyKey: input.idempotencyKey, createdBy: input.actor }).$returningId();
      const journalId = Number(inserted[0]?.id); if (!journalId) throw new Error("REVERSAL_JOURNAL_CREATE_FAILED");
      await transaction.insert(journalEntryLines).values(input.journal.lines.map((line, index) => ({ journalEntryId: journalId, lineNo: index + 1, accountCode: line.accountCode, accountName: line.accountName || null, description: line.description || null, debit: toFixed(line.debit), credit: toFixed(line.credit), baseDebit: toFixed(line.debit), baseCredit: toFixed(line.credit) })));
      return { journalId };
    },
    async markInvoiceReversed(invoiceId, reversedAt, actor) {
      await transaction.update(invoices).set({ status: "REVERSED" }).where(eq(invoices.id, invoiceId));
      void reversedAt; void actor;
    },
    async insertAuditEvent(input) {
      await transaction.insert(auditEvents).values({ actor: input.actor, actionCode: input.actionCode, entityType: "INVOICE", entityId: input.entityId, requestId: input.requestId });
    },
  };

  return {
    transaction<T>(callback: (inner: InvoicePostingTransaction) => Promise<T>) {
      return callback(tx);
    },
  };
}

export async function postInvoiceWithDrizzleTransaction(transaction: DrizzleTransaction, input: InvoicePostingInput, options: DrizzleInvoicePostingOptions = {}) {
  return postInvoiceWithTransaction(createDrizzleInvoicePostingRepository(transaction, options), input);
}

export async function createInvoiceDraftWithDrizzleTransaction(transaction: DrizzleTransaction, input: InvoicePostingInput) {
  return createInvoiceDraftWithTransaction(createDrizzleInvoicePostingRepository(transaction), input);
}

export async function postExistingInvoiceWithDrizzleTransaction(transaction: DrizzleTransaction, invoiceId: number, actor: string, requestId?: string) {
  return postExistingInvoiceWithTransaction(createDrizzleInvoicePostingRepository(transaction), invoiceId, actor, requestId);
}

export async function reverseInvoiceWithDrizzleTransaction(transaction: DrizzleTransaction, invoiceId: number, actor: string, requestId?: string) {
  return reverseInvoiceWithTransaction(createDrizzleInvoicePostingRepository(transaction), invoiceId, actor, requestId);
}
