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
    const receipt = await api.inventory.receive({ itemId: 1, context: { companyId: 1, branchId: 1, warehouseId: 1, fiscalPeriodId: 1, currencyCode: "SAR", languageCode: "ar" }, quantity: "3", unitCost: "50", reference: `GRN-${Date.now()}` });
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
    const updatedAccount = await api.windows.saveAccount({ id: account!.id, code: accountCode, name: "حساب CRUD محدث", accountType: "LIABILITY" });

    expect(updatedCustomer?.legalName).toBe("عميل CRUD محدث");
    expect(updatedSupplier?.legalName).toBe("مورد CRUD محدث");
    expect(updatedItem?.description).toBe("صنف CRUD محدث");
    expect(updatedItem?.unitCost).toBe("15.75");
    expect(updatedAccount?.name).toBe("حساب CRUD محدث");
    expect(updatedAccount?.accountType).toBe("LIABILITY");

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
    const updatedUser = await api.windows.saveSystemUser({ id: user!.id, openId: user!.openId, name: "مستخدم نافذة محدث", email: user!.email!, role: "user" });
    const updatedBranch = await api.windows.saveBranch({ id: branch!.id, companyId: 1, code: branch!.code, name: "فرع النافذة محدث" });
    expect(updatedUser?.name).toBe("مستخدم نافذة محدث");
    expect(updatedBranch?.name).toBe("فرع النافذة محدث");
    const branchRows = await api.windows.records({ legacyForm: "ERP_DBA_DFLT_DATA", search: `BR-${suffix}`, limit: 10 });
    const warehouseRows = await api.windows.records({ legacyForm: "MRPACS004", search: `WH-${suffix}`, limit: 10 });
    const userRows = await api.windows.records({ legacyForm: "ERP_DBA", search: `window-user-${suffix}`, limit: 10 });
    expect(branchRows.some((row: any) => row.code === `BR-${suffix}` && row.name === "فرع النافذة محدث")).toBe(true);
    expect(warehouseRows.some((row: any) => row.code === `WH-${suffix}`)).toBe(true);
    expect(userRows.some((row: any) => row.openId === `window-user-${suffix}` && row.name === "مستخدم نافذة محدث")).toBe(true);
    await api.windows.deleteRecord({ legacyForm: "ERP_DBA", id: user!.id });
    await api.windows.deleteRecord({ legacyForm: "ERP_DBA_DFLT_DATA", id: branch!.id });
    await api.windows.deleteRecord({ legacyForm: "MRPACS004", id: warehouse!.id });
    expect((await api.windows.records({ legacyForm: "ERP_DBA", search: `window-user-${suffix}`, limit: 10 })).some((row: any) => row.id === user!.id)).toBe(false);
  });

  it("supports typed currency, tax, document-type, sequence, and item-unit create/update routes", async () => {
    const api = appRouter.createCaller(ctx);
    const suffix = Date.now();
    const currency = await api.coreFoundation.saveCurrency({ code: "QZX", name: `QA currency ${suffix}`, decimalScale: 2, active: 1 });
    const updatedCurrency = await api.coreFoundation.saveCurrency({ code: "QZX", name: `QA currency updated ${suffix}`, decimalScale: 3, active: 1 });
    expect(currency?.code).toBe("QZX");
    expect(updatedCurrency?.name).toContain("updated");
    expect(updatedCurrency?.decimalScale).toBe(3);
    const exchangeRate = await api.coreFoundation.saveExchangeRate({ companyId: 1, currencyCode: "QZX", rateDate: "2035-11-20", rate: "2.5" });
    const initialExchangeRate = exchangeRate?.rate;
    const updatedExchangeRate = await api.coreFoundation.saveExchangeRate({ companyId: 1, currencyCode: "QZX", rateDate: "2035-11-20", rate: "2.75" });
    expect(initialExchangeRate).toBe("2.5");
    expect(updatedExchangeRate?.rate).toBe("2.75");

    const taxCode = `QA${suffix}`;
    const tax = await api.coreFoundation.saveTaxCode({ companyId: 1, code: taxCode, name: "ضريبة اختبار", rate: "5", category: "STANDARD", active: 1 });
    const updatedTax = await api.coreFoundation.saveTaxCode({ companyId: 1, code: taxCode, name: "ضريبة اختبار محدثة", rate: "7", category: "STANDARD", active: 1 });
    expect(tax?.code).toBe(taxCode);
    expect(updatedTax?.name).toBe("ضريبة اختبار محدثة");
    expect(updatedTax?.rate).toBe("7");

    const documentType = `QA_TYPE_${suffix}`;
    const definition = await api.coreFoundation.saveDocumentDefinition({ companyId: 1, documentType, displayName: "نوع اختبار", prefix: "QA-", approvalRequired: 1, postingRequired: 1, active: 1 });
    const updatedDefinition = await api.coreFoundation.saveDocumentDefinition({ companyId: 1, documentType, displayName: "نوع اختبار محدث", prefix: "QAT-", approvalRequired: 0, postingRequired: 1, active: 1 });
    expect(definition?.documentType).toBe(documentType);
    expect(updatedDefinition?.displayName).toBe("نوع اختبار محدث");
    expect(updatedDefinition?.prefix).toBe("QAT-");

    const sequence = await api.coreFoundation.saveDocumentSequence({ companyId: 1, documentType, prefix: "QAT-", nextNumber: 1 });
    const updatedSequence = await api.coreFoundation.saveDocumentSequence({ companyId: 1, documentType, prefix: "QAT-", nextNumber: 42 });
    expect(sequence?.documentType).toBe(documentType);
    expect(updatedSequence?.nextNumber).toBe(42);

    const unitCode = `QA${suffix}`;
    const unit = await api.coreFoundation.saveItemUnit({ itemId: 1, unitCode, unitName: "وحدة اختبار", conversionToBase: "1", isBase: 0, active: 1 });
    const updatedUnit = await api.coreFoundation.saveItemUnit({ itemId: 1, unitCode, unitName: "وحدة اختبار محدثة", conversionToBase: "12", isBase: 0, active: 1 });
    expect(unit?.unitCode).toBe(unitCode);
    expect(updatedUnit?.unitName).toBe("وحدة اختبار محدثة");
    expect(updatedUnit?.conversionToBase).toBe("12");

    const snapshot = await api.coreFoundation.snapshot({ companyId: 1, limit: 200 });
    expect(snapshot.currencies.some((row: any) => row.code === "QZX" && row.decimalScale === 3)).toBe(true);
    expect(snapshot.exchangeRates.some((row: any) => row.currencyCode === "QZX" && row.rate === "2.75")).toBe(true);
    expect(snapshot.taxes.some((row: any) => row.code === taxCode && row.rate === "7")).toBe(true);
    expect(snapshot.documentDefinitions.some((row: any) => row.documentType === documentType && row.displayName === "نوع اختبار محدث")).toBe(true);
    expect(snapshot.documentSequences.some((row: any) => row.documentType === documentType && row.nextNumber === 42)).toBe(true);
    expect(snapshot.units.some((row: any) => row.itemId === 1 && row.unitCode === unitCode && row.conversionToBase === "12")).toBe(true);
  });

  it("creates, closes, and reopens a fiscal period through typed ERP workspace routes", async () => {
    const api = appRouter.createCaller(ctx);
    const suffix = Date.now();
    const year = 2300 + (suffix % 1000);
    const code = `QA-${suffix}`;
    const period = await api.erpWorkspace.createFiscalPeriod({ companyId: 1, code, startsOn: `${year}-01-01T00:00:00.000Z`, endsOn: `${year}-01-31T23:59:59.999Z` });
    expect(period.status).toBe("OPEN");
    expect((await api.erpWorkspace.fiscalPeriods({ companyId: 1 })).some((row) => row.id === period.id && row.code === code)).toBe(true);
    await expect(api.erpWorkspace.createFiscalPeriod({ companyId: 1, code: `${code}-OVERLAP`, startsOn: `${year}-01-15T00:00:00.000Z`, endsOn: `${year}-02-15T00:00:00.000Z` })).rejects.toThrow("FISCAL_PERIOD_OVERLAPS_EXISTING");

    const closed = await api.erpWorkspace.closeFiscalPeriod({ periodId: period.id, requestId: `QA-CLOSE-${suffix}` });
    expect(closed.status).toBe("CLOSED");
    const reopened = await api.erpWorkspace.reopenFiscalPeriod({ periodId: period.id, requestId: `QA-REOPEN-${suffix}` });
    expect(reopened.status).toBe("OPEN");
  });

  it("validates the generic document POST to REVERSE state transition", async () => {
    const api = appRouter.createCaller(ctx);
    await expect(api.coreFoundation.validateTransition({ fromState: "POSTED", toState: "REVERSED" })).resolves.toEqual({ from: "POSTED", to: "REVERSED" });
    await expect(api.coreFoundation.validateTransition({ fromState: "DRAFT", toState: "REVERSED" })).rejects.toThrow("DOCUMENT_TRANSITION_NOT_ALLOWED:DRAFT:REVERSED");
  });

  it("exposes the complete inventory window catalog for the Workbench", async () => {
    const windows = await appRouter.createCaller(ctx).windows.list({ domain: "inventory/stock", limit: 500 });
    expect(windows).toHaveLength(298);
    expect(windows.every((window) => window.domainCode === "inventory/stock")).toBe(true);
    expect(windows.some((window) => window.legacyForm.toUpperCase() === "INVT003.FMX")).toBe(true);
  });
});
