import { describe, expect, it } from "vitest";
import { buildOpeningBalances, buildPurchaseJournal, buildReversalJournal, buildSaleJournal, calculateInvoice, canPostToPeriod, closeFiscalYear, validateJournal } from "./accountingCore";
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
  it("applies mido line discounts and cost totals before calculating the grand total", () => {
    expect(calculateInvoice([{ itemId: 1, quantity: 2, unitPrice: 100, discountAmount: 10, taxAmount: 15, unitCost: 60 }])).toMatchObject({ subtotal: 190, discountTotal: 10, taxTotal: 15, grandTotal: 205, costTotal: 120 });
    expect(() => calculateInvoice([{ itemId: 1, quantity: 1, unitPrice: 10, discountAmount: 11 }])).toThrow("DISCOUNT_EXCEEDS_LINE_TOTAL");
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
  it("accepts linked customer and supplier subledger accounts", () => {
    const sale = buildSaleJournal({ total: 215, subtotal: 200, taxTotal: 15, totalCogs: 80, receivableAccount: "1200-0007" });
    const purchase = buildPurchaseJournal({ total: 215, subtotal: 200, taxTotal: 15, payableAccount: "2100-0004" });
    expect(sale.lines.find((line) => line.accountCode === "1200-0007")?.debit).toBe(215);
    expect(purchase.lines.find((line) => line.accountCode === "2100-0004")?.credit).toBe(215);
  });
  it("enforces open fiscal period dates", () => {
    expect(canPostToPeriod({ status: "CLOSED", startsOn: "2026-01-01", endsOn: "2026-01-31" }, "2026-01-10").allowed).toBe(false);
    expect(canPostToPeriod({ status: "OPEN", startsOn: "2026-01-01", endsOn: "2026-01-31" }, "2026-02-01").reason).toBe("DATE_OUTSIDE_PERIOD");
  });
  it("builds a balanced year close with retained earnings", () => {
    const closing = closeFiscalYear({ revenue: 1000, expenses: 700, openingYear: "2027" });
    expect(closing.source).toBe("YEAR_CLOSE");
    expect(closing.totalDebit).toBe(closing.totalCredit);
    expect(closing.lines.some((line) => line.accountCode === "3201" && line.credit === 300)).toBe(true);
  });
  it("builds opening balances and excludes temporary accounts", () => {
    const opening = buildOpeningBalances([
      { code: "1100", type: "ASSET", balance: 1000 },
      { code: "2100", type: "LIABILITY", balance: -400 },
      { code: "3201", type: "EQUITY", balance: -600 },
      { code: "4100", type: "REVENUE", balance: 900 },
    ]);
    expect(opening.source).toBe("OPENING_BALANCE");
    expect(opening.lines).toHaveLength(3);
    expect(opening.totalDebit).toBe(opening.totalCredit);
  });
  it("maps legacy ONEX windows to explicit capabilities", () => {
    expect(getLegacyWindowContract("ARST004.fmx")?.capabilities).toContain("العكس المحاسبي");
    expect(getLegacyWindowContract("GLSI001.fmx")?.actions).toContain("close-period");
  });
});
