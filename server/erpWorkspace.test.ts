import { describe, expect, it } from "vitest";
import { assertNoPeriodOverlap, assertWorkspacePermission, buildCloseChecklist, buildFiscalCloseRequest, validateFiscalPeriod } from "./erpWorkspace";

describe("ERP workspace fiscal periods and permissions", () => {
  it("validates period ranges and rejects overlaps", () => {
    const period = validateFiscalPeriod({ companyId: 1, code: "2026-02", startsOn: "2026-02-01T00:00:00Z", endsOn: "2026-02-28T23:59:59Z" });
    expect(period.code).toBe("2026-02");
    expect(() => assertNoPeriodOverlap([{ startsOn: "2026-02-01", endsOn: "2026-02-28" }], period)).toThrow("FISCAL_PERIOD_OVERLAPS_EXISTING");
    expect(() => validateFiscalPeriod({ companyId: 1, code: "BAD", startsOn: "2026-03-10", endsOn: "2026-03-01" })).toThrow("FISCAL_PERIOD_RANGE_INVALID");
  });

  it("blocks close when the checklist has blocking work", () => {
    expect(buildCloseChecklist({ unpostedJournals: 0, draftInvoices: 0, unbalancedJournals: 0 }).canClose).toBe(true);
    expect(buildCloseChecklist({ unpostedJournals: 1, draftInvoices: 0, unbalancedJournals: 0 }).canClose).toBe(false);
  });

  it("limits close and reopen actions to the administrator/accountant policy", () => {
    expect(() => assertWorkspacePermission("SALES", "PERIOD_CLOSE")).toThrow("PERMISSION_DENIED:PERIOD_CLOSE");
    expect(() => assertWorkspacePermission("ACCOUNTANT", "PERIOD_CLOSE")).not.toThrow();
    expect(() => assertWorkspacePermission("ACCOUNTANT", "PERIOD_REOPEN")).toThrow("PERMISSION_DENIED:PERIOD_REOPEN");
    expect(buildFiscalCloseRequest({ periodId: 4, actor: "accountant", role: "ACCOUNTANT", requestId: "close-4" }).role).toBe("ACCOUNTANT");
  });
});
