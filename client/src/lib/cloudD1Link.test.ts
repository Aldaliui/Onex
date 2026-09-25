import { describe, expect, it } from "vitest";
import { mapOperation, mapOutput } from "./cloudD1Link";

describe("Cloud D1 tRPC procedure mappings", () => {
  it.each([
    ["inventory.warehouses", "/warehouses"],
    ["erpWorkspace.fiscalPeriods", "/fiscal-periods"],
  ])("maps %s to the Cloud D1 GET endpoint", (path, expectedPath) => {
    expect(mapOperation({ path, input: { companyId: 1 } } as any)).toEqual([expectedPath, "GET"]);
  });

  it("normalizes list responses from arrays and common envelopes", () => {
    const warehouse = { id: 1, code: "MAIN" };
    const period = { id: 1, code: "2026-01" };
    expect(mapOutput({ path: "inventory.warehouses" } as any, [warehouse])).toEqual([warehouse]);
    expect(mapOutput({ path: "inventory.warehouses" } as any, { rows: [warehouse] })).toEqual([warehouse]);
    expect(mapOutput({ path: "erpWorkspace.fiscalPeriods" } as any, { fiscalPeriods: [period] })).toEqual([period]);
    expect(mapOutput({ path: "erpWorkspace.fiscalPeriods" } as any, { unexpected: true })).toEqual([]);
  });
});
