import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { LOCAL_COOKIE } from "./_core/localAuth";
import { executeOracleAction, getOracleBridgeStatus } from "./_core/oracleBridge";
import { createBackupSnapshot, getBackupDownloadUrl, restoreBackupSnapshot, uploadBackupSnapshot } from "./backup";
import { approveJournalEntry, approvePurchaseOrder, approveSalesOrder, createAdjustmentNote, createGoodsIssue, createInventoryCount, createGoodsReceipt, createInventoryTransfer, createInvoice, createJournalDraft, createPaymentVoucher, createPurchaseInvoice, createPurchaseOrder, createSalesOrder, createReceiptVoucher, deleteAccount, deleteCustomer, deleteItem, deleteSupplier, deleteWindowRecord, executeGlWindowAction, executeSalesWindowAction, getAccountCatalog, getCatalogSources, getCurrencies, getDashboard, getEInvoiceStatus, getErpControlData, getFinancialReportCatalog, getGeneralLedgerReport, getGlReconciliationSnapshot, getInvoiceReturnSource, getItemTrace, getPurchaseIntegrationReport, getMasterData, getSystemSettings, getSystemTree, getTrialBalanceReport, getWindowCatalog, getWindowContract, getWindowDomains, importAccounts, listWarehouses, nextAdjustmentNumber, postAdjustmentNote, postGoodsIssue, postGoodsReceipt, postInventoryCount, postInventoryTransfer, postJournalEntry, postPaymentVoucher, postPurchaseInvoice, postReceiptVoucher, postInvoice, receiveStock, reverseInvoice, reverseJournalEntry, reversePurchaseInvoice, runFinancialReport, saveAccount, saveBank, saveBranch, saveCashBox, saveCurrency, saveCustomer, saveItem, saveJournal, saveSupplier, saveSystemSettings, saveSystemUser as saveWindowSystemUser, saveWarehouse, searchAccounts, searchAuditEvents, searchBranches, searchCustomers, searchInvoices, searchItems, searchJournals, searchSuppliers, searchSystemUsers, searchWarehouses, searchWindowExecutions, submitEInvoice, validateJournalEntry } from "./db";
import { isEInvoiceProviderConfigured } from "./eInvoicing";
import { buildOpeningBalances, closeFiscalYear } from "./accountingCore";
import { assertErpAction } from "./erpPolicy";
import { assignRolePermission, assignUserRole, closeFiscalPeriod, createFiscalPeriod, listFiscalPeriods, listWorkspacePermissions, listWorkspaceRoles, reopenFiscalPeriod } from "./erpWorkspaceDb";
import { validateThreeWayMatch } from "./purchaseIntegrationReport";
import { commitMasterDataImport, getCoreFoundationSnapshot, markNotificationRead, previewMasterDataImport, saveCurrencySettings, saveDocumentDefinitionSettings, saveDocumentSequenceSettings, saveExchangeRateSettings, saveItemUnitSettings, saveTaxCodeSettings, validateDocumentTransition } from "./coreFoundation";
import { assignSystemRolePermission, assignSystemUserRole, getSystemAdministration, removeSystemBranch, removeSystemRolePermission, removeSystemUser, removeSystemUserRole, saveSystemBranch, saveSystemPermission, saveSystemRole, saveSystemUser } from "./systemAdministration";

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
  erpWorkspace: router({
    fiscalPeriods: protectedProcedure.input(z.object({ companyId: z.number().int().positive().default(1) }).optional()).query(({ input }) => listFiscalPeriods(input?.companyId || 1)),
    createFiscalPeriod: adminProcedure.input(z.object({ companyId: z.number().int().positive().default(1), code: z.string().min(1).max(30), startsOn: z.string(), endsOn: z.string(), actor: z.string().optional(), role: z.string().optional() })).mutation(({ input, ctx }) => createFiscalPeriod({ ...input, actor: ctx.user.openId, role: ctx.user.role })),
    closeFiscalPeriod: adminProcedure.input(z.object({ periodId: z.number().int().positive(), actor: z.string().optional(), role: z.string().optional(), requestId: z.string().min(1).max(160) })).mutation(({ input, ctx }) => closeFiscalPeriod({ ...input, actor: ctx.user.openId, role: ctx.user.role })),
    reopenFiscalPeriod: adminProcedure.input(z.object({ periodId: z.number().int().positive(), actor: z.string().optional(), role: z.string().optional(), requestId: z.string().min(1).max(160) })).mutation(({ input, ctx }) => reopenFiscalPeriod({ ...input, actor: ctx.user.openId, role: ctx.user.role })),
    roles: adminProcedure.query(() => listWorkspaceRoles()),
    permissions: adminProcedure.query(() => listWorkspacePermissions()),
    assignUserRole: adminProcedure.input(z.object({ userId: z.number().int().positive(), roleId: z.number().int().positive(), branchId: z.number().int().positive().optional(), actor: z.string().optional(), role: z.string().optional() })).mutation(({ input, ctx }) => assignUserRole({ ...input, actor: ctx.user.openId, role: ctx.user.role })),
    assignRolePermission: adminProcedure.input(z.object({ roleId: z.number().int().positive(), permissionId: z.number().int().positive(), actor: z.string().optional(), role: z.string().optional() })).mutation(({ input, ctx }) => assignRolePermission({ ...input, actor: ctx.user.openId, role: ctx.user.role })),
  }),
  coreFoundation: router({
    snapshot: protectedProcedure.input(z.object({ companyId: z.number().int().positive().default(1), search: z.string().max(120).optional(), limit: z.number().int().min(1).max(200).default(100) })).query(({ input }) => getCoreFoundationSnapshot(input.companyId, input.search, input.limit)),
    previewImport: protectedProcedure.input(z.object({ companyId: z.number().int().positive().default(1), entityType: z.enum(["CUSTOMER", "SUPPLIER", "ITEM", "WAREHOUSE"]), fileName: z.string().min(1).max(255), csv: z.string().min(1).max(2_000_000) })).mutation(({ input, ctx }) => previewMasterDataImport({ ...input, actor: ctx.user.openId })),
    commitImport: protectedProcedure.input(z.object({ importId: z.number().int().nonnegative().default(0), companyId: z.number().int().positive().default(1), entityType: z.enum(["CUSTOMER", "SUPPLIER", "ITEM", "WAREHOUSE"]), rows: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.null()]))).min(1).max(10_000) })).mutation(({ input, ctx }) => commitMasterDataImport({ ...input, actor: ctx.user.openId })),
    markNotificationRead: protectedProcedure.input(z.object({ notificationId: z.number().int().positive() })).mutation(({ input, ctx }) => markNotificationRead({ ...input, userId: ctx.user.id })),
    validateTransition: protectedProcedure.input(z.object({ fromState: z.string().optional(), toState: z.string().min(1) })).query(({ input }) => validateDocumentTransition(input.fromState, input.toState)),
    saveCurrency: adminProcedure.input(z.object({ code: z.string().length(3), name: z.string().min(1).max(120), decimalScale: z.number().int().min(0).max(6).default(2), active: z.number().int().min(0).max(1).default(1) })).mutation(({ input, ctx }) => saveCurrencySettings({ ...input, actor: ctx.user.openId })),
    saveExchangeRate: adminProcedure.input(z.object({ companyId: z.number().int().positive().default(1), currencyCode: z.string().length(3), rateDate: z.string().min(1), rate: z.string().min(1), source: z.string().max(80).default("MANUAL") })).mutation(({ input, ctx }) => saveExchangeRateSettings({ ...input, actor: ctx.user.openId })),
    saveTaxCode: adminProcedure.input(z.object({ companyId: z.number().int().positive().default(1), code: z.string().min(1).max(30), name: z.string().min(1).max(160), rate: z.string().min(1), category: z.string().max(30).default("STANDARD"), active: z.number().int().min(0).max(1).default(1) })).mutation(({ input, ctx }) => saveTaxCodeSettings({ ...input, actor: ctx.user.openId })),
    saveDocumentDefinition: adminProcedure.input(z.object({ companyId: z.number().int().positive().default(1), documentType: z.string().min(2).max(40), displayName: z.string().min(1).max(160), prefix: z.string().max(30), approvalRequired: z.number().int().min(0).max(1).default(1), postingRequired: z.number().int().min(0).max(1).default(1), active: z.number().int().min(0).max(1).default(1) })).mutation(({ input, ctx }) => saveDocumentDefinitionSettings({ ...input, actor: ctx.user.openId })),
    saveDocumentSequence: adminProcedure.input(z.object({ companyId: z.number().int().positive().default(1), branchId: z.number().int().positive().nullable().optional(), periodId: z.number().int().positive().nullable().optional(), documentType: z.string().min(2).max(40), prefix: z.string().max(30), nextNumber: z.number().int().positive().default(1) })).mutation(({ input, ctx }) => saveDocumentSequenceSettings({ ...input, actor: ctx.user.openId })),
    saveItemUnit: adminProcedure.input(z.object({ itemId: z.number().int().positive(), unitCode: z.string().min(1).max(30), unitName: z.string().min(1).max(100), conversionToBase: z.string().min(1), isBase: z.number().int().min(0).max(1).default(0), barcode: z.string().max(100).optional(), active: z.number().int().min(0).max(1).default(1) })).mutation(({ input, ctx }) => saveItemUnitSettings({ ...input, actor: ctx.user.openId })),
  }),
  systemSettings: router({ get: publicProcedure.query(() => getSystemSettings()), save: protectedProcedure.input(z.object({ engine: z.string().min(1).max(30), host: z.string().max(255).optional(), port: z.number().int().min(1).max(65535), databaseName: z.string().max(160).optional(), ssl: z.number().int().min(0).max(1), updatedBy: z.string().min(1).max(100) })).mutation(({ input }) => saveSystemSettings(input)) }),
  systemAdministration: router({
    overview: adminProcedure.input(z.object({ search: z.string().max(120).optional(), companyId: z.number().int().positive().optional() }).optional()).query(({ input, ctx }) => getSystemAdministration(input || {}, ctx.user)),
    saveUser: adminProcedure.input(z.object({ id: z.number().int().positive().optional(), openId: z.string().min(1).max(64), name: z.string().max(255).optional(), email: z.string().email().max(320).optional(), role: z.enum(["user", "admin"]).default("user"), loginMethod: z.string().max(64).optional() })).mutation(({ input, ctx }) => saveSystemUser(input, ctx.user)),
    removeUser: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ input, ctx }) => removeSystemUser(input.id, ctx.user)),
    saveRole: adminProcedure.input(z.object({ id: z.number().int().positive().optional(), code: z.string().min(2).max(60), name: z.string().min(2).max(160), active: z.number().int().min(0).max(1).default(1) })).mutation(({ input, ctx }) => saveSystemRole(input, ctx.user)),
    savePermission: adminProcedure.input(z.object({ id: z.number().int().positive().optional(), code: z.string().min(2).max(120), windowCode: z.string().max(160).optional(), actionCode: z.string().min(2).max(80), description: z.string().max(300).optional() })).mutation(({ input, ctx }) => saveSystemPermission(input, ctx.user)),
    saveBranch: adminProcedure.input(z.object({ id: z.number().int().positive().optional(), companyId: z.number().int().positive(), code: z.string().min(1).max(30), name: z.string().min(1).max(200), active: z.number().int().min(0).max(1).default(1) })).mutation(({ input, ctx }) => saveSystemBranch(input, ctx.user)),
    removeBranch: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ input, ctx }) => removeSystemBranch(input.id, ctx.user)),
    assignUserRole: adminProcedure.input(z.object({ userId: z.number().int().positive(), roleId: z.number().int().positive(), branchId: z.number().int().positive().optional() })).mutation(({ input, ctx }) => assignSystemUserRole(input, ctx.user)),
    assignRolePermission: adminProcedure.input(z.object({ roleId: z.number().int().positive(), permissionId: z.number().int().positive() })).mutation(({ input, ctx }) => assignSystemRolePermission(input, ctx.user)),
    removeUserRole: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ input, ctx }) => removeSystemUserRole(input.id, ctx.user)),
    removeRolePermission: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ input, ctx }) => removeSystemRolePermission(input.id, ctx.user)),
  }),
  controlData: publicProcedure.query(() => getErpControlData()),
  oracle: router({ status: publicProcedure.query(() => getOracleBridgeStatus()) }),
  reports: router({
    catalog: publicProcedure.query(() => getFinancialReportCatalog()),
    run: protectedProcedure.input(z.object({ reportCode: z.enum(["GLSR001", "ARSR041", "MRPREP001"]), search: z.string().optional(), limit: z.number().int().min(1).max(500).default(100) })).query(({ input }) => runFinancialReport(input)),
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
    accountCatalog: protectedProcedure.input(z.object({ search: z.string().optional(), limit: z.number().int().min(1).max(500).default(500) }).optional()).query(({ input }) => getAccountCatalog(input?.search, input?.limit ?? 500)),
    records: protectedProcedure.input(z.object({ legacyForm: z.string().min(1).max(160), search: z.string().optional(), limit: z.number().int().min(1).max(100).default(20) })).query(({ input }): Promise<any[]> => {
      const form = input.legacyForm.replace(/\.fmx$/i, "").toUpperCase();
      if (["GLSR001", "ARSR041", "MRPREP001"].includes(form)) return runFinancialReport({ reportCode: form, search: input.search, limit: input.limit }).then((result) => result.rows);
      if (form === "ARST001") return Promise.resolve([]);
      if (form === "APSR001") return getPurchaseIntegrationReport({ status: "ALL" }).then((result) => result.rows);
      if (form === "ADMT027") return searchSystemUsers(input.search, input.limit);
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
    itemTrace: protectedProcedure.input(z.object({ itemId: z.number().int().positive(), warehouseId: z.number().int().positive().optional() })).query(({ input }) => getItemTrace(input.itemId, input.warehouseId)),
    saveCustomer: adminProcedure.input(partyInput).mutation(({ input }) => saveCustomer(input)),
    deleteCustomer: adminProcedure.input(z.object({ id: z.number().int().positive(), actor: z.string().optional() })).mutation(({ input, ctx }) => deleteCustomer({ id: input.id, actor: ctx.user.openId })),
    saveSupplier: adminProcedure.input(partyInput).mutation(({ input }) => saveSupplier(input)),
    deleteSupplier: adminProcedure.input(z.object({ id: z.number().int().positive(), actor: z.string().optional() })).mutation(({ input, ctx }) => deleteSupplier({ id: input.id, actor: ctx.user.openId })),
    saveCashBox: protectedProcedure.input(cashBoxInput).mutation(({ input }) => saveCashBox(input)),
    saveBank: protectedProcedure.input(bankInput).mutation(({ input }) => saveBank(input)),
    saveItem: adminProcedure.input(itemInput).mutation(({ input }) => saveItem(input)),
    deleteItem: adminProcedure.input(z.object({ id: z.number().int().positive(), actor: z.string().optional() })).mutation(({ input, ctx }) => deleteItem({ id: input.id, actor: ctx.user.openId })),
    saveJournal: adminProcedure.input(z.object({ journalNo: z.string().min(1).max(80), entryType: z.string().min(1).max(40), actor: z.string().optional(), lines: z.array(journalLine).min(2) })).mutation(({ input, ctx }) => saveJournal({ ...input, actor: ctx.user.openId })),
    createJournalDraft: adminProcedure.input(journalWorkflowInput).mutation(({ input, ctx }) => createJournalDraft({ ...input, actor: ctx.user.openId })),
    validateJournal: adminProcedure.input(z.object({ id: z.number().int().positive(), actor: z.string().optional() })).mutation(({ input, ctx }) => validateJournalEntry(input.id, ctx.user.openId)),
    approveJournal: adminProcedure.input(z.object({ id: z.number().int().positive(), actor: z.string().optional() })).mutation(({ input, ctx }) => approveJournalEntry(input.id, ctx.user.openId)),
    postJournal: adminProcedure.input(z.object({ id: z.number().int().positive(), actor: z.string().optional() })).mutation(({ input, ctx }) => postJournalEntry(input.id, ctx.user.openId)),
    reverseJournal: adminProcedure.input(z.object({ id: z.number().int().positive(), actor: z.string().optional() })).mutation(({ input, ctx }) => reverseJournalEntry(input.id, ctx.user.openId)),
    generalLedger: protectedProcedure.input(z.object({ accountCode: z.string().max(80).optional(), from: z.string().optional(), to: z.string().optional(), limit: z.number().int().min(1).max(5000).default(500) }).optional()).query(({ input }) => getGeneralLedgerReport(input || {})),
    trialBalance: protectedProcedure.input(z.object({ from: z.string().optional(), to: z.string().optional(), limit: z.number().int().min(1).max(5000).default(5000) }).optional()).query(({ input }) => getTrialBalanceReport(input || {})),
    reconciliation: protectedProcedure.input(z.object({ companyId: z.number().int().positive().default(1) }).optional()).query(({ input }) => getGlReconciliationSnapshot(input?.companyId || 1)),
    saveSystemUser: adminProcedure.input(z.object({ id: z.number().int().positive().optional(), openId: z.string().min(1).max(64), name: z.string().max(500).optional(), email: z.string().email().optional(), role: z.enum(["user", "admin"]).default("user"), loginMethod: z.string().max(64).optional() })).mutation(({ input }) => saveWindowSystemUser(input)),
    saveBranch: protectedProcedure.input(z.object({ id: z.number().int().positive().optional(), companyId: z.number().int().positive().default(1), code: z.string().min(1).max(30), name: z.string().min(1).max(200), active: z.number().int().min(0).max(1).default(1) })).mutation(({ input }) => saveBranch(input)),
    saveWarehouse: protectedProcedure.input(z.object({ id: z.number().int().positive().optional(), companyId: z.number().int().positive().default(1), code: z.string().min(1).max(30), name: z.string().min(1).max(200), active: z.number().int().min(0).max(1).default(1) })).mutation(({ input }) => saveWarehouse(input)),
    currencies: publicProcedure.query(() => getCurrencies()),
    saveCurrency: protectedProcedure.input(z.object({ code: z.string().length(3), name: z.string().min(1).max(120), decimalScale: z.number().int().min(0).max(6).default(2), active: z.number().int().min(0).max(1).default(1) })).mutation(({ input }) => saveCurrency(input)),
    saveAccount: protectedProcedure.input(z.object({ id: z.number().int().positive().optional(), companyId: z.number().int().positive().default(1), code: z.string().min(1).max(80), name: z.string().min(1).max(240), accountType: z.string().min(1).max(30), parentCode: z.string().max(80).optional(), levelNo: z.number().int().min(0).max(99).default(0), allowPosting: z.number().int().min(0).max(1).default(1), normalBalance: z.enum(["DEBIT", "CREDIT"]).default("DEBIT"), isControlAccount: z.number().int().min(0).max(1).default(0), cashFlowCategory: z.string().max(40).optional(), salesAccount: z.number().int().min(0).max(1).default(0), purchaseAccount: z.number().int().min(0).max(1).default(0), inventoryAccount: z.number().int().min(0).max(1).default(0), cogsAccount: z.number().int().min(0).max(1).default(0), currencyCode: z.string().length(3).default("SAR"), active: z.number().int().min(0).max(1).default(1), status: z.enum(["ACTIVE", "BLOCKED", "CLOSED"]).default("ACTIVE"), legacyCode: z.string().max(80).optional(), legacySource: z.string().max(120).optional() })).mutation(({ input }) => saveAccount(input)),
    importAccounts: protectedProcedure.input(z.object({ companyId: z.number().int().positive().default(1), actor: z.string().max(100).default("workbench.user"), rows: z.array(z.object({ code: z.string().min(1).max(80), name: z.string().min(1).max(240), accountType: z.string().min(1).max(30), parentCode: z.string().max(80).optional(), currencyCode: z.string().length(3).default("SAR"), active: z.number().int().min(0).max(1).default(1) })).min(1).max(1000) })).mutation(({ input }) => importAccounts(input)),
    deleteAccount: protectedProcedure.input(z.object({ id: z.number().int().positive(), actor: z.string().max(100).default("workbench.user") })).mutation(({ input }) => deleteAccount(input)),
    deleteRecord: adminProcedure.input(z.object({ legacyForm: z.string().min(1).max(160), id: z.number().int().positive(), actor: z.string().optional() })).mutation(({ input, ctx }) => deleteWindowRecord({ ...input, actor: ctx.user.openId })),
    executeAction: adminProcedure.input(z.object({ legacyForm: z.string().min(1).max(160), action: z.string().min(1).max(80), actor: z.string().optional(), requestId: z.string().min(1).max(160).default("workbench-request") })).mutation(async ({ input, ctx }) => {
      const contract = await getWindowContract(input.legacyForm);
      if (!contract.actions.includes(input.action)) throw new Error("ACTION_NOT_ALLOWED_FOR_WINDOW");
      return executeOracleAction({ legacyForm: contract.legacyForm, action: input.action, coreApi: contract.coreApi, procedures: contract.evidence.procedures, actor: ctx.user.openId });
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
  salesOrders: router({
    create: protectedProcedure.input(z.object({ orderNo: z.string().min(1), customerId: z.number().int().positive(), warehouseId: z.number().int().positive(), currencyCode: z.string().length(3).default("SAR"), actor: z.string().default("workbench.user"), lines: z.array(invoiceLine).min(1) })).mutation(({ input, ctx }) => { assertErpAction({ role: ctx.user?.role, action: "SALES_ORDER_CREATE", module: "AR" }); return createSalesOrder(input); }),
    approve: protectedProcedure.input(z.object({ orderId: z.number().int().positive(), actor: z.string().default("workbench.user") })).mutation(({ input, ctx }) => { assertErpAction({ role: ctx.user?.role, action: "SALES_ORDER_APPROVE", module: "AR" }); return approveSalesOrder(input.orderId, input.actor); }),
    issueCreate: protectedProcedure.input(z.object({ issueNo: z.string().min(1), salesOrderId: z.number().int().positive(), actor: z.string().default("workbench.user"), lines: z.array(z.object({ salesOrderLineId: z.number().int().positive(), itemId: z.number().int().positive(), quantity: z.string().min(1) })).min(1) })).mutation(({ input, ctx }) => { assertErpAction({ role: ctx.user?.role, action: "GOODS_ISSUE_CREATE", module: "AR" }); return createGoodsIssue(input); }),
    issuePost: protectedProcedure.input(z.object({ issueId: z.number().int().positive(), actor: z.string().default("workbench.user") })).mutation(({ input, ctx }) => { assertErpAction({ role: ctx.user?.role, action: "GOODS_ISSUE_POST", module: "AR" }); return postGoodsIssue(input.issueId, input.actor); }),
  }),
  invoices: router({
    create: protectedProcedure.input(z.object({ docNo: z.string().min(1), customerId: z.number().int().positive(), warehouseId: z.number().int().positive(), salesOrderId: z.number().int().positive().optional(), goodsIssueId: z.number().int().positive().optional(), currencyCode: z.string().length(3).default("SAR"), exchangeRate: z.string().default("1"), paymentMethod: z.enum(["CASH", "CREDIT", "CHECK", "WALLET", "BANK_TRANSFER"]).default("CASH"), paidAmount: z.string().default("0"), paymentReference: z.string().max(160).optional(), lines: z.array(invoiceLine).min(1), actor: z.string().default("demo.user") })).mutation(({ input, ctx }) => { assertErpAction({ role: ctx.user?.role, action: "INVOICE_CREATE", module: "AR" }); return createInvoice(input); }),
    post: protectedProcedure.input(z.object({ invoiceId: z.number().int().positive(), actor: z.string().default("demo.user") })).mutation(({ input, ctx }) => { assertErpAction({ role: ctx.user?.role, action: "INVOICE_POST", module: "AR" }); return postInvoice(input.invoiceId, input.actor); }),
    reverse: protectedProcedure.input(z.object({ invoiceId: z.number().int().positive(), actor: z.string().default("demo.user") })).mutation(({ input, ctx }) => { assertErpAction({ role: ctx.user?.role, action: "INVOICE_REVERSE", module: "AR" }); return reverseInvoice(input.invoiceId, input.actor); }),
  }),
  eInvoices: router({
    status: publicProcedure.input(z.object({ invoiceId: z.number().int().positive() })).query(({ input }) => getEInvoiceStatus(input.invoiceId)),
    provider: publicProcedure.query(() => ({ configured: isEInvoiceProviderConfigured() })),
    submit: protectedProcedure.input(z.object({ invoiceId: z.number().int().positive(), requestId: z.string().min(1).max(160).optional(), actor: z.string().min(1).max(100).default("workbench.user") })).mutation(({ input }) => submitEInvoice(input.invoiceId, input.actor, input.requestId)),
  }),
  purchases: router({
    integrationReport: protectedProcedure.input(z.object({ supplierId: z.number().int().positive().optional(), status: z.enum(["OPEN", "SETTLED", "ALL"]).default("ALL") }).default({ status: "ALL" })).query(({ input }) => getPurchaseIntegrationReport(input)),
    threeWayMatch: protectedProcedure.input(z.object({ orderedQuantity: z.number().nonnegative(), receivedQuantity: z.number().nonnegative(), invoicedQuantity: z.number().nonnegative(), orderedUnitPrice: z.number().nonnegative(), invoicedUnitPrice: z.number().nonnegative(), quantityTolerance: z.number().nonnegative().optional(), priceTolerance: z.number().nonnegative().optional() })).query(({ input }) => validateThreeWayMatch(input)),
    orderCreate: protectedProcedure.input(z.object({ orderNo: z.string().min(1), supplierId: z.number().int().positive(), warehouseId: z.number().int().positive(), currencyCode: z.string().length(3).default("SAR"), actor: z.string().default("workbench.user"), lines: z.array(invoiceLine).min(1) })).mutation(({ input, ctx }) => { assertErpAction({ role: ctx.user?.role, action: "PURCHASE_ORDER_CREATE", module: "AP" }); return createPurchaseOrder(input); }),
    orderApprove: protectedProcedure.input(z.object({ orderId: z.number().int().positive(), actor: z.string().default("workbench.user") })).mutation(({ input, ctx }) => { assertErpAction({ role: ctx.user?.role, action: "PURCHASE_ORDER_APPROVE", module: "AP" }); return approvePurchaseOrder(input.orderId, input.actor); }),
    receiptCreate: protectedProcedure.input(z.object({ receiptNo: z.string().min(1), purchaseOrderId: z.number().int().positive(), actor: z.string().default("workbench.user"), lines: z.array(z.object({ purchaseOrderLineId: z.number().int().positive(), itemId: z.number().int().positive(), quantity: z.string().min(1), unitCost: z.string().min(1) })).min(1) })).mutation(({ input, ctx }) => { assertErpAction({ role: ctx.user?.role, action: "GOODS_RECEIPT_CREATE", module: "AP" }); return createGoodsReceipt(input); }),
    receiptPost: protectedProcedure.input(z.object({ receiptId: z.number().int().positive(), actor: z.string().default("workbench.user") })).mutation(({ input, ctx }) => { assertErpAction({ role: ctx.user?.role, action: "GOODS_RECEIPT_POST", module: "AP" }); return postGoodsReceipt(input.receiptId, input.actor); }),
    create: protectedProcedure.input(z.object({ docNo: z.string().min(1), supplierId: z.number().int().positive(), warehouseId: z.number().int().positive(), purchaseOrderId: z.number().int().positive().optional(), goodsReceiptId: z.number().int().positive().optional(), currencyCode: z.string().length(3).default("SAR"), exchangeRate: z.string().default("1"), paymentMethod: z.enum(["CASH", "CREDIT", "CHECK", "WALLET", "BANK_TRANSFER"]).default("CREDIT"), paidAmount: z.string().default("0"), paymentReference: z.string().max(160).optional(), lines: z.array(invoiceLine).min(1), actor: z.string().default("workbench.user") })).mutation(({ input, ctx }) => { assertErpAction({ role: ctx.user?.role, action: "INVOICE_CREATE", module: "AP" }); return createPurchaseInvoice(input); }),
    post: protectedProcedure.input(z.object({ invoiceId: z.number().int().positive(), actor: z.string().default("workbench.user") })).mutation(({ input, ctx }) => { assertErpAction({ role: ctx.user?.role, action: "INVOICE_POST", module: "AP" }); return postPurchaseInvoice(input.invoiceId, input.actor); }),
    reverse: protectedProcedure.input(z.object({ invoiceId: z.number().int().positive(), actor: z.string().default("workbench.user") })).mutation(({ input, ctx }) => { assertErpAction({ role: ctx.user?.role, action: "INVOICE_REVERSE", module: "AP" }); return reversePurchaseInvoice(input.invoiceId, input.actor); }),
  }),
  adjustments: router({
    nextNumber: publicProcedure.input(z.object({ documentKind: z.enum(["SALES_RETURN", "PURCHASE_RETURN"]) })).query(({ input }) => nextAdjustmentNumber(input.documentKind)),
    source: publicProcedure.input(z.object({ invoiceId: z.number().int().positive(), invoiceType: z.enum(["SALE", "PURCHASE"]) })).query(({ input }) => getInvoiceReturnSource(input.invoiceId, input.invoiceType)),
    searchInvoices: publicProcedure.input(z.object({ search: z.string().optional(), invoiceType: z.enum(["SALE", "PURCHASE"]), partyId: z.number().int().positive().optional(), limit: z.number().int().min(1).max(50).default(20) })).query(async ({ input }) => (await searchInvoices(input.search, input.limit) as any[]).filter((invoice: any) => invoice.invoiceType === input.invoiceType && (!input.partyId || (input.invoiceType === "SALE" ? invoice.customerId === input.partyId : invoice.supplierId === input.partyId)))),
    create: protectedProcedure.input(z.object({ docNo: z.string().min(1), documentKind: z.enum(["SALES_RETURN", "PURCHASE_RETURN", "SALES_DISCOUNT", "SALES_ADDITION", "PURCHASE_DISCOUNT", "PURCHASE_ADDITION"]), originalInvoiceId: z.number().int().positive(), reason: z.string().max(500).optional(), lines: z.array(invoiceLine).min(1), actor: z.string().default("workbench.user") })).mutation(({ input, ctx }) => { if (input.documentKind.startsWith("SALES_")) assertErpAction({ role: ctx.user?.role, action: "SALES_RETURN_CREATE", module: "AR" }); return createAdjustmentNote(input); }),
    post: protectedProcedure.input(z.object({ adjustmentId: z.number().int().positive(), actor: z.string().default("workbench.user") })).mutation(({ input, ctx }) => { assertErpAction({ role: ctx.user?.role, action: "SALES_RETURN_POST", module: "AR" }); return postAdjustmentNote(input.adjustmentId, input.actor); }),
  }),
  vouchers: router({
    receiptCreate: protectedProcedure.input(z.object({ voucherNo: z.string().min(1).max(80), companyId: z.number().int().positive().default(1), customerId: z.number().int().positive(), cashAccountCode: z.string().min(1).max(80), currencyCode: z.string().length(3).default("SAR"), amount: z.string().min(1), reference: z.string().max(160).optional(), actor: z.string().default("workbench.user"), allocations: z.array(z.object({ invoiceId: z.number().int().positive(), amount: z.string().min(1) })).min(1) })).mutation(({ input, ctx }) => { assertErpAction({ role: ctx.user?.role, action: "PAYMENT_CREATE", module: "AR" }); return createReceiptVoucher({ ...input, actor: ctx.user.openId, partyId: input.customerId }); }),
    receiptPost: protectedProcedure.input(z.object({ voucherId: z.number().int().positive(), actor: z.string().optional() })).mutation(({ input, ctx }) => { assertErpAction({ role: ctx.user?.role, action: "PAYMENT_POST", module: "AR" }); return postReceiptVoucher(input.voucherId, ctx.user.openId); }),
    paymentCreate: protectedProcedure.input(z.object({ voucherNo: z.string().min(1).max(80), companyId: z.number().int().positive().default(1), supplierId: z.number().int().positive(), cashAccountCode: z.string().min(1).max(80), currencyCode: z.string().length(3).default("SAR"), amount: z.string().min(1), reference: z.string().max(160).optional(), actor: z.string().default("workbench.user"), allocations: z.array(z.object({ invoiceId: z.number().int().positive(), amount: z.string().min(1) })).min(1) })).mutation(({ input, ctx }) => { assertErpAction({ role: ctx.user?.role, action: "PAYMENT_CREATE", module: "AP" }); return createPaymentVoucher({ ...input, actor: ctx.user.openId, partyId: input.supplierId }); }),
    paymentPost: protectedProcedure.input(z.object({ voucherId: z.number().int().positive(), actor: z.string().optional() })).mutation(({ input, ctx }) => { assertErpAction({ role: ctx.user?.role, action: "PAYMENT_POST", module: "AP" }); return postPaymentVoucher(input.voucherId, ctx.user.openId); }),
  }),
  inventory: router({
    warehouses: publicProcedure.query(() => listWarehouses()),
    receive: protectedProcedure.input(z.object({ itemId: z.number().int().positive(), warehouseId: z.number().int().positive(), quantity: z.string().min(1), unitCost: z.string().min(1), actor: z.string().optional(), reference: z.string().min(1).max(80) })).mutation(({ input, ctx }) => { assertErpAction({ role: ctx.user?.role, action: "INVENTORY_RECEIVE", module: "INV" }); return receiveStock({ ...input, actor: ctx.user.openId }); }),
    countCreate: protectedProcedure.input(z.object({ countNo: z.string().min(1).max(80), warehouseId: z.number().int().positive(), countMode: z.enum(["PERIODIC", "CYCLE"]), actor: z.string().optional(), notes: z.string().max(500).optional(), lines: z.array(z.object({ itemId: z.number().int().positive(), countedQuantity: z.string().min(1) })).min(1) })).mutation(({ input, ctx }) => { assertErpAction({ role: ctx.user?.role, action: "INVENTORY_COUNT_CREATE", module: "INV" }); return createInventoryCount({ ...input, actor: ctx.user.openId }); }),
    countPost: protectedProcedure.input(z.object({ countId: z.number().int().positive(), actor: z.string().optional() })).mutation(({ input, ctx }) => { assertErpAction({ role: ctx.user?.role, action: "INVENTORY_COUNT_POST", module: "INV" }); return postInventoryCount(input.countId, ctx.user.openId); }),
    transferCreate: protectedProcedure.input(z.object({ transferNo: z.string().min(1).max(80), sourceWarehouseId: z.number().int().positive(), destinationWarehouseId: z.number().int().positive(), actor: z.string().optional(), lines: z.array(z.object({ itemId: z.number().int().positive(), quantity: z.string().min(1) })).min(1) })).mutation(({ input, ctx }) => { assertErpAction({ role: ctx.user?.role, action: "INVENTORY_TRANSFER_CREATE", module: "INV" }); return createInventoryTransfer({ ...input, actor: ctx.user.openId }); }),
    transferPost: protectedProcedure.input(z.object({ transferId: z.number().int().positive(), actor: z.string().optional() })).mutation(({ input, ctx }) => { assertErpAction({ role: ctx.user?.role, action: "INVENTORY_TRANSFER_POST", module: "INV" }); return postInventoryTransfer(input.transferId, ctx.user.openId); }),
  }),
});

export type AppRouter = typeof appRouter;
