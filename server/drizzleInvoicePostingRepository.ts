import { and, eq } from "drizzle-orm";
import { auditEvents, invoiceLines, invoices, items, journalEntries, journalEntryLines, stockBalances, stockMovements } from "../drizzle/schema";
import { postInvoiceWithTransaction, type InvoicePostingRepository, type InvoicePostingTransaction, type InvoicePostingPlan, type InvoicePostingInput, type PostedInvoiceResult } from "./invoicePostingService";

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
    async insertInvoice(input) {
      const inserted = await transaction.insert(invoices).values({
        invoiceType: input.invoiceType,
        docNo: input.docNo,
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
        sourceInvoiceId: input.invoiceId,
        movementType: input.movementType === "SALE" ? "SALES_ISSUE" : "PURCHASE_RECEIPT",
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
