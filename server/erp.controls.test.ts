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

  it("supports real create, update, and search for customer, supplier, item, and account windows", async () => {
    const api = appRouter.createCaller(ctx);
    const suffix = Date.now();
    const customerCode = `CRUD-C-${suffix}`;
    const supplierCode = `CRUD-S-${suffix}`;
    const itemCode = `CRUD-I-${suffix}`;
    const accountCode = `CRUD-A-${suffix}`;

    const customer = await api.windows.saveCustomer({ code: customerCode, legalName: "عميل CRUD أولي" });
    const supplier = await api.windows.saveSupplier({ code: supplierCode, legalName: "مورد CRUD أولي" });
    const item = await api.windows.saveItem({ code: itemCode, description: "صنف CRUD أولي", unitCost: "12.50" });
    const account = await api.windows.saveAccount({ code: accountCode, name: "حساب CRUD أولي", accountType: "ASSET" });

    expect(customer?.id).toBeTruthy();
    expect(supplier?.id).toBeTruthy();
    expect(item?.id).toBeTruthy();
    expect(account?.id).toBeTruthy();

    const updatedCustomer = await api.windows.saveCustomer({ id: customer!.id, code: customerCode, legalName: "عميل CRUD محدث" });
    const updatedSupplier = await api.windows.saveSupplier({ id: supplier!.id, code: supplierCode, legalName: "مورد CRUD محدث" });
    const updatedItem = await api.windows.saveItem({ id: item!.id, code: itemCode, description: "صنف CRUD محدث", unitCost: "15.75" });
    const updatedAccount = await api.windows.saveAccount({ id: account!.id, code: accountCode, name: "حساب CRUD محدث", accountType: "ASSET" });

    expect(updatedCustomer?.legalName).toBe("عميل CRUD محدث");
    expect(updatedSupplier?.legalName).toBe("مورد CRUD محدث");
    expect(updatedItem?.description).toBe("صنف CRUD محدث");
    expect(updatedItem?.unitCost).toBe("15.75");
    expect(updatedAccount?.name).toBe("حساب CRUD محدث");

    const [customerRows, supplierRows, itemRows, accountRows] = await Promise.all([
      api.windows.records({ legacyForm: "ARST003", search: customerCode, limit: 10 }),
      api.windows.records({ legacyForm: "APSI002", search: supplierCode, limit: 10 }),
      api.windows.records({ legacyForm: "INVT003", search: itemCode, limit: 10 }),
      api.windows.records({ legacyForm: "GLST001", search: accountCode, limit: 10 }),
    ]);
    expect(customerRows.some((row: any) => row.code === customerCode && row.legalName === "عميل CRUD محدث")).toBe(true);
    expect(supplierRows.some((row: any) => row.code === supplierCode && row.legalName === "مورد CRUD محدث")).toBe(true);
    expect(itemRows.some((row: any) => row.code === itemCode && row.description === "صنف CRUD محدث")).toBe(true);
    expect(accountRows.some((row: any) => row.code === accountCode && row.name === "حساب CRUD محدث")).toBe(true);
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
    const userRows = await api.windows.records({ legacyForm: "ERP_DBA", search: `window-user-${suffix}`, limit: 10 });
    expect(branchRows.some((row: any) => row.code === `BR-${suffix}`)).toBe(true);
    expect(warehouseRows.some((row: any) => row.code === `WH-${suffix}`)).toBe(true);
    expect(userRows.some((row: any) => row.openId === `window-user-${suffix}`)).toBe(true);
    await api.windows.deleteRecord({ legacyForm: "ERP_DBA", id: user!.id });
    await api.windows.deleteRecord({ legacyForm: "ERP_DBA_DFLT_DATA", id: branch!.id });
    await api.windows.deleteRecord({ legacyForm: "MRPACS004", id: warehouse!.id });
    expect((await api.windows.records({ legacyForm: "ERP_DBA", search: `window-user-${suffix}`, limit: 10 })).some((row: any) => row.id === user!.id)).toBe(false);
  });

  it("exposes the complete inventory window catalog for the Workbench", async () => {
    const windows = await appRouter.createCaller(ctx).windows.list({ domain: "inventory/stock", limit: 500 });
    expect(windows).toHaveLength(298);
    expect(windows.every((window) => window.domainCode === "inventory/stock")).toBe(true);
    expect(windows.some((window) => window.legacyForm.toUpperCase() === "INVT003.FMX")).toBe(true);
  });
});
