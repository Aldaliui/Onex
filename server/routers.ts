import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { LOCAL_COOKIE } from "./_core/localAuth";
import { executeOracleAction, getOracleBridgeStatus } from "./_core/oracleBridge";
import { createBackupSnapshot, getBackupDownloadUrl, restoreBackupSnapshot, uploadBackupSnapshot } from "./backup";
import { approveJournalEntry, createAdjustmentNote, createInventoryCount, createInventoryTransfer, createInvoice, createJournalDraft, createPaymentVoucher, createPurchaseInvoice, createReceiptVoucher, deleteAccount, deleteCustomer, deleteItem, deleteSupplier, deleteWindowRecord, executeGlWindowAction, executeSalesWindowAction, getAccountCatalog, getCatalogSources, getCurrencies, getDashboard, getEInvoiceStatus, getErpControlData, getFinancialReportCatalog, getGeneralLedgerReport, getGlReconciliationSnapshot, getInvoiceReturnSource, getItemTrace, getMasterData, getSystemSettings, getSystemTree, getTrialBalanceReport, getWindowCatalog, getWindowContract, getWindowDomains, importAccounts, listWarehouses, nextAdjustmentNumber, postAdjustmentNote, postInventoryCount, postInventoryTransfer, postJournalEntry, postPaymentVoucher, postPurchaseInvoice, postReceiptVoucher, postInvoice, receiveStock, reverseInvoice, reverseJournalEntry, reversePurchaseInvoice, runFinancialReport, saveAccount, saveBank, saveBranch, saveCashBox, saveCurrency, saveCustomer, saveItem, saveJournal, saveSupplier, saveSystemSettings, saveSystemUser, saveWarehouse, searchAccounts, searchAuditEvents, searchBranches, searchCustomers, searchInvoices, searchItems, searchJournals, searchSuppliers, searchSystemUsers, searchWarehouses, searchWindowExecutions, submitEInvoice, validateJournalEntry } from "./db";
import { isEInvoiceProviderConfigured } from "./eInvoicing";
import { buildOpeningBalances, closeFiscalYear } from "./accountingCore";
import { assertErpAction } from "./erpPolicy";

const invoiceLine = z.object({ itemId: z.number().int().positive(), quantity: z.string().min(1), unitPrice: z.string().min(1), taxAmount: z.string().default("0"), unitCode: z.string().max(30).default("EA"), batchNo: z.string().max(100).optional(), expireDate: z.string().optional(), locationId: z.number().int().positive().optional(), serials: z.array(z.string().min(1).max(160)).optional() });
const partyInput = z.object({ id: z.number().int().positive().optional(), companyId: z.number().int().positive().default(1), code: z.string().min(1).max(50), legalName: z.string().min(1).max(250), currencyCode: z.string().length(3).default("SAR"), status: z.enum(["ACTIVE", "BLOCKED", "CLOSED"]).default("ACTIVE") });
const cashBoxInput = z.object({ id: z.number().int().positive().optional(), companyId: z.number().int().positive().default(1), code: z.string().min(1).max(50), name: z.string().min(1).max(250), currencyCode: z.string().length(3).default("SAR"), status: z.enum(["ACTIVE", "BLOCKED", "CLOSED"]).default("ACTIVE") });
const bankInput = cashBoxInput.extend({ accountNumber: z.string().max(100).optional() });
const itemInput = z.object({ id: z.number().int().positive().optional(), companyId: z.number().int().positive().default(1), code: z.string().min(1).max(80), description: z.string().min(1).max(500), stockFlag: z.number().int().min(0).max(1).default(1), unitCost: z.string().default("0"), revenueAccount: z.string().default("4100"), inventoryAccount: z.string().default("1300"), cogsAccount: z.string().default("5100"), active: z.number().int().min(0).max(1).default(1) });
const journalLine = z.object({ accountCode: z.string().min(1).max(80), accountName: z.string().max(240).optional(), description: z.string().max(500).optional(), debit: z.string().default("0"), credit: z.string().default("0") });
const journalWorkflowInput = z.object({ journalNo: z.string().min(1).max(80), entryType: z.string().min(1).max(40), actor: z.string().default("workbench.user"), companyId: z.number().int().positive().default(1), branchId: z.number().int().positive().optional(), fiscalPeriodId: z.number().int().positive().optional(), journalDate: z.string().optional(), sourceType: z.string().max(40).default("MANUAL"), sourceDocumentNo: z.string().max(80).optional(), description: z.string().max(1000).optional(), lines: journalLine.extend({ currencyCode: z.string().length(3).default("SAR"), exchangeRate: z.string().default("1") }).array().min(2) });

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => { const cookieOptions = getSessionCookieOptions(ctx.req); ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 }); if (ctx.req.headers.cookie?.includes("onex_local_session=")) ctx.res.clearCookie(LOCAL_COOKIE, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" }); return { success: true } as const; }),
  }),
  dashboard: publicProcedure.query(() => getDashboard()),
  masterData: publicProcedure.query(() => getMasterData()),
  accounting: router({
    previewYearClose: protectedProcedure.input(z.object({ revenue: z.union([z.string(), z.number()]), expenses: z.union([z.string(), z.number()]), retainedEarningsAccount: z.string().max(80).optional(), openingYear: z.string().max(20).optional(), date: z.string().max(40).optional() })).mutation(({ input }) => closeFiscalYear(input)),
    previewOpeningBalances: protectedProcedure.input(z.object({ accounts: z.array(z.object({ code: z.string().min(1).max(80), type: z.string().max(30).optional(), balance: z.union([z.string(), z.number()]) })).min(1).max(5000) })).mutation(({ input }) => buildOpeningBalances(input.accounts)),
  }),
  systemSettings: router({ get: publicProcedure.query(() => getSystemSettings()), save: protectedProcedure.input(z.object({ engine: z.string().min(1).max(30), host: z.string().max(255).optional(), port: z.number().int().min(1).max(65535), databaseName: z.string().max(160).optional(), ssl: z.number().int().min(0).max(1), updatedBy: z.string().min(1).max(100) })).mutation(({ input }) => saveSystemSettings(input)) }),
  controlData: publicProcedure.query(() => getErpControlData()),
  oracle: router({ status: publicProcedure.query(() => getOracleBridgeStatus()) }),
  reports: router({
    catalog: publicProcedure.query(() => getFinancialReportCatalog()),
    run: publicProcedure.input(z.object({ reportCode: z.enum(["GLSR001", "ARSR041", "MRPREP001"]), search: z.string().optional(), limit: z.number().int().min(1).max(500).default(100) })).query(({ input }) => runFinancialReport(input)),
  }),
  backups: router({
    create: protectedProcedure.input(z.object({ offlineOperations: z.array(z.unknown()).default([]) })).mutation(({ input }) => createBackupSnapshot(input.offlineOperations)),
    upload: protectedProcedure.input(z.object({ offlineOperations: z.array(z.unknown()).default([]) })).mutation(({ input }) => uploadBackupSnapshot(input.offlineOperations)),
    downloadUrl: protectedProcedure.input(z.object({ key: z.string().min(1).max(500) })).query(({ input }) => getBackupDownloadUrl(input.key)),
    validate: protectedProcedure.input(z.object({ backup: z.unknown() })).mutation(({ input }) => restoreBackupSnapshot(input.backup)),
  }),
  windows: router({
    list: publicProcedure.input(z.object({ search: z.string().optional(), domain: z.string().optional(), limit: z.number().int().min(1).max(500).default(80) }).optional()).query(({ input }) => getWindowCatalog(input?.search, input?.domain, input?.limit ?? 80)),
    domains: publicProcedure.query(() => getWindowDomains()),
    tree: publicProcedure.query(() => getSystemTree()),
    sources: publicProcedure.query(() => getCatalogSources()),
    contract: publicProcedure.input(z.object({ legacyForm: z.string().min(1).max(160) })).query(({ input }) => getWindowContract(input.legacyForm)),
    accountCatalog: publicProcedure.input(z.object({ search: z.string().optional(), limit: z.number().int().min(1).max(500).default(500) }).optional()).query(({ input }) => getAccountCatalog(input?.search, input?.limit ?? 500)),
    records: publicProcedure.input(z.object({ legacyForm: z.string().min(1).max(160), search: z.string().optional(), limit: z.number().int().min(1).max(100).default(20) })).query(({ input }): Promise<any[]> => {
      const form = input.legacyForm.replace(/\.fmx$/i, "").toUpperCase();
      if (["GLSR001", "ARSR041", "MRPREP001"].includes(form)) return runFinancialReport({ reportCode: form, search: input.search, limit: input.limit }).then((result) => result.rows);
      if (form === "ADMT027") return searchSystemUsers(input.search, input.limit);
      if (form === "ERP_DBA") return searchSystemUsers(input.search, input.limit);
      if (form === "ERP_DBA_DFLT_DATA") return searchBranches(input.search, input.limit);
      if (form === "MRPACS004") return searchWarehouses(input.search, input.limit);
      if (form === "ERP_DBA") return searchSystemUsers(input.search, input.limit);
      if (form === "ERP_DBA_DFLT_DATA") return searchBranches(input.search, input.limit);
      if (form === "MRPACS004") return searchWarehouses(input.search, input.limit);
      if (form === "ERP_JOURNAL") return searchAuditEvents(input.search, input.limit);
      if (form.startsWith("ARST004") || form.startsWith("APST003")) return searchInvoices(input.search, input.limit);
      if (form.startsWith("ARST") || form.startsWith("ARSR")) return searchCustomers(input.search, input.limit);
      if (form === "APSI002") return searchSuppliers(input.search, input.limit);
      if (form.startsWith("APST") || form.startsWith("APSR")) return searchSuppliers(input.search, input.limit);
      if (form.startsWith("INVT") || form.startsWith("INVI")) return searchItems(input.search, input.limit);
      if (form.startsWith("POST")) return searchInvoices(input.search, input.limit);
      if (form === "GLST001") return searchAccounts(input.search, input.limit);
      if (form.startsWith("GLST") || form.startsWith("GLSI") || form.startsWith("GLSR")) return searchJournals(input.search, input.limit);
      return searchWindowExecutions(form, input.search, input.limit);
    }),
    itemTrace: publicProcedure.input(z.object({ itemId: z.number().int().positive(), warehouseId: z.number().int().positive().optional() })).query(({ input }) => getItemTrace(input.itemId, input.warehouseId)),
    saveCustomer: protectedProcedure.input(partyInput).mutation(({ input }) => saveCustomer(input)),
    deleteCustomer: protectedProcedure.input(z.object({ id: z.number().int().positive(), actor: z.string().max(100).default("workbench.user") })).mutation(({ input }) => deleteCustomer(input)),
    saveSupplier: protectedProcedure.input(partyInput).mutation(({ input }) => saveSupplier(input)),
    deleteSupplier: protectedProcedure.input(z.object({ id: z.number().int().positive(), actor: z.string().max(100).default("workbench.user") })).mutation(({ input }) => deleteSupplier(input)),
    saveCashBox: protectedProcedure.input(cashBoxInput).mutation(({ input }) => saveCashBox(input)),
    saveBank: protectedProcedure.input(bankInput).mutation(({ input }) => saveBank(input)),
    saveItem: protectedProcedure.input(itemInput).mutation(({ input }) => saveItem(input)),
    deleteItem: protectedProcedure.input(z.object({ id: z.number().int().positive(), actor: z.string().max(100).default("workbench.user") })).mutation(({ input }) => deleteItem(input)),
    saveJournal: protectedProcedure.input(z.object({ journalNo: z.string().min(1).max(80), entryType: z.string().min(1).max(40), actor: z.string().default("workbench.user"), lines: z.array(journalLine).min(2) })).mutation(({ input }) => saveJournal(input)),
    createJournalDraft: protectedProcedure.input(journalWorkflowInput).mutation(({ input }) => createJournalDraft(input)),
    validateJournal: protectedProcedure.input(z.object({ id: z.number().int().positive(), actor: z.string().default("workbench.user") })).mutation(({ input }) => validateJournalEntry(input.id, input.actor)),
    approveJournal: protectedProcedure.input(z.object({ id: z.number().int().positive(), actor: z.string().default("workbench.user") })).mutation(({ input }) => approveJournalEntry(input.id, input.actor)),
    postJournal: protectedProcedure.input(z.object({ id: z.number().int().positive(), actor: z.string().default("workbench.user") })).mutation(({ input }) => postJournalEntry(input.id, input.actor)),
    reverseJournal: protectedProcedure.input(z.object({ id: z.number().int().positive(), actor: z.string().default("workbench.user") })).mutation(({ input }) => reverseJournalEntry(input.id, input.actor)),
    generalLedger: publicProcedure.input(z.object({ accountCode: z.string().max(80).optional(), from: z.string().optional(), to: z.string().optional(), limit: z.number().int().min(1).max(5000).default(500) }).optional()).query(({ input }) => getGeneralLedgerReport(input || {})),
    trialBalance: publicProcedure.input(z.object({ from: z.string().optional(), to: z.string().optional(), limit: z.number().int().min(1).max(5000).default(5000) }).optional()).query(({ input }) => getTrialBalanceReport(input || {})),
    reconciliation: publicProcedure.input(z.object({ companyId: z.number().int().positive().default(1) }).optional()).query(({ input }) => getGlReconciliationSnapshot(input?.companyId || 1)),
    saveSystemUser: protectedProcedure.input(z.object({ id: z.number().int().positive().optional(), openId: z.string().min(1).max(64), name: z.string().max(500).optional(), email: z.string().email().optional(), role: z.enum(["user", "admin"]).default("user"), loginMethod: z.string().max(64).optional() })).mutation(({ input }) => saveSystemUser(input)),
    saveBranch: protectedProcedure.input(z.object({ id: z.number().int().positive().optional(), companyId: z.number().int().positive().default(1), code: z.string().min(1).max(30), name: z.string().min(1).max(200), active: z.number().int().min(0).max(1).default(1) })).mutation(({ input }) => saveBranch(input)),
    saveWarehouse: protectedProcedure.input(z.object({ id: z.number().int().positive().optional(), companyId: z.number().int().positive().default(1), code: z.string().min(1).max(30), name: z.string().min(1).max(200), active: z.number().int().min(0).max(1).default(1) })).mutation(({ input }) => saveWarehouse(input)),
    currencies: publicProcedure.query(() => getCurrencies()),
    saveCurrency: protectedProcedure.input(z.object({ code: z.string().length(3), name: z.string().min(1).max(120), decimalScale: z.number().int().min(0).max(6).default(2), active: z.number().int().min(0).max(1).default(1) })).mutation(({ input }) => saveCurrency(input)),
    saveAccount: protectedProcedure.input(z.object({ id: z.number().int().positive().optional(), companyId: z.number().int().positive().default(1), code: z.string().min(1).max(80), name: z.string().min(1).max(240), accountType: z.string().min(1).max(30), parentCode: z.string().max(80).optional(), levelNo: z.number().int().min(0).max(99).default(0), allowPosting: z.number().int().min(0).max(1).default(1), normalBalance: z.enum(["DEBIT", "CREDIT"]).default("DEBIT"), isControlAccount: z.number().int().min(0).max(1).default(0), cashFlowCategory: z.string().max(40).optional(), salesAccount: z.number().int().min(0).max(1).default(0), purchaseAccount: z.number().int().min(0).max(1).default(0), inventoryAccount: z.number().int().min(0).max(1).default(0), cogsAccount: z.number().int().min(0).max(1).default(0), currencyCode: z.string().length(3).default("SAR"), active: z.number().int().min(0).max(1).default(1), status: z.enum(["ACTIVE", "BLOCKED", "CLOSED"]).default("ACTIVE"), legacyCode: z.string().max(80).optional(), legacySource: z.string().max(120).optional() })).mutation(({ input }) => saveAccount(input)),
    importAccounts: protectedProcedure.input(z.object({ companyId: z.number().int().positive().default(1), actor: z.string().max(100).default("workbench.user"), rows: z.array(z.object({ code: z.string().min(1).max(80), name: z.string().min(1).max(240), accountType: z.string().min(1).max(30), parentCode: z.string().max(80).optional(), currencyCode: z.string().length(3).default("SAR"), active: z.number().int().min(0).max(1).default(1) })).min(1).max(1000) })).mutation(({ input }) => importAccounts(input)),
    deleteAccount: protectedProcedure.input(z.object({ id: z.number().int().positive(), actor: z.string().max(100).default("workbench.user") })).mutation(({ input }) => deleteAccount(input)),
    deleteRecord: protectedProcedure.input(z.object({ legacyForm: z.string().min(1).max(160), id: z.number().int().positive(), actor: z.string().max(100).default("workbench.user") })).mutation(({ input }) => deleteWindowRecord(input)),
    executeAction: protectedProcedure.input(z.object({ legacyForm: z.string().min(1).max(160), action: z.string().min(1).max(80), actor: z.string().min(1).max(100).default("workbench.user"), requestId: z.string().min(1).max(160).default("workbench-request") })).mutation(async ({ input }) => {
      const contract = await getWindowContract(input.legacyForm);
      if (!contract.actions.includes(input.action)) throw new Error("ACTION_NOT_ALLOWED_FOR_WINDOW");
      return executeOracleAction({ legacyForm: contract.legacyForm, action: input.action, coreApi: contract.coreApi, procedures: contract.evidence.procedures, actor: input.actor });
    }),
    salesExecute: protectedProcedure.input(z.object({ legacyForm: z.string().min(1).max(160), action: z.string().min(1).max(80), actor: z.string().min(1).max(100).default("workbench.user"), requestId: z.string().min(1).max(160), invoiceId: z.number().int().positive().optional(), search: z.string().optional(), limit: z.number().int().min(1).max(100).default(20), invoice: z.object({ docNo: z.string().min(1), customerId: z.number().int().positive(), warehouseId: z.number().int().positive(), currencyCode: z.string().length(3).default("SAR"), exchangeRate: z.string().default("1"), paymentMethod: z.enum(["CASH", "CREDIT", "CHECK", "WALLET", "BANK_TRANSFER"]).default("CASH"), paidAmount: z.string().default("0"), paymentReference: z.string().max(160).optional(), lines: z.array(invoiceLine).min(1), actor: z.string().default("workbench.user") }).optional() })).mutation(({ input }) => executeSalesWindowAction(input)),
    glExecute: protectedProcedure.input(z.object({ legacyForm: z.string().min(1).max(160), action: z.string().min(1).max(80), actor: z.string().min(1).max(100).default("workbench.user"), requestId: z.string().min(1).max(160), search: z.string().optional(), limit: z.number().int().min(1).max(100).default(20), fiscalPeriodId: z.number().int().positive().optional(), journal: z.object({ journalNo: z.string().min(1).max(80), entryType: z.string().min(1).max(40), actor: z.string().default("workbench.user"), lines: z.array(journalLine).min(2) }).optional() })).mutation(({ input }) => executeGlWindowAction(input)),
  }),
  ai: router({
    assist: publicProcedure.input(z.object({
      question: z.string().min(1).max(4000),
      window: z.string().optional(),
      context: z.string().optional(),
    })).mutation(async ({ input }) => {
      const system = `أنت المساعد العصبي لنظام ONEX ERP المتوافق مع Onyx القديم. أجب بالعربية باختصار وبدقة. لا تخترع بيانات محاسبية أو صلاحيات أو ترحيلات مؤكدة؛ ميّز بين المؤكد من الكتالوج والمستنتج. النافذة الحالية: ${input.window || "غير محددة"}. سياق الشاشة: ${input.context || "لا يوجد"}.`;
      try {
        const result = await invokeLLM({ model: "gpt-5-mini", maxTokens: 700, messages: [{ role: "system", content: system }, { role: "user", content: input.question }] });
        const content = result.choices[0]?.message?.content;
        return { answer: typeof content === "string" ? content : "لم أتمكن من توليد إجابة نصية." };
      } catch {
        return { answer: "المساعد يعمل في وضع محلي. راجع عقد النافذة والحقول والأدلة المطلوبة قبل تنفيذ أي ترحيل." };
      }
    }),
  }),
  invoices: router({
    create: protectedProcedure.input(z.object({ docNo: z.string().min(1), customerId: z.number().int().positive(), warehouseId: z.number().int().positive(), currencyCode: z.string().length(3).default("SAR"), exchangeRate: z.string().default("1"), paymentMethod: z.enum(["CASH", "CREDIT", "CHECK", "WALLET", "BANK_TRANSFER"]).default("CASH"), paidAmount: z.string().default("0"), paymentReference: z.string().max(160).optional(), lines: z.array(invoiceLine).min(1), actor: z.string().default("demo.user") })).mutation(({ input, ctx }) => { assertErpAction({ role: ctx.user?.role, action: "INVOICE_CREATE", module: "AR" }); return createInvoice(input); }),
    post: protectedProcedure.input(z.object({ invoiceId: z.number().int().positive(), actor: z.string().default("demo.user") })).mutation(({ input, ctx }) => { assertErpAction({ role: ctx.user?.role, action: "INVOICE_POST", module: "AR" }); return postInvoice(input.invoiceId, input.actor); }),
    reverse: protectedProcedure.input(z.object({ invoiceId: z.number().int().positive(), actor: z.string().default("demo.user") })).mutation(({ input, ctx }) => { assertErpAction({ role: ctx.user?.role, action: "INVOICE_REVERSE", module: "AR" }); return reverseInvoice(input.invoiceId, input.actor); }),
  }),
  eInvoices: router({
    status: publicProcedure.input(z.object({ invoiceId: z.number().int().positive() })).query(({ input }) => getEInvoiceStatus(input.invoiceId)),
    provider: publicProcedure.query(() => ({ configured: isEInvoiceProviderConfigured() })),
    submit: protectedProcedure.input(z.object({ invoiceId: z.number().int().positive(), requestId: z.string().min(1).max(160).optional(), actor: z.string().min(1).max(100).default("workbench.user") })).mutation(({ input }) => submitEInvoice(input.invoiceId, input.actor, input.requestId)),
  }),
  purchases: router({
    create: protectedProcedure.input(z.object({ docNo: z.string().min(1), supplierId: z.number().int().positive(), warehouseId: z.number().int().positive(), currencyCode: z.string().length(3).default("SAR"), exchangeRate: z.string().default("1"), paymentMethod: z.enum(["CASH", "CREDIT", "CHECK", "WALLET", "BANK_TRANSFER"]).default("CREDIT"), paidAmount: z.string().default("0"), paymentReference: z.string().max(160).optional(), lines: z.array(invoiceLine).min(1), actor: z.string().default("workbench.user") })).mutation(({ input, ctx }) => { assertErpAction({ role: ctx.user?.role, action: "INVOICE_CREATE", module: "AP" }); return createPurchaseInvoice(input); }),
    post: protectedProcedure.input(z.object({ invoiceId: z.number().int().positive(), actor: z.string().default("workbench.user") })).mutation(({ input, ctx }) => { assertErpAction({ role: ctx.user?.role, action: "INVOICE_POST", module: "AP" }); return postPurchaseInvoice(input.invoiceId, input.actor); }),
    reverse: protectedProcedure.input(z.object({ invoiceId: z.number().int().positive(), actor: z.string().default("workbench.user") })).mutation(({ input, ctx }) => { assertErpAction({ role: ctx.user?.role, action: "INVOICE_REVERSE", module: "AP" }); return reversePurchaseInvoice(input.invoiceId, input.actor); }),
  }),
  adjustments: router({
    nextNumber: publicProcedure.input(z.object({ documentKind: z.enum(["SALES_RETURN", "PURCHASE_RETURN"]) })).query(({ input }) => nextAdjustmentNumber(input.documentKind)),
    source: publicProcedure.input(z.object({ invoiceId: z.number().int().positive(), invoiceType: z.enum(["SALE", "PURCHASE"]) })).query(({ input }) => getInvoiceReturnSource(input.invoiceId, input.invoiceType)),
    searchInvoices: publicProcedure.input(z.object({ search: z.string().optional(), invoiceType: z.enum(["SALE", "PURCHASE"]), partyId: z.number().int().positive().optional(), limit: z.number().int().min(1).max(50).default(20) })).query(async ({ input }) => (await searchInvoices(input.search, input.limit) as any[]).filter((invoice: any) => invoice.invoiceType === input.invoiceType && (!input.partyId || (input.invoiceType === "SALE" ? invoice.customerId === input.partyId : invoice.supplierId === input.partyId)))),
    create: protectedProcedure.input(z.object({ docNo: z.string().min(1), documentKind: z.enum(["SALES_RETURN", "PURCHASE_RETURN", "SALES_DISCOUNT", "SALES_ADDITION", "PURCHASE_DISCOUNT", "PURCHASE_ADDITION"]), originalInvoiceId: z.number().int().positive(), reason: z.string().max(500).optional(), lines: z.array(invoiceLine).min(1), actor: z.string().default("workbench.user") })).mutation(({ input }) => createAdjustmentNote(input)),
    post: protectedProcedure.input(z.object({ adjustmentId: z.number().int().positive(), actor: z.string().default("workbench.user") })).mutation(({ input }) => postAdjustmentNote(input.adjustmentId, input.actor)),
  }),
  vouchers: router({
    receiptCreate: protectedProcedure.input(z.object({ voucherNo: z.string().min(1).max(80), companyId: z.number().int().positive().default(1), customerId: z.number().int().positive(), cashAccountCode: z.string().min(1).max(80), currencyCode: z.string().length(3).default("SAR"), amount: z.string().min(1), reference: z.string().max(160).optional(), actor: z.string().default("workbench.user"), allocations: z.array(z.object({ invoiceId: z.number().int().positive(), amount: z.string().min(1) })).min(1) })).mutation(({ input, ctx }) => { assertErpAction({ role: ctx.user?.role, action: "PAYMENT_CREATE", module: "AR" }); return createReceiptVoucher({ ...input, partyId: input.customerId }); }),
    receiptPost: protectedProcedure.input(z.object({ voucherId: z.number().int().positive(), actor: z.string().default("workbench.user") })).mutation(({ input }) => postReceiptVoucher(input.voucherId, input.actor)),
    paymentCreate: protectedProcedure.input(z.object({ voucherNo: z.string().min(1).max(80), companyId: z.number().int().positive().default(1), supplierId: z.number().int().positive(), cashAccountCode: z.string().min(1).max(80), currencyCode: z.string().length(3).default("SAR"), amount: z.string().min(1), reference: z.string().max(160).optional(), actor: z.string().default("workbench.user"), allocations: z.array(z.object({ invoiceId: z.number().int().positive(), amount: z.string().min(1) })).min(1) })).mutation(({ input, ctx }) => { assertErpAction({ role: ctx.user?.role, action: "PAYMENT_CREATE", module: "AP" }); return createPaymentVoucher({ ...input, partyId: input.supplierId }); }),
    paymentPost: protectedProcedure.input(z.object({ voucherId: z.number().int().positive(), actor: z.string().default("workbench.user") })).mutation(({ input }) => postPaymentVoucher(input.voucherId, input.actor)),
  }),
  inventory: router({
    warehouses: publicProcedure.query(() => listWarehouses()),
    receive: protectedProcedure.input(z.object({ itemId: z.number().int().positive(), warehouseId: z.number().int().positive(), quantity: z.string().min(1), unitCost: z.string().min(1), actor: z.string().default("workbench.user"), reference: z.string().min(1).max(80) })).mutation(({ input }) => receiveStock(input)),
    countCreate: protectedProcedure.input(z.object({ countNo: z.string().min(1).max(80), warehouseId: z.number().int().positive(), countMode: z.enum(["PERIODIC", "CYCLE"]), actor: z.string().default("workbench.user"), notes: z.string().max(500).optional(), lines: z.array(z.object({ itemId: z.number().int().positive(), countedQuantity: z.string().min(1) })).min(1) })).mutation(({ input }) => createInventoryCount(input)),
    countPost: protectedProcedure.input(z.object({ countId: z.number().int().positive(), actor: z.string().default("workbench.user") })).mutation(({ input }) => postInventoryCount(input.countId, input.actor)),
    transferCreate: protectedProcedure.input(z.object({ transferNo: z.string().min(1).max(80), sourceWarehouseId: z.number().int().positive(), destinationWarehouseId: z.number().int().positive(), actor: z.string().default("workbench.user"), lines: z.array(z.object({ itemId: z.number().int().positive(), quantity: z.string().min(1) })).min(1) })).mutation(({ input }) => createInventoryTransfer(input)),
    transferPost: protectedProcedure.input(z.object({ transferId: z.number().int().positive(), actor: z.string().default("workbench.user") })).mutation(({ input }) => postInventoryTransfer(input.transferId, input.actor)),
  }),
});

export type AppRouter = typeof appRouter;
