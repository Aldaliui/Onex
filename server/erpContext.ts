export type ErpContextInput = {
  companyId: number;
  branchId?: number | null;
  warehouseId?: number | null;
  fiscalPeriodId?: number | null;
  currencyCode?: string;
  languageCode?: string;
};

export type NormalizedErpContext = {
  companyId: number;
  branchId: number | null;
  warehouseId: number | null;
  fiscalPeriodId: number | null;
  currencyCode: string;
  languageCode: string;
};

export type ErpContextEvent = {
  userId: number;
  actor: string;
  actionCode: "CONTEXT_SET" | "CONTEXT_CLEAR";
  requestId: string;
  previous: NormalizedErpContext | null;
  next: NormalizedErpContext | null;
};

function optionalPositive(value: number | null | undefined, field: string): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${field}_INVALID`);
  return value;
}

export function normalizeErpContext(input: ErpContextInput): NormalizedErpContext {
  if (!Number.isInteger(input.companyId) || input.companyId <= 0) throw new Error("CONTEXT_COMPANY_REQUIRED");
  const currencyCode = String(input.currencyCode || "SAR").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currencyCode)) throw new Error("CONTEXT_CURRENCY_INVALID");
  const languageCode = String(input.languageCode || "ar").trim().toLowerCase();
  if (!/^[a-z]{2}(?:-[A-Z]{2})?$/.test(languageCode)) throw new Error("CONTEXT_LANGUAGE_INVALID");
  return {
    companyId: input.companyId,
    branchId: optionalPositive(input.branchId, "CONTEXT_BRANCH"),
    warehouseId: optionalPositive(input.warehouseId, "CONTEXT_WAREHOUSE"),
    fiscalPeriodId: optionalPositive(input.fiscalPeriodId, "CONTEXT_PERIOD"),
    currencyCode,
    languageCode,
  };
}

export function buildContextEvent(input: { userId: number; actor: string; requestId: string; previous: NormalizedErpContext | null; next: NormalizedErpContext | null }): ErpContextEvent {
  if (!Number.isInteger(input.userId) || input.userId <= 0) throw new Error("CONTEXT_USER_REQUIRED");
  if (!input.actor.trim()) throw new Error("CONTEXT_ACTOR_REQUIRED");
  if (!input.requestId.trim()) throw new Error("CONTEXT_REQUEST_ID_REQUIRED");
  return {
    userId: input.userId,
    actor: input.actor.trim(),
    actionCode: input.next ? "CONTEXT_SET" : "CONTEXT_CLEAR",
    requestId: input.requestId.trim(),
    previous: input.previous,
    next: input.next,
  };
}
