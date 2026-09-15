import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const ctx = { user: { id: 1, openId: "unit", role: "admin" } as any, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] } as TrpcContext;

describe("ERP control and inventory flows", () => {
  it("exposes branches, accounts, and open fiscal periods", async () => {
    const data = await appRouter.createCaller(ctx).controlData();
    expect(data.branches.length).toBeGreaterThan(0);
    expect(data.accounts.some((account) => account.code === "4100")).toBe(true);
    expect(data.fiscalPeriods.some((period) => period.status === "OPEN")).toBe(true);
  });

  it("creates a balanced account and receives stock", async () => {
    const api = appRouter.createCaller(ctx);
    const account = await api.windows.saveAccount({ code: `TEST-${Date.now()}`, name: "حساب اختبار", accountType: "ASSET" });
    expect(account?.code).toContain("TEST-");
    const receipt = await api.inventory.receive({ itemId: 1, warehouseId: 1, quantity: "3", unitCost: "50", reference: `GRN-${Date.now()}` });
    expect(receipt.status).toBe("RECEIVED");
  });

  it("creates automatic subledger accounts for financial entities", async () => {
    const api = appRouter.createCaller(ctx);
    const suffix = Date.now();
    const customer = await api.windows.saveCustomer({ code: `CUST-${suffix}`, legalName: "عميل مربوط" });
    const supplier = await api.windows.saveSupplier({ code: `SUP-${suffix}`, legalName: "مورد مربوط" });
    const cash = await api.windows.saveCashBox({ code: `CASH-${suffix}`, name: "صندوق مربوط" });
    const bank = await api.windows.saveBank({ code: `BANK-${suffix}`, name: "بنك مربوط", accountNumber: "123" });
    expect(customer?.accountId).toBeTruthy();
    expect(supplier?.accountId).toBeTruthy();
    expect(cash?.accountId).toBeTruthy();
    expect(bank?.accountId).toBeTruthy();
    const control = await api.controlData();
    expect(control.accounts.find((account) => account.id === customer?.accountId)?.code).toMatch(/^1200-/);
    expect(control.accounts.find((account) => account.id === supplier?.accountId)?.code).toMatch(/^2100-/);
    expect(control.accounts.find((account) => account.id === cash?.accountId)?.code).toMatch(/^1100-/);
    expect(control.accounts.find((account) => account.id === bank?.accountId)?.code).toMatch(/^1110-/);
  });

  it("supports real window CRUD for users, branches, and warehouses", async () => {
    const api = appRouter.createCaller(ctx);
    const suffix = Date.now();
    const user = await api.windows.saveSystemUser({ openId: `window-user-${suffix}`, name: "مستخدم نافذة", email: `window-${suffix}@example.com`, role: "user" });
    const branch = await api.windows.saveBranch({ code: `BR-${suffix}`, name: "فرع النافذة" });
    const warehouse = await api.windows.saveWarehouse({ code: `WH-${suffix}`, name: "مستودع النافذة" });
    expect(user?.openId).toContain("window-user-");
    expect(branch?.code).toBe(`BR-${suffix}`);
    expect(warehouse?.code).toBe(`WH-${suffix}`);
    const branchRows = await api.windows.records({ legacyForm: "ERP_DBA_DFLT_DATA", search: `BR-${suffix}`, limit: 10 });
    const warehouseRows = await api.windows.records({ legacyForm: "MRPACS004", search: `WH-${suffix}`, limit: 10 });
    expect(branchRows.some((row: any) => row.code === `BR-${suffix}`)).toBe(true);
    expect(warehouseRows.some((row: any) => row.code === `WH-${suffix}`)).toBe(true);
  });
});
