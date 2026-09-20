import { describe, expect, it } from "vitest";
import { buildEInvoicePayload, getEInvoiceProvider, verifyEInvoiceWebhook } from "./eInvoicing";
import { createHmac } from "node:crypto";

describe("electronic invoicing API", () => {
  it("builds a normalized invoice payload", () => {
    const payload = buildEInvoicePayload({
      invoiceId: 7,
      docNo: "INV-7",
      createdAt: "2026-09-20T10:00:00.000Z",
      currencyCode: "SAR",
      customerId: 3,
      customerName: "عميل اختبار",
      lines: [{ itemId: 1, quantity: "2", unitPrice: "100", taxAmount: "15" }],
    });
    expect(payload.totals).toEqual({ subtotal: 200, taxTotal: 15, grandTotal: 215 });
    expect(payload.buyer.name).toBe("عميل اختبار");
  });

  it("uses a deterministic local provider when no external URL is configured", async () => {
    const result = await getEInvoiceProvider().submit(buildEInvoicePayload({ invoiceId: 8, docNo: "INV-8", createdAt: new Date(), currencyCode: "SAR", lines: [{ itemId: 1, quantity: 1, unitPrice: 10, taxAmount: 0 }] }), "EINV:8");
    expect(result.status).toBe("ACCEPTED");
    expect(result.externalId).toBe("LOCAL-INV-8");
  });

  it("verifies signed callbacks when a webhook secret is configured", () => {
    const previous = process.env.EINVOICE_WEBHOOK_SECRET;
    process.env.EINVOICE_WEBHOOK_SECRET = "secret";
    const body = JSON.stringify({ invoiceId: 7, status: "ACCEPTED" });
    const signature = createHmac("sha256", "secret").update(body).digest("hex");
    expect(verifyEInvoiceWebhook(body, `sha256=${signature}`)).toBe(true);
    expect(verifyEInvoiceWebhook(body, "sha256=bad")).toBe(false);
    if (previous === undefined) delete process.env.EINVOICE_WEBHOOK_SECRET; else process.env.EINVOICE_WEBHOOK_SECRET = previous;
  });
});
