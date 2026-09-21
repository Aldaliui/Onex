export const SOURCE_SYSTEMS = ["ONEX", "MIDO", "BETASYS", "ORACLE", "ACCESS", "MANUAL"] as const;
export type SourceSystem = (typeof SOURCE_SYSTEMS)[number];

export const ERP_ENTITY_TYPES = ["ACCOUNT", "ITEM", "CUSTOMER", "SUPPLIER", "INVOICE", "JOURNAL", "PAYMENT", "STOCK_MOVEMENT"] as const;
export type ErpEntityType = (typeof ERP_ENTITY_TYPES)[number];

export const DOCUMENT_TYPES = ["SALES_INVOICE", "PURCHASE_INVOICE", "SALES_RETURN", "PURCHASE_RETURN", "JOURNAL", "RECEIPT", "PAYMENT"] as const;
export type ErpDocumentType = (typeof DOCUMENT_TYPES)[number];

export type SourceRef = {
  sourceSystem: SourceSystem;
  sourceId: string;
  sourceHash?: string;
  migrationBatchId?: string;
};

export type AccountContract = SourceRef & {
  entityType: "ACCOUNT";
  companyId: number;
  code: string;
  name: string;
  accountType: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
  parentCode?: string;
  currencyCode: string;
  active: boolean;
};

export type ItemContract = SourceRef & {
  entityType: "ITEM";
  companyId: number;
  code: string;
  name: string;
  unitCode: string;
  currencyCode: string;
  stockFlag: boolean;
  unitCost: string;
  salePrice: string;
  active: boolean;
};

export type CustomerContract = SourceRef & {
  entityType: "CUSTOMER";
  companyId: number;
  code: string;
  legalName: string;
  currencyCode: string;
  status: "ACTIVE" | "BLOCKED" | "CLOSED";
};

export class ErpContractError extends Error {
  constructor(public readonly code: string, message = code, public readonly details?: Record<string, unknown>) {
    super(message);
    this.name = "ErpContractError";
  }
}

function requiredText(value: unknown, code: string, maxLength: number): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new ErpContractError(code);
  if (normalized.length > maxLength) throw new ErpContractError(`${code}_TOO_LONG`);
  return normalized;
}

export function normalizeDecimal(value: unknown, field = "DECIMAL", scale = 6): string {
  const raw = String(value ?? "").trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(raw)) throw new ErpContractError(`${field}_INVALID`);
  const [integer, fraction = ""] = raw.split(".");
  if (fraction.length > scale) throw new ErpContractError(`${field}_SCALE_EXCEEDED`, `${field}_SCALE_EXCEEDED: ${field} supports at most ${scale} decimal places`);
  return `${integer}.${fraction.padEnd(scale, "0")}`;
}

export function normalizeCurrency(value: unknown): string {
  const currency = requiredText(value, "CURRENCY_REQUIRED", 3).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new ErpContractError("CURRENCY_INVALID");
  return currency;
}

export function normalizeSourceRef(input: Partial<SourceRef>): SourceRef {
  const sourceSystem = String(input.sourceSystem || "").trim().toUpperCase() as SourceSystem;
  if (!(SOURCE_SYSTEMS as readonly string[]).includes(sourceSystem)) throw new ErpContractError("SOURCE_SYSTEM_INVALID");
  const sourceId = requiredText(input.sourceId, "SOURCE_ID_REQUIRED", 160);
  const sourceHash = input.sourceHash ? requiredText(input.sourceHash, "SOURCE_HASH_INVALID", 128) : undefined;
  const migrationBatchId = input.migrationBatchId ? requiredText(input.migrationBatchId, "MIGRATION_BATCH_INVALID", 160) : undefined;
  return { sourceSystem, sourceId, sourceHash, migrationBatchId };
}

export function assertNonNegativeMoney(value: unknown, field: string): string {
  const normalized = normalizeDecimal(value, field);
  if (normalized.startsWith("-")) throw new ErpContractError(`${field}_NEGATIVE`);
  return normalized;
}

export function buildImportKey(ref: SourceRef, entityType: ErpEntityType): string {
  const normalized = normalizeSourceRef(ref);
  return `${entityType}:${normalized.sourceSystem}:${normalized.sourceId}`;
}

export function validateAccountContract(input: Partial<AccountContract>): AccountContract {
  const source = normalizeSourceRef(input);
  const code = requiredText(input.code, "ACCOUNT_CODE_REQUIRED", 80).toUpperCase();
  const name = requiredText(input.name, "ACCOUNT_NAME_REQUIRED", 240);
  const accountType = String(input.accountType || "").trim().toUpperCase() as AccountContract["accountType"];
  if (!["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"].includes(accountType)) throw new ErpContractError("ACCOUNT_TYPE_INVALID");
  const companyId = Number(input.companyId || 0);
  if (!Number.isInteger(companyId) || companyId <= 0) throw new ErpContractError("COMPANY_ID_INVALID");
  return { ...source, entityType: "ACCOUNT", companyId, code, name, accountType, parentCode: input.parentCode?.trim() || undefined, currencyCode: normalizeCurrency(input.currencyCode || "SAR"), active: input.active !== false };
}

export function validateItemContract(input: Partial<ItemContract>): ItemContract {
  const source = normalizeSourceRef(input);
  const companyId = Number(input.companyId || 0);
  if (!Number.isInteger(companyId) || companyId <= 0) throw new ErpContractError("COMPANY_ID_INVALID");
  return { ...source, entityType: "ITEM", companyId, code: requiredText(input.code, "ITEM_CODE_REQUIRED", 80), name: requiredText(input.name, "ITEM_NAME_REQUIRED", 500), unitCode: requiredText(input.unitCode || "EA", "ITEM_UNIT_REQUIRED", 30), currencyCode: normalizeCurrency(input.currencyCode || "SAR"), stockFlag: input.stockFlag !== false, unitCost: assertNonNegativeMoney(input.unitCost ?? "0", "ITEM_UNIT_COST"), salePrice: assertNonNegativeMoney(input.salePrice ?? "0", "ITEM_SALE_PRICE"), active: input.active !== false };
}

export function validateCustomerContract(input: Partial<CustomerContract>): CustomerContract {
  const source = normalizeSourceRef(input);
  const companyId = Number(input.companyId || 0);
  if (!Number.isInteger(companyId) || companyId <= 0) throw new ErpContractError("COMPANY_ID_INVALID");
  const status = String(input.status || "ACTIVE").trim().toUpperCase() as CustomerContract["status"];
  if (!["ACTIVE", "BLOCKED", "CLOSED"].includes(status)) throw new ErpContractError("CUSTOMER_STATUS_INVALID");
  return { ...source, entityType: "CUSTOMER", companyId, code: requiredText(input.code, "CUSTOMER_CODE_REQUIRED", 80), legalName: requiredText(input.legalName, "CUSTOMER_NAME_REQUIRED", 250), currencyCode: normalizeCurrency(input.currencyCode || "SAR"), status };
}
