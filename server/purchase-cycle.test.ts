import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";

const caller = () => appRouter.createCaller({ req: {} as any, res: {} as any, user: { id: 1, openId: "purchase-cycle-test", name: "Purchase", email: "purchase@local", role: "admin" } as any });

describe("atomic purchase cycle", () => {
  it("creates, approves, receives and posts a purchase order once", async () => {
    const api = caller();
    const suffix = Date.now();
    const order = await api.purchases.orderCreate({ orderNo: `PO-${suffix}`, supplierId: 1, warehouseId: 1, actor: "purchase-test", lines: [{ itemId: 1, quantity: "4", unitPrice: "25", taxAmount: "0" }] });
    expect(order.status).toBe("DRAFT");
    await expect(api.purchases.orderApprove({ orderId: Number(order.id), actor: "purchase-test" })).resolves.toMatchObject({ status: "APPROVED" });
    const receipt = await api.purchases.receiptCreate({ receiptNo: `GRN-${suffix}`, purchaseOrderId: Number(order.id), actor: "purchase-test", lines: [{ purchaseOrderLineId: 1, itemId: 1, quantity: "4", unitCost: "25" }] });
    const posted = await api.purchases.receiptPost({ receiptId: Number(receipt.id), actor: "purchase-test" });
    expect(posted).toMatchObject({ status: "POSTED", purchaseOrderStatus: "FULLY_RECEIVED" });
    await expect(api.purchases.receiptPost({ receiptId: Number(receipt.id), actor: "purchase-test" })).rejects.toThrow("GOODS_RECEIPT_NOT_POSTABLE");
  });
});
