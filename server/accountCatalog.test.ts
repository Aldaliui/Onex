import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const ctx = { user: { id: 1, openId: "account-catalog-test", role: "admin" } as any, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] } as TrpcContext;

describe("account catalog phase 1-2", () => {
  it("imports a parent and child atomically and exposes hierarchy metadata", async () => {
    const api = appRouter.createCaller(ctx); const suffix = Date.now(); const parent = `T${suffix}`; const child = `${parent}-01`;
    const result = await api.windows.importAccounts({ rows: [{ code: parent, name: "اختبار أصول", accountType: "ASSET" }, { code: child, name: "اختبار نقدية", accountType: "ASSET", parentCode: parent }] });
    expect(result.imported).toBe(2);
    const catalog = await api.windows.accountCatalog({ search: parent, limit: 20 });
    expect(catalog.some((row: any) => row.code === parent)).toBe(true);
    expect(catalog.some((row: any) => row.code === child && row.parentCode === parent)).toBe(true);
  });

  it("rejects invalid account hierarchy and duplicate import codes", async () => {
    const api = appRouter.createCaller(ctx); const suffix = Date.now();
    await expect(api.windows.saveAccount({ code: `SELF-${suffix}`, name: "حساب ذاتي", accountType: "ASSET", parentCode: `SELF-${suffix}` })).rejects.toThrow("ACCOUNT_PARENT_SELF_REFERENCE");
    await expect(api.windows.importAccounts({ rows: [{ code: `DUP-${suffix}`, name: "أول", accountType: "ASSET" }, { code: `DUP-${suffix}`, name: "ثانٍ", accountType: "ASSET" }] })).rejects.toThrow("ACCOUNT_IMPORT_DUPLICATE_CODE");
  });
});
