import { describe, expect, it } from "vitest";
import { createInvoiceDraftWithTransaction, postExistingInvoiceWithTransaction, reverseInvoiceWithTransaction, type InvoicePostingRepository, type InvoicePostingTransaction } from "./invoicePostingService";

function makeRepository(options: { failOnStock?: boolean } = {}) {
  const invoices: any[] = [];
  const lines: any[] = [];
  const journals: any[] = [];
  const movements: any[] = [];
  const audits: any[] = [];
  let invoiceId = 1;
  let journalId = 1;

  const repository: InvoicePostingRepository = {
    async transaction<T>(callback: (tx: InvoicePostingTransaction) => Promise<T>) {
      const snapshot = structuredClone({ invoices, lines, journals, movements, audits, invoiceId, journalId });
      const tx: InvoicePostingTransaction = {
        async findPostedByIdempotencyKey(key) {
          const journal = journals.find((row) => row.idempotencyKey === `JOURNAL:${key}` && row.status === "POSTED");
          const invoice = journal && invoices.find((row) => row.invoiceId === journal.invoiceId);
          return invoice && journal ? { invoiceId: invoice.invoiceId, journalId: journal.journalId, idempotencyKey: key, status: "POSTED", subtotal: invoice.subtotal, taxTotal: invoice.taxTotal, grandTotal: invoice.grandTotal, costTotal: invoice.costTotal || 0 } : undefined;
        },
        async insertInvoice(input) { const row = { ...input, invoiceId: invoiceId++, status: "DRAFT", costTotal: 0 }; invoices.push(row); return { invoiceId: row.invoiceId }; },
        async insertInvoiceLines(id, inputLines) { lines.push(...inputLines.map((line) => ({ invoiceId: id, ...line }))); const invoice = invoices.find((row) => row.invoiceId === id); if (invoice) invoice.costTotal = inputLines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0); },
        async insertJournal(input) { const row = { ...input, journalId: journalId++, status: "POSTED" }; journals.push(row); return { journalId: row.journalId }; },
        async insertStockMovement(input) { if (options.failOnStock) throw new Error("STOCK_WRITE_FAILED"); movements.push(input); },
        async markInvoicePosted(id) { invoices.find((row) => row.invoiceId === id)!.status = "POSTED"; },
        async insertAuditEvent(input) { audits.push(input); },
        async loadInvoiceForPosting(id) {
          const invoice = invoices.find((row) => row.invoiceId === id); if (!invoice) return undefined;
          return { invoiceId: id, status: invoice.status, input: { invoiceType: invoice.invoiceType, docNo: invoice.docNo, customerId: invoice.customerId, context: { companyId: invoice.companyId, branchId: invoice.branchId, warehouseId: invoice.warehouseId, fiscalPeriodId: invoice.fiscalPeriodId, currencyCode: invoice.currencyCode, languageCode: "ar" }, currencyCode: invoice.currencyCode, exchangeRate: invoice.exchangeRate, paymentMethod: invoice.paymentMethod, paidAmount: invoice.paidAmount, lines: lines.filter((line) => line.invoiceId === id).map(({ invoiceId: _id, ...line }) => line), accounts: input.accounts } };
        },
        async loadInvoiceForReversal(id) {
          const invoice = invoices.find((row) => row.invoiceId === id); const original = journals.find((row) => row.invoiceId === id); if (!invoice || !original) return undefined;
          return { invoiceId: id, docNo: invoice.docNo, status: "POSTED" as const, context: { companyId: invoice.companyId, branchId: invoice.branchId, warehouseId: invoice.warehouseId, fiscalPeriodId: invoice.fiscalPeriodId, currencyCode: invoice.currencyCode, languageCode: "ar" }, lines: lines.filter((line) => line.invoiceId === id).map((line) => ({ itemId: line.itemId, quantity: line.quantity, unitCost: line.unitCost })), journal: original.journal };
        },
        async findReversedByIdempotencyKey(key) { const row = journals.find((journal) => journal.idempotencyKey === key && journal.status === "REVERSED"); return row && { invoiceId: row.invoiceId, reversalJournalId: row.journalId, status: "REVERSED", idempotencyKey: key }; },
        async insertReversalJournal(input) { const row = { ...input, journalId: journalId++, status: "REVERSED" }; journals.push(row); return { journalId: row.journalId }; },
        async markInvoiceReversed(id) { invoices.find((row) => row.invoiceId === id)!.status = "REVERSED"; },
      };
      try { return await callback(tx); } catch (error) { invoices.splice(0, invoices.length, ...snapshot.invoices); lines.splice(0, lines.length, ...snapshot.lines); journals.splice(0, journals.length, ...snapshot.journals); movements.splice(0, movements.length, ...snapshot.movements); audits.splice(0, audits.length, ...snapshot.audits); invoiceId = snapshot.invoiceId; journalId = snapshot.journalId; throw error; }
    },
  };
  return { repository, invoices, journals, movements, audits };
}

const input = {
  invoiceType: "SALE" as const,
  docNo: "LIFE-001",
  customerId: 7,
  context: { companyId: 1, branchId: 2, warehouseId: 3, fiscalPeriodId: 4, currencyCode: "SAR", languageCode: "ar" },
  currencyCode: "SAR",
  exchangeRate: 1,
  paymentMethod: "CASH",
  paidAmount: 0,
  actor: "typed-test",
  requestId: "life-001",
  lines: [{ itemId: 1, quantity: 2, unitPrice: 100, taxAmount: 15, unitCost: 40 }],
  accounts: { receivableAccount: "1201", revenueAccount: "4101", taxAccount: "2201", cogsAccount: "5102", inventoryAccount: "1301" },
};

describe("typed existing invoice lifecycle", () => {
  it("posts an existing draft and reverses it without duplicate effects", async () => {
    const state = makeRepository();
    await createInvoiceDraftWithTransaction(state.repository, input);
    const posted = await postExistingInvoiceWithTransaction(state.repository, 1, "typed-test", "post-life-1");
    expect(posted.status).toBe("POSTED");
    expect(state.invoices[0].status).toBe("POSTED");
    expect(state.journals[0].status).toBe("POSTED");
    expect(state.movements).toHaveLength(1);
    const reversed = await reverseInvoiceWithTransaction(state.repository, 1, "typed-test", "reverse-life-1");
    expect(reversed.status).toBe("REVERSED");
    expect(state.movements).toHaveLength(2);
    expect((await reverseInvoiceWithTransaction(state.repository, 1, "typed-test", "reverse-life-1")).reversalJournalId).toBe(reversed.reversalJournalId);
    expect(state.journals).toHaveLength(2);
  });

  it("rolls back an existing invoice post when stock persistence fails", async () => {
    const state = makeRepository({ failOnStock: true });
    await createInvoiceDraftWithTransaction(state.repository, input);
    await expect(postExistingInvoiceWithTransaction(state.repository, 1, "typed-test", "post-life-fail")).rejects.toThrow("STOCK_WRITE_FAILED");
    expect(state.invoices[0].status).toBe("DRAFT");
    expect(state.journals).toHaveLength(0);
    expect(state.movements).toHaveLength(0);
  });
});
