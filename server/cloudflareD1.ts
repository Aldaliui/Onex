type CloudD1Config = {
  workerUrl: string;
  token?: string;
  actor: string;
  companyId: string;
};

function config(): CloudD1Config | null {
  const enabled = process.env.ONEX_STORAGE === "D1" || process.env.ONEX_USE_CLOUDFLARE_D1 === "1";
  const workerUrl = process.env.CLOUDFLARE_WORKER_URL?.trim();
  if (!enabled || !workerUrl) return null;
  return {
    workerUrl: workerUrl.replace(/\/$/, ""),
    token: process.env.ONEX_API_TOKEN?.trim() || undefined,
    actor: process.env.ONEX_ACTOR?.trim() || "workbench.user",
    companyId: process.env.ONEX_COMPANY_ID?.trim() || "1",
  };
}

export function isCloudflareD1Enabled() {
  return Boolean(config());
}

async function request<T>(path: string, init: RequestInit = {}, write = false): Promise<T> {
  const settings = config();
  if (!settings) throw new Error("CLOUDFLARE_D1_NOT_CONFIGURED");
  if (write && !settings.token) throw new Error("CLOUDFLARE_API_TOKEN_NOT_CONFIGURED");
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  if (init.body) headers.set("content-type", "application/json");
  if (write) {
    headers.set("authorization", `Bearer ${settings.token}`);
    headers.set("x-onex-actor", settings.actor);
    headers.set("x-onex-company-id", settings.companyId);
  }
  const response = await fetch(`${settings.workerUrl}${path}`, { ...init, headers });
  const body = (await response.json().catch(() => ({}))) as T & { error?: string; details?: string };
  if (!response.ok) throw new Error(body.error || body.details || `CLOUDFLARE_D1_HTTP_${response.status}`);
  return body;
}

export async function getCloudMasterData() {
  return request<{
    companies: unknown[];
    customers: unknown[];
    suppliers: unknown[];
    items: unknown[];
    warehouses: unknown[];
    currencies: unknown[];
  }>("/api/erp/master-data");
}

export async function createCloudSalesInvoice(input: Record<string, unknown>) {
  return request<Record<string, unknown>>("/api/erp/invoices", {
    method: "POST",
    body: JSON.stringify({ ...input, sourceForm: "ARST004" }),
  }, true);
}

export async function postCloudSalesInvoice(invoiceId: number) {
  return request<Record<string, unknown>>(`/api/erp/invoices/${invoiceId}/post`, {
    method: "POST",
    body: JSON.stringify({}),
  }, true);
}

export async function reverseCloudSalesInvoice(invoiceId: number) {
  return request<Record<string, unknown>>(`/api/erp/invoices/${invoiceId}/reverse`, {
    method: "POST",
    body: JSON.stringify({}),
  }, true);
}
