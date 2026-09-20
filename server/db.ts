import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ENV } from "./_core/env";
import { accounts, adjustmentNoteLines, adjustmentNotes, auditEvents, banks, branches, cashBoxes, companies, customers, documentEvents, eInvoiceSubmissions, fiscalPeriods, inventoryBatches, inventoryCountLines, inventoryCounts, inventorySerials, inventoryTransferLines, inventoryTransfers, invoices, invoiceLines, items, journalEntries, journalEntryLines, paymentAllocations, paymentVouchers, receiptAllocations, receiptVouchers, stockBalances, stockLocationBalances, stockMovements, suppliers, systemSettings, warehouseLocations, warehouses, windowContracts, windowExecutions, windowRegistry, type InsertUser, users } from "../drizzle/schema";
import { buildPurchaseJournal, buildReversalJournal, buildSaleJournal, calculateInvoice, canPostToPeriod, validateJournal } from "./accountingCore";
import { assertAtomicPost, assertAtomicReverse } from "./documentLifecycle";
import { getLegacyWindowContract } from "./legacyWindowContracts";
import { assertStockRule, calculateMovingAverage } from "./inventoryKernel";
import { createCloudSalesInvoice, getCloudAccounts, getCloudCurrencies, getCloudItemTrace, getCloudMasterData, importCloudAccounts, isCloudflareD1Enabled, postCloudSalesInvoice, reverseCloudSalesInvoice, saveCloudAccount, saveCloudBank, saveCloudCashBox, saveCloudCurrency, saveCloudWarehouse } from "./cloudflareD1";
import { buildEInvoicePayload, getEInvoiceProvider, type EInvoiceStatus } from "./eInvoicing";

let _db: ReturnType<typeof drizzle> | null = null;
let demoInvoiceSequence = 1000;
const demoInvoices = new Map<number, { invoiceId: number; docNo: string; subtotal: number; taxTotal: number; grandTotal: number; status: "DRAFT" | "POSTED" | "REVERSED" }>();
const demoPurchaseInvoices = new Map<number, { invoiceId: number; docNo: string; subtotal: number; taxTotal: number; grandTotal: number; status: "DRAFT" | "POSTED" | "REVERSED" }>();
const demoAdjustments = new Map<number, { adjustmentId: number; docNo: string; documentKind: string; grandTotal: number; status: "DRAFT" | "POSTED" | "REVERSED" }>();
const demoInventoryCounts = new Map<number, { countId: number; countNo: string; warehouseId: number; countMode: "PERIODIC" | "CYCLE"; status: "DRAFT" | "POSTED" | "CANCELLED"; lines: { itemId: number; systemQuantity: number; countedQuantity: number; unitCost: number }[] }>();
const demoSuppliers: Array<{ id: number; companyId: number; accountId?: number; code: string; legalName: string; currencyCode: string; status: "ACTIVE" | "BLOCKED" | "CLOSED" }> = [{ id: 1, companyId: 1, accountId: 4, code: "SUP-001", legalName: "مورد تجريبي", currencyCode: "SAR", status: "ACTIVE" }];
const demoCustomers: Array<{ id: number; companyId: number; accountId?: number; code: string; legalName: string; currencyCode: string; status: "ACTIVE" | "BLOCKED" | "CLOSED" }> = [{ id: 1, companyId: 1, accountId: 5, code: "CUST-001", legalName: "عميل تجريبي", currencyCode: "SAR", status: "ACTIVE" }];
const demoCashBoxes: Array<{ id: number; companyId: number; accountId?: number; code: string; name: string; currencyCode: string; status: "ACTIVE" | "BLOCKED" | "CLOSED" }> = [{ id: 1, companyId: 1, accountId: 1, code: "CASH-001", name: "الصندوق الرئيسي", currencyCode: "SAR", status: "ACTIVE" }];
const demoBanks: Array<{ id: number; companyId: number; accountId?: number; code: string; name: string; accountNumber: string; currencyCode: string; status: "ACTIVE" | "BLOCKED" | "CLOSED" }> = [{ id: 1, companyId: 1, accountId: 1, code: "BANK-001", name: "البنك الرئيسي", accountNumber: "", currencyCode: "SAR", status: "ACTIVE" }];
const demoItems = [{ id: 1, companyId: 1, code: "ITEM-001", description: "صنف تجريبي", stockFlag: 1, unitCost: "100", revenueAccount: "4100", inventoryAccount: "1300", cogsAccount: "5100", active: 1 }];
const demoJournals: Array<{ id: number; journalNo: string; entryType: string; totalDebit: string; totalCredit: string; status: "POSTED" }> = [];
const demoWindowExecutions = new Map<string, { status: string; response: unknown }>();
const demoEInvoiceSubmissions = new Map<string, { id: number; invoiceId: number; provider: string; status: EInvoiceStatus; externalId?: string; response?: unknown; errorCode?: string; errorMessage?: string }>();
const demoUsers: Array<{ id: number; openId: string; name: string | null; email: string | null; loginMethod: string; role: "user" | "admin"; lastSignedIn: Date }> = [];
const demoInventoryBalances = new Map<string, { quantity: number; totalCost: number; unitCost: number }>();
const demoInventoryTransfers = new Map<number, { id: number; transferNo: string; sourceWarehouseId: number; destinationWarehouseId: number; status: "DRAFT" | "POSTED"; lines: { itemId: number; quantity: number; unitCost: number }[] }>();
const demoInvoiceLines = new Map<number, LinkedInvoiceLine[]>();
const demoBatchBalances = new Map<string, { quantity: number; unitCost: number }>();
const demoLocationBalances = new Map<string, number>();
const demoSerialStatuses = new Map<string, { warehouseId: number; status: "AVAILABLE" | "SOLD" }>();
const demoBranches = [{ id: 1, companyId: 1, code: "MAIN", name: "الفرع الرئيسي", active: 1 }];
const demoWarehouses = [{ id: 1, companyId: 1, code: "MAIN", name: "المستودع الرئيسي", active: 1 }];
const demoAccounts: Array<{ id: number; companyId: number; code: string; name: string; accountType: string; parentCode?: string; currencyCode: string; active: number }> = [{ id: 1, companyId: 1, code: "1100", name: "النقدية", accountType: "ASSET", currencyCode: "SAR", active: 1 }, { id: 2, companyId: 1, code: "4100", name: "إيرادات المبيعات", accountType: "REVENUE", currencyCode: "SAR", active: 1 }, { id: 3, companyId: 1, code: "5100", name: "تكلفة المبيعات", accountType: "EXPENSE", currencyCode: "SAR", active: 1 }, { id: 4, companyId: 1, code: "2100-0001", name: "مورد تجريبي", accountType: "LIABILITY", parentCode: "2100", currencyCode: "SAR", active: 1 }, { id: 5, companyId: 1, code: "1200-0001", name: "عميل تجريبي", accountType: "ASSET", parentCode: "1200", currencyCode: "SAR", active: 1 }];
const demoPeriods = [{ id: 1, companyId: 1, code: "2026-01", startsOn: new Date("2026-01-01"), endsOn: new Date("2026-01-31"), status: "OPEN" as const }];

type FallbackWindow = {
  id: number; screenNo: string; screenName: string; parentId: string;
  systemNo: string; itemType: string; formName: string; displayOrder: number;
  userPermission: string; companyBranchPermission: string; buildState: string;
  compiledSize: number; rebuildLevel: string; sourceStatus: string;
  observedProcedures: number; observedTriggers: number; observedLibraries: number;
  observedTableIndicators: number; riskFlags: string; specPath: string;
  nextRequiredEvidence: string; legacyForm: string; domainCode: string;
  capability: string; migrationPhase: number; status: string; sourceConfidence: string;
  notes: string;
};

let fallbackWindows: FallbackWindow[] | null = null;
let hierarchyByFile: Map<string, { parentNo: string; sysNo: string; formNo: string; nameAr: string; nameEn: string; orderNo: number; inactive: number }> | null = null;
let cloneManifestByForm: Map<string, any> | null = null;
async function getIdempotentWindowResult(db: any, requestId: string) {
  if (!requestId) return undefined;
  if (!db) { const cached = demoWindowExecutions.get(requestId); return cached?.status === "SUCCEEDED" ? cached.response : undefined; }
  const existing = (await db.select({ status: windowExecutions.status, responseJson: windowExecutions.responseJson }).from(windowExecutions).where(eq(windowExecutions.requestId, requestId)).limit(1))[0];
  if (existing?.status === "SUCCEEDED" && existing.responseJson) { try { return JSON.parse(existing.responseJson); } catch { return undefined; } }
  return undefined;
}
function loadCloneManifest() {
  if (cloneManifestByForm) return cloneManifestByForm;
  cloneManifestByForm = new Map();
  try {
    const payload = JSON.parse(readFileSync(resolve(process.cwd(), "rebuild/window-clones/clone_manifest.json"), "utf8"));
    for (const contract of payload.contracts || []) cloneManifestByForm.set(String(contract.legacyForm).replace(/\.fmx$/i, "").toUpperCase(), contract);
  } catch { /* generated manifest is optional in packaged fallback mode */ }
  return cloneManifestByForm;
}
function loadHierarchy() {
  if (hierarchyByFile) return hierarchyByFile;
  hierarchyByFile = new Map();
  try {
    const lines = readFileSync(resolve(process.cwd(), "database-source/nodes_catalog_links.csv"), "utf8").split(/\r?\n/).filter(Boolean);
    const headers = lines.shift()!.split(",");
    for (const line of lines) {
      const parts = line.split(",");
      const row = Object.fromEntries(headers.map((key, index) => [key, parts[index] || ""]));
      if (row.file_name) hierarchyByFile.set(row.file_name.toUpperCase(), { parentNo: row.parent_no, sysNo: row.sys_no, formNo: row.form_no, nameAr: row.name_ar, nameEn: row.name_en, orderNo: Number(row.order_no || 0), inactive: Number(row.inactive || 0) });
    }
  } catch { /* source is optional when running from a packaged build */ }
  return hierarchyByFile;
}

const csvCache = new Map<string, string[][]>();
function parseCsv(text: string) {
  const rows: string[][] = []; let row: string[] = []; let value = ""; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i]; const next = text[i + 1];
    if (char === '"' && quoted && next === '"') { value += '"'; i++; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === ',' && !quoted) { row.push(value); value = ""; continue; }
    if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && next === '\n') i++; row.push(value); value = ""; if (row.some(Boolean)) rows.push(row); row = []; continue; }
    value += char;
  }
  if (value || row.length) { row.push(value); rows.push(row); }
  return rows;
}
function catalogRow(relativePath: string, key: string, keyColumn = 0) {
  try {
    if (!csvCache.has(relativePath)) csvCache.set(relativePath, parseCsv(readFileSync(resolve(process.cwd(), relativePath), "utf8")));
    const rows = csvCache.get(relativePath)!; const header = rows[0] || [];
    const target = key.toUpperCase().replace(/\.FMX$/, "");
    const found = rows.slice(1).find((item) => (item[keyColumn] || "").toUpperCase().replace(/\.FMX$/, "") === target);
    return found ? Object.fromEntries(header.map((name, index) => [name, found[index] || ""])) : undefined;
  } catch { return undefined; }
}
function loadFallbackWindows(): FallbackWindow[] {
  if (fallbackWindows) return fallbackWindows;
  const csvPath = resolve(process.cwd(), "rebuild-manifest/all_windows_rebuild_status.csv");
  try {
    const lines = readFileSync(csvPath, "utf8").split(/\r?\n/).filter(Boolean).slice(1);
    fallbackWindows = lines.map((line, index) => {
      const parts = line.split(",");
      const form = parts[0] || `WINDOW_${index + 1}.fmx`;
      const category = parts[1] || "other";
      const procedures = Number(parts[5] || 0);
      const triggers = Number(parts[6] || 0);
      const libraries = Number(parts[7] || 0);
      const tableIndicators = Number(parts[8] || 0);
      const rebuildLevel = parts[3] || "catalog_specification";
      const hierarchy = loadHierarchy().get(form.replace(/\.fmx$/i, "").toUpperCase());
      return {
        id: index + 1, screenNo: `SCR-${String(index + 1).padStart(4, "0")}`,
        screenName: hierarchy?.nameAr || hierarchy?.nameEn || form.replace(/\.fmx$/i, ""), parentId: hierarchy?.parentNo || category,
        systemNo: hierarchy?.sysNo ? `ONEX-${hierarchy.sysNo}` : "ONEX", itemType: "FORM", formName: form, displayOrder: hierarchy?.orderNo || index + 1,
        userPermission: category.toUpperCase().includes("ADMIN") ? "ROLE_ADMIN" : "ROLE_USER",
        companyBranchPermission: category.toUpperCase().includes("POS") ? "COMPANY_BRANCH_REQUIRED" : "COMPANY_BRANCH_SCOPE",
        buildState: rebuildLevel === "golden_master_verified" ? "متحقق" : rebuildLevel === "source_reconstruction" ? "قيد البناء" : rebuildLevel === "catalog_specification" ? "مواصفة" : "مفهرسة",
        compiledSize: Number(parts[2] || 0), rebuildLevel, sourceStatus: parts[4] || "FMB_PLL_not_found",
        observedProcedures: procedures, observedTriggers: triggers, observedLibraries: libraries,
        observedTableIndicators: tableIndicators, riskFlags: parts.slice(9, -3).join(","),
        specPath: parts[parts.length - 3] || "", nextRequiredEvidence: parts[parts.length - 1] || "FMB/PLL/PKS/PKB/DDL/Forms Builder",
        legacyForm: form, domainCode: category, capability: `${form.replace(/\.fmx$/i, "")}_COMPAT`, migrationPhase: 3,
        status: "cataloged", sourceConfidence: "FMX_STRING_EVIDENCE", notes: "Fallback catalog loaded from rebuild manifest",
      };
    });
  } catch {
    fallbackWindows = [];
  }
  return fallbackWindows;
}

function fallbackTree(rows = loadFallbackWindows()) {
  const tree = new Map<string, { id: string; label: string; domain: string; groups: { id: string; label: string; windows: FallbackWindow[] }[] }>();
  for (const row of rows) {
    const domain = row.domainCode || "OTHER";
    const prefix = row.legacyForm.replace(/\.fmx$/i, "").match(/^[A-Za-z]+/)?.[0]?.toUpperCase() || "MISC";
    const branch = tree.get(domain) || { id: domain, label: domain, domain, groups: [] };
    let group = branch.groups.find((item) => item.label === prefix);
    if (!group) { group = { id: `${domain}::${prefix}`, label: prefix, windows: [] }; branch.groups.push(group); }
    group.windows.push(row);
    tree.set(domain, branch);
  }
  return Array.from(tree.values()).map((branch) => ({ ...branch, windows: branch.groups.reduce((sum, group) => sum + group.windows.length, 0), groups: branch.groups.map((group) => ({ ...group, count: group.windows.length, windows: group.windows.map((win) => ({ ...win, screenNo: win.screenNo, screenName: win.screenName, parentId: group.id, systemNo: "ONEX", itemType: "FORM", formName: win.legacyForm })) })) }));
}

export async function getDb() {
  // Git catalog mode is the safe default. Enable a real database explicitly with ONEX_USE_DATABASE=1.
  if (process.env.NODE_ENV === "test" || process.env.VITEST || process.env.ONEX_DEMO_MODE === "1" || process.env.ONEX_USE_DATABASE !== "1") return null;
  if (!_db && process.env.DATABASE_URL) {
    _db = drizzle(process.env.DATABASE_URL);
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  const db = await getDb();
  if (!db || !user.openId) return;
  const values: InsertUser = { openId: user.openId, name: user.name, email: user.email, loginMethod: user.loginMethod, lastSignedIn: new Date() };
  const updateSet: Record<string, unknown> = { lastSignedIn: new Date() };
  if (user.name !== undefined) updateSet.name = user.name;
  if (user.email !== undefined) updateSet.email = user.email;
  if (user.loginMethod !== undefined) updateSet.loginMethod = user.loginMethod;
  if (user.role !== undefined) updateSet.role = user.role;
  else if (user.openId === ENV.ownerOpenId) updateSet.role = "admin";
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getWindowCatalog(search?: string, domain?: string, limit = 80) {
  const db = await getDb();
  if (!db) {
    const query = (search || "").toLowerCase();
    return loadFallbackWindows().filter((win) =>
      (!query || `${win.legacyForm} ${win.capability} ${win.domainCode}`.toLowerCase().includes(query)) &&
      (!domain || domain === "ALL" || win.domainCode === domain)
    ).slice(0, limit);
  }
  const filters = [];
  if (search) filters.push(or(like(windowRegistry.legacyForm, `%${search}%`), like(windowRegistry.capability, `%${search}%`)));
  if (domain && domain !== "ALL") filters.push(eq(windowRegistry.domainCode, domain));
  return db.select().from(windowRegistry).where(filters.length ? and(...filters) : undefined).orderBy(windowRegistry.domainCode, windowRegistry.legacyForm).limit(limit);
}

export async function getSystemTree() {
  const db = await getDb();
  if (!db) return fallbackTree();
  const rows = await db.select().from(windowRegistry).orderBy(windowRegistry.domainCode, windowRegistry.legacyForm);
  const categoryLabels: Record<string, string> = {
    'AR/ACCOUNTS-RECEIVABLE': 'الذمم المدينة والمبيعات', 'AP/PURCHASING': 'المشتريات والدائنون', 'GL/FINANCE': 'الحسابات العامة والمالية',
    'INVENTORY/STOCK': 'المخزون والمستودعات', 'MRP/TREASURY': 'التخطيط والخزينة', 'POS': 'نقاط البيع', 'HR': 'الموارد البشرية',
    'ADMIN/SYSTEM': 'الإدارة وإعدادات النظام', 'ASSETS/MAINTENANCE': 'الأصول والصيانة', 'OTHER-FINANCE/OPERATIONS': 'العمليات المالية', 'REPORTS': 'التقارير', 'OTHER': 'نوافذ أخرى'
  };
  const groups = new Map<string, { id: string; label: string; domain: string; windows: typeof rows }>();
  for (const row of rows) {
    const domain = row.domainCode;
    const base = row.legacyForm.replace(/\.fmx$/i, '');
    const prefix = base.match(/^[A-Za-z]+/)?.[0]?.toUpperCase() || 'MISC';
    const key = `${domain}::${prefix}`;
    if (!groups.has(key)) groups.set(key, { id: key, label: prefix, domain, windows: [] });
    groups.get(key)!.windows.push(row);
  }
  const tree = new Map<string, { id: string; label: string; domain: string; groups: { id: string; label: string; windows: typeof rows }[] }>();
  for (const group of Array.from(groups.values())) {
    if (!tree.has(group.domain)) tree.set(group.domain, { id: group.domain, label: categoryLabels[group.domain] || group.domain, domain: group.domain, groups: [] });
    tree.get(group.domain)!.groups.push(group);
  }
  return Array.from(tree.values()).map((branch) => ({ ...branch, windows: branch.groups.reduce((sum: number, group: any) => sum + group.windows.length, 0), groups: branch.groups.sort((a: any, b: any) => a.label.localeCompare(b.label)).map((group: any) => ({ ...group, count: group.windows.length, windows: group.windows.map((win: any) => ({ ...win, screenNo: `SCR-${String(win.id).padStart(4, '0')}`, screenName: win.legacyForm.replace(/\.fmx$/i, ''), parentId: group.id, systemNo: 'ONEX', itemType: 'FORM', formName: win.legacyForm, displayOrder: win.id, userPermission: win.domainCode === 'ADMIN/SYSTEM' ? 'ROLE_ADMIN' : 'ROLE_USER', companyBranchPermission: win.domainCode === 'POS' ? 'COMPANY_BRANCH_REQUIRED' : 'COMPANY_BRANCH_SCOPE', buildState: win.rebuildLevel === 'golden_master_verified' || win.rebuildLevel === 'production_ready' ? 'متحقق' : win.rebuildLevel === 'source_reconstruction' || win.rebuildLevel === 'forms_builder_build' ? 'قيد البناء' : win.rebuildLevel === 'catalog_specification' ? 'مواصفة' : (win.status === 'verified' ? 'متحقق' : 'مفهرس') })) })) }));
}

export async function getWindowDomains() {
  const db = await getDb();
  if (!db) return Array.from(new Set(loadFallbackWindows().map((row) => row.domainCode))).sort();
  const rows = await db.select({ domain: windowRegistry.domainCode }).from(windowRegistry).groupBy(windowRegistry.domainCode).orderBy(windowRegistry.domainCode);
  return rows.map((row) => row.domain);
}

export async function getCatalogSources() {
  const cloneManifest = loadCloneManifest();
  return {
    windowCount: loadFallbackWindows().length || 1490,
    hierarchyCount: loadHierarchy().size,
    specificationCount: 1490,
    catalogCount: 1490,
    runtimeContractCount: 1490,
    fieldEvidenceCatalogCount: 1490,
    cloneManifestCount: cloneManifest.size,
    cloneManifestMode: "COMPATIBILITY_CLONE",
    midoIntegration: {
      repository: "aldalistor/mido",
      repositoryCommit: "873bcda",
      meedoRepository: "aldalistor/Meedo-2",
      formsInventoryCount: 1490,
      oracleTablesImported: 936,
      oracleViewsImported: 200,
      oracleSequencesImported: 13,
      businessModules: ["accounting", "invoices", "inventory", "receivables", "period-close", "reports", "permissions"],
      status: "integrated-reference-layer",
    },
    sourceFiles: [
      "legacy-source/window_catalog.csv",
      "legacy-source/window_runtime_contracts.csv",
      "legacy-source/form_field_trigger_catalog.csv",
      "legacy-source/unified_window_contracts.csv",
      "rebuild/window-clones/clone_manifest.json",
      "legacy-source/recovery_manifest.csv",
      "legacy-source/generated_code_manifest.csv",
      "database-source/nodes_enriched.csv",
      "database-source/nodes_catalog_links.csv",
      "legacy-source/all_window_specs/*.rebuild.md",
      "legacy-source/MIDO_INTEGRATION_STATUS_AR.md",
      "legacy-source/mido/modules/*.js",
      "legacy-source/mido/oracle/migrations/*.sql",
    ],
  };
}

export async function getWindowContract(legacyForm: string) {
  const form = legacyForm.replace(/\.fmx$/i, "");
  const legacyContract = getLegacyWindowContract(form);
  const clone = loadCloneManifest().get(form.toUpperCase());
  const runtime = catalogRow("legacy-source/window_runtime_contracts.csv", form);
  const fields = catalogRow("legacy-source/form_field_trigger_catalog.csv", form);
  const unified = catalogRow("legacy-source/unified_window_contracts.csv", form, 1);
  const manifest = catalogRow("legacy-source/window_catalog.csv", `${form}.fmx`);
  const row = loadFallbackWindows().find((item) => item.legacyForm.replace(/\.fmx$/i, "").toUpperCase() === form.toUpperCase());
  const domain = row?.domainCode || runtime?.domain || "OTHER";
  const moduleByDomain: Record<string, string[]> = { AR: ["receivables-core.js", "commercial-invoice-core.js", "invoice-posting-core.js", "document-cycle-core.js"], AP: ["business-operations-core.js", "commercial-invoice-core.js", "document-cycle-core.js"], GL: ["accounting-core.js", "commercial-accounting-core.js", "chart-of-accounts-core.js", "period-close-core.js"], INVENTORY: ["business-operations-core.js", "invoice-posting-core.js"], POS: ["business-operations-core.js", "commercial-invoice-core.js"], HR: ["business-operations-core.js"] };
  const defaultActions = ["initialize", "query", "new", "validate", "save", "update", "delete", "approve", "post", "reverse", "print", "refresh", "exit"];
  const priorityActions: Record<string, string[]> = {
    ARST004: ["initialize", "query", "new", "validate", "save", "approve", "post", "print", "refresh", "exit"],
    ARST006: ["initialize", "query", "validate", "reverse", "print", "refresh", "exit"],
    ARST023: ["initialize", "query", "validate", "print", "refresh", "exit"],
  };
  const actions = priorityActions[form.toUpperCase()] || clone?.actions || unified?.actions?.split("|").filter(Boolean) || defaultActions;
  const evidence = (value?: string) => (value || "").split(/[;|]/).map((item) => item.trim()).filter(Boolean).slice(0, 40);
  const count = (...values: unknown[]) => { for (const value of values) { const parsed = Number(value); if (Number.isFinite(parsed)) return parsed; } return 0; };
  const cloudCoreCrudForms = new Set(["ARST003", "APSI002", "INVT003", "GLST001"]);
  return {
    legacyForm: `${form}.fmx`, screenName: row?.screenName || form, domain, parentId: row?.parentId || "ROOT",
    source: { manifest: Boolean(manifest), runtime: Boolean(runtime), fields: Boolean(fields), unified: Boolean(unified), specification: `legacy-source/all_window_specs/${form}.rebuild.md` },
    counts: { fields: count(fields?.fields, unified?.window_field_evidence_count, runtime?.observed_field_count, row?.observedProcedures), procedures: count(manifest?.procedures, runtime?.observed_procedure_count, row?.observedProcedures), triggers: count(manifest?.triggers, runtime?.observed_trigger_count, row?.observedTriggers), tables: count(manifest?.tables, runtime?.observed_table_count, row?.observedTableIndicators) },
    evidence: { fields: evidence(fields?.fields), procedures: evidence(fields?.procedures || runtime?.legacy_packages), triggers: evidence(fields?.triggers), tables: evidence(fields?.tables) },
    actions: legacyContract?.actions || actions, coreApi: legacyContract?.coreApi || unified?.core_api || runtime?.core_api || `ONEX_${domain.replace(/[^A-Z]/gi, "_")}_WINDOW_API`,
    midoModules: moduleByDomain[domain.split("/")[0].toUpperCase()] || ["business-operations-core.js", "document-cycle-core.js"],
    legacyContract,
    status: cloudCoreCrudForms.has(form.toUpperCase()) || legacyContract?.implementationStatus === "IMPLEMENTED" ? "IMPLEMENTED_WITH_CLOUD_CORE" : unified?.production_status || "NOT_READY_FOR_PRODUCTION", specificationPath: `legacy-source/all_window_specs/${form}.rebuild.md`,
    clone: clone?.rebuild || (priorityActions[form.toUpperCase()] ? { mode: "COMPATIBILITY_CLONE", sourceForm: `${form}.fmx`, sourceAvailable: false, updateTrack: "AR_CORE_PHASE1" } : undefined),
  };
}

export async function getDashboard() {
  const db = await getDb();
  if (!db) return { windows: loadFallbackWindows().length || 1490, domains: new Set(loadFallbackWindows().map((row) => row.domainCode)).size || 12, invoices: 0, stockValue: "0.00", journals: 0, recentInvoices: [] };
  const [windowCount, domainCount, invoiceCount, stockValue, journalCount, recentInvoices] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(windowRegistry),
    db.select({ count: sql<number>`count(distinct ${windowRegistry.domainCode})` }).from(windowRegistry),
    db.select({ count: sql<number>`count(*)` }).from(invoices),
    db.select({ total: sql<string>`coalesce(sum(${stockBalances.totalCost}), 0)` }).from(stockBalances),
    db.select({ count: sql<number>`count(*)` }).from(journalEntries),
    db.select().from(invoices).orderBy(desc(invoices.createdAt)).limit(6),
  ]);
  return { windows: Number(windowCount[0]?.count ?? 0), domains: Number(domainCount[0]?.count ?? 0), invoices: Number(invoiceCount[0]?.count ?? 0), stockValue: String(stockValue[0]?.total ?? "0"), journals: Number(journalCount[0]?.count ?? 0), recentInvoices };
}

export async function getMasterData(): Promise<any> {
  if (isCloudflareD1Enabled()) return getCloudMasterData();
  const db = await getDb();
  if (!db) return {
    companies: [{ id: 1, code: "ONEX", name: "شركة Onyx التجريبية", baseCurrency: "SAR" }],
    customers: demoCustomers,
    suppliers: demoSuppliers,
    cashBoxes: demoCashBoxes,
    banks: demoBanks,
    items: [{ id: 1, companyId: 1, code: "ITEM-001", description: "صنف تجريبي", stockFlag: 1, unitCost: "100", revenueAccount: "4100", inventoryAccount: "1300", cogsAccount: "5100", active: 1 }],
    warehouses: [{ id: 1, companyId: 1, code: "MAIN", name: "المستودع الرئيسي", active: 1 }],
    balances: [{ balance: { quantity: "100", totalCost: "10000", unitCost: "100" }, item: { code: "ITEM-001" }, warehouse: { code: "MAIN" } }],
  };
  const [companyRows, customerRows, supplierRows, cashBoxRows, bankRows, itemRows, warehouseRows, balanceRows] = await Promise.all([
    db.select().from(companies).limit(20), db.select().from(customers).limit(100), db.select().from(suppliers).limit(100), db.select().from(cashBoxes).limit(100), db.select().from(banks).limit(100), db.select().from(items).limit(100), db.select().from(warehouses).limit(50), db.select({ balance: stockBalances, item: items, warehouse: warehouses }).from(stockBalances).leftJoin(items, eq(stockBalances.itemId, items.id)).leftJoin(warehouses, eq(stockBalances.warehouseId, warehouses.id)).limit(100),
  ]);
  return { companies: companyRows, customers: customerRows, suppliers: supplierRows, cashBoxes: cashBoxRows, banks: bankRows, items: itemRows, warehouses: warehouseRows, balances: balanceRows };
}

export async function getErpControlData() {
  const db = await getDb();
  if (!db) return { branches: demoBranches, accounts: demoAccounts, fiscalPeriods: demoPeriods };
  const [branchRows, accountRows, periodRows] = await Promise.all([
    db.select().from(branches).limit(100),
    db.select().from(accounts).where(eq(accounts.active, 1)).orderBy(accounts.code).limit(500),
    db.select().from(fiscalPeriods).orderBy(desc(fiscalPeriods.startsOn)).limit(100),
  ]);
  return { branches: branchRows, accounts: accountRows, fiscalPeriods: periodRows };
}

export async function searchInvoices(search?: string, limit = 20) {
  const db = await getDb();
  const query = (search || "").trim();
  if (!db) {
    return Array.from(demoInvoices.values()).filter((invoice) => !query || `${invoice.docNo} ${invoice.status}`.toLowerCase().includes(query.toLowerCase())).slice(-limit).reverse();
  }
  const filters = query ? or(like(invoices.docNo, `%${query}%`), like(invoices.status, `%${query}%`)) : undefined;
  return db.select().from(invoices).where(filters).orderBy(desc(invoices.createdAt)).limit(limit);
}

export async function getInvoiceReturnSource(invoiceId: number, invoiceType: "SALE" | "PURCHASE") {
  const db = await getDb();
  if (!db) {
    const invoice = Array.from(invoiceType === "SALE" ? demoInvoices.values() : demoPurchaseInvoices.values()).find((row) => row.invoiceId === invoiceId);
    if (!invoice) throw new Error("INVOICE_NOT_FOUND");
    return { invoice, lines: [{ itemId: 1, itemCode: "ITEM-001", description: "صنف تجريبي", unit: "وحدة", quantity: 1, unitPrice: invoice.subtotal, taxAmount: invoice.taxTotal, lineTotal: invoice.grandTotal }], previousBalance: 0 };
  }
  const invoice = (await db.select().from(invoices).where(and(eq(invoices.id, invoiceId), eq(invoices.invoiceType, invoiceType))).limit(1))[0];
  if (!invoice) throw new Error("INVOICE_NOT_FOUND");
  const lines = await db.select({ id: invoiceLines.id, itemId: invoiceLines.itemId, itemCode: items.code, description: items.description, unit: sql<string>`'وحدة'`, quantity: invoiceLines.quantity, unitPrice: invoiceLines.unitPrice, taxAmount: invoiceLines.taxAmount, lineTotal: invoiceLines.lineTotal }).from(invoiceLines).leftJoin(items, eq(items.id, invoiceLines.itemId)).where(eq(invoiceLines.invoiceId, invoiceId));
  const partyFilter = invoiceType === "SALE" ? (invoice.customerId === null ? sql`1 = 0` : eq(invoices.customerId, invoice.customerId)) : (invoice.supplierId === null ? sql`1 = 0` : eq(invoices.supplierId, invoice.supplierId));
  const balanceRows = await db.select({ balance: sql<string>`COALESCE(SUM(${invoices.remainingAmount}), 0)` }).from(invoices).where(and(partyFilter, eq(invoices.invoiceType, invoiceType), eq(invoices.status, "POSTED")));
  return { invoice, lines, previousBalance: balanceRows[0]?.balance || "0" };
}

export async function nextAdjustmentNumber(documentKind: "SALES_RETURN" | "PURCHASE_RETURN") {
  const prefix = documentKind === "SALES_RETURN" ? "SR" : "PR";
  const year = new Date().getFullYear();
  const db = await getDb();
  if (!db) return `${prefix}-${year}-000001`;
  const rows = await db.select({ docNo: adjustmentNotes.docNo }).from(adjustmentNotes).where(like(adjustmentNotes.docNo, `${prefix}-${year}-%`));
  const max = rows.reduce((value, row) => Math.max(value, Number(String(row.docNo).split("-").at(-1) || 0)), 0);
  return `${prefix}-${year}-${String(max + 1).padStart(6, "0")}`;
}

export async function searchCustomers(search?: string, limit = 20) {
  const db = await getDb(); const query = (search || "").trim();
  if (!db) return demoCustomers.filter((row) => !query || `${row.code} ${row.legalName}`.toLowerCase().includes(query.toLowerCase())).slice(0, limit);
  const filters = query ? or(like(customers.code, `%${query}%`), like(customers.legalName, `%${query}%`)) : undefined;
  return db.select().from(customers).where(filters).orderBy(customers.code).limit(limit);
}

export async function searchSystemUsers(search?: string, limit = 20) {
  const db = await getDb();
  if (!db) { const query = (search || "").trim().toLowerCase(); return demoUsers.filter((row) => !query || `${row.openId} ${row.email || ""} ${row.name || ""}`.toLowerCase().includes(query)).slice(0, limit); }
  const query = (search || "").trim();
  const filters = query ? or(like(users.openId, `%${query}%`), like(users.email, `%${query}%`), like(users.name, `%${query}%`)) : undefined;
  return db.select({ id: users.id, openId: users.openId, name: users.name, email: users.email, role: users.role, lastSignedIn: users.lastSignedIn }).from(users).where(filters).orderBy(users.id).limit(limit);
}

export async function saveSystemUser(input: { id?: number; openId: string; name?: string; email?: string; role?: "user" | "admin"; loginMethod?: string }) {
  const db = await getDb();
  const values = { openId: input.openId, name: input.name || null, email: input.email || null, loginMethod: input.loginMethod || "workbench", role: input.role || "user" as const };
  if (!db) { const existing = demoUsers.find((row) => row.id === input.id || row.openId === input.openId); if (existing) { Object.assign(existing, values, { lastSignedIn: new Date() }); return existing; } const row = { id: Math.max(...demoUsers.map((item) => item.id), 0) + 1, ...values, lastSignedIn: new Date() }; demoUsers.push(row); return row; }
  if (input.id) {
    await db.update(users).set(values).where(eq(users.id, input.id));
    return (await db.select({ id: users.id, openId: users.openId, name: users.name, email: users.email, role: users.role, loginMethod: users.loginMethod, lastSignedIn: users.lastSignedIn }).from(users).where(eq(users.id, input.id)).limit(1))[0];
  }
  const inserted = await db.insert(users).values(values).$returningId();
  return (await db.select({ id: users.id, openId: users.openId, name: users.name, email: users.email, role: users.role, loginMethod: users.loginMethod, lastSignedIn: users.lastSignedIn }).from(users).where(eq(users.id, Number(inserted[0]?.id))).limit(1))[0];
}

export async function searchAuditEvents(search?: string, limit = 20) {
  const db = await getDb(); const query = (search || "").trim();
  if (!db) return Array.from(demoWindowExecutions.entries()).map(([requestId, value], index) => ({ id: index + 1, actor: "workbench.user", actionCode: "EXECUTION", entityType: "WINDOW", entityId: requestId, requestId, createdAt: new Date(), status: value.status })).filter((row) => !query || `${row.actionCode} ${row.entityType} ${row.entityId} ${row.requestId}`.toLowerCase().includes(query.toLowerCase())).slice(0, limit);
  const filters = query ? or(like(auditEvents.actionCode, `%${query}%`), like(auditEvents.entityType, `%${query}%`), like(auditEvents.entityId, `%${query}%`), like(auditEvents.requestId, `%${query}%`)) : undefined;
  return db.select().from(auditEvents).where(filters).orderBy(desc(auditEvents.createdAt), desc(auditEvents.id)).limit(limit);
}

export async function searchBranches(search?: string, limit = 20) {
  const db = await getDb(); const query = (search || "").trim();
  if (!db) return demoBranches.filter((row) => !query || `${row.code} ${row.name}`.toLowerCase().includes(query.toLowerCase())).slice(0, limit);
  const filters = query ? or(like(branches.code, `%${query}%`), like(branches.name, `%${query}%`)) : undefined;
  return db.select().from(branches).where(filters).orderBy(branches.code).limit(limit);
}

export async function saveBranch(input: { id?: number; companyId: number; code: string; name: string; active?: number }) {
  const db = await getDb(); const values = { companyId: input.companyId, code: input.code, name: input.name, active: input.active ?? 1 };
  if (!db) { const existing = demoBranches.find((row) => row.id === input.id || row.code === input.code); if (existing) Object.assign(existing, values); else demoBranches.push({ id: Math.max(...demoBranches.map((row) => row.id), 0) + 1, ...values }); return demoBranches.at(-1); }
  if (input.id) { await db.update(branches).set(values).where(eq(branches.id, input.id)); return (await db.select().from(branches).where(eq(branches.id, input.id)).limit(1))[0]; }
  const inserted = await db.insert(branches).values(values).$returningId(); return (await db.select().from(branches).where(eq(branches.id, Number(inserted[0]?.id))).limit(1))[0];
}

export async function searchWarehouses(search?: string, limit = 20) {
  const db = await getDb(); const query = (search || "").trim();
  if (!db) return demoWarehouses.filter((row) => !query || `${row.code} ${row.name}`.toLowerCase().includes(query.toLowerCase())).slice(0, limit);
  const filters = query ? or(like(warehouses.code, `%${query}%`), like(warehouses.name, `%${query}%`)) : undefined;
  return db.select().from(warehouses).where(filters).orderBy(warehouses.code).limit(limit);
}

export async function saveWarehouse(input: { id?: number; companyId: number; code: string; name: string; active?: number }) {
  if (isCloudflareD1Enabled()) return saveCloudWarehouse(input);
  const db = await getDb(); const values = { companyId: input.companyId, code: input.code, name: input.name, active: input.active ?? 1 };
  if (!db) { const existing = demoWarehouses.find((row) => row.id === input.id || row.code === input.code); if (existing) Object.assign(existing, values); else demoWarehouses.push({ id: Math.max(...demoWarehouses.map((row) => row.id), 0) + 1, ...values }); return demoWarehouses.at(-1); }
  if (input.id) { await db.update(warehouses).set(values).where(eq(warehouses.id, input.id)); return (await db.select().from(warehouses).where(eq(warehouses.id, input.id)).limit(1))[0]; }
  const inserted = await db.insert(warehouses).values(values).$returningId(); return (await db.select().from(warehouses).where(eq(warehouses.id, Number(inserted[0]?.id))).limit(1))[0];
}

async function createLinkedAccount(tx: any, input: { companyId: number; entityId: number; name: string; accountType: string; parentCode: string; currencyCode: string }) {
  const code = `${input.parentCode}-${String(input.entityId).padStart(4, "0")}`;
  const existing = (await tx.select().from(accounts).where(and(eq(accounts.companyId, input.companyId), eq(accounts.code, code))).limit(1))[0];
  if (existing) return existing;
  const inserted = await tx.insert(accounts).values({ companyId: input.companyId, code, name: input.name, accountType: input.accountType, parentCode: input.parentCode, currencyCode: input.currencyCode, active: 1 }).$returningId();
  return (await tx.select().from(accounts).where(eq(accounts.id, Number(inserted[0]?.id))).limit(1))[0];
}

export async function saveCustomer(input: { id?: number; companyId: number; code: string; legalName: string; currencyCode?: string; status?: "ACTIVE" | "BLOCKED" | "CLOSED" }) {
  const db = await getDb();
  const currencyCode = input.currencyCode || "SAR"; const status = input.status || "ACTIVE";
  if (!db) { const existing = demoCustomers.find((row) => row.id === input.id || row.code === input.code); if (existing) { Object.assign(existing, input); return { ...existing, accountId: (existing as any).accountId }; } const id = Math.max(...demoCustomers.map((row) => row.id), 0) + 1; const accountId = Math.max(...demoAccounts.map((row) => row.id), 0) + 1; demoAccounts.push({ id: accountId, companyId: input.companyId, code: `1200-${String(id).padStart(4, "0")}`, name: input.legalName, accountType: "ASSET", parentCode: "1200", currencyCode, active: 1 }); const row = { id, companyId: input.companyId, code: input.code, legalName: input.legalName, currencyCode, status, accountId }; demoCustomers.push(row); return row; }
  return db.transaction(async (tx) => { if (input.id) { const current = (await tx.select().from(customers).where(eq(customers.id, input.id)).limit(1))[0]; await tx.update(customers).set({ code: input.code, legalName: input.legalName, currencyCode, status }).where(eq(customers.id, input.id)); if (current?.accountId) await tx.update(accounts).set({ name: input.legalName, currencyCode, active: status === "ACTIVE" ? 1 : 0 }).where(eq(accounts.id, current.accountId)); return (await tx.select().from(customers).where(eq(customers.id, input.id)).limit(1))[0]; } const inserted = await tx.insert(customers).values({ companyId: input.companyId, code: input.code, legalName: input.legalName, currencyCode, status }).$returningId(); const id = Number(inserted[0]?.id); if (!id) throw new Error("CUSTOMER_CREATE_FAILED"); const account = await createLinkedAccount(tx, { companyId: input.companyId, entityId: id, name: input.legalName, accountType: "ASSET", parentCode: "1200", currencyCode }); await tx.update(customers).set({ accountId: account.id }).where(eq(customers.id, id)); return (await tx.select().from(customers).where(eq(customers.id, id)).limit(1))[0]; });
}

export async function searchSuppliers(search?: string, limit = 20) {
  const db = await getDb(); const query = (search || "").trim();
  if (!db) return demoSuppliers.filter((row) => !query || `${row.code} ${row.legalName}`.toLowerCase().includes(query.toLowerCase())).slice(0, limit);
  const filters = query ? or(like(suppliers.code, `%${query}%`), like(suppliers.legalName, `%${query}%`)) : undefined;
  return db.select().from(suppliers).where(filters).orderBy(suppliers.code).limit(limit);
}

export async function saveSupplier(input: { id?: number; companyId: number; code: string; legalName: string; currencyCode?: string; status?: "ACTIVE" | "BLOCKED" | "CLOSED" }) {
  const db = await getDb(); const currencyCode = input.currencyCode || "SAR"; const status = input.status || "ACTIVE";
  if (!db) { const existing = demoSuppliers.find((row) => row.id === input.id || row.code === input.code); if (existing) { Object.assign(existing, input); return { ...existing, accountId: (existing as any).accountId }; } const id = Math.max(...demoSuppliers.map((row) => row.id), 0) + 1; const accountId = Math.max(...demoAccounts.map((row) => row.id), 0) + 1; demoAccounts.push({ id: accountId, companyId: input.companyId, code: `2100-${String(id).padStart(4, "0")}`, name: input.legalName, accountType: "LIABILITY", parentCode: "2100", currencyCode, active: 1 }); const row = { id, companyId: input.companyId, code: input.code, legalName: input.legalName, currencyCode, status, accountId }; demoSuppliers.push(row); return row; }
  return db.transaction(async (tx) => { if (input.id) { const current = (await tx.select().from(suppliers).where(eq(suppliers.id, input.id)).limit(1))[0]; await tx.update(suppliers).set({ code: input.code, legalName: input.legalName, currencyCode, status }).where(eq(suppliers.id, input.id)); if (current?.accountId) await tx.update(accounts).set({ name: input.legalName, currencyCode, active: status === "ACTIVE" ? 1 : 0 }).where(eq(accounts.id, current.accountId)); return (await tx.select().from(suppliers).where(eq(suppliers.id, input.id)).limit(1))[0]; } const inserted = await tx.insert(suppliers).values({ companyId: input.companyId, code: input.code, legalName: input.legalName, currencyCode, status }).$returningId(); const id = Number(inserted[0]?.id); if (!id) throw new Error("SUPPLIER_CREATE_FAILED"); const account = await createLinkedAccount(tx, { companyId: input.companyId, entityId: id, name: input.legalName, accountType: "LIABILITY", parentCode: "2100", currencyCode }); await tx.update(suppliers).set({ accountId: account.id }).where(eq(suppliers.id, id)); return (await tx.select().from(suppliers).where(eq(suppliers.id, id)).limit(1))[0]; });
}

export async function saveCashBox(input: { id?: number; companyId: number; code: string; name: string; currencyCode?: string; status?: "ACTIVE" | "BLOCKED" | "CLOSED" }) {
  if (isCloudflareD1Enabled()) return saveCloudCashBox(input);
  const db = await getDb(); const currencyCode = input.currencyCode || "SAR"; const status = input.status || "ACTIVE";
  if (!db) { const existing = demoCashBoxes.find((row) => row.id === input.id || row.code === input.code); if (existing) { Object.assign(existing, input); return existing; } const id = Math.max(...demoCashBoxes.map((row) => row.id), 0) + 1; const accountId = Math.max(...demoAccounts.map((row) => row.id), 0) + 1; demoAccounts.push({ id: accountId, companyId: input.companyId, code: `1100-${String(id).padStart(4, "0")}`, name: input.name, accountType: "ASSET", parentCode: "1100", currencyCode, active: 1 }); const row = { id, companyId: input.companyId, accountId, code: input.code, name: input.name, currencyCode, status }; demoCashBoxes.push(row); return row; }
  return db.transaction(async (tx) => { const inserted = await tx.insert(cashBoxes).values({ companyId: input.companyId, code: input.code, name: input.name, currencyCode, status }).$returningId(); const id = Number(inserted[0]?.id); const account = await createLinkedAccount(tx, { companyId: input.companyId, entityId: id, name: input.name, accountType: "ASSET", parentCode: "1100", currencyCode }); await tx.update(cashBoxes).set({ accountId: account.id }).where(eq(cashBoxes.id, id)); return (await tx.select().from(cashBoxes).where(eq(cashBoxes.id, id)).limit(1))[0]; });
}

export async function saveBank(input: { id?: number; companyId: number; code: string; name: string; accountNumber?: string; currencyCode?: string; status?: "ACTIVE" | "BLOCKED" | "CLOSED" }) {
  if (isCloudflareD1Enabled()) return saveCloudBank(input);
  const db = await getDb(); const currencyCode = input.currencyCode || "SAR"; const status = input.status || "ACTIVE";
  if (!db) { const existing = demoBanks.find((row) => row.id === input.id || row.code === input.code); if (existing) { Object.assign(existing, input); return existing; } const id = Math.max(...demoBanks.map((row) => row.id), 0) + 1; const accountId = Math.max(...demoAccounts.map((row) => row.id), 0) + 1; demoAccounts.push({ id: accountId, companyId: input.companyId, code: `1110-${String(id).padStart(4, "0")}`, name: input.name, accountType: "ASSET", parentCode: "1110", currencyCode, active: 1 }); const row = { id, companyId: input.companyId, accountId, code: input.code, name: input.name, accountNumber: input.accountNumber || "", currencyCode, status }; demoBanks.push(row); return row; }
  return db.transaction(async (tx) => { const inserted = await tx.insert(banks).values({ companyId: input.companyId, code: input.code, name: input.name, accountNumber: input.accountNumber || null, currencyCode, status }).$returningId(); const id = Number(inserted[0]?.id); const account = await createLinkedAccount(tx, { companyId: input.companyId, entityId: id, name: input.name, accountType: "ASSET", parentCode: "1110", currencyCode }); await tx.update(banks).set({ accountId: account.id }).where(eq(banks.id, id)); return (await tx.select().from(banks).where(eq(banks.id, id)).limit(1))[0]; });
}

export async function searchItems(search?: string, limit = 20) {
  const db = await getDb(); const query = (search || "").trim();
  if (!db) return demoItems.filter((row) => !query || `${row.code} ${row.description}`.toLowerCase().includes(query.toLowerCase())).slice(0, limit);
  const filters = query ? or(like(items.code, `%${query}%`), like(items.description, `%${query}%`)) : undefined;
  return db.select().from(items).where(filters).orderBy(items.code).limit(limit);
}

export async function getItemTrace(itemId: number, warehouseId?: number) {
  if (isCloudflareD1Enabled()) return getCloudItemTrace(itemId, warehouseId);
  const db = await getDb();
  if (!db) {
    const item = demoItems.find((row) => row.id === itemId);
    if (!item) throw new Error("ITEM_NOT_FOUND");
    const balance = demoInventoryBalances.get(`${itemId}:1`);
    return { item: { ...item, unitCode: "EA", currencyCode: "SAR", balances: balance ? [{ warehouseId: 1, warehouseCode: "MAIN", warehouseName: "المستودع الرئيسي", ...balance }] : [] }, movements: [] };
  }
  const itemRow = (await db.select({ item: items, company: companies }).from(items).leftJoin(companies, eq(items.companyId, companies.id)).where(eq(items.id, itemId)).limit(1))[0];
  if (!itemRow) throw new Error("ITEM_NOT_FOUND");
  const balanceRows = await db.select({ balance: stockBalances, warehouse: warehouses }).from(stockBalances).leftJoin(warehouses, eq(stockBalances.warehouseId, warehouses.id)).where(and(eq(stockBalances.itemId, itemId), warehouseId ? eq(stockBalances.warehouseId, warehouseId) : sql`1 = 1`));
  const movementRows = await db.select().from(stockMovements).where(and(eq(stockMovements.itemId, itemId), warehouseId ? eq(stockMovements.warehouseId, warehouseId) : sql`1 = 1`)).orderBy(desc(stockMovements.createdAt), desc(stockMovements.id)).limit(100);
  return { item: { ...itemRow.item, unitCode: "EA", currencyCode: itemRow.company?.baseCurrency || "SAR", balances: balanceRows.map((row) => ({ ...row.balance, warehouseCode: row.warehouse?.code, warehouseName: row.warehouse?.name })) }, movements: movementRows };
}

type AccountInput = { id?: number; companyId?: number; code: string; name: string; accountType: string; parentCode?: string; currencyCode?: string; active?: number };
const ACCOUNT_TYPES = new Set(["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE", "OTHER"]);
function normalizeAccount(input: AccountInput) {
  const code = input.code.trim().toUpperCase(); const name = input.name.trim(); const accountType = input.accountType.trim().toUpperCase(); const parentCode = input.parentCode?.trim().toUpperCase() || undefined; const currencyCode = (input.currencyCode || "SAR").trim().toUpperCase();
  if (!code || !name) throw new Error("ACCOUNT_CODE_AND_NAME_REQUIRED");
  if (!ACCOUNT_TYPES.has(accountType)) throw new Error("ACCOUNT_TYPE_INVALID");
  if (!/^[A-Z0-9][A-Z0-9._/-]{0,79}$/.test(code)) throw new Error("ACCOUNT_CODE_INVALID");
  if (!/^[A-Z]{3}$/.test(currencyCode)) throw new Error("ACCOUNT_CURRENCY_INVALID");
  if (parentCode === code) throw new Error("ACCOUNT_PARENT_SELF_REFERENCE");
  return { companyId: input.companyId || 1, code, name, accountType, parentCode, currencyCode, active: input.active === 0 ? 0 : 1 };
}
async function assertAccountParent(tx: any, values: ReturnType<typeof normalizeAccount>, id?: number) {
  if (!values.parentCode) return;
  const parent = (await tx.select().from(accounts).where(and(eq(accounts.companyId, values.companyId), eq(accounts.code, values.parentCode))).limit(1))[0];
  if (!parent) throw new Error("ACCOUNT_PARENT_NOT_FOUND");
  const seen = new Set([values.code]); let cursor: any = parent;
  while (cursor?.parentCode) { if (seen.has(cursor.code)) throw new Error("ACCOUNT_HIERARCHY_CYCLE"); seen.add(cursor.code); cursor = (await tx.select().from(accounts).where(and(eq(accounts.companyId, values.companyId), eq(accounts.code, cursor.parentCode))).limit(1))[0]; }
  if (id && parent.id === id) throw new Error("ACCOUNT_PARENT_SELF_REFERENCE");
}
export async function searchAccounts(search?: string, limit = 20) {
  if (isCloudflareD1Enabled()) return getCloudAccounts(search);
  const db = await getDb(); const query = (search || "").trim();
  if (!db) return demoAccounts.filter((row) => !query || `${row.code} ${row.name}`.toLowerCase().includes(query.toLowerCase())).slice(0, limit);
  const filters = query ? or(like(accounts.code, `%${query}%`), like(accounts.name, `%${query}%`)) : undefined;
  return db.select().from(accounts).where(filters).orderBy(accounts.code).limit(limit);
}
export async function getAccountCatalog(search?: string, limit = 500) {
  const rows = await searchAccounts(search, limit) as any[]; const byParent = new Map<string, number>();
  for (const row of rows) if (row.parentCode) byParent.set(row.parentCode, (byParent.get(row.parentCode) || 0) + 1);
  return rows.map((row) => ({ ...row, depth: row.parentCode ? 1 : 0, hasChildren: (byParent.get(row.code) || 0) > 0 }));
}
export async function saveAccount(input: AccountInput) {
  const values = normalizeAccount(input);
  if (isCloudflareD1Enabled()) return saveCloudAccount(values);
  const db = await getDb();
  if (!db) { const existing = demoAccounts.find((row) => row.id === input.id || (row.companyId === values.companyId && row.code === values.code)); if (existing) { Object.assign(existing, values); return existing; } const row = { id: Math.max(...demoAccounts.map((row) => row.id), 0) + 1, ...values }; demoAccounts.push(row); return row; }
  return db.transaction(async (tx) => {
    await assertAccountParent(tx, values, input.id);
    const duplicate = (await tx.select().from(accounts).where(and(eq(accounts.companyId, values.companyId), eq(accounts.code, values.code))).limit(1))[0];
    if (duplicate && duplicate.id !== input.id) throw new Error("ACCOUNT_CODE_DUPLICATE");
    if (input.id) {
      const current = (await tx.select().from(accounts).where(eq(accounts.id, input.id)).limit(1))[0]; if (!current) throw new Error("ACCOUNT_NOT_FOUND");
      if (current.code !== values.code) { const ref = (await tx.select().from(journalEntryLines).where(eq(journalEntryLines.accountCode, current.code)).limit(1))[0]; if (ref) throw new Error("ACCOUNT_CODE_HAS_JOURNAL_REFERENCES"); }
      await tx.update(accounts).set(values).where(eq(accounts.id, input.id)); await tx.insert(auditEvents).values({ actor: "workbench.user", actionCode: "UPDATE", entityType: "ACCOUNT", entityId: String(input.id), requestId: `ACCOUNT:UPDATE:${input.id}` });
      return (await tx.select().from(accounts).where(eq(accounts.id, input.id)).limit(1))[0];
    }
    const inserted = await tx.insert(accounts).values(values).$returningId(); const id = Number(inserted[0]?.id); if (!id) throw new Error("ACCOUNT_CREATE_FAILED");
    await tx.insert(auditEvents).values({ actor: "workbench.user", actionCode: "CREATE", entityType: "ACCOUNT", entityId: String(id), requestId: `ACCOUNT:CREATE:${id}` });
    return (await tx.select().from(accounts).where(eq(accounts.id, id)).limit(1))[0];
  });
}

export async function saveItem(input: { id?: number; companyId: number; code: string; description: string; stockFlag?: number; unitCost?: string; revenueAccount?: string; inventoryAccount?: string; cogsAccount?: string; active?: number }) {
  const db = await getDb();
  const values = { companyId: input.companyId, code: input.code, description: input.description, stockFlag: input.stockFlag ?? 1, unitCost: input.unitCost || "0", revenueAccount: input.revenueAccount || "4100", inventoryAccount: input.inventoryAccount || "1300", cogsAccount: input.cogsAccount || "5100", active: input.active ?? 1 };
  if (!db) { const existing = demoItems.find((row) => row.id === input.id || row.code === input.code); if (existing) Object.assign(existing, values); else demoItems.push({ id: Math.max(...demoItems.map((row) => row.id), 0) + 1, ...values }); return demoItems.at(-1); }
  if (input.id) { await db.update(items).set(values).where(eq(items.id, input.id)); return db.select().from(items).where(eq(items.id, input.id)).limit(1).then((rows) => rows[0]); }
  const inserted = await db.insert(items).values(values).$returningId(); return db.select().from(items).where(eq(items.id, Number(inserted[0]?.id))).limit(1).then((rows) => rows[0]);
}

export async function searchJournals(search?: string, limit = 20) {
  const db = await getDb(); const query = (search || "").trim();
  if (!db) return demoJournals.filter((row) => !query || `${row.journalNo} ${row.entryType}`.toLowerCase().includes(query.toLowerCase())).slice(0, limit);
  const filters = query ? or(like(journalEntries.journalNo, `%${query}%`), like(journalEntries.entryType, `%${query}%`)) : undefined;
  return db.select().from(journalEntries).where(filters).orderBy(desc(journalEntries.createdAt)).limit(limit);
}

export async function saveJournal(input: { journalNo: string; entryType: string; actor: string; lines: { accountCode: string; accountName?: string; description?: string; debit: string; credit: string }[] }) {
  const journal = validateJournal({ description: input.entryType, source: "MANUAL", lines: input.lines });
  const debit = journal.totalDebit; const credit = journal.totalCredit;
  const db = await getDb();
  if (!db) { const id = demoJournals.length + 1; const result = { id, journalNo: input.journalNo, entryType: input.entryType, totalDebit: debit.toFixed(6), totalCredit: credit.toFixed(6), status: "POSTED" as const }; demoJournals.push(result); return result; }
  return db.transaction(async (tx) => { const inserted = await tx.insert(journalEntries).values({ journalNo: input.journalNo, entryType: input.entryType, totalDebit: debit.toFixed(6), totalCredit: credit.toFixed(6) }).$returningId(); const id = Number(inserted[0]?.id); if (!id) throw new Error("JOURNAL_CREATE_FAILED"); await tx.insert(journalEntryLines).values(journal.lines.map((line) => ({ journalEntryId: id, accountCode: line.accountCode, accountName: line.accountName, description: line.description, debit: line.debit.toFixed(6), credit: line.credit.toFixed(6) }))); await tx.insert(auditEvents).values({ actor: input.actor, actionCode: "CREATE", entityType: "GL_JOURNAL", entityId: String(id), requestId: `JOURNAL:${input.journalNo}` }); return { id, journalNo: input.journalNo, entryType: input.entryType, totalDebit: debit.toFixed(6), totalCredit: credit.toFixed(6), status: "POSTED" as const }; });
}

export async function executeGlWindowAction(input: {
  legacyForm: string; action: string; actor: string; requestId: string; journal?: Parameters<typeof saveJournal>[0]; search?: string; limit?: number; fiscalPeriodId?: number;
}) {
  const form = input.legacyForm.replace(/\.fmx$/i, "").toUpperCase();
  const contract = await getWindowContract(`${form}.fmx`);
  if (!contract.domain.toUpperCase().startsWith("GL")) throw new Error("GL_WINDOW_DOMAIN_REQUIRED");
  const readOnly = form.startsWith("GLSI") || form.startsWith("GLSR") || ["GLST005", "GLST006"].includes(form);
  const allowed = readOnly ? ["initialize", "query", "print", "export", "refresh", "exit"] : ["initialize", "query", "new", "validate", "save", "approve", "post", "print", "refresh", "exit"];
  if (!allowed.includes(input.action) || !contract.actions.includes(input.action)) throw new Error("ACTION_NOT_ALLOWED_FOR_GL_WINDOW");
  const db = await getDb();
  const cached = await getIdempotentWindowResult(db, input.requestId);
  if (cached) return { legacyForm: `${form}.fmx`, action: input.action, result: cached, mode: "DATABASE_CONTRACT" as const, idempotent: true };
  const log = async (status: string, response: unknown) => { if (db) await db.insert(windowExecutions).values({ legacyForm: `${form}.fmx`, actionCode: input.action, requestId: input.requestId, actor: input.actor, status, responseJson: JSON.stringify(response) }); };
  try {
    let response: unknown;
    if (["initialize", "validate", "refresh"].includes(input.action)) response = { legacyForm: `${form}.fmx`, action: input.action, status: "VALIDATED", mode: "DATABASE_CONTRACT" };
    else if (["query", "print", "export"].includes(input.action)) response = { legacyForm: `${form}.fmx`, action: input.action, rows: await searchJournals(input.search, input.limit || 20), mode: "DATABASE_CONTRACT" };
    else if (["new", "save", "approve", "post"].includes(input.action)) {
      if (readOnly || !input.journal) throw new Error("GL_JOURNAL_PAYLOAD_REQUIRED");
      if (db) {
        const codes = input.journal.lines.map((line) => line.accountCode);
        const activeAccounts = await db.select({ code: accounts.code }).from(accounts).where(and(or(...codes.map((code) => eq(accounts.code, code))), eq(accounts.active, 1)));
        if (activeAccounts.length !== new Set(codes).size) throw new Error("GL_ACCOUNT_NOT_FOUND_OR_INACTIVE");
        if (input.fiscalPeriodId) { const period = (await db.select().from(fiscalPeriods).where(eq(fiscalPeriods.id, input.fiscalPeriodId)).limit(1))[0]; if (!period || period.status !== "OPEN") throw new Error("GL_FISCAL_PERIOD_CLOSED"); }
      }
      response = await saveJournal(input.journal);
    } else throw new Error("GL_ACTION_NOT_IMPLEMENTED");
    await log("SUCCEEDED", response); if (!db) demoWindowExecutions.set(input.requestId, { status: "SUCCEEDED", response });
    return { legacyForm: `${form}.fmx`, action: input.action, result: response, mode: "DATABASE_CONTRACT" as const };
  } catch (error) { await log("FAILED", { error: error instanceof Error ? error.message : String(error) }); throw error; }
}

type LinkedInvoiceLine = { itemId: number; quantity: string; unitPrice: string; taxAmount: string; unitCode?: string; batchNo?: string; expireDate?: string; locationId?: number; serials?: string[] };
function validateLinkedInvoiceLines(lines: LinkedInvoiceLine[]) { for (const line of lines) { const quantity = Number(line.quantity); if (line.expireDate && !Number.isFinite(new Date(line.expireDate).getTime())) throw new Error("INVALID_EXPIRY_DATE"); if (line.serials?.length && (!Number.isInteger(quantity) || line.serials.length !== quantity)) throw new Error("SERIAL_COUNT_MISMATCH"); if (line.serials?.length && new Set(line.serials).size !== line.serials.length) throw new Error("DUPLICATE_SERIAL_NUMBER"); } }
function applyDemoInvoiceTrace(lines: LinkedInvoiceLine[], warehouseId: number, direction: "IN" | "OUT") { for (const line of lines) { const quantity = Number(line.quantity); if (line.batchNo) { const key = `${line.itemId}:${warehouseId}:${line.batchNo}`; const batch = demoBatchBalances.get(key) || { quantity: 0, unitCost: Number(line.unitPrice) }; const after = direction === "IN" ? batch.quantity + quantity : batch.quantity - quantity; if (after < -0.000001) throw new Error("INSUFFICIENT_BATCH_STOCK"); demoBatchBalances.set(key, { quantity: after, unitCost: Number(line.unitPrice) || batch.unitCost }); } if (line.locationId) { const key = `${line.itemId}:${warehouseId}:${line.locationId}`; const before = demoLocationBalances.get(key) || 0; const after = direction === "IN" ? before + quantity : before - quantity; if (after < -0.000001) throw new Error("INSUFFICIENT_LOCATION_STOCK"); demoLocationBalances.set(key, after); } for (const serialNo of line.serials || []) { const key = `${line.itemId}:${serialNo}`; if (direction === "IN") { if (demoSerialStatuses.has(key)) throw new Error("DUPLICATE_SERIAL_NUMBER"); demoSerialStatuses.set(key, { warehouseId, status: "AVAILABLE" }); } else { const serial = demoSerialStatuses.get(key); if (!serial || serial.warehouseId !== warehouseId || serial.status !== "AVAILABLE") throw new Error("SERIAL_NOT_AVAILABLE"); serial.status = "SOLD"; } } } }

export async function createInvoice(input: { docNo: string; customerId: number; warehouseId: number; currencyCode?: string; exchangeRate?: string; paymentMethod?: string; paidAmount?: string; paymentReference?: string; lines: LinkedInvoiceLine[]; actor: string; }) {
  if (!input.docNo.trim()) throw new Error("INVOICE_DOCNO_REQUIRED");
  if (!Number(input.customerId) || !Number(input.warehouseId)) throw new Error("INVOICE_PARTY_AND_WAREHOUSE_REQUIRED");
  if (!Number.isFinite(Number(input.exchangeRate || 1)) || Number(input.exchangeRate || 1) <= 0) throw new Error("EXCHANGE_RATE_INVALID");
  if (!input.lines.length) throw new Error("INVOICE_LINES_REQUIRED");
  for (const line of input.lines) { if (!Number.isFinite(Number(line.quantity)) || Number(line.quantity) <= 0) throw new Error("INVOICE_QUANTITY_INVALID"); if (!Number.isFinite(Number(line.unitPrice)) || Number(line.unitPrice) < 0) throw new Error("INVOICE_PRICE_INVALID"); if (!Number.isFinite(Number(line.taxAmount)) || Number(line.taxAmount) < 0) throw new Error("INVOICE_TAX_INVALID"); }
  validateLinkedInvoiceLines(input.lines);
  const calculated = calculateInvoice(input.lines, input.paidAmount || "0");
  if (Number(input.paidAmount || 0) < 0 || Number(input.paidAmount || 0) > calculated.grandTotal) throw new Error("PAID_AMOUNT_EXCEEDS_INVOICE");
  if (isCloudflareD1Enabled()) return createCloudSalesInvoice(input as unknown as Record<string, unknown>);
  const db = await getDb();
  const { subtotal, taxTotal, grandTotal } = calculated;
  const idempotencyKey = `ARST004:${input.docNo}`;
  if (!db) {
    if (Array.from(demoInvoices.values()).some((invoice) => invoice.docNo === input.docNo)) throw new Error("DUPLICATE_IDEMPOTENCY_KEY");
    const invoiceId = ++demoInvoiceSequence;
    const paidAmount = Number(input.paidAmount || 0);
    const result = { invoiceId, docNo: input.docNo, currencyCode: input.currencyCode || "SAR", exchangeRate: Number(input.exchangeRate || 1), paymentMethod: input.paymentMethod || "CASH", paidAmount, remainingAmount: grandTotal - paidAmount, subtotal, taxTotal, grandTotal, status: "DRAFT" as const };
    demoInvoices.set(invoiceId, result);
    demoInvoiceLines.set(invoiceId, input.lines);
    return result;
  }
  return db.transaction(async (tx) => {
    const paidAmount = Number(input.paidAmount || 0);
    const inserted = await tx.insert(invoices).values({ docNo: input.docNo, customerId: input.customerId, warehouseId: input.warehouseId, currencyCode: input.currencyCode || "SAR", exchangeRate: input.exchangeRate || "1", subtotal: subtotal.toFixed(6), taxTotal: taxTotal.toFixed(6), grandTotal: grandTotal.toFixed(6), paymentMethod: input.paymentMethod || "CASH", paidAmount: paidAmount.toFixed(6), remainingAmount: (grandTotal - paidAmount).toFixed(6), paymentReference: input.paymentReference || null, idempotencyKey, createdBy: input.actor }).$returningId();
    const invoiceId = Number(inserted[0]?.id);
    if (!invoiceId) throw new Error("INVOICE_CREATE_FAILED");
    await tx.insert(invoiceLines).values(input.lines.map((line) => ({ invoiceId, itemId: line.itemId, quantity: line.quantity, unitPrice: line.unitPrice, taxAmount: line.taxAmount, lineTotal: (Number(line.quantity) * Number(line.unitPrice) + Number(line.taxAmount)).toFixed(6), unitCode: line.unitCode || "EA", batchNo: line.batchNo || null, expireDate: line.expireDate ? new Date(line.expireDate) : null, locationId: line.locationId || null, serialsJson: line.serials?.length ? JSON.stringify(line.serials) : null })));
    await tx.insert(auditEvents).values({ actor: input.actor, actionCode: "CREATE", entityType: "AR_DOC", entityId: String(invoiceId), requestId: idempotencyKey });
    return { invoiceId, docNo: input.docNo, subtotal, taxTotal, grandTotal, status: "DRAFT" as const };
  });
}

export async function createPurchaseInvoice(input: { docNo: string; supplierId: number; warehouseId: number; currencyCode?: string; exchangeRate?: string; paymentMethod?: string; paidAmount?: string; paymentReference?: string; lines: LinkedInvoiceLine[]; actor: string; }) {
  validateLinkedInvoiceLines(input.lines);
  const calculated = calculateInvoice(input.lines, input.paidAmount || "0");
  const { subtotal, taxTotal, grandTotal } = calculated;
  const idempotencyKey = `APST003:${input.docNo}`;
  const db = await getDb();
  if (!db) {
    if (Array.from(demoPurchaseInvoices.values()).some((invoice) => invoice.docNo === input.docNo)) throw new Error("DUPLICATE_IDEMPOTENCY_KEY");
    const invoiceId = ++demoInvoiceSequence;
    const result = { invoiceId, docNo: input.docNo, subtotal, taxTotal, grandTotal, status: "DRAFT" as const };
    demoPurchaseInvoices.set(invoiceId, result);
    demoInvoiceLines.set(invoiceId, input.lines);
    return result;
  }
  return db.transaction(async (tx) => {
    const paidAmount = Number(input.paidAmount || 0);
    const inserted = await tx.insert(invoices).values({ invoiceType: "PURCHASE", docNo: input.docNo, customerId: null, supplierId: input.supplierId, warehouseId: input.warehouseId, currencyCode: input.currencyCode || "SAR", exchangeRate: input.exchangeRate || "1", subtotal: subtotal.toFixed(6), taxTotal: taxTotal.toFixed(6), grandTotal: grandTotal.toFixed(6), paymentMethod: input.paymentMethod || "CREDIT", paidAmount: paidAmount.toFixed(6), remainingAmount: (grandTotal - paidAmount).toFixed(6), paymentReference: input.paymentReference || null, idempotencyKey, sourceForm: "APST003", createdBy: input.actor }).$returningId();
    const invoiceId = Number(inserted[0]?.id);
    if (!invoiceId) throw new Error("PURCHASE_INVOICE_CREATE_FAILED");
    await tx.insert(invoiceLines).values(input.lines.map((line) => ({ invoiceId, itemId: line.itemId, quantity: line.quantity, unitPrice: line.unitPrice, taxAmount: line.taxAmount, lineTotal: (Number(line.quantity) * Number(line.unitPrice) + Number(line.taxAmount)).toFixed(6), unitCode: line.unitCode || "EA", batchNo: line.batchNo || null, expireDate: line.expireDate ? new Date(line.expireDate) : null, locationId: line.locationId || null, serialsJson: line.serials?.length ? JSON.stringify(line.serials) : null })));
    await tx.insert(auditEvents).values({ actor: input.actor, actionCode: "CREATE", entityType: "AP_DOC", entityId: String(invoiceId), requestId: idempotencyKey });
    return { invoiceId, docNo: input.docNo, subtotal, taxTotal, grandTotal, status: "DRAFT" as const };
  });
}

export async function postPurchaseInvoice(invoiceId: number, actor: string) {
  const db = await getDb();
  if (!db) {
    const invoice = demoPurchaseInvoices.get(invoiceId);
    if (!invoice) throw new Error("PURCHASE_INVOICE_NOT_FOUND");
    if (invoice.status !== "DRAFT") throw new Error("PURCHASE_INVOICE_ALREADY_POSTED_OR_REVERSED");
    assertAtomicPost({ documentType: "PURCHASE_INVOICE", documentId: invoiceId, actor, requestId: `POST:${invoice.docNo}` });
    applyDemoInvoiceTrace(demoInvoiceLines.get(invoiceId) || [], 1, "IN");
    invoice.status = "POSTED";
    return { invoiceId, status: "POSTED" as const };
  }
  return db.transaction(async (tx) => {
    const invoice = (await tx.select().from(invoices).where(and(eq(invoices.id, invoiceId), eq(invoices.invoiceType, "PURCHASE"))).limit(1))[0];
    if (!invoice) throw new Error("PURCHASE_INVOICE_NOT_FOUND");
    if (invoice.status !== "DRAFT") throw new Error("PURCHASE_INVOICE_ALREADY_POSTED_OR_REVERSED");
    assertAtomicPost({ documentType: "PURCHASE_INVOICE", documentId: invoiceId, actor, requestId: `POST:${invoice.docNo}` });
    const supplier = invoice.supplierId ? (await tx.select().from(suppliers).where(eq(suppliers.id, invoice.supplierId)).limit(1))[0] : undefined;
    if (!supplier?.accountId) throw new Error("SUPPLIER_ACCOUNT_NOT_LINKED");
    const supplierAccount = (await tx.select().from(accounts).where(eq(accounts.id, supplier.accountId)).limit(1))[0];
    if (!supplierAccount) throw new Error("SUPPLIER_ACCOUNT_NOT_FOUND");
    const lines = await tx.select({ line: invoiceLines, item: items, balance: stockBalances }).from(invoiceLines).innerJoin(items, eq(invoiceLines.itemId, items.id)).leftJoin(stockBalances, and(eq(stockBalances.itemId, invoiceLines.itemId), eq(stockBalances.warehouseId, invoice.warehouseId))).where(eq(invoiceLines.invoiceId, invoiceId));
    const periods = await tx.select().from(fiscalPeriods).where(and(eq(fiscalPeriods.companyId, 1), eq(fiscalPeriods.status, "OPEN"))).orderBy(desc(fiscalPeriods.startsOn));
    const period = periods.find((candidate) => canPostToPeriod(candidate, invoice.createdAt).allowed);
    const periodCheck = canPostToPeriod(period, invoice.createdAt);
    if (!periodCheck.allowed) throw new Error(periodCheck.reason || "PERIOD_NOT_POSTABLE");
    for (const row of lines) {
      const quantity = Number(row.line.quantity); const unitCost = Number(row.line.unitPrice); const totalCost = quantity * unitCost;
      if (!row.item.stockFlag) continue;
      const beforeQty = Number(row.balance?.quantity ?? 0); const beforeCost = Number(row.balance?.totalCost ?? 0);
      const afterQty = beforeQty + quantity; const afterCost = beforeCost + totalCost;
      if (row.balance) await tx.update(stockBalances).set({ quantity: afterQty.toFixed(6), totalCost: afterCost.toFixed(6), unitCost: (afterCost / afterQty).toFixed(6), versionNo: row.balance.versionNo + 1 }).where(eq(stockBalances.id, row.balance.id));
      else await tx.insert(stockBalances).values({ itemId: row.line.itemId, warehouseId: invoice.warehouseId, quantity: quantity.toFixed(6), totalCost: totalCost.toFixed(6), unitCost: unitCost.toFixed(6), versionNo: 1 });
      await tx.insert(stockMovements).values({ itemId: row.line.itemId, warehouseId: invoice.warehouseId, sourceInvoiceId: invoiceId, movementType: "PURCHASE_RECEIPT", quantityIn: quantity.toFixed(6), unitCost: unitCost.toFixed(6), totalCost: totalCost.toFixed(6), balanceAfter: afterQty.toFixed(6), createdBy: actor });
      await applyInvoiceInventoryTrace(tx, row, invoice.warehouseId, quantity, unitCost, "IN", actor);
    }
    const purchaseJournal = buildPurchaseJournal({ total: Number(invoice.grandTotal), subtotal: Number(invoice.subtotal), taxTotal: Number(invoice.taxTotal), payableAccount: supplierAccount.code, inventoryAccount: lines[0]?.item.inventoryAccount || "1300" });
    const insertedJournal = await tx.insert(journalEntries).values({ journalNo: `AP-${invoice.docNo}`, sourceInvoiceId: invoiceId, entryType: "AP_PURCHASE", totalDebit: purchaseJournal.totalDebit.toFixed(6), totalCredit: purchaseJournal.totalCredit.toFixed(6) }).$returningId();
    const journalId = Number(insertedJournal[0]?.id); if (!journalId) throw new Error("JOURNAL_CREATE_FAILED");
    await tx.insert(journalEntryLines).values(purchaseJournal.lines.map((line) => ({ journalEntryId: journalId, accountCode: line.accountCode, accountName: line.accountName, description: line.description, debit: Number(line.debit || 0).toFixed(6), credit: Number(line.credit || 0).toFixed(6) })));
    await tx.update(invoices).set({ status: "POSTED", postedAt: new Date() }).where(eq(invoices.id, invoiceId));
    await tx.insert(auditEvents).values({ actor, actionCode: "POST", entityType: "AP_DOC", entityId: String(invoiceId), requestId: `POST:${invoice.docNo}` });
    return { invoiceId, status: "POSTED" as const };
  });
}

export async function reversePurchaseInvoice(invoiceId: number, actor: string) {
  const db = await getDb();
  if (!db) {
    const invoice = demoPurchaseInvoices.get(invoiceId);
    if (!invoice || invoice.status !== "POSTED") throw new Error("ONLY_POSTED_PURCHASE_INVOICES_CAN_BE_REVERSED");
    assertAtomicReverse({ documentType: "PURCHASE_INVOICE", documentId: invoiceId, actor, requestId: `REV:${invoice.docNo}` });
    invoice.status = "REVERSED";
    return { invoiceId, status: "REVERSED" as const };
  }
  return db.transaction(async (tx) => {
    const invoice = (await tx.select().from(invoices).where(and(eq(invoices.id, invoiceId), eq(invoices.invoiceType, "PURCHASE"))).limit(1))[0];
    if (!invoice || invoice.status !== "POSTED") throw new Error("ONLY_POSTED_PURCHASE_INVOICES_CAN_BE_REVERSED");
    assertAtomicReverse({ documentType: "PURCHASE_INVOICE", documentId: invoiceId, actor, requestId: `REV:${invoice.docNo}` });
    const lines = await tx.select({ line: invoiceLines, item: items, balance: stockBalances }).from(invoiceLines).innerJoin(items, eq(invoiceLines.itemId, items.id)).leftJoin(stockBalances, and(eq(stockBalances.itemId, invoiceLines.itemId), eq(stockBalances.warehouseId, invoice.warehouseId))).where(eq(invoiceLines.invoiceId, invoiceId));
    for (const row of lines) {
      if (!row.item.stockFlag || !row.balance) continue;
      const quantity = Number(row.line.quantity); const beforeQty = Number(row.balance.quantity); const unitCost = Number(row.balance.unitCost); if (beforeQty < quantity) throw new Error(`INSUFFICIENT_STOCK_FOR_PURCHASE_REVERSAL:${row.item.code}`);
      const afterQty = beforeQty - quantity; const totalCost = quantity * unitCost; const afterCost = Math.max(0, Number(row.balance.totalCost) - totalCost);
      await tx.update(stockBalances).set({ quantity: afterQty.toFixed(6), totalCost: afterCost.toFixed(6), unitCost: afterQty ? (afterCost / afterQty).toFixed(6) : "0", versionNo: row.balance.versionNo + 1 }).where(eq(stockBalances.id, row.balance.id));
      await tx.insert(stockMovements).values({ itemId: row.line.itemId, warehouseId: invoice.warehouseId, sourceInvoiceId: invoiceId, movementType: "PURCHASE_RETURN", quantityOut: quantity.toFixed(6), unitCost: unitCost.toFixed(6), totalCost: totalCost.toFixed(6), balanceAfter: afterQty.toFixed(6), createdBy: actor });
    }
    const originalJournal = (await tx.select().from(journalEntries).where(and(eq(journalEntries.sourceInvoiceId, invoiceId), eq(journalEntries.entryType, "AP_PURCHASE"))).limit(1))[0];
    if (!originalJournal) throw new Error("ORIGINAL_PURCHASE_JOURNAL_NOT_FOUND");
    const originalLines = await tx.select().from(journalEntryLines).where(eq(journalEntryLines.journalEntryId, originalJournal.id));
    const reversal = validateJournal({ description: "عكس فاتورة مشتريات", source: "PURCHASE_INVOICE_REVERSAL", lines: originalLines.map((line) => ({ accountCode: line.accountCode, accountName: line.accountName || undefined, debit: Number(line.credit), credit: Number(line.debit), description: `عكس: ${line.description || ""}` })) });
    const insertedJournal = await tx.insert(journalEntries).values({ journalNo: `AP-REV-${invoice.docNo}`, sourceInvoiceId: invoiceId, entryType: "AP_REVERSAL", totalDebit: reversal.totalDebit.toFixed(6), totalCredit: reversal.totalCredit.toFixed(6) }).$returningId();
    const journalId = Number(insertedJournal[0]?.id); if (!journalId) throw new Error("REVERSAL_JOURNAL_CREATE_FAILED");
    await tx.insert(journalEntryLines).values(reversal.lines.map((line) => ({ journalEntryId: journalId, accountCode: line.accountCode, accountName: line.accountName, description: line.description, debit: Number(line.debit || 0).toFixed(6), credit: Number(line.credit || 0).toFixed(6) })));
    await tx.update(invoices).set({ status: "REVERSED" }).where(eq(invoices.id, invoiceId));
    await tx.insert(auditEvents).values({ actor, actionCode: "REVERSE", entityType: "AP_DOC", entityId: String(invoiceId), requestId: `REV:${invoice.docNo}` });
    return { invoiceId, status: "REVERSED" as const };
  });
}

type AdjustmentKind = "SALES_RETURN" | "PURCHASE_RETURN" | "SALES_DISCOUNT" | "SALES_ADDITION" | "PURCHASE_DISCOUNT" | "PURCHASE_ADDITION";

export async function createAdjustmentNote(input: { docNo: string; documentKind: AdjustmentKind; originalInvoiceId: number; reason?: string; lines: { itemId: number; quantity: string; unitPrice: string; taxAmount: string }[]; actor: string }) {
  const calculated = calculateInvoice(input.lines, "0"); const db = await getDb(); const idempotencyKey = "ADJ:" + input.docNo;
  if (!db) { const adjustmentId = ++demoInvoiceSequence; const result = { adjustmentId, docNo: input.docNo, documentKind: input.documentKind, grandTotal: calculated.grandTotal, status: "DRAFT" as const }; demoAdjustments.set(adjustmentId, result); return result; }
  return db.transaction(async (tx) => {
    const original = (await tx.select().from(invoices).where(eq(invoices.id, input.originalInvoiceId)).limit(1))[0];
    if (!original || original.status !== "POSTED") throw new Error("ORIGINAL_INVOICE_NOT_POSTED");
    const isSales = input.documentKind.startsWith("SALES_"); if (isSales !== (original.invoiceType === "SALE")) throw new Error("ADJUSTMENT_KIND_INVOICE_TYPE_MISMATCH");
    const inserted = await tx.insert(adjustmentNotes).values({ docNo: input.docNo, documentKind: input.documentKind, originalInvoiceId: input.originalInvoiceId, customerId: original.customerId, supplierId: original.supplierId, warehouseId: original.warehouseId, subtotal: calculated.subtotal.toFixed(6), taxTotal: calculated.taxTotal.toFixed(6), grandTotal: calculated.grandTotal.toFixed(6), reason: input.reason || null, idempotencyKey, createdBy: input.actor }).$returningId();
    const adjustmentId = Number(inserted[0]?.id); if (!adjustmentId) throw new Error("ADJUSTMENT_CREATE_FAILED");
    await tx.insert(adjustmentNoteLines).values(input.lines.map((line) => ({ adjustmentNoteId: adjustmentId, itemId: line.itemId, quantity: line.quantity, unitPrice: line.unitPrice, taxAmount: line.taxAmount, lineTotal: (Number(line.quantity) * Number(line.unitPrice) + Number(line.taxAmount)).toFixed(6) })));
    await tx.insert(auditEvents).values({ actor: input.actor, actionCode: "CREATE", entityType: "ADJUSTMENT_NOTE", entityId: String(adjustmentId), requestId: idempotencyKey });
    return { adjustmentId, docNo: input.docNo, grandTotal: calculated.grandTotal, status: "DRAFT" as const };
  });
}

export async function postAdjustmentNote(adjustmentId: number, actor: string) {
  const db = await getDb(); if (!db) { const note = demoAdjustments.get(adjustmentId); if (!note || note.status !== "DRAFT") throw new Error("ADJUSTMENT_NOT_POSTABLE"); note.status = "POSTED"; return { adjustmentId, status: "POSTED" as const }; }
  return db.transaction(async (tx) => {
    const note = (await tx.select().from(adjustmentNotes).where(eq(adjustmentNotes.id, adjustmentId)).limit(1))[0]; if (!note || note.status !== "DRAFT") throw new Error("ADJUSTMENT_NOT_POSTABLE");
    const original = (await tx.select().from(invoices).where(eq(invoices.id, note.originalInvoiceId)).limit(1))[0]; if (!original || original.status !== "POSTED") throw new Error("ORIGINAL_INVOICE_NOT_POSTED");
    const periods = await tx.select().from(fiscalPeriods).where(and(eq(fiscalPeriods.companyId, 1), eq(fiscalPeriods.status, "OPEN"))).orderBy(desc(fiscalPeriods.startsOn)); const period = periods.find((candidate) => canPostToPeriod(candidate, note.createdAt).allowed); const periodCheck = canPostToPeriod(period, note.createdAt); if (!periodCheck.allowed) throw new Error(periodCheck.reason || "PERIOD_NOT_POSTABLE");
    const isSales = note.documentKind.startsWith("SALES_"); const originalPartyId = isSales ? original.customerId : original.supplierId; const partyTable = isSales ? customers : suppliers; const party = originalPartyId ? (await tx.select().from(partyTable).where(eq(partyTable.id, originalPartyId)).limit(1))[0] : undefined; if (!party?.accountId) throw new Error("ADJUSTMENT_PARTY_ACCOUNT_NOT_LINKED"); const partyAccount = (await tx.select().from(accounts).where(eq(accounts.id, party.accountId)).limit(1))[0]; if (!partyAccount) throw new Error("ADJUSTMENT_PARTY_ACCOUNT_NOT_FOUND");
    const lines = await tx.select({ line: adjustmentNoteLines, item: items, balance: stockBalances }).from(adjustmentNoteLines).innerJoin(items, eq(adjustmentNoteLines.itemId, items.id)).leftJoin(stockBalances, and(eq(stockBalances.itemId, adjustmentNoteLines.itemId), eq(stockBalances.warehouseId, note.warehouseId))).where(eq(adjustmentNoteLines.adjustmentNoteId, adjustmentId));
    const returnsStock = note.documentKind === "SALES_RETURN" || note.documentKind === "PURCHASE_RETURN"; let totalCost = 0;
    for (const row of lines) { if (!returnsStock || !row.item.stockFlag) continue; const quantity = Number(row.line.quantity); const beforeQty = Number(row.balance?.quantity ?? 0); const unitCost = Number(row.balance?.unitCost ?? row.item.unitCost ?? 0); const isInbound = note.documentKind === "SALES_RETURN"; if (!isInbound && beforeQty < quantity) throw new Error("INSUFFICIENT_STOCK_FOR_ADJUSTMENT:" + row.item.code); const cost = quantity * unitCost; totalCost += cost; const afterQty = isInbound ? beforeQty + quantity : beforeQty - quantity; const beforeCost = Number(row.balance?.totalCost ?? 0); const afterCost = isInbound ? beforeCost + cost : Math.max(0, beforeCost - cost); if (row.balance) await tx.update(stockBalances).set({ quantity: afterQty.toFixed(6), totalCost: afterCost.toFixed(6), unitCost: afterQty ? (afterCost / afterQty).toFixed(6) : "0", versionNo: row.balance.versionNo + 1 }).where(eq(stockBalances.id, row.balance.id)); else await tx.insert(stockBalances).values({ itemId: row.line.itemId, warehouseId: note.warehouseId, quantity: afterQty.toFixed(6), totalCost: afterCost.toFixed(6), unitCost: unitCost.toFixed(6), versionNo: 1 }); await tx.insert(stockMovements).values({ itemId: row.line.itemId, warehouseId: note.warehouseId, sourceInvoiceId: note.originalInvoiceId, movementType: isInbound ? "SALES_RETURN" : "PURCHASE_RETURN", quantityIn: isInbound ? quantity.toFixed(6) : "0", quantityOut: isInbound ? "0" : quantity.toFixed(6), unitCost: unitCost.toFixed(6), totalCost: cost.toFixed(6), balanceAfter: afterQty.toFixed(6), createdBy: actor }); }
    const addition = note.documentKind.endsWith("ADDITION"); const subtotal = Number(note.subtotal); const tax = Number(note.taxTotal); const total = Number(note.grandTotal); const inventoryCode = lines[0]?.item.inventoryAccount || "1300"; const revenueCode = lines[0]?.item.revenueAccount || "4100"; const cogsCode = lines[0]?.item.cogsAccount || "5100"; let journalLines: any[];
    if (isSales) { journalLines = addition ? [{ accountCode: partyAccount.code, debit: total, credit: 0, description: "إشعار إضافة على العميل" }, { accountCode: revenueCode, debit: 0, credit: subtotal, description: "إضافة إيراد" }, { accountCode: "2200", debit: 0, credit: tax, description: "إضافة ضريبة" }] : [{ accountCode: partyAccount.code, debit: 0, credit: total, description: "إشعار خصم أو مرتجع للعميل" }, { accountCode: revenueCode, debit: subtotal, credit: 0, description: "تخفيض إيراد" }, { accountCode: "2200", debit: tax, credit: 0, description: "تخفيض ضريبة" }]; if (note.documentKind === "SALES_RETURN") journalLines.push({ accountCode: cogsCode, debit: totalCost, credit: 0, description: "إعادة تكلفة المبيعات" }, { accountCode: inventoryCode, debit: 0, credit: totalCost, description: "إعادة البضاعة للمخزون" }); }
    else { journalLines = addition ? [{ accountCode: inventoryCode, debit: subtotal, credit: 0, description: "إضافة تكلفة مشتريات" }, { accountCode: "1400", debit: tax, credit: 0, description: "إضافة ضريبة مشتريات" }, { accountCode: partyAccount.code, debit: 0, credit: total, description: "إشعار إضافة على المورد" }] : [{ accountCode: partyAccount.code, debit: total, credit: 0, description: "إشعار خصم أو مرتجع للمورد" }, { accountCode: inventoryCode, debit: 0, credit: subtotal, description: "تخفيض تكلفة المشتريات" }, { accountCode: "1400", debit: 0, credit: tax, description: "تخفيض ضريبة المشتريات" }]; }
    const journal = validateJournal({ description: "ترحيل " + note.documentKind, source: "ADJUSTMENT_NOTE", lines: journalLines }); const insertedJournal = await tx.insert(journalEntries).values({ journalNo: "ADJ-" + note.docNo, sourceInvoiceId: note.originalInvoiceId, entryType: note.documentKind, totalDebit: journal.totalDebit.toFixed(6), totalCredit: journal.totalCredit.toFixed(6) }).$returningId(); const journalId = Number(insertedJournal[0]?.id); if (!journalId) throw new Error("ADJUSTMENT_JOURNAL_CREATE_FAILED"); await tx.insert(journalEntryLines).values(journal.lines.map((line) => ({ journalEntryId: journalId, accountCode: line.accountCode, accountName: line.accountName, description: line.description, debit: Number(line.debit || 0).toFixed(6), credit: Number(line.credit || 0).toFixed(6) }))); await tx.update(adjustmentNotes).set({ status: "POSTED", postedAt: new Date() }).where(eq(adjustmentNotes.id, adjustmentId)); await tx.insert(auditEvents).values({ actor, actionCode: "POST", entityType: "ADJUSTMENT_NOTE", entityId: String(adjustmentId), requestId: "POST:" + note.docNo }); return { adjustmentId, status: "POSTED" as const, journalId, totalCost };
  });
}


type InventoryCountMode = "PERIODIC" | "CYCLE";

export async function createInventoryCount(input: { countNo: string; warehouseId: number; countMode: InventoryCountMode; actor: string; notes?: string; lines: { itemId: number; countedQuantity: string }[] }) {
  const db = await getDb();
  if (!db) {
    if (Array.from(demoInventoryCounts.values()).some((count) => count.countNo === input.countNo)) throw new Error("DUPLICATE_COUNT_NUMBER");
    const countId = ++demoInvoiceSequence;
    const result = { countId, countNo: input.countNo, warehouseId: input.warehouseId, countMode: input.countMode, status: "DRAFT" as const, lines: input.lines.map((line) => { const item = demoItems.find((candidate) => candidate.id === line.itemId); return { itemId: line.itemId, systemQuantity: 0, countedQuantity: Number(line.countedQuantity), unitCost: Number(item?.unitCost || 0) }; }) };
    demoInventoryCounts.set(countId, result);
    return { countId, countNo: input.countNo, status: "DRAFT" as const, lineCount: result.lines.length };
  }
  return db.transaction(async (tx) => {
    const warehouse = (await tx.select().from(warehouses).where(eq(warehouses.id, input.warehouseId)).limit(1))[0];
    if (!warehouse || warehouse.active !== 1) throw new Error("WAREHOUSE_NOT_ACTIVE");
    const inserted = await tx.insert(inventoryCounts).values({ countNo: input.countNo, warehouseId: input.warehouseId, countMode: input.countMode, actor: input.actor, notes: input.notes || null }).$returningId();
    const countId = Number(inserted[0]?.id); if (!countId) throw new Error("INVENTORY_COUNT_CREATE_FAILED");
    for (const line of input.lines) {
      const item = (await tx.select().from(items).where(eq(items.id, line.itemId)).limit(1))[0]; if (!item) throw new Error("ITEM_NOT_FOUND:" + line.itemId);
      const balance = (await tx.select().from(stockBalances).where(and(eq(stockBalances.itemId, line.itemId), eq(stockBalances.warehouseId, input.warehouseId))).limit(1))[0];
      const systemQuantity = Number(balance?.quantity || 0); const unitCost = Number(balance?.unitCost || item.unitCost || 0); const countedQuantity = Number(line.countedQuantity); if (!Number.isFinite(countedQuantity) || countedQuantity < 0) throw new Error("INVALID_COUNTED_QUANTITY");
      await tx.insert(inventoryCountLines).values({ countId, itemId: line.itemId, systemQuantity: systemQuantity.toFixed(6), countedQuantity: countedQuantity.toFixed(6), unitCost: unitCost.toFixed(6), varianceQuantity: (countedQuantity - systemQuantity).toFixed(6), varianceValue: ((countedQuantity - systemQuantity) * unitCost).toFixed(6) });
    }
    await tx.insert(auditEvents).values({ actor: input.actor, actionCode: "CREATE", entityType: "INVENTORY_COUNT", entityId: String(countId), requestId: "COUNT:" + input.countNo });
    return { countId, countNo: input.countNo, status: "DRAFT" as const, lineCount: input.lines.length };
  });
}

export async function postInventoryCount(countId: number, actor: string) {
  const db = await getDb();
  if (!db) { const count = demoInventoryCounts.get(countId); if (!count || count.status !== "DRAFT") throw new Error("INVENTORY_COUNT_NOT_POSTABLE"); count.status = "POSTED"; return { countId, status: "POSTED" as const, totalVariance: count.lines.reduce((sum, line) => sum + (line.countedQuantity - line.systemQuantity) * line.unitCost, 0).toFixed(6) }; }
  return db.transaction(async (tx) => {
    const count = (await tx.select().from(inventoryCounts).where(eq(inventoryCounts.id, countId)).limit(1))[0]; if (!count || count.status !== "DRAFT") throw new Error("INVENTORY_COUNT_NOT_POSTABLE");
    const lines = await tx.select({ line: inventoryCountLines, item: items, balance: stockBalances }).from(inventoryCountLines).innerJoin(items, eq(inventoryCountLines.itemId, items.id)).leftJoin(stockBalances, and(eq(stockBalances.itemId, inventoryCountLines.itemId), eq(stockBalances.warehouseId, count.warehouseId))).where(eq(inventoryCountLines.countId, countId));
    const periods = await tx.select().from(fiscalPeriods).where(and(eq(fiscalPeriods.companyId, 1), eq(fiscalPeriods.status, "OPEN"))).orderBy(desc(fiscalPeriods.startsOn)); const period = periods.find((candidate) => canPostToPeriod(candidate, count.countedAt).allowed); const periodCheck = canPostToPeriod(period, count.countedAt); if (!periodCheck.allowed) throw new Error(periodCheck.reason || "PERIOD_NOT_POSTABLE");
    const journalLines: { accountCode: string; debit: number; credit: number; description: string }[] = []; let totalVariance = 0;
    for (const row of lines) { const counted = Number(row.line.countedQuantity); const system = Number(row.line.systemQuantity); const unitCost = Number(row.line.unitCost); const variance = counted - system; const value = variance * unitCost; totalVariance += value; if (!variance) continue; const balance = row.balance; const afterCost = counted * unitCost; if (balance) await tx.update(stockBalances).set({ quantity: counted.toFixed(6), totalCost: afterCost.toFixed(6), unitCost: unitCost.toFixed(6), versionNo: balance.versionNo + 1 }).where(eq(stockBalances.id, balance.id)); else await tx.insert(stockBalances).values({ itemId: row.line.itemId, warehouseId: count.warehouseId, quantity: counted.toFixed(6), totalCost: afterCost.toFixed(6), unitCost: unitCost.toFixed(6), versionNo: 1 }); await tx.insert(stockMovements).values({ itemId: row.line.itemId, warehouseId: count.warehouseId, movementType: variance > 0 ? "INVENTORY_GAIN" : "INVENTORY_LOSS", quantityIn: variance > 0 ? variance.toFixed(6) : "0", quantityOut: variance < 0 ? Math.abs(variance).toFixed(6) : "0", unitCost: unitCost.toFixed(6), totalCost: Math.abs(value).toFixed(6), balanceAfter: counted.toFixed(6), createdBy: actor }); if (variance > 0) journalLines.push({ accountCode: row.item.inventoryAccount || "1300", debit: value, credit: 0, description: "زيادة جرد " + row.item.code }, { accountCode: "4300", debit: 0, credit: value, description: "أرباح فروقات الجرد" }); else journalLines.push({ accountCode: "5300", debit: Math.abs(value), credit: 0, description: "خسائر فروقات الجرد" }, { accountCode: row.item.inventoryAccount || "1300", debit: 0, credit: Math.abs(value), description: "نقص جرد " + row.item.code }); }
    if (journalLines.length) { const journal = validateJournal({ description: "ترحيل جرد " + count.countNo, source: "INVENTORY_COUNT", lines: journalLines }); const insertedJournal = await tx.insert(journalEntries).values({ journalNo: "COUNT-" + count.countNo, entryType: "INVENTORY_COUNT", totalDebit: journal.totalDebit.toFixed(6), totalCredit: journal.totalCredit.toFixed(6) }).$returningId(); const journalId = Number(insertedJournal[0]?.id); if (!journalId) throw new Error("INVENTORY_COUNT_JOURNAL_FAILED"); await tx.insert(journalEntryLines).values(journal.lines.map((line) => ({ journalEntryId: journalId, accountCode: line.accountCode, accountName: line.accountName, description: line.description, debit: Number(line.debit || 0).toFixed(6), credit: Number(line.credit || 0).toFixed(6) }))); }
    await tx.update(inventoryCounts).set({ status: "POSTED", postedAt: new Date() }).where(eq(inventoryCounts.id, countId)); await tx.insert(auditEvents).values({ actor, actionCode: "POST", entityType: "INVENTORY_COUNT", entityId: String(countId), requestId: "POST-COUNT:" + count.countNo }); return { countId, status: "POSTED" as const, totalVariance: totalVariance.toFixed(6) };
  });
}

export async function listWarehouses() { const db = await getDb(); if (!db) return [{ id: 1, companyId: 1, code: "MAIN", name: "المستودع الرئيسي", active: 1 }]; return db.select().from(warehouses).orderBy(warehouses.code); }


export async function receiveStock(input: { itemId: number; warehouseId: number; quantity: string; unitCost: string; actor: string; reference: string }) {
  const quantity = Number(input.quantity); const unitCost = Number(input.unitCost);
  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitCost) || unitCost < 0) throw new Error("INVALID_STOCK_RECEIPT");
  const db = await getDb();
  if (!db) { const key = `${input.itemId}:${input.warehouseId}`; const before = demoInventoryBalances.get(key) || { quantity: 0, totalCost: 0, unitCost: 0 }; const next = calculateMovingAverage(before.quantity, before.totalCost, quantity, unitCost); demoInventoryBalances.set(key, next); return { itemId: input.itemId, warehouseId: input.warehouseId, quantity: input.quantity, unitCost: input.unitCost, totalCost: next.totalCost.toFixed(6), balanceAfter: next.quantity.toFixed(6), status: "RECEIVED" as const, reference: input.reference }; }
  return db.transaction(async (tx) => {
    const balance = (await tx.select().from(stockBalances).where(and(eq(stockBalances.itemId, input.itemId), eq(stockBalances.warehouseId, input.warehouseId))).limit(1))[0];
    const beforeQty = Number(balance?.quantity ?? 0); const beforeCost = Number(balance?.totalCost ?? 0); const totalCost = quantity * unitCost;
    const afterQty = beforeQty + quantity; const afterCost = beforeCost + totalCost;
    if (balance) await tx.update(stockBalances).set({ quantity: afterQty.toFixed(6), totalCost: afterCost.toFixed(6), unitCost: (afterCost / afterQty).toFixed(6), versionNo: balance.versionNo + 1 }).where(eq(stockBalances.id, balance.id));
    else await tx.insert(stockBalances).values({ itemId: input.itemId, warehouseId: input.warehouseId, quantity: quantity.toFixed(6), totalCost: totalCost.toFixed(6), unitCost: unitCost.toFixed(6), versionNo: 1 });
    await tx.insert(stockMovements).values({ itemId: input.itemId, warehouseId: input.warehouseId, movementType: "PURCHASE_RECEIPT", quantityIn: quantity.toFixed(6), unitCost: unitCost.toFixed(6), totalCost: totalCost.toFixed(6), balanceAfter: afterQty.toFixed(6), createdBy: input.actor });
    const journalNo = `AP-RECEIPT-${input.reference}`;
    const inserted = await tx.insert(journalEntries).values({ journalNo, entryType: "AP_RECEIPT", totalDebit: totalCost.toFixed(6), totalCredit: totalCost.toFixed(6) }).$returningId();
    const journalId = Number(inserted[0]?.id); if (journalId) await tx.insert(journalEntryLines).values([{ journalEntryId: journalId, accountCode: "1300", accountName: "المخزون", debit: totalCost.toFixed(6), credit: "0", description: input.reference }, { journalEntryId: journalId, accountCode: "2100", accountName: "الموردون", debit: "0", credit: totalCost.toFixed(6), description: input.reference }]);
    await tx.insert(auditEvents).values({ actor: input.actor, actionCode: "RECEIVE", entityType: "STOCK", entityId: `${input.itemId}:${input.warehouseId}`, requestId: `RECEIVE:${input.reference}` });
    return { itemId: input.itemId, warehouseId: input.warehouseId, quantity: input.quantity, unitCost: input.unitCost, totalCost: totalCost.toFixed(6), status: "RECEIVED" as const, reference: input.reference };
  });
}

export async function postInvoice(invoiceId: number, actor: string, requestId?: string) {
  if (isCloudflareD1Enabled()) {
    assertAtomicPost({ documentType: "SALES_INVOICE", documentId: invoiceId, actor, requestId: requestId || `POST:SALES_INVOICE:${invoiceId}` });
    return postCloudSalesInvoice(invoiceId);
  }
  const db = await getDb();
  if (!db) {
    const invoice = demoInvoices.get(invoiceId);
    if (!invoice) throw new Error("INVOICE_NOT_FOUND");
    if (invoice.status !== "DRAFT") throw new Error("INVOICE_ALREADY_POSTED_OR_REVERSED");
    assertAtomicPost({ documentType: "SALES_INVOICE", documentId: invoiceId, actor, requestId: `POST:${invoice.docNo}` });
    applyDemoInvoiceTrace(demoInvoiceLines.get(invoiceId) || [], 1, "OUT");
    invoice.status = "POSTED";
    return { invoiceId, status: "POSTED" as const, totalCogs: 0 };
  }
  return db.transaction(async (tx) => {
    const invoice = (await tx.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1))[0];
    if (!invoice) throw new Error("INVOICE_NOT_FOUND");
    if (invoice.status !== "DRAFT") throw new Error("INVOICE_ALREADY_POSTED_OR_REVERSED");
    assertAtomicPost({ documentType: "SALES_INVOICE", documentId: invoiceId, actor, requestId: `POST:${invoice.docNo}` });
    const customer = invoice.customerId ? (await tx.select().from(customers).where(eq(customers.id, invoice.customerId)).limit(1))[0] : undefined;
    if (!customer?.accountId) throw new Error("CUSTOMER_ACCOUNT_NOT_LINKED");
    const customerAccount = (await tx.select().from(accounts).where(eq(accounts.id, customer.accountId)).limit(1))[0];
    if (!customerAccount) throw new Error("CUSTOMER_ACCOUNT_NOT_FOUND");
    const lines = await tx.select({ line: invoiceLines, item: items, balance: stockBalances }).from(invoiceLines).innerJoin(items, eq(invoiceLines.itemId, items.id)).leftJoin(stockBalances, and(eq(stockBalances.itemId, invoiceLines.itemId), eq(stockBalances.warehouseId, invoice.warehouseId))).where(eq(invoiceLines.invoiceId, invoiceId));
    const periods = await tx.select().from(fiscalPeriods).where(and(eq(fiscalPeriods.companyId, 1), eq(fiscalPeriods.status, "OPEN"))).orderBy(desc(fiscalPeriods.startsOn));
    const period = periods.find((candidate) => canPostToPeriod(candidate, invoice.createdAt).allowed);
    const periodCheck = canPostToPeriod(period, invoice.createdAt);
    if (!periodCheck.allowed) throw new Error(periodCheck.reason || "PERIOD_NOT_POSTABLE");
    let totalCogs = 0;
    for (const row of lines) {
      const quantity = Number(row.line.quantity);
      const balance = row.balance;
      const beforeQty = Number(balance?.quantity ?? 0);
      const unitCost = Number(balance?.unitCost ?? row.item.unitCost ?? 0);
      if (row.item.stockFlag && beforeQty < quantity) throw new Error(`INSUFFICIENT_STOCK:${row.item.code}`);
      const cost = row.item.stockFlag ? quantity * unitCost : 0;
      totalCogs += cost;
      if (row.item.stockFlag && balance) {
        const afterQty = beforeQty - quantity;
        const afterCost = Math.max(0, Number(balance.totalCost) - cost);
        await tx.update(stockBalances).set({ quantity: afterQty.toFixed(6), totalCost: afterCost.toFixed(6), unitCost: afterQty ? (afterCost / afterQty).toFixed(6) : "0", versionNo: balance.versionNo + 1 }).where(eq(stockBalances.id, balance.id));
        await tx.insert(stockMovements).values({ itemId: row.line.itemId, warehouseId: invoice.warehouseId, sourceInvoiceId: invoiceId, movementType: "SALES_ISSUE", quantityOut: quantity.toFixed(6), unitCost: unitCost.toFixed(6), totalCost: cost.toFixed(6), balanceAfter: afterQty.toFixed(6), createdBy: actor });
        await applyInvoiceInventoryTrace(tx, row, invoice.warehouseId, quantity, unitCost, "OUT", actor);
      }
    }
    const total = Number(invoice.grandTotal);
    const saleJournal = buildSaleJournal({ total, subtotal: Number(invoice.subtotal), taxTotal: Number(invoice.taxTotal), totalCogs, receivableAccount: customerAccount.code, revenueAccount: lines[0]?.item.revenueAccount || "4100", cogsAccount: lines[0]?.item.cogsAccount || "5100", inventoryAccount: lines[0]?.item.inventoryAccount || "1300" });
    const insertedJournal = await tx.insert(journalEntries).values({ journalNo: `AR-${invoice.docNo}`, sourceInvoiceId: invoiceId, entryType: "AR_SALE", totalDebit: saleJournal.totalDebit.toFixed(6), totalCredit: saleJournal.totalCredit.toFixed(6) }).$returningId();
    const journalId = Number(insertedJournal[0]?.id);
    if (!journalId) throw new Error("JOURNAL_CREATE_FAILED");
    await tx.insert(journalEntryLines).values(saleJournal.lines.map((line) => ({ journalEntryId: journalId, accountCode: line.accountCode, accountName: line.accountName, description: line.description, debit: Number(line.debit || 0).toFixed(6), credit: Number(line.credit || 0).toFixed(6) })));
    await tx.update(invoices).set({ status: "POSTED", postedAt: new Date() }).where(eq(invoices.id, invoiceId));
    await tx.insert(auditEvents).values({ actor, actionCode: "POST", entityType: "AR_DOC", entityId: String(invoiceId), requestId: `POST:${invoice.docNo}` });
    return { invoiceId, status: "POSTED" as const, totalCogs };
  });
}

export async function submitEInvoice(invoiceId: number, actor: string, requestId?: string) {
  const db = await getDb();
  const idempotencyKey = requestId?.trim() || `EINV:${invoiceId}`;
  if (!db) {
    const invoice = demoInvoices.get(invoiceId);
    if (!invoice || invoice.status !== "POSTED") throw new Error("EINVOICE_REQUIRES_POSTED_SALES_INVOICE");
    const existing = demoEInvoiceSubmissions.get(idempotencyKey);
    if (existing) return { ...existing, idempotent: true };
    const provider = getEInvoiceProvider();
    const result = await provider.submit(buildEInvoicePayload({ invoiceId, docNo: invoice.docNo, createdAt: new Date(), currencyCode: "SAR", customerId: 1, customerName: "عميل تجريبي", lines: demoInvoiceLines.get(invoiceId) || [] }), idempotencyKey);
    const submission = { id: demoEInvoiceSubmissions.size + 1, invoiceId, provider: provider.name, ...result };
    demoEInvoiceSubmissions.set(idempotencyKey, submission);
    return submission;
  }
  const existing = (await db.select().from(eInvoiceSubmissions).where(eq(eInvoiceSubmissions.idempotencyKey, idempotencyKey)).limit(1))[0];
  if (existing) return { ...existing, response: existing.responseJson ? JSON.parse(existing.responseJson) : undefined, idempotent: true };
  const invoice = (await db.select().from(invoices).where(and(eq(invoices.id, invoiceId), eq(invoices.invoiceType, "SALE"))).limit(1))[0];
  if (!invoice || invoice.status !== "POSTED") throw new Error("EINVOICE_REQUIRES_POSTED_SALES_INVOICE");
  const customer = invoice.customerId ? (await db.select().from(customers).where(eq(customers.id, invoice.customerId)).limit(1))[0] : undefined;
  const lines = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId));
  const payload = buildEInvoicePayload({ invoiceId, docNo: invoice.docNo, createdAt: invoice.createdAt, currencyCode: invoice.currencyCode, customerId: invoice.customerId, customerName: customer?.legalName, lines });
  const provider = getEInvoiceProvider();
  const inserted = await db.insert(eInvoiceSubmissions).values({ invoiceId, provider: provider.name, status: "QUEUED", idempotencyKey, payloadJson: JSON.stringify(payload) }).$returningId();
  const id = Number(inserted[0]?.id);
  if (!id) throw new Error("EINVOICE_SUBMISSION_CREATE_FAILED");
  let result;
  try { result = await provider.submit(payload, idempotencyKey); } catch (error) { result = { status: "FAILED" as const, errorCode: "PROVIDER_UNAVAILABLE", errorMessage: error instanceof Error ? error.message : String(error) }; }
  await db.update(eInvoiceSubmissions).set({ status: result.status, externalId: result.externalId || null, responseJson: result.response === undefined ? null : JSON.stringify(result.response), errorCode: result.errorCode || null, errorMessage: result.errorMessage || null, submittedAt: new Date() }).where(eq(eInvoiceSubmissions.id, id));
  await db.insert(auditEvents).values({ actor, actionCode: "EINVOICE_SUBMIT", entityType: "AR_DOC", entityId: String(invoiceId), requestId: idempotencyKey });
  return { id, invoiceId, provider: provider.name, ...result };
}

export async function getEInvoiceStatus(invoiceId: number) {
  const db = await getDb();
  if (!db) return Array.from(demoEInvoiceSubmissions.values()).filter((row) => row.invoiceId === invoiceId);
  const rows = await db.select().from(eInvoiceSubmissions).where(eq(eInvoiceSubmissions.invoiceId, invoiceId)).orderBy(desc(eInvoiceSubmissions.createdAt));
  return rows.map((row) => ({ ...row, response: row.responseJson ? JSON.parse(row.responseJson) : undefined }));
}

export async function reverseInvoice(invoiceId: number, actor: string, requestId?: string) {
  if (isCloudflareD1Enabled()) {
    assertAtomicReverse({ documentType: "SALES_INVOICE", documentId: invoiceId, actor, requestId: requestId || `REV:SALES_INVOICE:${invoiceId}` });
    return reverseCloudSalesInvoice(invoiceId);
  }
  const db = await getDb();
  if (!db) {
    const invoice = demoInvoices.get(invoiceId);
    if (!invoice || invoice.status !== "POSTED") throw new Error("ONLY_POSTED_INVOICES_CAN_BE_REVERSED");
    assertAtomicReverse({ documentType: "SALES_INVOICE", documentId: invoiceId, actor, requestId: `REV:${invoice.docNo}` });
    invoice.status = "REVERSED";
    return { invoiceId, status: "REVERSED" as const };
  }
  return db.transaction(async (tx) => {
    const invoice = (await tx.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1))[0];
    if (!invoice || invoice.status !== "POSTED") throw new Error("ONLY_POSTED_INVOICES_CAN_BE_REVERSED");
    assertAtomicReverse({ documentType: "SALES_INVOICE", documentId: invoiceId, actor, requestId: `REV:${invoice.docNo}` });
    const lines = await tx.select({ line: invoiceLines, item: items, balance: stockBalances }).from(invoiceLines).innerJoin(items, eq(invoiceLines.itemId, items.id)).leftJoin(stockBalances, and(eq(stockBalances.itemId, invoiceLines.itemId), eq(stockBalances.warehouseId, invoice.warehouseId))).where(eq(invoiceLines.invoiceId, invoiceId));
    const originalJournal = (await tx.select().from(journalEntries).where(and(eq(journalEntries.sourceInvoiceId, invoiceId), eq(journalEntries.entryType, "AR_SALE"))).limit(1))[0];
    for (const row of lines) {
      if (!row.item.stockFlag || !row.balance) continue;
      const quantity = Number(row.line.quantity);
      const cost = quantity * Number(row.balance.unitCost);
      const afterQty = Number(row.balance.quantity) + quantity;
      const afterCost = Number(row.balance.totalCost) + cost;
      await tx.update(stockBalances).set({ quantity: afterQty.toFixed(6), totalCost: afterCost.toFixed(6), unitCost: (afterCost / afterQty).toFixed(6), versionNo: row.balance.versionNo + 1 }).where(eq(stockBalances.id, row.balance.id));
      await tx.insert(stockMovements).values({ itemId: row.line.itemId, warehouseId: invoice.warehouseId, sourceInvoiceId: invoiceId, movementType: "SALES_RETURN", quantityIn: quantity.toFixed(6), unitCost: Number(row.balance.unitCost).toFixed(6), totalCost: cost.toFixed(6), balanceAfter: afterQty.toFixed(6), createdBy: actor });
    }
    if (!originalJournal) throw new Error("ORIGINAL_JOURNAL_NOT_FOUND");
    const originalLines = await tx.select().from(journalEntryLines).where(eq(journalEntryLines.journalEntryId, originalJournal.id));
    const totalCogs = Number(originalLines.find((line) => line.accountCode === "5100")?.debit || 0);
    const reversal = validateJournal({ description: "عكس فاتورة مبيعات", source: "SALE_INVOICE_REVERSAL", lines: originalLines.map((line) => ({ accountCode: line.accountCode, accountName: line.accountName || undefined, debit: Number(line.credit), credit: Number(line.debit), description: `عكس: ${line.description || ""}` })) });
    const insertedReversal = await tx.insert(journalEntries).values({ journalNo: `REV-${invoice.docNo}`, sourceInvoiceId: invoiceId, entryType: "REVERSAL", totalDebit: reversal.totalDebit.toFixed(6), totalCredit: reversal.totalCredit.toFixed(6) }).$returningId();
    const reversalId = Number(insertedReversal[0]?.id);
    if (!reversalId) throw new Error("REVERSAL_JOURNAL_CREATE_FAILED");
    await tx.insert(journalEntryLines).values(reversal.lines.map((line) => ({ journalEntryId: reversalId, accountCode: line.accountCode, accountName: line.accountName, description: line.description, debit: Number(line.debit || 0).toFixed(6), credit: Number(line.credit || 0).toFixed(6) })));
    await tx.update(invoices).set({ status: "REVERSED" }).where(eq(invoices.id, invoiceId));
    await tx.insert(auditEvents).values({ actor, actionCode: "REVERSE", entityType: "AR_DOC", entityId: String(invoiceId), requestId: `REV:${invoice.docNo}` });
    return { invoiceId, status: "REVERSED" as const };
  });
}

export async function executeSalesWindowAction(input: {
  legacyForm: string; action: string; actor: string; requestId: string; invoiceId?: number;
  invoice?: Parameters<typeof createInvoice>[0]; search?: string; limit?: number;
}) {
  const form = input.legacyForm.replace(/\.fmx$/i, "").toUpperCase();
  const contract = await getWindowContract(`${form}.fmx`);
  if (!contract.domain.toUpperCase().startsWith("AR")) throw new Error("SALES_WINDOW_DOMAIN_REQUIRED");
  if (!contract.actions.includes(input.action)) throw new Error("ACTION_NOT_ALLOWED_FOR_SALES_WINDOW");
  const db = await getDb();
  const cached = await getIdempotentWindowResult(db, input.requestId);
  if (cached) return { legacyForm: `${form}.fmx`, action: input.action, result: cached, mode: "DATABASE_CONTRACT" as const, idempotent: true };
  if (db) {
    await db.insert(windowContracts).values({ legacyForm: contract.legacyForm, domainCode: contract.domain, coreApi: contract.coreApi, actionsJson: JSON.stringify(contract.actions), evidenceJson: JSON.stringify(contract.evidence), rebuildLevel: "catalog_specification", verificationStatus: "CATALOG_ONLY", active: 1 }).onDuplicateKeyUpdate({ set: { domainCode: contract.domain, coreApi: contract.coreApi, actionsJson: JSON.stringify(contract.actions), evidenceJson: JSON.stringify(contract.evidence), updatedAt: new Date() } });
  }
  const log = async (status: string, response: unknown, invoiceId?: number) => {
    if (!db) return;
    await db.insert(windowExecutions).values({ legacyForm: `${form}.fmx`, actionCode: input.action, invoiceId, requestId: input.requestId, actor: input.actor, status, responseJson: JSON.stringify(response) });
  };
  try {
    let response: unknown;
    if (["initialize", "validate", "refresh"].includes(input.action)) response = { legacyForm: `${form}.fmx`, action: input.action, status: "VALIDATED", mode: "DATABASE_CONTRACT" };
    else if (input.action === "query") response = { legacyForm: `${form}.fmx`, action: input.action, rows: await searchInvoices(input.search, input.limit || 20), mode: "DATABASE_CONTRACT" };
    else if (["new", "save"].includes(input.action)) {
      if (!input.invoice) throw new Error("SALES_INVOICE_PAYLOAD_REQUIRED");
      response = await createInvoice(input.invoice);
    } else if (input.action === "post") {
      if (!input.invoiceId) throw new Error("SALES_INVOICE_ID_REQUIRED");
      response = await postInvoice(input.invoiceId, input.actor, input.requestId);
    } else if (input.action === "reverse") {
      if (!input.invoiceId) throw new Error("SALES_INVOICE_ID_REQUIRED");
      response = await reverseInvoice(input.invoiceId, input.actor, input.requestId);
    } else if (input.action === "print") response = { rows: await searchInvoices(input.search, input.limit || 20), mode: "DATABASE_CONTRACT" };
    else throw new Error("SALES_ACTION_NOT_IMPLEMENTED");
    await log("SUCCEEDED", response, input.invoiceId); if (!db) demoWindowExecutions.set(input.requestId, { status: "SUCCEEDED", response });
    return { legacyForm: `${form}.fmx`, action: input.action, result: response, mode: "DATABASE_CONTRACT" as const };
  } catch (error) {
    await log("FAILED", { error: error instanceof Error ? error.message : String(error) }, input.invoiceId);
    throw error;
  }
}

export function getFinancialReportCatalog() {
  return [
    { code: "GLSR001", name: "ملخص القيود المحاسبية", source: "journal_entries", columns: ["journalNo", "entryType", "totalDebit", "totalCredit", "status"] },
    { code: "ARSR041", name: "سجل فواتير المبيعات", source: "invoices", columns: ["docNo", "customerId", "grandTotal", "status", "createdAt"] },
    { code: "MRPREP001", name: "تقييم المخزون", source: "stock_balances", columns: ["itemId", "warehouseId", "quantity", "unitCost", "totalCost"] },
  ];
}

export async function runFinancialReport(input: { reportCode: string; search?: string; limit?: number }) {
  const db = await getDb(); const limit = input.limit || 100; const query = (input.search || "").trim();
  if (!db) {
    if (input.reportCode === "ARSR041") return { reportCode: input.reportCode, title: "سجل فواتير المبيعات", columns: ["docNo", "customerId", "grandTotal", "status"], rows: Array.from(demoInvoices.values()).filter((row) => !query || row.docNo.includes(query)).slice(-limit).reverse() };
    if (input.reportCode === "MRPREP001") return { reportCode: input.reportCode, title: "تقييم المخزون", columns: ["itemId", "warehouseId", "quantity", "unitCost", "totalCost"], rows: [{ itemId: 1, warehouseId: 1, quantity: "100", unitCost: "100", totalCost: "10000" }] };
    return { reportCode: input.reportCode, title: "ملخص القيود المحاسبية", columns: ["journalNo", "entryType", "totalDebit", "totalCredit", "status"], rows: demoJournals.slice(-limit).reverse() };
  }
  if (input.reportCode === "ARSR041") {
    const filters = query ? like(invoices.docNo, `%${query}%`) : undefined;
    return { reportCode: input.reportCode, title: "سجل فواتير المبيعات", columns: ["docNo", "customerId", "grandTotal", "status", "createdAt"], rows: await db.select({ docNo: invoices.docNo, customerId: invoices.customerId, grandTotal: invoices.grandTotal, status: invoices.status, createdAt: invoices.createdAt }).from(invoices).where(filters).orderBy(desc(invoices.createdAt)).limit(limit) };
  }
  if (input.reportCode === "MRPREP001") return { reportCode: input.reportCode, title: "تقييم المخزون", columns: ["itemId", "warehouseId", "quantity", "unitCost", "totalCost"], rows: await db.select({ itemId: stockBalances.itemId, warehouseId: stockBalances.warehouseId, quantity: stockBalances.quantity, unitCost: stockBalances.unitCost, totalCost: stockBalances.totalCost }).from(stockBalances).limit(limit) };
  const filters = query ? like(journalEntries.journalNo, `%${query}%`) : undefined;
  return { reportCode: input.reportCode, title: "ملخص القيود المحاسبية", columns: ["journalNo", "entryType", "totalDebit", "totalCredit", "status", "createdAt"], rows: await db.select({ journalNo: journalEntries.journalNo, entryType: journalEntries.entryType, totalDebit: journalEntries.totalDebit, totalCredit: journalEntries.totalCredit, status: journalEntries.status, createdAt: journalEntries.createdAt }).from(journalEntries).where(filters).orderBy(desc(journalEntries.createdAt)).limit(limit) };
}

export async function deleteCustomer(input: { id: number; actor?: string }) {
  const db = await getDb();
  if (!db) {
    const index = demoCustomers.findIndex((row) => row.id === input.id);
    if (index < 0) throw new Error("CUSTOMER_NOT_FOUND");
    const [removed] = demoCustomers.splice(index, 1);
    if (removed?.accountId) {
      const accountIndex = demoAccounts.findIndex((row) => row.id === removed.accountId);
      if (accountIndex >= 0) demoAccounts.splice(accountIndex, 1);
    }
    return { id: input.id, deleted: true as const };
  }
  return db.transaction(async (tx) => {
    const current = (await tx.select().from(customers).where(eq(customers.id, input.id)).limit(1))[0];
    if (!current) throw new Error("CUSTOMER_NOT_FOUND");
    const invoice = (await tx.select({ id: invoices.id }).from(invoices).where(and(eq(invoices.customerId, input.id), eq(invoices.invoiceType, "SALE"))).limit(1))[0];
    if (invoice) throw new Error("CUSTOMER_HAS_TRANSACTIONS");
    const adjustment = (await tx.select({ id: adjustmentNotes.id }).from(adjustmentNotes).where(eq(adjustmentNotes.customerId, input.id)).limit(1))[0];
    if (adjustment) throw new Error("CUSTOMER_HAS_TRANSACTIONS");
    await tx.delete(customers).where(eq(customers.id, input.id));
    if (current.accountId) await tx.delete(accounts).where(eq(accounts.id, current.accountId));
    await tx.insert(auditEvents).values({ actor: input.actor || "workbench.user", actionCode: "DELETE", entityType: "CUSTOMER", entityId: String(input.id), requestId: `CUSTOMER:DELETE:${input.id}` });
    return { id: input.id, deleted: true as const };
  });
}

export async function deleteSupplier(input: { id: number; actor?: string }) {
  const db = await getDb();
  if (!db) {
    const index = demoSuppliers.findIndex((row) => row.id === input.id);
    if (index < 0) throw new Error("SUPPLIER_NOT_FOUND");
    const [removed] = demoSuppliers.splice(index, 1);
    if (removed?.accountId) {
      const accountIndex = demoAccounts.findIndex((row) => row.id === removed.accountId);
      if (accountIndex >= 0) demoAccounts.splice(accountIndex, 1);
    }
    return { id: input.id, deleted: true as const };
  }
  return db.transaction(async (tx) => {
    const current = (await tx.select().from(suppliers).where(eq(suppliers.id, input.id)).limit(1))[0];
    if (!current) throw new Error("SUPPLIER_NOT_FOUND");
    const invoice = (await tx.select({ id: invoices.id }).from(invoices).where(and(eq(invoices.supplierId, input.id), eq(invoices.invoiceType, "PURCHASE"))).limit(1))[0];
    if (invoice) throw new Error("SUPPLIER_HAS_TRANSACTIONS");
    const adjustment = (await tx.select({ id: adjustmentNotes.id }).from(adjustmentNotes).where(eq(adjustmentNotes.supplierId, input.id)).limit(1))[0];
    if (adjustment) throw new Error("SUPPLIER_HAS_TRANSACTIONS");
    await tx.delete(suppliers).where(eq(suppliers.id, input.id));
    if (current.accountId) await tx.delete(accounts).where(eq(accounts.id, current.accountId));
    await tx.insert(auditEvents).values({ actor: input.actor || "workbench.user", actionCode: "DELETE", entityType: "SUPPLIER", entityId: String(input.id), requestId: `SUPPLIER:DELETE:${input.id}` });
    return { id: input.id, deleted: true as const };
  });
}

export async function deleteItem(input: { id: number; actor?: string }) {
  const db = await getDb();
  if (!db) {
    const index = demoItems.findIndex((row) => row.id === input.id);
    if (index < 0) throw new Error("ITEM_NOT_FOUND");
    demoItems.splice(index, 1);
    return { id: input.id, deleted: true as const };
  }
  return db.transaction(async (tx) => {
    const current = (await tx.select({ id: items.id }).from(items).where(eq(items.id, input.id)).limit(1))[0];
    if (!current) throw new Error("ITEM_NOT_FOUND");
    const invoiceLine = (await tx.select({ id: invoiceLines.id }).from(invoiceLines).where(eq(invoiceLines.itemId, input.id)).limit(1))[0];
    const balance = (await tx.select({ id: stockBalances.id }).from(stockBalances).where(eq(stockBalances.itemId, input.id)).limit(1))[0];
    const movement = (await tx.select({ id: stockMovements.id }).from(stockMovements).where(eq(stockMovements.itemId, input.id)).limit(1))[0];
    const adjustmentLine = (await tx.select({ id: adjustmentNoteLines.id }).from(adjustmentNoteLines).where(eq(adjustmentNoteLines.itemId, input.id)).limit(1))[0];
    const countLine = (await tx.select({ id: inventoryCountLines.id }).from(inventoryCountLines).where(eq(inventoryCountLines.itemId, input.id)).limit(1))[0];
    if (invoiceLine || balance || movement || adjustmentLine || countLine) throw new Error("ITEM_HAS_TRANSACTIONS");
    await tx.delete(items).where(eq(items.id, input.id));
    await tx.insert(auditEvents).values({ actor: input.actor || "workbench.user", actionCode: "DELETE", entityType: "ITEM", entityId: String(input.id), requestId: `ITEM:DELETE:${input.id}` });
    return { id: input.id, deleted: true as const };
  });
}

export async function deleteAccount(input: { id: number; actor?: string }) {
  const db = await getDb();
  if (!db) {
    const index = demoAccounts.findIndex((row) => row.id === input.id);
    if (index < 0) throw new Error("ACCOUNT_NOT_FOUND");
    demoAccounts.splice(index, 1);
    return { id: input.id, deleted: true as const };
  }
  return db.transaction(async (tx) => {
    const current = (await tx.select().from(accounts).where(eq(accounts.id, input.id)).limit(1))[0];
    if (!current) throw new Error("ACCOUNT_NOT_FOUND");
    const journalLine = (await tx.select({ id: journalEntryLines.id }).from(journalEntryLines).where(eq(journalEntryLines.accountCode, current.code)).limit(1))[0];
    const customer = (await tx.select({ id: customers.id }).from(customers).where(eq(customers.accountId, input.id)).limit(1))[0];
    const supplier = (await tx.select({ id: suppliers.id }).from(suppliers).where(eq(suppliers.accountId, input.id)).limit(1))[0];
    const item = (await tx.select({ id: items.id }).from(items).where(or(eq(items.revenueAccount, current.code), eq(items.inventoryAccount, current.code), eq(items.cogsAccount, current.code))).limit(1))[0];
    const cashBox = (await tx.select({ id: cashBoxes.id }).from(cashBoxes).where(eq(cashBoxes.accountId, input.id)).limit(1))[0];
    const bank = (await tx.select({ id: banks.id }).from(banks).where(eq(banks.accountId, input.id)).limit(1))[0];
    if (journalLine || customer || supplier || item || cashBox || bank) throw new Error("ACCOUNT_HAS_REFERENCES");
    await tx.delete(accounts).where(eq(accounts.id, input.id));
    await tx.insert(auditEvents).values({ actor: input.actor || "workbench.user", actionCode: "DELETE", entityType: "ACCOUNT", entityId: String(input.id), requestId: `ACCOUNT:DELETE:${input.id}` });
    return { id: input.id, deleted: true as const };
  });
}

export async function searchWindowExecutions(legacyForm: string, search?: string, limit = 20) {
  const form = legacyForm.replace(/\.fmx$/i, "").toUpperCase();
  const query = (search || "").trim();
  const db = await getDb();
  if (!db) {
    return Array.from(demoWindowExecutions.entries()).map(([requestId, value], index) => ({ id: index + 1, legacyForm: form, actionCode: "EXECUTION", requestId, status: value.status, response: value.response })).filter((row) => !query || `${row.requestId} ${row.status}`.toLowerCase().includes(query.toLowerCase())).slice(0, limit);
  }
  const filters = [eq(windowExecutions.legacyForm, `${form}.fmx`)];
  if (query) filters.push(or(like(windowExecutions.actionCode, `%${query}%`), like(windowExecutions.requestId, `%${query}%`), like(windowExecutions.status, `%${query}%`))!);
  return db.select().from(windowExecutions).where(and(...filters)).orderBy(desc(windowExecutions.createdAt)).limit(limit);
}

export async function deleteWindowRecord(input: { legacyForm: string; id: number; actor?: string }) {
  const form = input.legacyForm.replace(/\.fmx$/i, "").toUpperCase();
  if (form === "ARST003") return deleteCustomer({ id: input.id, actor: input.actor });
  if (form === "APSI002") return deleteSupplier({ id: input.id, actor: input.actor });
  if (form === "INVT003") return deleteItem({ id: input.id, actor: input.actor });
  if (form === "GLST001") return deleteAccount({ id: input.id, actor: input.actor });
  const db = await getDb();
  if (!db) {
    if (form === "ERP_DBA" || form === "ADMT027") { const index = demoUsers.findIndex((row) => row.id === input.id); if (index < 0) throw new Error("USER_NOT_FOUND"); demoUsers.splice(index, 1); return { id: input.id, deleted: true as const }; }
    if (form === "ERP_DBA_DFLT_DATA") { const index = demoBranches.findIndex((row) => row.id === input.id); if (index < 0) throw new Error("BRANCH_NOT_FOUND"); demoBranches.splice(index, 1); return { id: input.id, deleted: true as const }; }
    if (form === "MRPACS004") { const index = demoWarehouses.findIndex((row) => row.id === input.id); if (index < 0) throw new Error("WAREHOUSE_NOT_FOUND"); demoWarehouses.splice(index, 1); return { id: input.id, deleted: true as const }; }
    throw new Error("WINDOW_DELETE_NOT_SUPPORTED");
  }
  return db.transaction(async (tx) => {
    if (form === "ERP_DBA" || form === "ADMT027") {
      const current = (await tx.select({ id: users.id }).from(users).where(eq(users.id, input.id)).limit(1))[0];
      if (!current) throw new Error("USER_NOT_FOUND");
      await tx.delete(users).where(eq(users.id, input.id));
      await tx.insert(auditEvents).values({ actor: input.actor || "workbench.user", actionCode: "DELETE", entityType: "USER", entityId: String(input.id), requestId: `USER:DELETE:${input.id}` });
      return { id: input.id, deleted: true as const };
    }
    if (form === "ERP_DBA_DFLT_DATA") {
      const current = (await tx.select({ id: branches.id }).from(branches).where(eq(branches.id, input.id)).limit(1))[0];
      if (!current) throw new Error("BRANCH_NOT_FOUND");
      await tx.delete(branches).where(eq(branches.id, input.id));
      await tx.insert(auditEvents).values({ actor: input.actor || "workbench.user", actionCode: "DELETE", entityType: "BRANCH", entityId: String(input.id), requestId: `BRANCH:DELETE:${input.id}` });
      return { id: input.id, deleted: true as const };
    }
    if (form === "MRPACS004") {
      const current = (await tx.select({ id: warehouses.id }).from(warehouses).where(eq(warehouses.id, input.id)).limit(1))[0];
      if (!current) throw new Error("WAREHOUSE_NOT_FOUND");
      const invoice = (await tx.select({ id: invoices.id }).from(invoices).where(eq(invoices.warehouseId, input.id)).limit(1))[0];
      const balance = (await tx.select({ id: stockBalances.id }).from(stockBalances).where(eq(stockBalances.warehouseId, input.id)).limit(1))[0];
      if (invoice || balance) throw new Error("WAREHOUSE_HAS_TRANSACTIONS");
      await tx.delete(warehouses).where(eq(warehouses.id, input.id));
      await tx.insert(auditEvents).values({ actor: input.actor || "workbench.user", actionCode: "DELETE", entityType: "WAREHOUSE", entityId: String(input.id), requestId: `WAREHOUSE:DELETE:${input.id}` });
      return { id: input.id, deleted: true as const };
    }
    if (form === "ARST004" || form.startsWith("POST") || form === "APST003") {
      const current = (await tx.select({ id: invoices.id, status: invoices.status }).from(invoices).where(eq(invoices.id, input.id)).limit(1))[0];
      if (!current) throw new Error("DOCUMENT_NOT_FOUND");
      if (current.status !== "DRAFT") throw new Error("POSTED_DOCUMENT_CANNOT_BE_DELETED");
      await tx.delete(invoiceLines).where(eq(invoiceLines.invoiceId, input.id));
      await tx.delete(invoices).where(eq(invoices.id, input.id));
      await tx.insert(auditEvents).values({ actor: input.actor || "workbench.user", actionCode: "DELETE", entityType: "ERP_DOCUMENT", entityId: String(input.id), requestId: `DOCUMENT:DELETE:${input.id}` });
      return { id: input.id, deleted: true as const };
    }
    throw new Error("WINDOW_DELETE_NOT_SUPPORTED");
  });
}

const demoReceiptVouchers = new Map<number, { id: number; voucherNo: string; customerId: number; amount: number; status: "DRAFT" | "POSTED" | "REVERSED"; allocations: { invoiceId: number; amount: number }[] }>();
const demoPaymentVouchers = new Map<number, { id: number; voucherNo: string; supplierId: number; amount: number; status: "DRAFT" | "POSTED" | "REVERSED"; allocations: { invoiceId: number; amount: number }[] }>();
let demoVoucherSequence = 5000;

type VoucherAllocation = { invoiceId: number; amount: string };
type VoucherInput = { voucherNo: string; companyId?: number; partyId: number; cashAccountCode: string; currencyCode?: string; amount: string; reference?: string; actor: string; allocations: VoucherAllocation[] };

function validateVoucher(input: VoucherInput) {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("VOUCHER_AMOUNT_MUST_BE_POSITIVE");
  if (!input.allocations.length) throw new Error("VOUCHER_NEEDS_ALLOCATIONS");
  const allocations = input.allocations.map((row) => ({ invoiceId: row.invoiceId, amount: Number(row.amount) }));
  if (allocations.some((row) => !Number.isInteger(row.invoiceId) || row.invoiceId <= 0 || !Number.isFinite(row.amount) || row.amount <= 0)) throw new Error("VOUCHER_INVALID_ALLOCATION");
  const allocated = allocations.reduce((sum, row) => sum + row.amount, 0);
  if (Math.abs(allocated - amount) > 0.000001) throw new Error("VOUCHER_ALLOCATION_MUST_EQUAL_TOTAL");
  return { amount, allocations };
}

export async function createReceiptVoucher(input: VoucherInput) {
  const checked = validateVoucher(input); const db = await getDb(); const idempotencyKey = `RECEIPT:${input.voucherNo}`;
  if (!db) { if (Array.from(demoReceiptVouchers.values()).some((row) => row.voucherNo === input.voucherNo)) throw new Error("DUPLICATE_IDEMPOTENCY_KEY"); const id = ++demoVoucherSequence; const result = { id, voucherNo: input.voucherNo, customerId: input.partyId, amount: checked.amount, status: "DRAFT" as const, allocations: checked.allocations }; demoReceiptVouchers.set(id, result); return result; }
  return db.transaction(async (tx) => { const inserted = await tx.insert(receiptVouchers).values({ voucherNo: input.voucherNo, companyId: input.companyId || 1, customerId: input.partyId, cashAccountCode: input.cashAccountCode, currencyCode: input.currencyCode || "SAR", amount: checked.amount.toFixed(6), idempotencyKey, reference: input.reference || null, actor: input.actor }).$returningId(); const id = Number(inserted[0]?.id); if (!id) throw new Error("RECEIPT_CREATE_FAILED"); await tx.insert(receiptAllocations).values(checked.allocations.map((row) => ({ receiptId: id, invoiceId: row.invoiceId, amount: row.amount.toFixed(6) }))); return { id, voucherNo: input.voucherNo, amount: checked.amount, status: "DRAFT" as const }; });
}

export async function createPaymentVoucher(input: VoucherInput) {
  const checked = validateVoucher(input); const db = await getDb(); const idempotencyKey = `PAYMENT:${input.voucherNo}`;
  if (!db) { if (Array.from(demoPaymentVouchers.values()).some((row) => row.voucherNo === input.voucherNo)) throw new Error("DUPLICATE_IDEMPOTENCY_KEY"); const id = ++demoVoucherSequence; const result = { id, voucherNo: input.voucherNo, supplierId: input.partyId, amount: checked.amount, status: "DRAFT" as const, allocations: checked.allocations }; demoPaymentVouchers.set(id, result); return result; }
  return db.transaction(async (tx) => { const inserted = await tx.insert(paymentVouchers).values({ voucherNo: input.voucherNo, companyId: input.companyId || 1, supplierId: input.partyId, cashAccountCode: input.cashAccountCode, currencyCode: input.currencyCode || "SAR", amount: checked.amount.toFixed(6), idempotencyKey, reference: input.reference || null, actor: input.actor }).$returningId(); const id = Number(inserted[0]?.id); if (!id) throw new Error("PAYMENT_CREATE_FAILED"); await tx.insert(paymentAllocations).values(checked.allocations.map((row) => ({ paymentId: id, invoiceId: row.invoiceId, amount: row.amount.toFixed(6) }))); return { id, voucherNo: input.voucherNo, amount: checked.amount, status: "DRAFT" as const }; });
}

async function postVoucher(kind: "RECEIPT" | "PAYMENT", id: number, actor: string) {
  const db = await getDb();
  if (!db) { const map = kind === "RECEIPT" ? demoReceiptVouchers : demoPaymentVouchers; const voucher = map.get(id); if (!voucher) throw new Error(`${kind}_NOT_FOUND`); if (voucher.status !== "DRAFT") throw new Error(`${kind}_NOT_POSTABLE`); assertAtomicPost({ documentType: `${kind}_VOUCHER`, documentId: id, actor, requestId: `${kind}:POST:${id}` }); const invoicesMap = kind === "RECEIPT" ? demoInvoices : demoPurchaseInvoices; for (const allocation of voucher.allocations) { const invoice = invoicesMap.get(allocation.invoiceId); if (!invoice) throw new Error("ALLOCATED_INVOICE_NOT_FOUND"); if (invoice.status !== "POSTED") throw new Error("ALLOCATED_INVOICE_NOT_POSTED"); } voucher.status = "POSTED"; return { id, status: "POSTED" as const }; }
  return db.transaction(async (tx) => {
    const voucher = kind === "RECEIPT" ? (await tx.select().from(receiptVouchers).where(eq(receiptVouchers.id, id)).limit(1))[0] : (await tx.select().from(paymentVouchers).where(eq(paymentVouchers.id, id)).limit(1))[0];
    if (!voucher) throw new Error(`${kind}_NOT_FOUND`); if (voucher.status !== "DRAFT") throw new Error(`${kind}_NOT_POSTABLE`); assertAtomicPost({ documentType: `${kind}_VOUCHER`, documentId: id, actor, requestId: `${kind}:POST:${id}` });
    const allocations = kind === "RECEIPT" ? await tx.select().from(receiptAllocations).where(eq(receiptAllocations.receiptId, id)) : await tx.select().from(paymentAllocations).where(eq(paymentAllocations.paymentId, id));
    for (const allocation of allocations) { const invoice = (await tx.select().from(invoices).where(eq(invoices.id, allocation.invoiceId)).limit(1))[0]; if (!invoice || invoice.status !== "POSTED") throw new Error("ALLOCATED_INVOICE_NOT_POSTED"); const currentPaid = Number(invoice.paidAmount || 0); const allocationAmount = Number(allocation.amount); const remaining = Number(invoice.grandTotal) - currentPaid; if (allocationAmount > remaining + 0.000001) throw new Error("VOUCHER_EXCEEDS_INVOICE_BALANCE"); await tx.update(invoices).set({ paidAmount: (currentPaid + allocationAmount).toFixed(6), remainingAmount: (remaining - allocationAmount).toFixed(6) }).where(eq(invoices.id, invoice.id)); }
    if (kind === "RECEIPT") await tx.update(receiptVouchers).set({ status: "POSTED", postedAt: new Date() }).where(eq(receiptVouchers.id, id)); else await tx.update(paymentVouchers).set({ status: "POSTED", postedAt: new Date() }).where(eq(paymentVouchers.id, id));
    await tx.insert(auditEvents).values({ actor, actionCode: "POST", entityType: `${kind}_VOUCHER`, entityId: String(id), requestId: `${kind}:POST:${id}` });
    return { id, status: "POSTED" as const };
  });
}

export const postReceiptVoucher = (id: number, actor: string) => postVoucher("RECEIPT", id, actor);
export const postPaymentVoucher = (id: number, actor: string) => postVoucher("PAYMENT", id, actor);

export async function createInventoryTransfer(input: { transferNo: string; sourceWarehouseId: number; destinationWarehouseId: number; actor: string; lines: { itemId: number; quantity: string }[] }) {
  if (input.sourceWarehouseId === input.destinationWarehouseId) throw new Error("TRANSFER_WAREHOUSES_MUST_DIFFER");
  if (!input.lines.length) throw new Error("TRANSFER_NEEDS_LINES");
  const lines = input.lines.map((line) => { const quantity = Number(line.quantity); if (!Number.isInteger(line.itemId) || line.itemId <= 0 || !Number.isFinite(quantity) || quantity <= 0) throw new Error("INVALID_TRANSFER_LINE"); return { itemId: line.itemId, quantity }; });
  const db = await getDb();
  if (!db) { if (Array.from(demoInventoryTransfers.values()).some((row) => row.transferNo === input.transferNo)) throw new Error("DUPLICATE_IDEMPOTENCY_KEY"); const id = Math.max(...Array.from(demoInventoryTransfers.keys()), 0) + 1; const result = { id, transferNo: input.transferNo, sourceWarehouseId: input.sourceWarehouseId, destinationWarehouseId: input.destinationWarehouseId, status: "DRAFT" as const, lines: lines.map((line) => ({ ...line, unitCost: demoInventoryBalances.get(`${line.itemId}:${input.sourceWarehouseId}`)?.unitCost || 0 })) }; demoInventoryTransfers.set(id, result); return result; }
  return db.transaction(async (tx) => { const inserted = await tx.insert(inventoryTransfers).values({ transferNo: input.transferNo, sourceWarehouseId: input.sourceWarehouseId, destinationWarehouseId: input.destinationWarehouseId, actor: input.actor, idempotencyKey: `TRANSFER:${input.transferNo}` }).$returningId(); const id = Number(inserted[0]?.id); if (!id) throw new Error("TRANSFER_CREATE_FAILED"); await tx.insert(inventoryTransferLines).values(lines.map((line) => ({ transferId: id, itemId: line.itemId, quantity: line.quantity.toFixed(6), unitCost: "0" }))); return { id, transferNo: input.transferNo, status: "DRAFT" as const, lineCount: lines.length }; });
}

export async function postInventoryTransfer(transferId: number, actor: string) {
  const db = await getDb();
  if (!db) { const transfer = demoInventoryTransfers.get(transferId); if (!transfer || transfer.status !== "DRAFT") throw new Error("TRANSFER_NOT_POSTABLE"); assertAtomicPost({ documentType: "INVENTORY_TRANSFER", documentId: transferId, actor, requestId: `TRANSFER:POST:${transferId}` }); for (const line of transfer.lines) { const sourceKey = `${line.itemId}:${transfer.sourceWarehouseId}`; const destinationKey = `${line.itemId}:${transfer.destinationWarehouseId}`; const source = demoInventoryBalances.get(sourceKey) || { quantity: 0, totalCost: 0, unitCost: 0 }; const afterSource = assertStockRule({ beforeQuantity: source.quantity, movementQuantity: line.quantity, direction: "OUT" }); const destination = demoInventoryBalances.get(destinationKey) || { quantity: 0, totalCost: 0, unitCost: 0 }; const movedCost = line.quantity * source.unitCost; demoInventoryBalances.set(sourceKey, { quantity: afterSource, totalCost: Math.max(0, source.totalCost - movedCost), unitCost: afterSource ? Math.max(0, source.totalCost - movedCost) / afterSource : 0 }); demoInventoryBalances.set(destinationKey, { quantity: destination.quantity + line.quantity, totalCost: destination.totalCost + movedCost, unitCost: (destination.totalCost + movedCost) / (destination.quantity + line.quantity) }); } transfer.status = "POSTED"; return { transferId, status: "POSTED" as const }; }
  return db.transaction(async (tx) => {
    const transfer = (await tx.select().from(inventoryTransfers).where(eq(inventoryTransfers.id, transferId)).limit(1))[0]; if (!transfer || transfer.status !== "DRAFT") throw new Error("TRANSFER_NOT_POSTABLE"); assertAtomicPost({ documentType: "INVENTORY_TRANSFER", documentId: transferId, actor, requestId: `TRANSFER:POST:${transferId}` });
    const lines = await tx.select().from(inventoryTransferLines).where(eq(inventoryTransferLines.transferId, transferId));
    for (const line of lines) { const source = (await tx.select().from(stockBalances).where(and(eq(stockBalances.itemId, line.itemId), eq(stockBalances.warehouseId, transfer.sourceWarehouseId))).limit(1))[0]; const quantity = Number(line.quantity); if (!source) throw new Error("INSUFFICIENT_STOCK"); const afterSource = assertStockRule({ beforeQuantity: Number(source.quantity), movementQuantity: quantity, direction: "OUT" }); const movedCost = quantity * Number(source.unitCost); const destination = (await tx.select().from(stockBalances).where(and(eq(stockBalances.itemId, line.itemId), eq(stockBalances.warehouseId, transfer.destinationWarehouseId))).limit(1))[0]; const nextDestination = destination ? calculateMovingAverage(Number(destination.quantity), Number(destination.totalCost), quantity, Number(source.unitCost)) : { quantity, totalCost: movedCost, unitCost: Number(source.unitCost) }; await tx.update(stockBalances).set({ quantity: afterSource.toFixed(6), totalCost: Math.max(0, Number(source.totalCost) - movedCost).toFixed(6), unitCost: afterSource ? (Math.max(0, Number(source.totalCost) - movedCost) / afterSource).toFixed(6) : "0", versionNo: source.versionNo + 1 }).where(eq(stockBalances.id, source.id)); if (destination) await tx.update(stockBalances).set({ quantity: nextDestination.quantity.toFixed(6), totalCost: nextDestination.totalCost.toFixed(6), unitCost: nextDestination.unitCost.toFixed(6), versionNo: destination.versionNo + 1 }).where(eq(stockBalances.id, destination.id)); else await tx.insert(stockBalances).values({ itemId: line.itemId, warehouseId: transfer.destinationWarehouseId, quantity: nextDestination.quantity.toFixed(6), totalCost: nextDestination.totalCost.toFixed(6), unitCost: nextDestination.unitCost.toFixed(6), versionNo: 1 }); await tx.insert(stockMovements).values([{ itemId: line.itemId, warehouseId: transfer.sourceWarehouseId, movementType: "TRANSFER_OUT", quantityOut: quantity.toFixed(6), unitCost: Number(source.unitCost).toFixed(6), totalCost: movedCost.toFixed(6), balanceAfter: afterSource.toFixed(6), createdBy: actor }, { itemId: line.itemId, warehouseId: transfer.destinationWarehouseId, movementType: "TRANSFER_IN", quantityIn: quantity.toFixed(6), unitCost: Number(source.unitCost).toFixed(6), totalCost: movedCost.toFixed(6), balanceAfter: nextDestination.quantity.toFixed(6), createdBy: actor }]); }
    await tx.update(inventoryTransfers).set({ status: "POSTED", postedAt: new Date() }).where(eq(inventoryTransfers.id, transferId)); await tx.insert(auditEvents).values({ actor, actionCode: "POST", entityType: "INVENTORY_TRANSFER", entityId: String(transferId), requestId: `TRANSFER:POST:${transferId}` }); return { transferId, status: "POSTED" as const };
  });
}

async function applyInvoiceInventoryTrace(tx: any, line: any, warehouseId: number, quantity: number, unitCost: number, direction: "IN" | "OUT", actor: string) {
  const metadata = line.line; const serials: string[] = metadata.serialsJson ? JSON.parse(metadata.serialsJson) : [];
  if (metadata.locationId) { const location = (await tx.select().from(warehouseLocations).where(and(eq(warehouseLocations.id, metadata.locationId), eq(warehouseLocations.warehouseId, warehouseId))).limit(1))[0]; if (!location || location.active !== 1) throw new Error("STORAGE_LOCATION_NOT_ACTIVE"); const locationBalance = (await tx.select().from(stockLocationBalances).where(and(eq(stockLocationBalances.itemId, metadata.itemId), eq(stockLocationBalances.warehouseId, warehouseId), eq(stockLocationBalances.locationId, metadata.locationId))).limit(1))[0]; const before = Number(locationBalance?.quantity || 0); const after = direction === "IN" ? before + quantity : before - quantity; if (after < -0.000001) throw new Error("INSUFFICIENT_LOCATION_STOCK"); const totalCost = direction === "IN" ? Number(locationBalance?.totalCost || 0) + quantity * unitCost : Math.max(0, Number(locationBalance?.totalCost || 0) - quantity * unitCost); if (locationBalance) await tx.update(stockLocationBalances).set({ quantity: after.toFixed(6), totalCost: totalCost.toFixed(6), unitCost: after ? (totalCost / after).toFixed(6) : "0", versionNo: locationBalance.versionNo + 1 }).where(eq(stockLocationBalances.id, locationBalance.id)); else await tx.insert(stockLocationBalances).values({ itemId: metadata.itemId, warehouseId, locationId: metadata.locationId, quantity: quantity.toFixed(6), totalCost: (quantity * unitCost).toFixed(6), unitCost: unitCost.toFixed(6), versionNo: 1 }); }
  if (metadata.batchNo) { const batch = (await tx.select().from(inventoryBatches).where(and(eq(inventoryBatches.itemId, metadata.itemId), eq(inventoryBatches.warehouseId, warehouseId), eq(inventoryBatches.batchNo, metadata.batchNo))).limit(1))[0]; const before = Number(batch?.quantity || 0); const after = direction === "IN" ? before + quantity : before - quantity; if (after < -0.000001) throw new Error("INSUFFICIENT_BATCH_STOCK"); if (batch) await tx.update(inventoryBatches).set({ quantity: after.toFixed(6), unitCost: unitCost.toFixed(6), expireDate: metadata.expireDate ? new Date(metadata.expireDate) : batch.expireDate, locationId: metadata.locationId || batch.locationId }).where(eq(inventoryBatches.id, batch.id)); else if (direction === "IN") await tx.insert(inventoryBatches).values({ itemId: metadata.itemId, warehouseId, batchNo: metadata.batchNo, quantity: quantity.toFixed(6), unitCost: unitCost.toFixed(6), expireDate: metadata.expireDate ? new Date(metadata.expireDate) : null, locationId: metadata.locationId || null }); }
  if (serials.length) { if (direction === "IN") { for (const serialNo of serials) await tx.insert(inventorySerials).values({ itemId: metadata.itemId, warehouseId, serialNo, status: "AVAILABLE" }); } else { for (const serialNo of serials) { const serial = (await tx.select().from(inventorySerials).where(and(eq(inventorySerials.itemId, metadata.itemId), eq(inventorySerials.serialNo, serialNo))).limit(1))[0]; if (!serial || serial.status !== "AVAILABLE" || serial.warehouseId !== warehouseId) throw new Error("SERIAL_NOT_AVAILABLE"); await tx.update(inventorySerials).set({ status: "SOLD" }).where(eq(inventorySerials.id, serial.id)); } } }
  await tx.insert(auditEvents).values({ actor, actionCode: direction === "IN" ? "TRACE_IN" : "TRACE_OUT", entityType: "INVOICE_INVENTORY_TRACE", entityId: `${metadata.itemId}:${warehouseId}`, requestId: `TRACE:${direction}:${metadata.itemId}:${warehouseId}:${metadata.batchNo || ""}:${metadata.locationId || ""}` });
}

export async function getSystemSettings() {
  const db = await getDb();
  if (!db) return { companyId: 1, engine: "mysql", host: "", port: 3306, databaseName: "", ssl: 1, updatedBy: "local" };
  const row = (await db.select().from(systemSettings).where(eq(systemSettings.companyId, 1)).limit(1))[0];
  return row || { companyId: 1, engine: "mysql", host: "", port: 3306, databaseName: "", ssl: 1, updatedBy: "system" };
}

export async function saveSystemSettings(input: { engine: string; host?: string; port: number; databaseName?: string; ssl: number; updatedBy: string }) {
  const db = await getDb();
  if (!db) return { companyId: 1, ...input, saved: true, secretPolicy: "DATABASE_URL remains a server secret" };
  await db.insert(systemSettings).values({ companyId: 1, engine: input.engine, host: input.host || null, port: input.port, databaseName: input.databaseName || null, ssl: input.ssl, updatedBy: input.updatedBy }).onDuplicateKeyUpdate({ set: { engine: input.engine, host: input.host || null, port: input.port, databaseName: input.databaseName || null, ssl: input.ssl, updatedBy: input.updatedBy, updatedAt: new Date() } });
  return { ...(await getSystemSettings()), saved: true, secretPolicy: "DATABASE_URL remains a server secret" };
}
export async function getCurrencies() {
  if (isCloudflareD1Enabled()) return getCloudCurrencies();
  return [{ code: "SAR", name: "Saudi Riyal", decimalScale: 2, active: 1 }, { code: "USD", name: "US Dollar", decimalScale: 2, active: 1 }, { code: "EUR", name: "Euro", decimalScale: 2, active: 1 }];
}

export async function saveCurrency(input: { code: string; name: string; decimalScale?: number; active?: number }) {
  if (isCloudflareD1Enabled()) return saveCloudCurrency(input);
  return { ...input, code: input.code.toUpperCase(), decimalScale: input.decimalScale ?? 2, active: input.active ?? 1 };
}

export async function importAccounts(input: { companyId?: number; actor?: string; rows: Array<AccountInput> }) {
  const companyId = input.companyId || 1; const normalized = input.rows.map((row) => normalizeAccount({ ...row, companyId })); const codes = new Set<string>();
  for (const row of normalized) { if (codes.has(row.code)) throw new Error("ACCOUNT_IMPORT_DUPLICATE_CODE"); codes.add(row.code); if (row.parentCode && row.parentCode === row.code) throw new Error("ACCOUNT_PARENT_SELF_REFERENCE"); }
  if (isCloudflareD1Enabled()) return importCloudAccounts({ ...input, companyId, rows: normalized });
  const db = await getDb();
  if (!db) { for (const row of normalized) await saveAccount(row); return { ok: true, imported: normalized.length, codes: normalized.map((row) => row.code) }; }
  return db.transaction(async (tx) => {
    const existing = await tx.select().from(accounts).where(eq(accounts.companyId, companyId)); const available = new Set(existing.map((row: any) => row.code));
    for (const row of normalized) if (row.parentCode && !available.has(row.parentCode) && !codes.has(row.parentCode)) throw new Error(`ACCOUNT_PARENT_NOT_FOUND:${row.parentCode}`);
    for (const row of normalized) { const current = existing.find((item: any) => item.code === row.code); if (current) await tx.update(accounts).set(row).where(eq(accounts.id, current.id)); else await tx.insert(accounts).values(row); available.add(row.code); }
    await tx.insert(auditEvents).values({ actor: input.actor || "workbench.user", actionCode: "IMPORT", entityType: "ACCOUNT_CATALOG", entityId: "BATCH", requestId: `ACCOUNT:IMPORT:${Date.now()}` });
    return { ok: true, imported: normalized.length, codes: normalized.map((row) => row.code) };
  });
}

export async function searchCurrencies() { return getCurrencies(); }
