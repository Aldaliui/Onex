import { createHmac, timingSafeEqual } from "node:crypto";

export const E_INVOICE_STATUSES = ["QUEUED", "SUBMITTED", "ACCEPTED", "REJECTED", "FAILED"] as const;
export type EInvoiceStatus = (typeof E_INVOICE_STATUSES)[number];

export type EInvoicePayload = {
  invoiceId: number;
  documentNumber: string;
  issueDate: string;
  currencyCode: string;
  seller: { name: string; taxNumber?: string };
  buyer: { id?: number; name?: string };
  totals: { subtotal: number; taxTotal: number; grandTotal: number };
  lines: Array<{ itemId: number; quantity: number; unitPrice: number; taxAmount: number; lineTotal: number }>;
};

export type EInvoiceProviderResult = {
  status: EInvoiceStatus;
  externalId?: string;
  response?: unknown;
  errorCode?: string;
  errorMessage?: string;
};

export type EInvoiceProvider = {
  name: string;
  submit(payload: EInvoicePayload, idempotencyKey: string): Promise<EInvoiceProviderResult>;
};

function providerConfig() {
  return {
    url: process.env.EINVOICE_PROVIDER_URL?.trim(),
    token: process.env.EINVOICE_PROVIDER_TOKEN?.trim(),
    name: process.env.EINVOICE_PROVIDER_NAME?.trim() || "GENERIC_HTTP",
    webhookSecret: process.env.EINVOICE_WEBHOOK_SECRET?.trim(),
  };
}

function localProvider(): EInvoiceProvider {
  return {
    name: "LOCAL_SANDBOX",
    async submit(payload, idempotencyKey) {
      return { status: "ACCEPTED", externalId: `LOCAL-${payload.documentNumber}`, response: { sandbox: true, idempotencyKey } };
    },
  };
}

function httpProvider(): EInvoiceProvider {
  const config = providerConfig();
  if (!config.url) return localProvider();
  return {
    name: config.name,
    async submit(payload, idempotencyKey) {
      const response = await fetch(config.url!, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          ...(config.token ? { authorization: `Bearer ${config.token}` } : {}),
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return { status: "FAILED", response: body, errorCode: `HTTP_${response.status}`, errorMessage: "E-invoice provider rejected the request" };
      const providerStatus = String((body as any)?.status || "SUBMITTED").toUpperCase();
      const status: EInvoiceStatus = E_INVOICE_STATUSES.includes(providerStatus as EInvoiceStatus) ? (providerStatus as EInvoiceStatus) : "SUBMITTED";
      return { status, externalId: String((body as any)?.externalId || (body as any)?.id || "") || undefined, response: body };
    },
  };
}

export function getEInvoiceProvider() {
  return httpProvider();
}

export function isEInvoiceProviderConfigured() {
  return Boolean(providerConfig().url);
}

export function buildEInvoicePayload(input: {
  invoiceId: number;
  docNo: string;
  createdAt: Date | string;
  currencyCode: string;
  customerId?: number | null;
  customerName?: string | null;
  lines: Array<{ itemId: number; quantity: string | number; unitPrice: string | number; taxAmount: string | number; lineTotal?: string | number }>;
  sellerName?: string;
  sellerTaxNumber?: string;
}) {
  const lines = input.lines.map((line) => {
    const quantity = Number(line.quantity);
    const unitPrice = Number(line.unitPrice);
    const taxAmount = Number(line.taxAmount || 0);
    return { itemId: line.itemId, quantity, unitPrice, taxAmount, lineTotal: line.lineTotal === undefined ? quantity * unitPrice + taxAmount : Number(line.lineTotal) };
  });
  const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  const taxTotal = lines.reduce((sum, line) => sum + line.taxAmount, 0);
  return {
    invoiceId: input.invoiceId,
    documentNumber: input.docNo,
    issueDate: new Date(input.createdAt).toISOString(),
    currencyCode: input.currencyCode || "SAR",
    seller: { name: input.sellerName || process.env.EINVOICE_SELLER_NAME || "ONEX ERP", taxNumber: input.sellerTaxNumber || process.env.EINVOICE_SELLER_TAX_NUMBER },
    buyer: { id: input.customerId || undefined, name: input.customerName || undefined },
    totals: { subtotal, taxTotal, grandTotal: subtotal + taxTotal },
    lines,
  } satisfies EInvoicePayload;
}

export function verifyEInvoiceWebhook(payload: string, signature: string | undefined) {
  const secret = providerConfig().webhookSecret;
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  const received = signature.replace(/^sha256=/i, "");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(received, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
