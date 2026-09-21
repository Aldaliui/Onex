import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildSaleJournal, calculateInvoice, closeFiscalYear, validateJournal } from "./accountingCore";

type ParityFixture = {
  journals: Array<{ description: string; source: string; lines: Array<{ accountCode: string; debit: number; credit: number }>; total: number }>;
  yearClose: { input: { revenue: number; expenses: number; openingYear: number }; source: string; totalDebit: number; totalCredit: number; retainedEarningsAccount: string; netProfit: number };
  saleInvoice: { lines: Array<{ itemId: number; quantity: number; unitPrice: number; taxAmount: number; unitCost: number }>; subtotal: number; grandTotal: number; costTotal: number };
};

const fixture = JSON.parse(readFileSync(new URL("../test/fixtures/mido/accounting-parity.json", import.meta.url), "utf8")) as ParityFixture;

function expectError(fn: () => unknown, code: string) {
  expect(fn).toThrow(code);
}

describe("mido accounting parity fixtures", () => {
  it("keeps the mido balanced journal invariant", () => {
    const expected = fixture.journals[0];
    const actual = validateJournal(expected);
    expect(actual.source).toBe(expected.source);
    expect(actual.totalDebit).toBe(expected.total);
    expect(actual.totalCredit).toBe(expected.total);
  });

  it("keeps the mido year-close totals and retained earnings account", () => {
    const expected = fixture.yearClose;
    const actual = closeFiscalYear(expected.input);
    expect(actual.source).toBe(expected.source);
    expect(actual.totalDebit).toBe(expected.totalDebit);
    expect(actual.totalCredit).toBe(expected.totalCredit);
    expect(actual.lines.at(-1)?.accountCode).toBe(expected.retainedEarningsAccount);
    expect(actual.lines.at(-1)?.credit).toBe(expected.netProfit);
  });

  it("keeps the mido sale posting accounting equation", () => {
    const expected = fixture.saleInvoice;
    const invoice = calculateInvoice(expected.lines);
    const journal = buildSaleJournal({ total: invoice.grandTotal, subtotal: invoice.subtotal, taxTotal: invoice.taxTotal, totalCogs: invoice.costTotal });
    expect(invoice.subtotal).toBe(expected.subtotal);
    expect(invoice.grandTotal).toBe(expected.grandTotal);
    expect(invoice.costTotal).toBe(expected.costTotal);
    expect(journal.totalDebit).toBe(journal.totalCredit);
    expect(journal.lines.some((line) => line.accountCode === "5100" && line.debit === expected.costTotal)).toBe(true);
  });

  it("preserves the negative behavior contract", () => {
    expectError(() => validateJournal({ description: "غير متوازن", lines: [{ accountCode: "1101", debit: 100 }, { accountCode: "4101", credit: 90 }] }), "JOURNAL_NOT_BALANCED");
    expectError(() => calculateInvoice([]), "INVOICE_NEEDS_LINES");
    expectError(() => calculateInvoice([{ itemId: 1, quantity: 0, unitPrice: 10, unitCost: 5 }]), "INVOICE_QUANTITY_MUST_BE_POSITIVE");
  });
});
