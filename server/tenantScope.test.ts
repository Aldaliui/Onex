import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { assertCompanyScope, parseCompanyId, requireCompanyScope } from "./tenantScope";

describe("company tenant scope", () => {
  const request = { headers: { "x-onex-company-id": "7" } };

  it("accepts a valid authenticated company scope", () => {
    expect(requireCompanyScope(request, 7)).toBe(7);
    expect(assertCompanyScope(request, "7")).toBe(7);
  });

  it("rejects requests without a positive company scope", () => {
    expect(() => requireCompanyScope({ headers: {} }, 7)).toThrowError(TRPCError);
    expect(() => parseCompanyId(0)).toThrowError(TRPCError);
  });

  it("rejects cross-company reads and writes", () => {
    expect(() => requireCompanyScope(request, 8)).toThrowError("COMPANY_SCOPE_MISMATCH");
  });
});
