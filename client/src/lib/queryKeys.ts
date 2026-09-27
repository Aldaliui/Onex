/** Stable application query keys for refresh and invalidation helpers. */
export const erpQueryKeys = {
  dashboard: ["dashboard"] as const,
  masterData: ["masterData"] as const,
  controlData: ["controlData"] as const,
  accountCatalog: (input?: { search?: string; limit?: number }) =>
    ["windows", "accountCatalog", input ?? {}] as const,
  windowTree: ["windows", "tree"] as const,
  windowList: (input?: { search?: string; domain?: string; limit?: number }) =>
    ["windows", "list", input ?? {}] as const,
  systemSettings: ["systemSettings", "get"] as const,
  systemAdministration: (input?: { search?: string }) =>
    ["systemAdministration", "overview", input ?? {}] as const,
  fiscalPeriods: (companyId = 1) =>
    ["erpWorkspace", "fiscalPeriods", { companyId }] as const,
} as const;
