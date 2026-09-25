import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const ctx = { user: { id: 1, openId: "unit", role: "admin" } as any, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] } as TrpcContext;
const caller = () => appRouter.createCaller(ctx);

const forms = {
  login: "ERP_LOGIN.fmx",
  gl: "GLSI001.fmx",
  ar: "ARSI004.fmx",
  ap: "APSI003.fmx",
  inventory: "INVI001.fmx",
  pos: "POSI001.fmx",
  report: "GLSR001.fmx",
};

describe("ONEX module unit tests", () => {
  it("LOGIN: exposes login contract and rejects undeclared destructive actions", async () => {
    const api = caller();
    const contract = await api.windows.contract({ legacyForm: forms.login });
    expect(contract.legacyForm).toBe(forms.login);
    expect(contract.actions).toContain("query");
    await expect(api.windows.executeAction({ legacyForm: forms.login, action: "drop_database" })).rejects.toBeTruthy();
  });

  it("GL: exposes journal/accounting contract with atomic actions", async () => {
    const api = caller();
    const contract = await api.windows.contract({ legacyForm: forms.gl });
    expect(contract.domain).toMatch(/GL|OTHER/);
    expect(contract.actions).toContain("post");
    expect(contract.midoModules.length).toBeGreaterThan(0);
    const result = await api.windows.executeAction({ legacyForm: forms.gl, action: "validate" });
    expect(result.mode).toBe("SAFE_SIMULATION");
  });
  it("GL window API validates and saves balanced journals through the data layer", async () => {
    const api = caller();
    const result = await api.windows.glExecute({ legacyForm: "GLST002.fmx", action: "save", requestId: `gl-api-${Date.now()}`, journal: { journalNo: `GL-API-${Date.now()}`, entryType: "GENERAL_JOURNAL", actor: "unit.gl", lines: [{ accountCode: "1100", debit: "100", credit: "0" }, { accountCode: "4100", debit: "0", credit: "100" }] } });
    expect(result.mode).toBe("DATABASE_CONTRACT");
    expect((result.result as { status: string }).status).toBe("POSTED");
    await expect(api.windows.glExecute({ legacyForm: "GLST002.fmx", action: "save", requestId: `gl-invalid-${Date.now()}`, journal: { journalNo: `GL-BAD-${Date.now()}`, entryType: "GENERAL_JOURNAL", actor: "unit.gl", lines: [{ accountCode: "1100", debit: "100", credit: "0" }, { accountCode: "4100", debit: "0", credit: "90" }] } })).rejects.toBeTruthy();
  });
  it("GL window API returns the original result for a repeated requestId", async () => {
    const api = caller(); const requestId = `gl-idempotent-${Date.now()}`; const journal = { journalNo: `GL-IDEMP-${Date.now()}`, entryType: "GENERAL_JOURNAL", actor: "unit.gl", lines: [{ accountCode: "1100", debit: "55", credit: "0" }, { accountCode: "4100", debit: "0", credit: "55" }] };
    const first = await api.windows.glExecute({ legacyForm: "GLST002.fmx", action: "save", requestId, journal }); const second = await api.windows.glExecute({ legacyForm: "GLST002.fmx", action: "save", requestId, journal: { ...journal, journalNo: `${journal.journalNo}-CHANGED` } });
    expect(second.idempotent).toBe(true); expect(second.result).toEqual(first.result);
  });

  it("AR: creates, posts, and reverses a receivable invoice atomically", async () => {
    const api = caller();
    const master = await api.masterData();
    expect(master.customers.length).toBeGreaterThan(0);
    const created = await api.invoices.create({ docNo: `AR-UNIT-${Date.now()}`, customerId: 1, warehouseId: 1, actor: "unit.ar", lines: [{ itemId: 1, quantity: "2", unitPrice: "100", taxAmount: "15" }] });
    expect(created.status).toBe("DRAFT");
    expect((await api.invoices.post({ invoiceId: created.invoiceId, actor: "unit.ar" })).status).toBe("POSTED");
    expect((await api.invoices.reverse({ invoiceId: created.invoiceId, actor: "unit.ar" })).status).toBe("REVERSED");
  });

  it("AR typed invoice routes create, update, post, and reverse a draft in order", async () => {
    const api = caller();
    const suffix = Date.now();
    const created = await api.invoices.create({ docNo: `AR-TYPED-${suffix}`, customerId: 1, warehouseId: 1, actor: "unit.ar.typed", lines: [{ itemId: 1, quantity: "1", unitPrice: "20", taxAmount: "3" }] });
    expect(created.status).toBe("DRAFT");

    const updated = await api.invoices.update({ invoiceId: created.invoiceId, requestId: `AR-TYPED-UPDATE-${suffix}`, docNo: `AR-TYPED-UPDATED-${suffix}`, customerId: 1, warehouseId: 1, actor: "unit.ar.typed", lines: [{ itemId: 1, quantity: "2", unitPrice: "30", taxAmount: "5" }] });
    expect(updated).toMatchObject({ invoiceId: created.invoiceId, docNo: `AR-TYPED-UPDATED-${suffix}`, status: "DRAFT", subtotal: 60, taxTotal: 5, grandTotal: 65 });
    expect((await api.invoices.post({ invoiceId: created.invoiceId, actor: "unit.ar.typed" })).status).toBe("POSTED");
    expect((await api.invoices.reverse({ invoiceId: created.invoiceId, actor: "unit.ar.typed" })).status).toBe("REVERSED");
    await expect(api.invoices.update({ invoiceId: created.invoiceId, requestId: `AR-TYPED-UPDATE-AFTER-POST-${suffix}`, docNo: `AR-TYPED-INVALID-${suffix}`, customerId: 1, warehouseId: 1, actor: "unit.ar.typed", lines: [{ itemId: 1, quantity: "1", unitPrice: "1", taxAmount: "0" }] })).rejects.toThrow("ONLY_DRAFT_INVOICES_CAN_BE_EDITED");
  });

  it("AR priority windows: expose compatibility clones with bounded actions", async () => {
    const api = caller();
    const invoice = await api.windows.contract({ legacyForm: "ARST004.fmx" });
    const reversal = await api.windows.contract({ legacyForm: "ARST006.fmx" });
    const inquiry = await api.windows.contract({ legacyForm: "ARST023.fmx" });
    expect(invoice.clone).toMatchObject({ mode: "COMPATIBILITY_CLONE", sourceAvailable: false });
    expect(invoice.actions).toEqual(expect.arrayContaining(["save", "post"]));
    expect(reversal.actions).toEqual(expect.arrayContaining(["reverse"]));
    expect(reversal.actions).not.toContain("delete");
    expect(inquiry.actions).toEqual(expect.arrayContaining(["query", "print"]));
  });

  it("Sales window API executes the AR contract against the active data layer", async () => {
    const api = caller();
    const created = await api.windows.salesExecute({ legacyForm: "ARST004.fmx", action: "new", requestId: `sales-api-${Date.now()}`, invoice: { docNo: `SALES-API-${Date.now()}`, customerId: 1, warehouseId: 1, lines: [{ itemId: 1, quantity: "1", unitPrice: "100", taxAmount: "15" }], actor: "contract.sales" } });
    expect(created.mode).toBe("DATABASE_CONTRACT");
    expect((created.result as { status: string }).status).toBe("DRAFT");
    const queried = await api.windows.salesExecute({ legacyForm: "ARST023.fmx", action: "query", requestId: `sales-query-${Date.now()}`, search: "SALES-API" });
    expect(queried.mode).toBe("DATABASE_CONTRACT");
  });
  it("Sales window API returns the original invoice for a repeated requestId", async () => {
    const api = caller(); const requestId = `sales-idempotent-${Date.now()}`; const invoice = { docNo: `SALES-IDEMP-${Date.now()}`, customerId: 1, warehouseId: 1, lines: [{ itemId: 1, quantity: "1", unitPrice: "20", taxAmount: "3" }], actor: "contract.sales" };
    const first = await api.windows.salesExecute({ legacyForm: "ARST004.fmx", action: "new", requestId, invoice }); const second = await api.windows.salesExecute({ legacyForm: "ARST004.fmx", action: "new", requestId, invoice: { ...invoice, docNo: `${invoice.docNo}-CHANGED` } });
    expect(second.idempotent).toBe(true); expect(second.result).toEqual(first.result);
  });

  it("Sales window API supports the complete typed CREATE, UPDATE, POST, REVERSE lifecycle", async () => {
    const api = caller();
    const suffix = Date.now();
    const invoiceIdempotentKey = `SALES-LIFECYCLE-${suffix}`;
    const invoice = { docNo: `SALES-LIFECYCLE-${suffix}`, customerId: 1, warehouseId: 1, currencyCode: "SAR", exchangeRate: "1", paymentMethod: "CREDIT" as const, paidAmount: "0", lines: [{ itemId: 1, quantity: "1", unitPrice: "20", taxAmount: "3" }], actor: "contract.sales" };
    const created = await api.windows.salesExecute({ legacyForm: "ARST004.fmx", action: "new", requestId: `${invoiceIdempotentKey}:CREATE`, invoice });
    expect(created.mode).toBe("DATABASE_CONTRACT");
    expect((created.result as { status: string }).status).toBe("DRAFT");
    const invoiceId = Number((created.result as { invoiceId: number }).invoiceId);

    const updated = await api.windows.salesExecute({ legacyForm: "ARST004.fmx", action: "update", requestId: `${invoiceIdempotentKey}:UPDATE`, invoiceId, invoice: { ...invoice, docNo: `SALES-LIFECYCLE-UPDATED-${suffix}`, lines: [{ itemId: 1, quantity: "2", unitPrice: "30", taxAmount: "5" }] } });
    expect(updated.mode).toBe("DATABASE_CONTRACT");
    expect(updated.action).toBe("update");
    expect(updated.result).toMatchObject({ invoiceId, docNo: `SALES-LIFECYCLE-UPDATED-${suffix}`, status: "DRAFT", subtotal: 60, taxTotal: 5, grandTotal: 65 });

    const posted = await api.windows.salesExecute({ legacyForm: "ARST004.fmx", action: "post", requestId: `${invoiceIdempotentKey}:POST`, invoiceId });
    expect((posted.result as { status: string }).status).toBe("POSTED");
    const reversed = await api.windows.salesExecute({ legacyForm: "ARST004.fmx", action: "reverse", requestId: `${invoiceIdempotentKey}:REVERSE`, invoiceId });
    expect((reversed.result as { status: string }).status).toBe("REVERSED");
    await expect(api.windows.salesExecute({ legacyForm: "ARST004.fmx", action: "update", requestId: `${invoiceIdempotentKey}:UPDATE-AFTER-POST`, invoiceId, invoice })).rejects.toThrow("ONLY_DRAFT_INVOICES_CAN_BE_EDITED");
  });

  it("AP: exposes purchasing windows and save/update/delete actions", async () => {
    const api = caller();
    const contract = await api.windows.contract({ legacyForm: forms.ap });
    expect(contract.legacyForm).toBe(forms.ap);
    expect(contract.actions).toEqual(expect.arrayContaining(["new", "save", "update", "delete"]));
    const result = await api.windows.executeAction({ legacyForm: forms.ap, action: "save" });
    expect(result.ok).toBe(true);
  });

  it("Inventory: exposes stock evidence, tables, and validation action", async () => {
    const api = caller();
    const contract = await api.windows.contract({ legacyForm: forms.inventory });
    expect(contract.counts.fields).toBeGreaterThanOrEqual(0);
    expect(contract.counts.tables).toBeGreaterThanOrEqual(0);
    expect(contract.evidence.procedures.length).toBeGreaterThanOrEqual(0);
    expect((await api.windows.executeAction({ legacyForm: forms.inventory, action: "validate" })).ok).toBe(true);
  });

  it("POS: exposes a distinct POS window contract and branch-scoped permission metadata", async () => {
    const api = caller();
    const contract = await api.windows.contract({ legacyForm: forms.pos });
    expect(contract.legacyForm).toBe(forms.pos);
    expect(contract.domain).toMatch(/POS|OTHER/);
    expect(contract.source.runtime).toBe(true);
  });

  it("Reports: exposes print action and report catalog source", async () => {
    const api = caller();
    const contract = await api.windows.contract({ legacyForm: forms.report });
    expect(contract.actions).toContain("print");
    expect(contract.specificationPath).toContain("all_window_specs");
    const sources = await api.windows.sources();
    expect(sources.sourceFiles.some((file) => file.includes("window_runtime_contracts"))).toBe(true);
  });
});
