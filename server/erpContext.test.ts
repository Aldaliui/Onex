import { describe, expect, it } from "vitest";
import { buildContextEvent, normalizeErpContext, requireErpExecutionContext } from "./erpContext";

describe("ERP operating context", () => {
  it("normalizes a complete context", () => {
    expect(normalizeErpContext({ companyId: 1, branchId: 2, warehouseId: 3, fiscalPeriodId: 4, currencyCode: "sar", languageCode: "ar" })).toEqual({
      companyId: 1,
      branchId: 2,
      warehouseId: 3,
      fiscalPeriodId: 4,
      currencyCode: "SAR",
      languageCode: "ar",
    });
  });

  it("rejects missing or malformed context references", () => {
    expect(() => normalizeErpContext({ companyId: 0 })).toThrow("CONTEXT_COMPANY_REQUIRED");
    expect(() => normalizeErpContext({ companyId: 1, branchId: 0 })).toThrow("CONTEXT_BRANCH_INVALID");
    expect(() => normalizeErpContext({ companyId: 1, currencyCode: "SA" })).toThrow("CONTEXT_CURRENCY_INVALID");
  });

  it("creates auditable set and clear events", () => {
    const next = normalizeErpContext({ companyId: 1 });
    expect(buildContextEvent({ userId: 8, actor: "user-8", requestId: "ctx-1", previous: null, next }).actionCode).toBe("CONTEXT_SET");
    expect(buildContextEvent({ userId: 8, actor: "user-8", requestId: "ctx-2", previous: next, next: null }).actionCode).toBe("CONTEXT_CLEAR");
    expect(() => buildContextEvent({ userId: 8, actor: "", requestId: "ctx-3", previous: null, next })).toThrow("CONTEXT_ACTOR_REQUIRED");
  });

  it("requires branch, warehouse, and fiscal period for posting", () => {
    expect(requireErpExecutionContext({ companyId: 1, branchId: 2, warehouseId: 3, fiscalPeriodId: 4 }).warehouseId).toBe(3);
    expect(() => requireErpExecutionContext({ companyId: 1, branchId: 2, warehouseId: 3 })).toThrow("EXECUTION_CONTEXT_PERIOD_REQUIRED");
  });
});
