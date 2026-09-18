import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";

const caller = () => appRouter.createCaller({ req: {} as any, res: {} as any, user: { id: 1, openId: "test", name: "Test", email: "test@local", role: "admin" } as any });

describe("sales and purchasing settlement vouchers", () => {
  it("creates and posts a customer receipt against a posted invoice", async () => {
    const api = caller();
    const invoice = await api.invoices.create({ docNo: `RCV-INV-${Date.now()}`, customerId: 1, warehouseId: 1, actor: "voucher.test", lines: [{ itemId: 1, quantity: "1", unitPrice: "100", taxAmount: "15" }] });
    await api.invoices.post({ invoiceId: invoice.invoiceId, actor: "voucher.test" });
    const receipt = await api.vouchers.receiptCreate({ voucherNo: `RCV-${Date.now()}`, customerId: 1, cashAccountCode: "1100", amount: "115", actor: "voucher.test", allocations: [{ invoiceId: invoice.invoiceId, amount: "115" }] });
    expect(receipt.status).toBe("DRAFT");
    expect((await api.vouchers.receiptPost({ voucherId: receipt.id, actor: "voucher.test" })).status).toBe("POSTED");
  });

  it("creates and posts a supplier payment against a posted purchase invoice", async () => {
    const api = caller();
    const invoice = await api.purchases.create({ docNo: `PAY-INV-${Date.now()}`, supplierId: 1, warehouseId: 1, actor: "voucher.test", lines: [{ itemId: 1, quantity: "1", unitPrice: "80", taxAmount: "12" }] });
    await api.purchases.post({ invoiceId: invoice.invoiceId, actor: "voucher.test" });
    const payment = await api.vouchers.paymentCreate({ voucherNo: `PAY-${Date.now()}`, supplierId: 1, cashAccountCode: "1100", amount: "92", actor: "voucher.test", allocations: [{ invoiceId: invoice.invoiceId, amount: "92" }] });
    expect((await api.vouchers.paymentPost({ voucherId: payment.id, actor: "voucher.test" })).status).toBe("POSTED");
  });

  it("rejects allocations whose total differs from the voucher", async () => {
    const api = caller();
    await expect(api.vouchers.receiptCreate({ voucherNo: `BAD-RCV-${Date.now()}`, customerId: 1, cashAccountCode: "1100", amount: "10", actor: "voucher.test", allocations: [{ invoiceId: 1, amount: "9" }] })).rejects.toThrow("VOUCHER_ALLOCATION_MUST_EQUAL_TOTAL");
  });
});
