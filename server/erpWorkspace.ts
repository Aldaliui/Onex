export const FISCAL_PERIOD_STATUSES = ["OPEN", "CLOSED"] as const;
export type FiscalPeriodStatus = (typeof FISCAL_PERIOD_STATUSES)[number];

export const ERP_WORKSPACE_ACTIONS = [
  "PERIOD_CREATE",
  "PERIOD_CLOSE",
  "PERIOD_REOPEN",
  "PERIOD_QUERY",
  "ROLE_ASSIGN",
  "ROLE_PERMISSION_EDIT",
] as const;
export type ErpWorkspaceAction = (typeof ERP_WORKSPACE_ACTIONS)[number];

export type ErpWorkspaceRole = "ADMIN" | "ACCOUNTANT" | "SALES" | "INVENTORY" | string;

export const DEFAULT_WORKSPACE_PERMISSIONS: Record<string, readonly ErpWorkspaceAction[]> = {
  ADMIN: [...ERP_WORKSPACE_ACTIONS],
  ACCOUNTANT: ["PERIOD_QUERY", "PERIOD_CLOSE"],
  SALES: ["PERIOD_QUERY"],
  INVENTORY: ["PERIOD_QUERY"],
};

export type FiscalPeriodInput = {
  companyId: number;
  code: string;
  startsOn: Date | string;
  endsOn: Date | string;
};

function asDate(value: Date | string, field: string): Date {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`${field}_INVALID`);
  return date;
}

export function validateFiscalPeriod(input: FiscalPeriodInput): FiscalPeriodInput & { startsOn: Date; endsOn: Date } {
  if (!Number.isInteger(input.companyId) || input.companyId <= 0) throw new Error("COMPANY_ID_INVALID");
  const code = input.code.trim();
  if (!code) throw new Error("FISCAL_PERIOD_CODE_REQUIRED");
  const startsOn = asDate(input.startsOn, "FISCAL_PERIOD_START");
  const endsOn = asDate(input.endsOn, "FISCAL_PERIOD_END");
  if (startsOn >= endsOn) throw new Error("FISCAL_PERIOD_RANGE_INVALID");
  return { ...input, code, startsOn, endsOn };
}

export function assertNoPeriodOverlap(existing: Array<{ startsOn: Date | string; endsOn: Date | string }>, candidate: FiscalPeriodInput): void {
  const next = validateFiscalPeriod(candidate);
  const overlaps = existing.some((period) => {
    const startsOn = asDate(period.startsOn, "FISCAL_PERIOD_START");
    const endsOn = asDate(period.endsOn, "FISCAL_PERIOD_END");
    return next.startsOn < endsOn && next.endsOn > startsOn;
  });
  if (overlaps) throw new Error("FISCAL_PERIOD_OVERLAPS_EXISTING");
}

export function assertWorkspacePermission(role: ErpWorkspaceRole, action: ErpWorkspaceAction): void {
  const permissions = DEFAULT_WORKSPACE_PERMISSIONS[String(role || "").toUpperCase()] || [];
  if (!permissions.includes(action)) throw new Error(`PERMISSION_DENIED:${action}`);
}

export function assertPeriodStatus(status: string, expected: FiscalPeriodStatus): void {
  if (String(status).toUpperCase() !== expected) throw new Error(`FISCAL_PERIOD_EXPECTED_${expected}`);
}

export function buildCloseChecklist(input: { unpostedJournals: number; draftInvoices: number; unbalancedJournals: number }) {
  const checks = [
    { code: "UNPOSTED_JOURNALS", count: input.unpostedJournals, blocking: input.unpostedJournals > 0 },
    { code: "DRAFT_INVOICES", count: input.draftInvoices, blocking: input.draftInvoices > 0 },
    { code: "UNBALANCED_JOURNALS", count: input.unbalancedJournals, blocking: input.unbalancedJournals > 0 },
  ];
  return { checks, canClose: checks.every((check) => !check.blocking) };
}

export function buildFiscalCloseRequest(input: { periodId: number; actor: string; role: ErpWorkspaceRole; requestId: string }) {
  if (!Number.isInteger(input.periodId) || input.periodId <= 0) throw new Error("FISCAL_PERIOD_ID_REQUIRED");
  if (!input.actor.trim()) throw new Error("CLOSE_ACTOR_REQUIRED");
  if (!input.requestId.trim()) throw new Error("CLOSE_REQUEST_ID_REQUIRED");
  assertWorkspacePermission(input.role, "PERIOD_CLOSE");
  return { ...input, actor: input.actor.trim(), requestId: input.requestId.trim(), role: String(input.role).toUpperCase() };
}
