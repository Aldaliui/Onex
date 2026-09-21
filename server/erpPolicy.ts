import { currencyPolicy, roundCurrency, type CurrencyPolicy } from "../packages/erp-domain-core/shared/money";

export type ErpAction = "INVOICE_CREATE" | "INVOICE_APPROVE" | "INVOICE_POST" | "INVOICE_REVERSE" | "PURCHASE_ORDER_CREATE" | "PURCHASE_ORDER_APPROVE" | "GOODS_RECEIPT_CREATE" | "GOODS_RECEIPT_POST" | "SALES_ORDER_CREATE" | "SALES_ORDER_APPROVE" | "GOODS_ISSUE_CREATE" | "GOODS_ISSUE_POST" | "SALES_RETURN_CREATE" | "SALES_RETURN_POST" | "PAYMENT_CREATE" | "PERIOD_CLOSE" | "MASTER_DATA_EDIT" | "MIGRATION_RUN";
export type ErpRole = "user" | "admin" | string | undefined;
export { currencyPolicy, roundCurrency };
export type { CurrencyPolicy };

const defaultPermissions: Record<string, ErpAction[]> = {
  user: ["INVOICE_CREATE", "INVOICE_APPROVE", "INVOICE_POST", "PURCHASE_ORDER_CREATE", "PURCHASE_ORDER_APPROVE", "GOODS_RECEIPT_CREATE", "GOODS_RECEIPT_POST", "SALES_ORDER_CREATE", "SALES_ORDER_APPROVE", "GOODS_ISSUE_CREATE", "GOODS_ISSUE_POST", "PAYMENT_CREATE", "MASTER_DATA_EDIT"],
  admin: ["INVOICE_CREATE", "INVOICE_APPROVE", "INVOICE_POST", "INVOICE_REVERSE", "PURCHASE_ORDER_CREATE", "PURCHASE_ORDER_APPROVE", "GOODS_RECEIPT_CREATE", "GOODS_RECEIPT_POST", "SALES_ORDER_CREATE", "SALES_ORDER_APPROVE", "GOODS_ISSUE_CREATE", "GOODS_ISSUE_POST", "SALES_RETURN_CREATE", "SALES_RETURN_POST", "PAYMENT_CREATE", "PERIOD_CLOSE", "MASTER_DATA_EDIT", "MIGRATION_RUN"],
};

export function assertExchangeRate(value: number | string): number {
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("EXCHANGE_RATE_INVALID");
  return rate;
}

export function assertLicensed(module = "ERP"): void {
  const status = String(process.env.ONEX_LICENSE_STATUS || "ACTIVE").toUpperCase();
  const licensedModules = String(process.env.ONEX_LICENSED_MODULES || "ERP,GL,AR,AP,INV").split(",").map((item) => item.trim().toUpperCase()).filter(Boolean);
  if (!["ACTIVE", "TRIAL"].includes(status)) throw new Error("LICENSE_INACTIVE");
  if (!licensedModules.includes(module.toUpperCase()) && !licensedModules.includes("ERP")) throw new Error(`LICENSE_MODULE_NOT_ENABLED:${module}`);
}

export function assertPermission(role: ErpRole, action: ErpAction): void {
  const permissions = defaultPermissions[String(role || "user")] || [];
  const extra = String(process.env.ONEX_ROLE_PERMISSIONS || "").split(",").map((item) => item.trim()).filter(Boolean);
  if (!permissions.includes(action) && !extra.includes(action) && process.env.ONEX_ENFORCE_PERMISSIONS === "1") throw new Error(`PERMISSION_DENIED:${action}`);
}

export function assertOpenPeriod(period: { status?: string; startsOn?: Date | string; endsOn?: Date | string } | undefined, postingDate: Date | string = new Date()): void {
  if (!period) throw new Error("PERIOD_NOT_FOUND");
  if (!["OPEN", "REOPENED"].includes(String(period.status || "").toUpperCase())) throw new Error("PERIOD_CLOSED");
  const date = new Date(postingDate).getTime();
  const start = new Date(period.startsOn || "").getTime();
  const end = new Date(period.endsOn || "").getTime();
  if (![date, start, end].every(Number.isFinite)) throw new Error("PERIOD_DATE_INVALID");
  if (date < start || date > end) throw new Error("DATE_OUTSIDE_PERIOD");
}

export function assertErpAction(input: { role: ErpRole; action: ErpAction; module?: string }): void {
  assertLicensed(input.module || "ERP");
  assertPermission(input.role, input.action);
}
