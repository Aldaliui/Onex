import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { LOCAL_COOKIE } from "./_core/localAuth";
import { executeOracleAction, getOracleBridgeStatus } from "./_core/oracleBridge";
import { createAdjustmentNote, createInvoice, createPurchaseInvoice, getCatalogSources, getDashboard, getErpControlData, getFinancialReportCatalog, getMasterData, getSystemTree, getWindowCatalog, getWindowContract, getWindowDomains, postAdjustmentNote, postInvoice, postPurchaseInvoice, receiveStock, reverseInvoice, reversePurchaseInvoice, runFinancialReport, saveAccount, saveBank, saveCashBox, saveCustomer, saveItem, saveJournal, saveSupplier, searchCustomers, searchInvoices, searchItems, searchJournals, searchSuppliers, searchSystemUsers } from "./db";

const invoiceLine = z.object({ itemId: z.number().int().positive(), quantity: z.string().min(1), unitPrice: z.string().min(1), taxAmount: z.string().default("0") });
const partyInput = z.object({ id: z.number().int().positive().optional(), companyId: z.number().int().positive().default(1), code: z.string().min(1).max(50), legalName: z.string().min(1).max(250), currencyCode: z.string().length(3).default("SAR"), status: z.enum(["ACTIVE", "BLOCKED", "CLOSED"]).default("ACTIVE") });
const cashBoxInput = z.object({ id: z.number().int().positive().optional(), companyId: z.number().int().positive().default(1), code: z.string().min(1).max(50), name: z.string().min(1).max(250), currencyCode: z.string().length(3).default("SAR"), status: z.enum(["ACTIVE", "BLOCKED", "CLOSED"]).default("ACTIVE") });
const bankInput = cashBoxInput.extend({ accountNumber: z.string().max(100).optional() });
const itemInput = z.object({ id: z.number().int().positive().optional(), companyId: z.number().int().positive().default(1), code: z.string().min(1).max(80), description: z.string().min(1).max(500), stockFlag: z.number().int().min(0).max(1).default(1), unitCost: z.string().default("0"), revenueAccount: z.string().default("4100"), inventoryAccount: z.string().default("1300"), cogsAccount: z.string().default("5100"), active: z.number().int().min(0).max(1).default(1) });
const journalLine = z.object({ accountCode: z.string().min(1).max(80), accountName: z.string().max(240).optional(), description: z.string().max(500).optional(), debit: z.string().default("0"), credit: z.string().default("0") });

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => { const cookieOptions = getSessionCookieOptions(ctx.req); ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 }); if (ctx.req.headers.cookie?.includes("onex_local_session=")) ctx.res.clearCookie(LOCAL_COOKIE, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" }); return { success: true } as const; }),
  }),
  dashboard: publicProcedure.query(() => getDashboard()),
  masterData: publicProcedure.query(() => getMasterData()),
  controlData: publicProcedure.query(() => getErpControlData()),
  oracle: router({ status: publicProcedure.query(() => getOracleBridgeStatus()) }),
  reports: router({
    catalog: publicProcedure.query(() => getFinancialReportCatalog()),
    run: publicProcedure.input(z.object({ reportCode: z.enum(["GLSR001", "ARSR041", "MRPREP001"]), search: z.string().optional(), limit: z.number().int().min(1).max(500).default(100) })).query(({ input }) => runFinancialReport(input)),
  }),
  windows: router({
    list: publicProcedure.input(z.object({ search: z.string().optional(), domain: z.string().optional(), limit: z.number().int().min(1).max(500).default(80) }).optional()).query(({ input }) => getWindowCatalog(input?.search, input?.domain, input?.limit ?? 80)),
    domains: publicProcedure.query(() => getWindowDomains()),
    tree: publicProcedure.query(() => getSystemTree()),
    sources: publicProcedure.query(() => getCatalogSources()),
    contract: publicProcedure.input(z.object({ legacyForm: z.string().min(1).max(160) })).query(({ input }) => getWindowContract(input.legacyForm)),
    records: publicProcedure.input(z.object({ legacyForm: z.string().min(1).max(160), search: z.string().optional(), limit: z.number().int().min(1).max(100).default(20) })).query(({ input }): Promise<any[]> => {
      const form = input.legacyForm.replace(/\.fmx$/i, "").toUpperCase();
      if (["GLSR001", "ARSR041", "MRPREP001"].includes(form)) return runFinancialReport({ reportCode: form, search: input.search, limit: input.limit }).then((result) => result.rows);
      if (form === "ADMT027") return searchSystemUsers(input.search, input.limit);
      if (form.startsWith("ARST004")) return searchInvoices(input.search, input.limit);
      if (form.startsWith("ARST") || form.startsWith("ARSR")) return searchCustomers(input.search, input.limit);
      if (form.startsWith("APST") || form.startsWith("APSR")) return searchSuppliers(input.search, input.limit);
      if (form.startsWith("INVT") || form.startsWith("INVI")) return searchItems(input.search, input.limit);
      if (form.startsWith("POST")) return searchInvoices(input.search, input.limit);
      if (form.startsWith("GLST") || form.startsWith("GLSI") || form.startsWith("GLSR")) return searchJournals(input.search, input.limit);
      return Promise.resolve([]);
    }),
    saveCustomer: protectedProcedure.input(partyInput).mutation(({ input }) => saveCustomer(input)),
    saveSupplier: protectedProcedure.input(partyInput).mutation(({ input }) => saveSupplier(input)),
    saveCashBox: protectedProcedure.input(cashBoxInput).mutation(({ input }) => saveCashBox(input)),
    saveBank: protectedProcedure.input(bankInput).mutation(({ input }) => saveBank(input)),
    saveItem: protectedProcedure.input(itemInput).mutation(({ input }) => saveItem(input)),
    saveJournal: protectedProcedure.input(z.object({ journalNo: z.string().min(1).max(80), entryType: z.string().min(1).max(40), actor: z.string().default("workbench.user"), lines: z.array(journalLine).min(2) })).mutation(({ input }) => saveJournal(input)),
    saveAccount: protectedProcedure.input(z.object({ id: z.number().int().positive().optional(), companyId: z.number().int().positive().default(1), code: z.string().min(1).max(80), name: z.string().min(1).max(240), accountType: z.string().min(1).max(30), parentCode: z.string().max(80).optional(), currencyCode: z.string().length(3).default("SAR"), active: z.number().int().min(0).max(1).default(1) })).mutation(({ input }) => saveAccount(input)),
    executeAction: publicProcedure.input(z.object({ legacyForm: z.string().min(1).max(160), action: z.string().min(1).max(80) })).mutation(async ({ input }) => {
      const contract = await getWindowContract(input.legacyForm);
      if (!contract.actions.includes(input.action)) throw new Error("ACTION_NOT_ALLOWED_FOR_WINDOW");
      return executeOracleAction({ legacyForm: contract.legacyForm, action: input.action, coreApi: contract.coreApi, procedures: contract.evidence.procedures, actor: "workbench.user" });
    }),
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
    create: protectedProcedure.input(z.object({ docNo: z.string().min(1), customerId: z.number().int().positive(), warehouseId: z.number().int().positive(), currencyCode: z.string().length(3).default("SAR"), exchangeRate: z.string().default("1"), paymentMethod: z.enum(["CASH", "CREDIT", "CHECK", "WALLET", "BANK_TRANSFER"]).default("CASH"), paidAmount: z.string().default("0"), paymentReference: z.string().max(160).optional(), lines: z.array(invoiceLine).min(1), actor: z.string().default("demo.user") })).mutation(({ input }) => createInvoice(input)),
    post: protectedProcedure.input(z.object({ invoiceId: z.number().int().positive(), actor: z.string().default("demo.user") })).mutation(({ input }) => postInvoice(input.invoiceId, input.actor)),
    reverse: protectedProcedure.input(z.object({ invoiceId: z.number().int().positive(), actor: z.string().default("demo.user") })).mutation(({ input }) => reverseInvoice(input.invoiceId, input.actor)),
  }),
  purchases: router({
    create: protectedProcedure.input(z.object({ docNo: z.string().min(1), supplierId: z.number().int().positive(), warehouseId: z.number().int().positive(), currencyCode: z.string().length(3).default("SAR"), exchangeRate: z.string().default("1"), paymentMethod: z.enum(["CASH", "CREDIT", "CHECK", "WALLET", "BANK_TRANSFER"]).default("CREDIT"), paidAmount: z.string().default("0"), paymentReference: z.string().max(160).optional(), lines: z.array(invoiceLine).min(1), actor: z.string().default("workbench.user") })).mutation(({ input }) => createPurchaseInvoice(input)),
    post: protectedProcedure.input(z.object({ invoiceId: z.number().int().positive(), actor: z.string().default("workbench.user") })).mutation(({ input }) => postPurchaseInvoice(input.invoiceId, input.actor)),
    reverse: protectedProcedure.input(z.object({ invoiceId: z.number().int().positive(), actor: z.string().default("workbench.user") })).mutation(({ input }) => reversePurchaseInvoice(input.invoiceId, input.actor)),
  }),
  adjustments: router({
    create: protectedProcedure.input(z.object({ docNo: z.string().min(1), documentKind: z.enum(["SALES_RETURN", "PURCHASE_RETURN", "SALES_DISCOUNT", "SALES_ADDITION", "PURCHASE_DISCOUNT", "PURCHASE_ADDITION"]), originalInvoiceId: z.number().int().positive(), reason: z.string().max(500).optional(), lines: z.array(invoiceLine).min(1), actor: z.string().default("workbench.user") })).mutation(({ input }) => createAdjustmentNote(input)),
    post: protectedProcedure.input(z.object({ adjustmentId: z.number().int().positive(), actor: z.string().default("workbench.user") })).mutation(({ input }) => postAdjustmentNote(input.adjustmentId, input.actor)),
  }),
  inventory: router({
    receive: protectedProcedure.input(z.object({ itemId: z.number().int().positive(), warehouseId: z.number().int().positive(), quantity: z.string().min(1), unitCost: z.string().min(1), actor: z.string().default("workbench.user"), reference: z.string().min(1).max(80) })).mutation(({ input }) => receiveStock(input)),
  }),
});

export type AppRouter = typeof appRouter;
