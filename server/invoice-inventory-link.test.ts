import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";

const caller = () => appRouter.createCaller({ req: {} as any, res: {} as any, user: { id: 1, openId: "trace-test", name: "Trace", email: "trace@local", role: "admin" } as any });

describe("invoice inventory traceability", () => {
  it("links purchase receipt and sales issue to the same batch, serial, and location", async () => {
    const api = caller(); const suffix = Date.now();
    const purchase = await api.purchases.create({ docNo: `TRACE-P-${suffix}`, supplierId: 1, warehouseId: 1, actor: "trace-test", lines: [{ itemId: 1, quantity: "1", unitPrice: "50", taxAmount: "0", unitCode: "EA", batchNo: `B-${suffix}`, expireDate: "2027-12-31", locationId: 1, serials: [`S-${suffix}`] }] });
    expect((await api.purchases.post({ invoiceId: purchase.invoiceId, actor: "trace-test" })).status).toBe("POSTED");
    const sale = await api.invoices.create({ docNo: `TRACE-S-${suffix}`, customerId: 1, warehouseId: 1, actor: "trace-test", lines: [{ itemId: 1, quantity: "1", unitPrice: "75", taxAmount: "0", unitCode: "EA", batchNo: `B-${suffix}`, locationId: 1, serials: [`S-${suffix}`] }] });
    expect((await api.invoices.post({ invoiceId: sale.invoiceId, actor: "trace-test" })).status).toBe("POSTED");
  });

  it("rejects duplicate serials within an invoice line", async () => {
    const api = caller();
    await expect(api.purchases.create({ docNo: `TRACE-BAD-${Date.now()}`, supplierId: 1, warehouseId: 1, actor: "trace-test", lines: [{ itemId: 1, quantity: "2", unitPrice: "50", taxAmount: "0", serials: ["DUP", "DUP"] }] })).rejects.toThrow("DUPLICATE_SERIAL_NUMBER");
  });
});
