import { describe, expect, it } from "vitest";
import { postInvoiceWithTransaction, type InvoicePostingRepository, type InvoicePostingTransaction, type PostedInvoiceResult } from "./invoicePostingService";
import { readFileSync } from "node:fs";

type Fixture = {
  saleInvoice: {
    lines: Array<{ itemId: number; quantity: number; unitPrice: number; taxAmount: number; unitCost: number }>;
    subtotal: number;
    grandTotal: number;
    costTotal: number;
  };
};

const fixture = JSON.parse(readFileSync(new URL("../test/fixtures/mido/accounting-parity.json", import.meta.url), "utf8")) as Fixture;

function makeRepository(options: { failOnStock?: boolean } = {}) {
  const invoices: Array<Record<string, unknown> & { invoiceId: number; status: string; idempotencyKey: string }> = [];
  const invoiceLines: Array<Record<string, unknown>> = [];
  const journals: Array<Record<string, unknown> & { journalId: number }> = [];
  const stockMovements: Array<Record<string, unknown>> = [];
  const audits: Array<Record<string, unknown>> = [];
  let nextInvoiceId = 1;
  let nextJournalId = 1;

  const repository: InvoicePostingRepository = {
    async transaction<T>(callback: (tx: InvoicePostingTransaction) => Promise<T>) {
      const snapshot = {
        invoices: structuredClone(invoices),
        invoiceLines: structuredClone(invoiceLines),
        journals: structuredClone(journals),
        stockMovements: structuredClone(stockMovements),
        audits: structuredClone(audits),
        nextInvoiceId,
        nextJournalId,
      };
      const tx: InvoicePostingTransaction = {
        async findPostedByIdempotencyKey(key) {
          const invoice = invoices.find((row) => row.idempotencyKey === key && row.status === "POSTED");
          if (!invoice) return undefined;
          const journal = journals.find((row) => row.invoiceId === invoice.invoiceId);
          if (!journal) throw new Error("JOURNAL_NOT_FOUND_FOR_IDEMPOTENT_INVOICE");
          return {
            invoiceId: invoice.invoiceId,
            journalId: journal.journalId,
            idempotencyKey: key,
            status: "POSTED",
            subtotal: Number(invoice.subtotal),
            taxTotal: Number(invoice.taxTotal),
            grandTotal: Number(invoice.grandTotal),
            costTotal: Number(invoice.costTotal),
          };
        },
        async insertInvoice(input) {
          const invoice = { ...input, invoiceId: nextInvoiceId++, status: "DRAFT", costTotal: 0 };
          invoices.push(invoice);
          return { invoiceId: invoice.invoiceId };
        },
        async insertInvoiceLines(invoiceId, lines) {
          invoiceLines.push(...lines.map((line) => ({ invoiceId, ...line })));
          const invoice = invoices.find((row) => row.invoiceId === invoiceId);
          if (invoice) invoice.costTotal = lines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0);
        },
        async insertJournal(input) {
          const journal = { ...input, journalId: nextJournalId++ };
          journals.push(journal);
          return { journalId: journal.journalId };
        },
        async insertStockMovement(input) {
          if (options.failOnStock) throw new Error("STOCK_WRITE_FAILED");
          stockMovements.push(input);
        },
        async markInvoicePosted(invoiceId) {
          const invoice = invoices.find((row) => row.invoiceId === invoiceId);
          if (!invoice) throw new Error("INVOICE_NOT_FOUND");
          invoice.status = "POSTED";
        },
        async insertAuditEvent(input) {
          audits.push(input);
        },
      };
      try {
        return await callback(tx);
      } catch (error) {
        invoices.splice(0, invoices.length, ...snapshot.invoices);
        invoiceLines.splice(0, invoiceLines.length, ...snapshot.invoiceLines);
        journals.splice(0, journals.length, ...snapshot.journals);
        stockMovements.splice(0, stockMovements.length, ...snapshot.stockMovements);
        audits.splice(0, audits.length, ...snapshot.audits);
        nextInvoiceId = snapshot.nextInvoiceId;
        nextJournalId = snapshot.nextJournalId;
        throw error;
      }
    },
  };

  return { repository, invoices, invoiceLines, journals, stockMovements, audits };
}

function saleInput(requestId = "mido-parity-1") {
  return {
    invoiceType: "SALE" as const,
    docNo: "MIDO-PARITY-001",
    customerId: 7,
    warehouseId: 3,
    actor: "tester",
    requestId,
    lines: fixture.saleInvoice.lines,
    accounts: { receivableAccount: "1201", revenueAccount: "4101", taxAccount: "2201", cogsAccount: "5102", inventoryAccount: "1301" },
  };
}

describe("typed invoice posting service", () => {
  it("preserves mido invoice totals, cost, and balanced posting intent", async () => {
    const state = makeRepository();
    const result = await postInvoiceWithTransaction(state.repository, saleInput());
    expect(result.status).toBe("POSTED");
    expect(result.subtotal).toBe(fixture.saleInvoice.subtotal);
    expect(result.grandTotal).toBe(fixture.saleInvoice.grandTotal);
    expect(result.costTotal).toBe(fixture.saleInvoice.costTotal);
    expect(state.journals[0].journal.totalDebit).toBe(state.journals[0].journal.totalCredit);
    expect(state.journals[0].journal.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountCode: "1201", debit: fixture.saleInvoice.grandTotal }),
      expect.objectContaining({ accountCode: "4101", credit: fixture.saleInvoice.subtotal }),
      expect.objectContaining({ accountCode: "5102", debit: fixture.saleInvoice.costTotal }),
      expect.objectContaining({ accountCode: "1301", credit: fixture.saleInvoice.costTotal }),
    ]));
    expect(state.invoices).toHaveLength(1);
    expect(state.invoiceLines).toHaveLength(1);
    expect(state.stockMovements[0]).toMatchObject({ itemId: 1, quantity: -2, movementType: "SALE" });
  });

  it("rolls back invoice, journal, stock, and audit writes when stock persistence fails", async () => {
    const state = makeRepository({ failOnStock: true });
    await expect(postInvoiceWithTransaction(state.repository, saleInput("rollback-1"))).rejects.toThrow("STOCK_WRITE_FAILED");
    expect(state.invoices).toHaveLength(0);
    expect(state.invoiceLines).toHaveLength(0);
    expect(state.journals).toHaveLength(0);
    expect(state.stockMovements).toHaveLength(0);
    expect(state.audits).toHaveLength(0);
  });

  it("returns the committed result instead of duplicating a repeated request", async () => {
    const state = makeRepository();
    const first = await postInvoiceWithTransaction(state.repository, saleInput("same-request"));
    const second = await postInvoiceWithTransaction(state.repository, saleInput("same-request"));
    expect(second).toEqual(first);
    expect(state.invoices).toHaveLength(1);
    expect(state.journals).toHaveLength(1);
    expect(state.stockMovements).toHaveLength(1);
  });

  it("rejects invalid invoice identity before opening a transaction", async () => {
    const state = makeRepository();
    await expect(postInvoiceWithTransaction(state.repository, { ...saleInput(), customerId: 0 })).rejects.toThrow("INVOICE_CUSTOMER_REQUIRED");
    expect(state.invoices).toHaveLength(0);
  });
});
