import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { assertStockRule, calculateMovingAverage, normalizeUnitQuantity, validateSerialSet } from "./inventoryKernel";

const caller = () => appRouter.createCaller({ req: {} as any, res: {} as any, user: { id: 1, openId: "inventory-test", name: "Inventory", email: "inventory@local", role: "admin" } as any });

describe("integrated inventory engine", () => {
  it("calculates moving average and normalized units", () => {
    expect(calculateMovingAverage(10, 1000, 5, 120)).toEqual({ quantity: 15, totalCost: 1600, unitCost: 106.66666666666667 });
    expect(normalizeUnitQuantity(2, 12)).toBe(24);
    expect(() => normalizeUnitQuantity(0, 1)).toThrow("INVALID_UNIT_CONVERSION");
  });

  it("prevents negative stock and duplicate serials", () => {
    expect(assertStockRule({ beforeQuantity: 5, movementQuantity: 3, direction: "OUT" })).toBe(2);
    expect(() => assertStockRule({ beforeQuantity: 5, movementQuantity: 6, direction: "OUT" })).toThrow("INSUFFICIENT_STOCK");
    expect(assertStockRule({ beforeQuantity: 5, movementQuantity: 6, direction: "OUT", allowNegative: true })).toBe(-1);
    expect(() => validateSerialSet(["S-1", "S-1"], 2)).toThrow("DUPLICATE_SERIAL_NUMBER");
  });

  it("receives and transfers stock atomically in local mode", async () => {
    const api = caller();
    const suffix = Date.now();
    await api.inventory.receive({ itemId: 1, context: { companyId: 1, branchId: 1, warehouseId: 1, fiscalPeriodId: 1, currencyCode: "SAR", languageCode: "ar" }, quantity: "10", unitCost: "25", actor: "inventory-test", reference: `RECEIVE-${suffix}` });
    const transfer = await api.inventory.transferCreate({ transferNo: `TR-${suffix}`, sourceWarehouseId: 1, destinationWarehouseId: 2, actor: "inventory-test", lines: [{ itemId: 1, quantity: "4" }] });
    expect(transfer.status).toBe("DRAFT");
    expect((await api.inventory.transferPost({ transferId: transfer.id, actor: "inventory-test" })).status).toBe("POSTED");
    const bad = await api.inventory.transferCreate({ transferNo: `TR-BAD-${suffix}`, sourceWarehouseId: 1, destinationWarehouseId: 2, actor: "inventory-test", lines: [{ itemId: 1, quantity: "1000" }] });
    await expect(api.inventory.transferPost({ transferId: bad.id, actor: "inventory-test" })).rejects.toThrow("INSUFFICIENT_STOCK");
  });
});
