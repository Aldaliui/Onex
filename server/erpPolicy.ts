export type ErpAction =
  | "INVOICE_CREATE"
  | "INVOICE_APPROVE"
  | "INVOICE_POST"
  | "INVOICE_REVERSE"
  | "PAYMENT_CREATE"
  | "PERIOD_CLOSE"
  | "MASTER_DATA_EDIT"
  | "MIGRATION_RUN";

export type ErpRole = "user" | "admin" | string | undefined;

export type CurrencyPolicy = {
  code: string;
  decimalScale: number;
  rounding: "HALF_UP";
  baseCurrency: string;
};

const defaultPermissions: Record<string, ErpAction[]> = {
  user: ["INVOICE_CREATE", "INVOICE_APPROVE", "INVOICE_POST", "PAYMENT_CREATE", "MASTER_DATA_EDIT"],
  admin: ["INVOICE_CREATE", "INVOICE_APPROVE", "INVOICE_POST", "INVOICE_REVERSE", "PAYMENT_CREATE", "PERIOD_CLOSE", "MASTER_DATA_EDIT", "MIGRATION_RUN"],
};

export function currencyPolicy(input: { code?: string; decimalScale?: number; baseCurrency?: string }): CurrencyPolicy {
  const code = String(input.code || "SAR").trim().toUpperCase();
  const baseCurrency = String(input.baseCurrency || process.env.ONEX_BASE_CURRENCY || "SAR").trim().toUpperCase();
  const decimalScale = input.decimalScale ?? 2;
  if (!/^[A-Z]{3}$/.test(code) || !/^[A-Z]{3}$/.test(baseCurrency)) throw new Error("CURRENCY_CODE_INVALID");
  if (!Number.isInteger(decimalScale) || decimalScale < 0 || decimalScale > 6) throw new Error("CURRENCY_SCALE_INVALID");
  return { code, decimalScale, rounding: "HALF_UP", baseCurrency };
}

export function roundCurrency(value: number | string, policy: CurrencyPolicy): number {
  const amount = Number(value);
  if (!Number.isFinite(amount)) throw new Error("CURRENCY_AMOUNT_INVALID");
  const factor = 10 ** policy.decimalScale;
  return Math.sign(amount) * Math.round(Math.abs(amount) * factor + Number.EPSILON) / factor;
}

export function assertLicensed(module = "ERP"): void {
  const status = String(process.env.ONEX_LICENSE_STATUS || "ACTIVE").toUpperCase();
  const licensedModules = String(process.env.ONEX_LICENSED_MODULES || "ERP,GL,AR,AP,INV").split(",").map((item) => item.trim().toUpperCase()).filter(Boolean);
  if (!["ACTIVE", "TRIAL"].includes(status)) throw new Error("LICENSE_INACTIVE");
  if (!licensedModules.includes(module.toUpperCase()) && !licensedModules.includes("ERP")) throw new Error(`LICENSE_MODULE_NOT_ENABLED:${module}`);
}

export function assertPermission(role: ErpRole, action: ErpAction): void {
  const roleName = String(role || "user");
  const permissions = defaultPermissions[roleName] || [];
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
