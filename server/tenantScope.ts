import { TRPCError } from "@trpc/server";

export const TENANT_HEADER = "x-onex-company-id";

export type TenantRequest = {
  headers?: Record<string, string | string[] | undefined>;
};

function headerValue(request: TenantRequest, name: string): string | undefined {
  const value = request.headers?.[name] ?? request.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

export function parseCompanyId(value: unknown): number {
  const companyId = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(companyId) || companyId <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "COMPANY_SCOPE_REQUIRED" });
  }
  return companyId;
}

/**
 * Resolves the company scope from the trusted request context and rejects a
 * body/query companyId that tries to cross that scope. The header is set by
 * the authenticated gateway/session and must never be accepted from an
 * untrusted client without gateway authentication.
 */
export function requireCompanyScope(request: TenantRequest, requestedCompanyId?: unknown): number {
  const scopedCompanyId = parseCompanyId(headerValue(request, TENANT_HEADER));
  if (requestedCompanyId !== undefined && parseCompanyId(requestedCompanyId) !== scopedCompanyId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "COMPANY_SCOPE_MISMATCH" });
  }
  return scopedCompanyId;
}

export function assertCompanyScope(request: TenantRequest, requestedCompanyId: unknown): number {
  return requireCompanyScope(request, requestedCompanyId);
}
