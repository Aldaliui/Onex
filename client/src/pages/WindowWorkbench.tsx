import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Archive, BarChart3, BookOpen, Calculator, ChevronDown, ChevronLeft, CircleHelp, Database, Download, FileBarChart, FilePlus2, FolderTree, LayoutDashboard, Menu, Package, PanelLeft, Printer, Receipt, RefreshCw, Search, Settings2, ShieldCheck, ShoppingCart, Users, X } from "lucide-react";
import { WindowManagerProvider, type WindowAction, type WindowRecord, useWindowManager } from "@/window-runtime/WindowManager";
import { WindowSideActions, WindowToolbar, WindowTitleBar } from "@/window-runtime/WindowToolbar";
import { getLegacyContract } from "@/window-runtime/legacyContracts";
import { ContractWindowPanel } from "@/window-runtime/ContractWindowPanel";
import { syncStatusLabel, useOfflineSync } from "@/hooks/useOfflineSync";
import { deleteCloudWindowRecord, updateCloudWindowRecord } from "@/lib/cloudD1Link";
import LocalLogin from "@/components/LocalLogin";
import ReturnNoteForm from "@/components/ReturnNoteForm";
import SalesInvoiceForm from "@/components/SalesInvoiceForm";
import PurchaseInvoiceForm from "@/components/PurchaseInvoiceForm";
import AccountCatalogPanel from "@/components/AccountCatalogPanel";
import JournalEntryPanel from "@/components/JournalEntryPanel";
import GeneralLedgerPanel from "@/components/GeneralLedgerPanel";
import GlReconciliationPanel from "@/components/GlReconciliationPanel";
import VoucherPanel from "@/components/VoucherPanel";
import ItemTracePanel from "@/components/ItemTracePanel";
import ItemMasterPanel from "@/components/ItemMasterPanel";
import AdvancedWarehousePanel from "@/components/AdvancedWarehousePanel";
import InventoryDocumentCenter from "@/components/InventoryDocumentCenter";
import PurchaseCycleCenter from "@/components/PurchaseCycleCenter";
import SalesCycleCenter from "@/components/SalesCycleCenter";
import ReferenceDataPanel from "@/components/ReferenceDataPanel";
import WorkspaceOverview from "@/components/WorkspaceOverview";
import CoreFoundationPanel from "@/components/CoreFoundationPanel";
import RolePermissionPanel from "@/components/RolePermissionPanel";
import FinanceSetupPanel from "@/components/FinanceSetupPanel";
import FiscalPeriodPanel from "@/components/FiscalPeriodPanel";
import DocumentSetupPanel from "@/components/DocumentSetupPanel";
import { adminLegacyWindows } from "@/window-runtime/adminWindowCatalog";
import MasterDataPanel from "@/components/MasterDataPanel";

type ModuleKey = "admin" | "core" | "finance" | "sales" | "purchasing" | "inventory" | "mrp" | "hr" | "pos" | "reports";
type RuntimeWindow = WindowRecord & { module: ModuleKey };
type GenericRecord = Record<string, unknown>;

const modules: Array<{ id: ModuleKey; label: string; code: string; icon: typeof Settings2; windows: RuntimeWindow[] }> = [
  { id: "admin", label: "الإدارة والنظام", code: "ADMIN", icon: Settings2, windows: [{ id: "ERP_DBA", label: "إدارة النظام", module: "admin", kind: "transaction" }, { id: "ERP_DBA_DFLT_DATA", label: "البيانات الافتراضية", module: "admin", kind: "transaction" }, { id: "ERP_JOURNAL", label: "سجل العمليات والتدقيق", module: "admin", kind: "inquiry" }, { id: "ADMT027", label: "المستخدمون والصلاحيات", module: "admin", kind: "transaction" }, ...adminLegacyWindows.filter((window) => window.id !== "ADMT027").map((window) => ({ id: window.id, label: window.label, module: "admin" as const, kind: window.kind }))] },
  { id: "core", label: "النواة المشتركة", code: "CORE", icon: Database, windows: [{ id: "CORE001", label: "الهيكل المؤسسي", module: "core", kind: "transaction" }, { id: "CORE002", label: "العملات والضرائب والفترات", module: "core", kind: "transaction" }, { id: "CORE003", label: "المستخدمون والأدوار والسياسات", module: "core", kind: "transaction" }, { id: "CORE004", label: "المستندات والترقيم والتنبيهات", module: "core", kind: "transaction" }, { id: "CORE005", label: "استيراد البيانات الرئيسية", module: "core", kind: "transaction" }, { id: "CORE006", label: "السنة المالية والفترات", module: "core", kind: "transaction" }, { id: "CORE007", label: "العملاء والموردون والأصناف والوحدات", module: "core", kind: "transaction" }] },
  { id: "finance", label: "الحسابات العامة", code: "GL", icon: Calculator, windows: [{ id: "GLST001", label: "دليل الحسابات والعملات", module: "finance", kind: "transaction" }, { id: "GLST002", label: "القيد اليومي", module: "finance", kind: "transaction" }, { id: "GLST004", label: "السندات والقيود المالية", module: "finance", kind: "transaction" }, { id: "GLST007", label: "الصناديق", module: "finance", kind: "transaction" }, { id: "GLST008", label: "البنوك", module: "finance", kind: "transaction" }, { id: "GLST005", label: "تفاصيل اليومية", module: "finance", kind: "inquiry" }, { id: "GLST006", label: "ملاحظات القيود", module: "finance", kind: "inquiry" }, { id: "GLSI001", label: "استعلام القيود", module: "finance", kind: "inquiry" }] },
  { id: "sales", label: "المبيعات والعملاء", code: "AR", icon: Receipt, windows: [{ id: "ARST003", label: "تعريف العملاء", module: "sales", kind: "transaction" }, { id: "ARST004", label: "فاتورة المبيعات", module: "sales", kind: "transaction" }, { id: "ARST007", label: "مرتجع مبيعات", module: "sales", kind: "transaction" }, { id: "ARST006", label: "كشف حساب العميل", module: "sales", kind: "inquiry" }, { id: "ARSR041", label: "كشف حساب عميل", module: "sales", kind: "report" }] },
  { id: "sales", label: "المبيعات والعملاء", code: "AR", icon: ShoppingCart, windows: [{ id: "ARST001", label: "دورة أمر البيع والصرف", module: "sales", kind: "transaction" }, { id: "ARST004", label: "فاتورة العميل", module: "sales", kind: "transaction" }, { id: "ARST007", label: "مرتجع مبيعات", module: "sales", kind: "transaction" }, { id: "ARST005", label: "كشف حساب العميل", module: "sales", kind: "inquiry" }] },
  { id: "purchasing", label: "المشتريات والموردون", code: "AP", icon: ShoppingCart, windows: [{ id: "APST001", label: "دورة أمر الشراء والاستلام", module: "purchasing", kind: "transaction" }, { id: "APST003", label: "فاتورة المشتريات", module: "purchasing", kind: "transaction" }, { id: "APST007", label: "مرتجع مشتريات", module: "purchasing", kind: "transaction" }, { id: "APSR001", label: "GRNI والمطابقة الثلاثية", module: "purchasing", kind: "inquiry" }, { id: "APST005", label: "كشف حساب المورد", module: "purchasing", kind: "inquiry" }, { id: "APSI002", label: "الموردون", module: "purchasing", kind: "transaction" }] },
  { id: "inventory", label: "المخزون", code: "INV", icon: Package, windows: [{ id: "INVT010", label: "لوحة عمليات المخزون", module: "inventory", kind: "inquiry" }, { id: "INVT008", label: "سياسات إعادة الطلب", module: "inventory", kind: "transaction" }, { id: "INVT007", label: "مواقع التخزين", module: "inventory", kind: "transaction" }, { id: "INVT009", label: "تتبع الدفعات والأرقام", module: "inventory", kind: "inquiry" }, { id: "INVT001", label: "مركز مستندات المخزون", module: "inventory", kind: "transaction" }, { id: "INVT002", label: "إذن استلام مخزني", module: "inventory", kind: "transaction" }, { id: "INVT005", label: "تحويل بين المستودعات", module: "inventory", kind: "transaction" }, { id: "INVT006", label: "محضر جرد وتسوية", module: "inventory", kind: "transaction" }, { id: "INVT003", label: "بطاقة الصنف", module: "inventory", kind: "transaction" }, { id: "INVT004", label: "حركة المخزون", module: "inventory", kind: "inquiry" }] },
  { id: "mrp", label: "التخطيط والتصنيع", code: "MRP", icon: BarChart3, windows: [{ id: "MRPACS004", label: "إعدادات التخطيط والتصنيع", module: "mrp", kind: "transaction" }] },
  { id: "hr", label: "الموارد البشرية", code: "HR", icon: Users, windows: [{ id: "HRSI002", label: "ملف الموظف", module: "hr", kind: "transaction" }, { id: "HRSR002", label: "تقارير الموظفين", module: "hr", kind: "report" }] },
  { id: "pos", label: "نقطة البيع", code: "POS", icon: LayoutDashboard, windows: [{ id: "POSLGN", label: "تشغيل نقطة البيع", module: "pos", kind: "transaction" }, { id: "POST001", label: "مبيعات نقطة البيع", module: "pos", kind: "transaction" }] },
  { id: "reports", label: "التقارير", code: "RPT", icon: FileBarChart, windows: [{ id: "GLSR001", label: "تقارير الحسابات", module: "reports", kind: "report" }, { id: "ARSR041", label: "سجل فواتير المبيعات", module: "reports", kind: "report" }, { id: "MRPREP001", label: "تقارير التخطيط والمخزون", module: "reports", kind: "report" }] },
];
const kindLabel = { transaction: "معاملة", inquiry: "استعلام", report: "تقرير" };

function moduleForLegacyDomain(domain: string, formName = ""): ModuleKey {
  const value = `${domain} ${formName}`.toUpperCase();
  if (value.includes("CORE00") || value.includes("SHARED ERP")) return "core";
  if (value.includes("ADMIN") || value.includes("ERP_DBA") || value.includes("ADMT")) return "admin";
  if (value.includes("GL/") || value.includes("FINANCE") || value.includes("GLS") || value.includes("GLST") || value.includes("GLSI")) return "finance";
  if (value.includes("AR/") || value.includes("RECEIVABLE") || value.includes("ARST") || value.includes("ARSI")) return "sales";
  if (value.includes("AP/") || value.includes("PURCHAS") || value.includes("APST") || value.includes("APSI")) return "purchasing";
  if (value.includes("INVENTORY") || value.includes("STOCK") || value.includes("INVT") || value.includes("INVI")) return "inventory";
  if (value.includes("POS")) return "pos";
  if (value.includes("REPORT") || value.includes("GLSR") || value.includes("ARSR") || value.includes("MRPREP")) return "reports";
  if (value.includes("HR") || value.includes("EMPLOYEE")) return "hr";
  if (value.includes("MRP") || value.includes("TREASURY")) return "mrp";
  return "admin";
}

function kindForLegacyWindow(formName: string, itemType?: string): RuntimeWindow["kind"] {
  const value = formName.toUpperCase();
  if ((itemType || "").toUpperCase().includes("REPORT") || value.includes("REPORT") || value.startsWith("GLSR") || value.startsWith("ARSR") || value.startsWith("MRPREP")) return "report";
  if ((itemType || "").toUpperCase().includes("INQUIRY") || value.includes("SI") || value.includes("SR") || value.includes("QUERY")) return "inquiry";
  return "transaction";
}


function FinancialReportPanel({ reportCode }: { reportCode: string }) {
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState("100");
  const report = trpc.reports.run.useQuery({ reportCode: reportCode as "GLSR001" | "ARSR041" | "MRPREP001", search: search || undefined, limit: Number(limit) || 100 }, { enabled: ["GLSR001", "ARSR041", "MRPREP001"].includes(reportCode) });
  const rows = (report.data?.rows ?? []) as GenericRecord[];
  const columns: string[] = (report.data?.columns ?? ["journalNo", "entryType", "totalDebit", "totalCredit", "status"]) as string[];
  const totals: { totalDebit: number; totalCredit: number } = rows.reduce<{ totalDebit: number; totalCredit: number }>((result, row) => ({ totalDebit: result.totalDebit + Number(row.totalDebit || 0), totalCredit: result.totalCredit + Number(row.totalCredit || 0) }), { totalDebit: 0, totalCredit: 0 });
  const exportCsv = () => { const csv = [columns.join(","), ...rows.map((row) => columns.map((column) => JSON.stringify(row[column] ?? "")).join(","))].join("\n"); const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = `${reportCode}-report.csv`; link.click(); URL.revokeObjectURL(url); };
  const reportSource = reportCode === "ARSR041" ? "invoices" : reportCode === "MRPREP001" ? "stock_balances" : "journal_entries";
  return <section className="financial-report-panel" dir="rtl"><div className="financial-report-heading"><div><span className="financial-report-kicker">ONEX · FINANCIAL CONTROL</span><h2>{report.data?.title || "التقرير المالي"}</h2><p>{reportSource} · عرض حي من قاعدة البيانات</p></div><span className="report-status-dot">{report.isFetching ? "جارٍ التحديث" : "متصل"}</span></div><div className="financial-report-controls"><label>بحث في التقرير<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={reportCode === "GLSR001" ? "مثال: JV-2026" : "بحث بالكود أو الرقم"} /></label><label>عدد الصفوف<select value={limit} onChange={(event) => setLimit(event.target.value)}><option value="25">25</option><option value="100">100</option><option value="250">250</option><option value="500">500</option></select></label><button type="button" className="report-action" onClick={() => void report.refetch()}><RefreshCw size={14} /> تحديث</button><button type="button" className="report-action" onClick={exportCsv} disabled={!rows.length}><Download size={14} /> CSV</button><button type="button" className="report-action" onClick={() => window.print()}><Printer size={14} /> طباعة</button></div><div className="financial-report-metrics"><div><span>عدد السجلات</span><strong>{rows.length}</strong></div><div><span>إجمالي المدين</span><strong>{reportCode === "GLSR001" ? `${totals.totalDebit.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س` : "—"}</strong></div><div><span>إجمالي الدائن</span><strong>{reportCode === "GLSR001" ? `${totals.totalCredit.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س` : "—"}</strong></div><div><span>حالة المراجعة</span><strong className={reportCode !== "GLSR001" || Math.abs(totals.totalDebit - totals.totalCredit) < 0.01 ? "balanced" : "attention"}>{reportCode !== "GLSR001" || Math.abs(totals.totalDebit - totals.totalCredit) < 0.01 ? "سليم" : "مراجعة مطلوبة"}</strong></div></div><div className="financial-report-table-wrap">{report.isLoading ? <div className="report-empty">جارٍ تحميل التقرير من قاعدة البيانات...</div> : report.error ? <div className="report-empty report-error">تعذر تحميل التقرير: {report.error.message}</div> : rows.length ? <table className="financial-report-table"><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${String(row.journalNo ?? row.docNo ?? row.itemId ?? index)}-${index}`}>{columns.map((column) => <td key={column}>{String(row[column] ?? "—")}</td>)}</tr>)}</tbody></table> : <div className="report-empty">لا توجد نتائج مطابقة للفلاتر الحالية.</div>}</div><footer className="financial-report-footer"><span>المصدر: {reportSource}</span><span>{report.data?.reportCode || reportCode}.fmx</span></footer></section>;
}

function AuthenticatedWorkbench() {
  const [, setLocation] = useLocation();
  const manager = useWindowManager();
  const [expanded, setExpanded] = useState<ModuleKey | null>("finance");
  const [query, setQuery] = useState("");
  const [sidebar, setSidebar] = useState(true);
  const [simpleMode, setSimpleMode] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const windowCatalog = trpc.windows.list.useQuery({ search: query || undefined, limit: 80 });
  const systemTree = trpc.windows.tree.useQuery(undefined, { refetchOnWindowFocus: false });
  const inventoryCatalog = trpc.windows.list.useQuery({ search: query || undefined, domain: "inventory/stock", limit: 500 });
  const glCatalog = trpc.windows.list.useQuery({ search: query || undefined, domain: "GL", limit: 500 });
  const activeContract = trpc.windows.contract.useQuery({ legacyForm: manager.activeId ?? "__none__" }, { enabled: Boolean(manager.activeId) });
  const records = trpc.windows.records.useQuery({ legacyForm: manager.activeId ?? "__none__", search: query || undefined, limit: 20 }, { enabled: Boolean(manager.activeId) });
  const masterData = trpc.masterData.useQuery();
  const createInvoice = trpc.invoices.create.useMutation();
  const postInvoice = trpc.invoices.post.useMutation();
  const reverseInvoice = trpc.invoices.reverse.useMutation();
  const saveAccount = trpc.windows.saveAccount.useMutation();
  const saveCustomer = trpc.windows.saveCustomer.useMutation();
  const saveSupplier = trpc.windows.saveSupplier.useMutation();
  const saveItem = trpc.windows.saveItem.useMutation();
  const saveJournal = trpc.windows.saveJournal.useMutation();
  const saveSystemUser = trpc.windows.saveSystemUser.useMutation();
  const saveBranch = trpc.windows.saveBranch.useMutation();
  const saveWarehouse = trpc.windows.saveWarehouse.useMutation();
  const saveCashBox = trpc.windows.saveCashBox.useMutation();
  const saveBank = trpc.windows.saveBank.useMutation();
  const executeWindowAction = trpc.windows.executeAction.useMutation();
  const glExecute = trpc.windows.glExecute.useMutation();
  const offline = useOfflineSync(async (operation) => { if (operation.type === "GL_WINDOW_ACTION") { await glExecute.mutateAsync(operation.payload as any); return "SYNCED"; } if (operation.type !== "WINDOW_ACTION") return "CONFLICT"; await executeWindowAction.mutateAsync(operation.payload as { legacyForm: string; action: "save" | "post" }); return "SYNCED"; });
  const inventoryRows = Array.isArray(inventoryCatalog.data) ? inventoryCatalog.data : ((inventoryCatalog.data as any)?.rows ?? []);
  const glRows = Array.isArray(glCatalog.data) ? glCatalog.data : ((glCatalog.data as any)?.rows ?? []);
  const catalogWindows = useMemo<RuntimeWindow[]>(() => {
    const branches = (systemTree.data ?? []) as Array<{ domain?: string; groups?: Array<{ windows?: Array<Record<string, unknown>> }> }>;
    return branches.flatMap((branch) => (branch.groups ?? []).flatMap((group) => (group.windows ?? []).map((row) => {
      const id = String(row.legacyForm || row.formName || row.screenName || "").replace(/\.fmx$/i, "");
      return { id, label: String(row.screenName || id), module: moduleForLegacyDomain(String(branch.domain || row.domainCode || ""), id), kind: kindForLegacyWindow(id, String(row.itemType || "")) };
    }))).filter((window) => window.id);
  }, [systemTree.data]);
  const inventoryWindows = useMemo<RuntimeWindow[]>(() => inventoryRows.map((row: any) => {
    const id = String(row.legacyForm || row.formName || "").replace(/\.fmx$/i, "");
    const upper = id.toUpperCase();
    const kind: RuntimeWindow["kind"] = upper.includes("REP") || upper.startsWith("MTXR") || upper.startsWith("MTXXR") ? "report" : upper.startsWith("MTXI") || upper.startsWith("MTXC") ? "inquiry" : "transaction";
    return { id, label: row.screenName || id, module: "inventory", kind };
  }), [inventoryRows]);
  const glWindows = useMemo<RuntimeWindow[]>(() => glRows.map((row: any) => {
    const id = String(row.legacyForm || row.formName || "").replace(/\.fmx$/i, "");
    const upper = id.toUpperCase();
    const kind: RuntimeWindow["kind"] = upper.startsWith("GLSR") || upper.startsWith("GLSI") || ["GLST005", "GLST006"].includes(upper) ? "inquiry" : "transaction";
    return { id, label: row.screenName || id, module: "finance", kind };
  }), [glRows]);
  const filteredModules = useMemo(() => modules.map((module) => {
    const sourceWindows = module.id === "inventory" && catalogWindows.length ? [...module.windows, ...catalogWindows.filter((window) => window.module === module.id)] : catalogWindows.length ? catalogWindows.filter((window) => window.module === module.id) : module.id === "inventory" && inventoryWindows.length ? inventoryWindows : module.id === "finance" && glWindows.length ? glWindows : module.windows;
    return { ...module, windows: sourceWindows.filter((w) => `${w.id} ${w.label}`.toLowerCase().includes(query.toLowerCase())) };
  }).filter((module) => module.windows.length || module.label.includes(query)).filter((module) => !simpleMode || ["finance", "inventory", "sales", "ar", "stock"].some((token) => `${module.id} ${module.label} ${module.code}`.toLowerCase().includes(token))), [query, inventoryWindows, glWindows, catalogWindows, simpleMode]);
  const active = manager.activeWindow;
  const activeRecords = (records.data || []) as GenericRecord[];
  const setField = (id: string, value: string) => { setValues((current) => ({ ...current, [id]: value })); if (active) manager.markDirty(active.id); };

  useEffect(() => { setEditing(false); setValues({}); }, [manager.activeId]);

  const openWindow = async (window: RuntimeWindow) => {
    const contract = getLegacyContract(window.id);
    const ok = await manager.openWindow(window, { beforeOpen: () => { toast.info(`فتح ${window.id} · ${contract?.source.namespace ?? "GENERIC"}`); }, onInit: () => { toast.success(`تمت تهيئة ${window.id}`); }, afterCommit: () => { toast.success(`تم حفظ ${window.id}`); }, onClose: () => { toast.info(`إغلاق ${window.id}`); } });
    if (!ok) toast.error(`تعذر فتح ${window.id}`);
  };

  const openWorkspaceWindow = (windowId: string) => {
    const window = modules.flatMap((module) => module.windows).find((candidate) => candidate.id === windowId);
    if (window) {
      void openWindow(window);
      return;
    }
    void openWindow({ id: windowId, label: windowId, module: "reports", kind: "inquiry" });
  };

  const selectRecord = (record: GenericRecord) => {
    const next: Record<string, string> = {};
    Object.entries(record).forEach(([key, value]) => { if (value !== null && value !== undefined) next[key.toUpperCase()] = String(value); });
    setValues(next); setEditing(false); if (active) manager.markClean(active.id); toast.success("تم تحميل السجل للتحرير أو المراجعة");
  };

  const saveDraft = async () => {
    if (!active) return;
    if (active.kind !== "transaction") return toast.info("هذه النافذة للقراءة والاستعلام فقط");
    const v = values; const companyId = Number(v.COMPANYID || v.CMP_NO || 1); const done = () => { setEditing(false); void manager.commitWindow(active.id); void records.refetch(); };
    const onError = (error: { message?: string }) => { toast.error(error.message || "تعذر الحفظ"); };
    if (active.id === "GLST001") return saveAccount.mutate({ id: v.ID ? Number(v.ID) : undefined, companyId, code: v.A_CODE || v.CODE || `ACC-${Date.now()}`, name: v.A_NAME || v.NAME || "حساب جديد", accountType: v.A_TYPE || "GENERAL", parentCode: v.CC_CODE, currencyCode: v.A_CY || "SAR", active: v.ACTIVE === "0" ? 0 : 1 }, { onSuccess: done, onError });
    if (active.id === "ARST003") return saveCustomer.mutate({ id: v.ID ? Number(v.ID) : undefined, companyId, code: v.C_CODE || v.CODE || `CUST-${Date.now()}`, legalName: v.C_NAME || v.LEGALNAME || "عميل جديد", currencyCode: v.A_CY || "SAR", status: "ACTIVE" }, { onSuccess: done, onError });
    if (["APSI002", "APST003"].includes(active.id)) return saveSupplier.mutate({ id: v.ID ? Number(v.ID) : undefined, companyId, code: v.V_CODE || v.CODE || `SUP-${Date.now()}`, legalName: v.V_NAME || v.C_NAME || "مورد جديد", currencyCode: v.A_CY || "SAR", status: "ACTIVE" }, { onSuccess: done, onError });
    if (active.id === "INVT003") return saveItem.mutate({ id: v.ID ? Number(v.ID) : undefined, companyId, code: v.I_CODE || v.CODE || `ITEM-${Date.now()}`, description: v.I_DESC || v.I_NAME || "صنف جديد", stockFlag: 1, unitCost: v.NEW_COST || "0", revenueAccount: "4100", inventoryAccount: "1300", cogsAccount: "5100", active: v.ACTIVE === "0" ? 0 : 1 }, { onSuccess: done, onError });
    if (["ERP_DBA", "ADMT027", "HRSI002", "POSLGN"].includes(active.id)) return saveSystemUser.mutate({ id: v.ID ? Number(v.ID) : undefined, openId: v.USR || v.OPENID || v.EMAIL || `local-${Date.now()}`, name: v.USR_NAME || v.NAME || v.C_NAME || "مستخدم جديد", email: v.EMAIL || undefined, role: v.ROLE === "admin" || v.PRIVILEGE === "admin" ? "admin" : "user", loginMethod: v.LOGINMETHOD || "workbench" }, { onSuccess: done, onError });
    if (active.id === "ERP_DBA_DFLT_DATA") return saveBranch.mutate({ id: v.ID ? Number(v.ID) : undefined, companyId, code: v.BRN_NO || v.CODE || `BR-${Date.now()}`, name: v.BRN_NAME || v.NAME || "فرع جديد", active: v.ACTIVE === "0" ? 0 : 1 }, { onSuccess: done, onError });
    if (active.id === "MRPACS004") return saveWarehouse.mutate({ id: v.ID ? Number(v.ID) : undefined, companyId, code: v.W_CODE || v.CODE || `WH-${Date.now()}`, name: v.W_NAME || v.NAME || "مستودع جديد", active: v.ACTIVE === "0" ? 0 : 1 }, { onSuccess: done, onError });
    if (["GLST002", "GLST004"].includes(active.id)) { const journal = { journalNo: v.DOC_NO || `${active.id}-${Date.now()}`, entryType: active.id, actor: "workbench.user", lines: [{ accountCode: v.A_CODE || "1100", description: v.REMARKS || "قيد من النافذة", debit: v.DEBIT || v.AMT || "0", credit: "0" }, { accountCode: "4100", description: v.REMARKS || "الطرف المقابل", debit: "0", credit: v.CREDIT || v.AMT || "0" }] }; if (!offline.online) { void offline.enqueue("GL_WINDOW_ACTION", { legacyForm: `${active.id}.fmx`, action: "save", actor: "workbench.user", requestId: `GL:${journal.journalNo}`, journal }); return toast.info("تم حفظ القيد محليًا وستتم مزامنته عند عودة الاتصال"); } return glExecute.mutate({ legacyForm: `${active.id}.fmx`, action: "save", actor: "workbench.user", requestId: `GL:${journal.journalNo}`, journal }, { onSuccess: done, onError }); }
    if (["ARST004", "POST001"].includes(active.id)) { const customer = masterData.data?.customers?.[0]; const warehouse = masterData.data?.warehouses?.[0]; const item = masterData.data?.items?.[0]; if (!customer || !warehouse || !item) return toast.error("لا توجد بيانات أساسية كافية لإنشاء الفاتورة"); return createInvoice.mutate({ docNo: v.DOC_NO || `${active.id}-${Date.now()}`, customerId: customer.id, warehouseId: warehouse.id, actor: "workbench.user", lines: [{ itemId: item.id, quantity: v.QTY || "1", unitPrice: v.PRICE || "0", taxAmount: v.TAX_AMT || "0" }] }, { onSuccess: done, onError }); }
    try {
      const recordId = Number(v.ID || v.id || 0);
      if (!recordId) throw new Error("SELECT_RECORD_BEFORE_SAVE");
      const fields: Record<string, unknown> = {};
      if (active.id.startsWith("ARST")) { if (v.C_NAME || v.LEGALNAME) fields.legalName = v.C_NAME || v.LEGALNAME; if (v.A_CY) fields.currencyCode = v.A_CY; }
      else if (active.id.startsWith("APS")) { if (v.V_NAME || v.C_NAME || v.LEGALNAME) fields.legalName = v.V_NAME || v.C_NAME || v.LEGALNAME; if (v.A_CY) fields.currencyCode = v.A_CY; }
      else if (active.id.startsWith("INVT")) { if (v.I_DESC || v.I_NAME || v.DESCRIPTION) fields.description = v.I_DESC || v.I_NAME || v.DESCRIPTION; if (v.ACTIVE) fields.active = v.ACTIVE === "0" ? 0 : 1; }
      else if (active.id.startsWith("GLST") || active.id.startsWith("GLSI")) { if (v.ENTRYTYPE) fields.entryType = v.ENTRYTYPE; if (v.STATUS) fields.status = v.STATUS; }
      else throw new Error("WINDOW_RECORD_NOT_EDITABLE");
      if (!Object.keys(fields).length) throw new Error("NO_EDITABLE_FIELDS");
      await updateCloudWindowRecord({ legacyForm: `${active.id}.fmx`, id: recordId, fields });
      await records.refetch(); setEditing(false); manager.markClean(active.id); toast.success(`تم تحديث ${active.id} في D1`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر الحفظ في D1"); }
  };

  const handleAction = async (action: WindowAction) => {
    const id = manager.activeId; if (!id || !active) return;
    if (action === "previous" || action === "next") {
      if (!activeRecords.length) return toast.info("لا توجد سجلات للتنقل");
      const currentId = String(values.ID || values.id || "");
      const currentIndex = activeRecords.findIndex((record) => String(record.ID ?? record.id ?? "") === currentId);
      const nextIndex = currentIndex < 0 ? 0 : (action === "previous" ? Math.max(0, currentIndex - 1) : Math.min(activeRecords.length - 1, currentIndex + 1));
      selectRecord(activeRecords[nextIndex]);
      return toast.success(action === "previous" ? "تم تحميل السجل السابق" : "تم تحميل السجل التالي");
    }
    if (action === "new" || action === "create") { setValues({}); setEditing(true); manager.markDirty(id); return toast.info(`CREATE · سجل جديد في ${id}`); }
    if (action === "edit" || action === "update") { if (active.kind !== "transaction") return toast.info("الاستعلامات والتقارير للقراءة فقط"); setEditing(true); return manager.markDirty(id); }
    if (action === "save") return saveDraft();
    if (action === "query") { await records.refetch(); return toast.success(`تم البحث وتحديث سجلات ${id}`); }
    if (action === "undo" || action === "cancel") { setEditing(false); setValues({}); manager.markClean(id); return; }
    if (action === "delete" || action === "void") {
      const recordId = Number(values.ID || values.id || 0);
      if (!recordId) return toast.info("اختر سجلاً قبل الحذف");
      if (!window.confirm("سيتم تنفيذ DELETE/VOID على السجل المحدد وفق سياسة النافذة. هل تريد المتابعة؟")) return;
      try { await deleteCloudWindowRecord({ legacyForm: `${id}.fmx`, id: recordId, actor: "workbench.user" }); setValues({}); await records.refetch(); manager.markClean(id); toast.success("تم تنفيذ DELETE/VOID في D1"); }
      catch (error) { toast.error(error instanceof Error ? error.message : "تعذر حذف السجل"); }
      return;
    }
    if (action === "approve" || action === "post" || action === "reverse") { try {
      const recordId = Number(values.ID || values.id || values.INVOICEID || 0);
      if (action !== "approve" && (id === "ARST004" || id === "POST001") && recordId) {
        const mutation = action === "post" ? postInvoice : reverseInvoice;
        await mutation.mutateAsync({ invoiceId: recordId, actor: "workbench.user" });
        await records.refetch(); manager.markClean(id); toast.success(action === "post" ? `تم ترحيل ${id} في D1` : `تم عكس ${id} في D1`); return;
      }
      const requestId = `WINDOW:${id}:${action.toUpperCase()}:${Date.now()}`;
      await executeWindowAction.mutateAsync({ legacyForm: `${id}.fmx`, action, actor: "workbench.user", requestId });
      await records.refetch(); toast.success(action === "approve" ? `تم اعتماد ${id} في D1` : action === "post" ? `تم ترحيل ${id} في D1` : `تم عكس ${id} في D1`); manager.markClean(id);
    } catch (error) { toast.error(error instanceof Error ? error.message : `تعذر تنفيذ ${action} لـ ${id}`); } return; }
    if (action === "print") { window.print(); toast.success(`تم فتح نسخة الطباعة لـ ${id}`); return; }
    return toast.info(`مساعدة ${id}: الإدراج F6، التعديل F2، البحث F7، الحفظ F10`);
  };

  useEffect(() => { const onKeyDown = (event: KeyboardEvent) => { if (event.key === "F10") { event.preventDefault(); void handleAction("save"); } else if (event.key === "F7") { event.preventDefault(); void handleAction("query"); } else if (event.key === "F6") { event.preventDefault(); void handleAction("new"); } else if (event.key === "F2") { event.preventDefault(); void handleAction("edit"); } else if (event.key === "Escape" && manager.activeId) { event.preventDefault(); void handleAction("cancel"); } else if (event.key === "Delete") { event.preventDefault(); void handleAction("delete"); } }; window.addEventListener("keydown", onKeyDown); return () => window.removeEventListener("keydown", onKeyDown); });

  useEffect(() => { const onKeyDown = (event: KeyboardEvent) => { const target = event.target as HTMLElement; if (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return; if (event.key === "F1") { event.preventDefault(); setShowShortcuts((value) => !value); return; } if (event.key === "F6") { event.preventDefault(); void handleAction("new"); } else if (event.key === "F2") { event.preventDefault(); void handleAction("edit"); } else if (event.key === "F7") { event.preventDefault(); void handleAction("query"); } else if (event.key === "F10") { event.preventDefault(); void handleAction("save"); } else if (event.key === "F11") { event.preventDefault(); void handleAction("post"); } else if (event.key === "F12") { event.preventDefault(); void handleAction("reverse"); } else if (event.key === "Escape") { event.preventDefault(); void handleAction("cancel"); } else if (event.ctrlKey && event.key.toLowerCase() === "p") { event.preventDefault(); void handleAction("print"); } else if (event.ctrlKey && event.key.toLowerCase() === "z") { event.preventDefault(); void handleAction("undo"); } }; window.addEventListener("keydown", onKeyDown); return () => window.removeEventListener("keydown", onKeyDown); }, [active, handleAction]);

  return <div className="workbench-shell" dir="rtl"><header className="workbench-menubar"><button className="workbench-brand" onClick={() => setLocation("/")}><span className="brand-mark">ON</span><span><b>YS ERP</b><small>Oracle Forms Workbench</small></span></button><button className="menubar-item" onClick={() => setLocation("/home")}><LayoutDashboard size={15} /> لوحة التحكم</button><button className="menubar-item"><Menu size={15} /> النظام</button><button className="menubar-item"><FolderTree size={15} /> النوافذ</button><button className="menubar-item"><FileBarChart size={15} /> التقارير</button><button className="menubar-item" onClick={() => setLocation("/setup")}><Settings2 size={15} /> تهيئة</button><span className="menubar-spacer" /><span className="connection-state"><i /> نواة دورة الحياة</span><span className={`offline-status ${offline.online ? "online" : "offline"}`}><i /> {syncStatusLabel(offline)}</span><button className={`simple-mode-toggle ${simpleMode ? "active" : ""}`} onClick={() => setSimpleMode((value) => !value)}>{simpleMode ? "الوضع الكامل" : "الوضع المبسط"}</button><button className="icon-button" title="مساعدة"><CircleHelp size={17} /></button></header><div className="workbench-toolbar"><button className="toolbar-main" onClick={() => setSidebar((value) => !value)}><PanelLeft size={16} /> شجرة النظام</button><span className="toolbar-path">النظام الرئيسي <ChevronLeft size={14} /> مساحة تشغيل النوافذ</span><span className="toolbar-spacer" /><label className="window-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="بحث عن نافذة أو سجل..." /></label></div><div className={`simple-mode-banner ${simpleMode ? "visible" : ""}`}>{simpleMode && <><b>وضع التشغيل المبسط</b><span>اختر عملية للبدء؛ التفاصيل المحاسبية والتقنية مخفية.</span><button onClick={() => { setQuery("AR"); setSimpleMode(false); }}>فتح المبيعات</button><button onClick={() => { setQuery("IN"); setSimpleMode(false); }}>فتح المخزون</button></>}</div><div className="workbench-layout">{sidebar && <aside className="workbench-sidebar"><div className="sidebar-title"><div><span>قائمة النظام</span><small>MODULE NAVIGATOR</small></div><button className="icon-button"><ChevronDown size={15} /></button></div><div className="tree-root"><BookOpen size={17} /><div><b>YS Enterprise Resource Planning</b><small>الإصدار 6.20 · بيئة التشغيل</small></div></div>{filteredModules.map((module) => { const Icon = module.icon; const isOpen = expanded === module.id; return <div className="module-tree" key={module.id}><button className="module-row" onClick={() => setExpanded(isOpen ? null : module.id)}><Icon size={16} /><span><b>{module.label}</b><small>{module.code} · {module.windows.length} نوافذ</small></span>{isOpen ? <ChevronDown size={15} /> : <ChevronLeft size={15} />}</button>{isOpen && <><div className="section-tabs">{module.id === "sales" && <button type="button" className={`section-tab return-sales-tab ${active?.id === "ARST007" ? "active" : ""}`} onClick={() => void openWindow({ id: "ARST007", label: "مرتجع مبيعات", module: "sales", kind: "transaction" })}>↩ مرتجع مبيعات</button>}{module.id === "purchasing" && <button type="button" className={`section-tab return-purchase-tab ${active?.id === "APST007" ? "active" : ""}`} onClick={() => void openWindow({ id: "APST007", label: "مرتجع مشتريات", module: "purchasing", kind: "transaction" })}>↩ مرتجع مشتريات</button>}</div><div className="module-children">{module.windows.map((window) => <button key={window.id} className={`tree-window ${active?.id === window.id ? "selected" : ""}`} onClick={() => void openWindow(window)}><span className="window-dot" /><span><b>{window.label}</b><small>{window.id} · {kindLabel[window.kind]}</small></span><FilePlus2 size={13} /></button>)}</div></>}</div>})}</aside>}<main className="workbench-main"><div className="open-tabs">{manager.sessions.map((session) => <button key={session.id} className={`open-tab ${manager.activeId === session.id ? "active" : ""}`} onClick={() => manager.restoreWindow(session.id)}><span className="tab-icon"><Archive size={13} /></span><span>{session.id}</span><small>{session.phase}</small><X size={13} onClick={(event) => { event.stopPropagation(); void manager.closeWindow(session.id); }} /></button>)}<span className="open-tabs-spacer" /><span className="session-label"><ShieldCheck size={14} /> جلسة آمنة · {manager.sessions.length} نافذة</span></div><div className="window-stage">{active && !active.minimized ? <section className="legacy-window"><WindowTitleBar label={active.label} id={active.id} kind={kindLabel[active.kind]} onMinimize={() => manager.minimizeWindow(active.id)} onClose={() => void manager.closeWindow(active.id)} /><div className="contract-ribbon">{activeContract.isLoading ? "جارٍ تحميل عقد النافذة..." : `${activeContract.data?.coreApi || "ONEX_WINDOW_API"} · ${active.phase} · ${activeContract.data?.status || "NOT_READY"}`} {windowCatalog.isFetching ? " · تحديث الفهرس" : ""}</div><WindowSideActions onAction={handleAction} disabled={createInvoice.isPending || postInvoice.isPending || reverseInvoice.isPending || saveAccount.isPending || saveCustomer.isPending || saveSupplier.isPending || saveItem.isPending || saveJournal.isPending || saveSystemUser.isPending || saveBranch.isPending || saveWarehouse.isPending || saveCashBox.isPending || saveBank.isPending} />{active.id === "CORE003" ? <RolePermissionPanel /> : active.id === "CORE002" ? <FinanceSetupPanel /> : active.id === "CORE006" ? <FiscalPeriodPanel /> : active.id === "CORE004" ? <DocumentSetupPanel /> : active.id === "CORE007" ? <MasterDataPanel /> : active.id.startsWith("CORE") ? <CoreFoundationPanel initialTab={active.id === "CORE002" ? "finance" : active.id === "CORE003" ? "security" : active.id === "CORE004" ? "documents" : active.id === "CORE005" ? "imports" : "organization"} /> : active.id === "ARST001" ? <SalesCycleCenter /> : active.id === "APST001" ? <PurchaseCycleCenter /> : active.id === "INVT010" ? <AdvancedWarehousePanel mode="dashboard" /> : active.id === "INVT008" ? <AdvancedWarehousePanel mode="reorder" /> : active.id === "INVT007" ? <AdvancedWarehousePanel mode="locations" /> : active.id === "INVT009" ? <AdvancedWarehousePanel mode="trace" /> : active.id === "INVT001" ? <InventoryDocumentCenter /> : active.id === "INVT002" ? <InventoryDocumentCenter initialMode="receipt" /> : active.id === "INVT005" ? <InventoryDocumentCenter initialMode="transfer" /> : active.id === "INVT006" ? <InventoryDocumentCenter initialMode="count" /> : active.id.startsWith("GLSR") ? <FinancialReportPanel reportCode={active.id} /> : active.id === "INVT003" ? <ItemMasterPanel /> : active.id === "INVT004" ? <ItemTracePanel records={activeRecords} mode="movement" /> : active.id === "GLST001" ? <AccountCatalogPanel /> : active.id === "GLST002" ? <JournalEntryPanel /> : active.id === "GLST005" ? <GeneralLedgerPanel mode="ledger" /> : active.id === "GLSR001" ? <GeneralLedgerPanel mode="trial" /> : active.id === "GLST006" ? <GlReconciliationPanel /> : active.id === "GLST004" ? <VoucherPanel kind="receipt" /> : active.id === "GLST007" ? <ReferenceDataPanel mode="cash" records={(masterData.data?.cashBoxes || []) as GenericRecord[]} onRefresh={() => void masterData.refetch()} /> : active.id === "GLST008" ? <ReferenceDataPanel mode="bank" records={(masterData.data?.banks || []) as GenericRecord[]} onRefresh={() => void masterData.refetch()} /> : active.id === "MRPACS004" ? <ReferenceDataPanel mode="warehouse" records={(masterData.data?.warehouses || []) as GenericRecord[]} onRefresh={() => void masterData.refetch()} /> : active.id === "ARST004" ? <SalesInvoiceForm /> : ["APST003", "APST004"].includes(active.id) ? <PurchaseInvoiceForm /> : ["ARST007", "APST007"].includes(active.id) ? <ReturnNoteForm initialKind={active.id === "ARST007" ? "SALES_RETURN" : "PURCHASE_RETURN"} /> : <><WindowToolbar phase={active.phase} onAction={handleAction} onClose={() => void manager.closeWindow(active.id)} disabled={createInvoice.isPending || postInvoice.isPending || reverseInvoice.isPending || saveAccount.isPending || saveCustomer.isPending || saveSupplier.isPending || saveItem.isPending || saveJournal.isPending || saveSystemUser.isPending || saveBranch.isPending || saveWarehouse.isPending || saveCashBox.isPending || saveBank.isPending} /><ContractWindowPanel window={active as RuntimeWindow} contract={getLegacyContract(active.id)} records={activeRecords} values={values} editing={editing} onChange={setField} onSelectRecord={selectRecord} onAction={handleAction} /></>}</section> : active?.minimized ? <div className="empty-workbench"><LayoutDashboard size={44} /><h2>النافذة مصغرة</h2><p>اختر تبويب النافذة من الأعلى لاستعادتها ومتابعة العمل.</p></div> : <WorkspaceOverview onOpen={openWorkspaceWindow} />}</div>{showShortcuts && <div className="shortcuts-help"><b>اختصارات Workbench</b><span>F6 جديد</span><span>F2 تعديل</span><span>F7 بحث</span><span>F10 حفظ</span><span>F11 ترحيل</span><span>Esc إلغاء</span><span>Ctrl+P طباعة</span><span>F1 إخفاء</span></div>}<footer className="workbench-status"><span><i className="status-green" /> {active?.phase === "error" ? active.lastError : active?.phase === "committed" ? "تم الحفظ" : active?.phase === "dirty" ? "تعديلات غير محفوظة" : "جاهز"}</span><span>المستخدم: administrator</span><span>الفرع: الرئيسي</span><span className="status-spacer" /><span>F6 جديد</span><span>F2 تعديل</span><span>F7 بحث</span><span>F10 حفظ</span><span>الإصدار 6.20</span></footer></main></div></div>;
}

function WorkbenchAuthGate() { const auth = trpc.auth.me.useQuery(undefined, { retry: false, refetchOnWindowFocus: false }); if (auth.isLoading) return <main className="local-login-shell" dir="rtl"><section className="local-login-card"><p className="local-login-kicker">ONEX ERP · SECURE SESSION</p><h1>جارٍ التحقق من الجلسة...</h1></section></main>; if (!auth.data) return <LocalLogin />; return <AuthenticatedWorkbench />; }
export default function WindowWorkbench() { return <WindowManagerProvider><WorkbenchAuthGate /></WindowManagerProvider>; }
