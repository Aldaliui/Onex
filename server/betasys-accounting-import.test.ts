import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type ChartAccount = { code: string; name: string; accountType: string; parentCode?: string; allowPosting: number };

const chart = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "config/chart-of-accounts/default-ar.json"), "utf8")) as { accounts: ChartAccount[] };
const context = { user: { id: 1, openId: "betasys-import-test", role: "admin" } as any, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] } as TrpcContext;

describe("BetaSys accounting transfer", () => {
  it("keeps every chart parent resolvable and classifies posting accounts", () => {
    const codes = new Set(chart.accounts.map((account) => account.code));
    expect(chart.accounts.length).toBeGreaterThanOrEqual(20);
    for (const account of chart.accounts) {
      if (account.parentCode) expect(codes.has(account.parentCode)).toBe(true);
      if (account.allowPosting === 0) expect(chart.accounts.some((child) => child.parentCode === account.code)).toBe(true);
    }
  });

  it("imports a legacy-shaped parent and child without losing hierarchy", async () => {
    const api = appRouter.createCaller(context);
    const suffix = Date.now();
    const parent = `BS${suffix}`;
    const child = `${parent}-01`;
    const result = await api.windows.importAccounts({
      actor: "betasys-transfer-test",
      rows: [
        { code: parent, name: "BetaSys أصول اختبار", accountType: "ASSET", active: 1 },
        { code: child, name: "BetaSys صندوق اختبار", accountType: "ASSET", parentCode: parent, active: 1 },
      ],
    });
    expect(result.imported).toBe(2);
    const rows = await api.windows.accountCatalog({ search: parent, limit: 20 });
    expect(rows.some((row: any) => row.code === parent)).toBe(true);
    expect(rows.some((row: any) => row.code === child && row.parentCode === parent)).toBe(true);
  });

  it("rejects duplicate codes before a migration batch is applied", async () => {
    const api = appRouter.createCaller(context);
    const code = `BSDUP${Date.now()}`;
    await expect(api.windows.importAccounts({ rows: [
      { code, name: "نسخة أولى", accountType: "ASSET" },
      { code, name: "نسخة ثانية", accountType: "ASSET" },
    ] })).rejects.toThrow("ACCOUNT_IMPORT_DUPLICATE_CODE");
  });
});
