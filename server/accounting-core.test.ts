import { describe, expect, it } from "vitest";
import { buildPurchaseJournal, buildReversalJournal, buildSaleJournal, calculateInvoice, canPostToPeriod, validateJournal } from "./accountingCore";
import { getLegacyWindowContract } from "./legacyWindowContracts";

describe("accounting core rules", () => {
  it("rejects unbalanced or invalid journals", () => {
    expect(() => validateJournal({ description: "x", lines: [{ accountCode: "1100", debit: 100 }, { accountCode: "4100", credit: 90 }] })).toThrow("JOURNAL_NOT_BALANCED");
    expect(() => validateJournal({ description: "x", lines: [{ accountCode: "1100", debit: 100, credit: 1 }, { accountCode: "4100", credit: 99 }] })).toThrow("JOURNAL_LINE_BOTH_SIDES");
  });
  it("calculates invoice totals and prevents overpayment", () => {
    expect(calculateInvoice([{ itemId: 1, quantity: "2", unitPrice: "100", taxAmount: "15" }], "50")).toMatchObject({ subtotal: 200, taxTotal: 15, grandTotal: 215, remainingAmount: 165 });
    expect(() => calculateInvoice([{ itemId: 1, quantity: 1, unitPrice: 10, taxAmount: 0 }], 11)).toThrow("PAID_AMOUNT_EXCEEDS_INVOICE");
  });
  it("builds balanced sale and reversal entries", () => {
    const sale = buildSaleJournal({ total: 215, subtotal: 200, taxTotal: 15, totalCogs: 80 });
    const reversal = buildReversalJournal({ total: 215, subtotal: 200, taxTotal: 15, totalCogs: 80 });
    expect(sale.totalDebit).toBe(sale.totalCredit);
    expect(reversal.totalDebit).toBe(reversal.totalCredit);
    expect(reversal.lines[0].credit).toBe(215);
  });
  it("builds a balanced purchase entry to inventory and supplier payable", () => {
    const purchase = buildPurchaseJournal({ total: 215, subtotal: 200, taxTotal: 15 });
    expect(purchase.totalDebit).toBe(purchase.totalCredit);
    expect(purchase.lines.some((line) => line.accountCode === "2100" && line.credit === 215)).toBe(true);
  });
  it("enforces open fiscal period dates", () => {
    expect(canPostToPeriod({ status: "CLOSED", startsOn: "2026-01-01", endsOn: "2026-01-31" }, "2026-01-10").allowed).toBe(false);
    expect(canPostToPeriod({ status: "OPEN", startsOn: "2026-01-01", endsOn: "2026-01-31" }, "2026-02-01").reason).toBe("DATE_OUTSIDE_PERIOD");
  });
  it("maps legacy ONEX windows to explicit capabilities", () => {
    expect(getLegacyWindowContract("ARST004.fmx")?.capabilities).toContain("العكس المحاسبي");
    expect(getLegacyWindowContract("GLSI001.fmx")?.actions).toContain("close-period");
  });
});
