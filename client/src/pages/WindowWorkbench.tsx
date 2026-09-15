import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Archive, BarChart3, BookOpen, Calculator, ChevronDown, ChevronLeft, CircleHelp, FileBarChart, FilePlus2, FolderTree, LayoutDashboard, Menu, Package, PanelLeft, Receipt, Search, Settings2, ShieldCheck, ShoppingCart, Users, X } from "lucide-react";
import { WindowManagerProvider, type WindowAction, type WindowRecord, useWindowManager } from "@/window-runtime/WindowManager";
import { WindowToolbar, WindowTitleBar } from "@/window-runtime/WindowToolbar";
import { getLegacyContract, type LegacyField } from "@/window-runtime/legacyContracts";
import LocalLogin from "@/components/LocalLogin";

type ModuleKey = "admin" | "finance" | "sales" | "purchasing" | "inventory" | "mrp" | "hr" | "pos" | "reports";
type RuntimeWindow = WindowRecord & { module: ModuleKey };
type GenericRecord = Record<string, unknown>;

const modules: Array<{ id: ModuleKey; label: string; code: string; icon: typeof Settings2; windows: RuntimeWindow[] }> = [
  { id: "admin", label: "الإدارة والنظام", code: "ADMIN", icon: Settings2, windows: [{ id: "ERP_DBA", label: "إدارة النظام", module: "admin", kind: "transaction" }, { id: "ERP_DBA_DFLT_DATA", label: "البيانات الافتراضية", module: "admin", kind: "transaction" }, { id: "ERP_JOURNAL", label: "سجل العمليات والتدقيق", module: "admin", kind: "inquiry" }, { id: "ADMT027", label: "المستخدمون والصلاحيات", module: "admin", kind: "transaction" }] },
  { id: "finance", label: "الحسابات العامة", code: "GL", icon: Calculator, windows: [{ id: "GLST001", label: "دليل الحسابات", module: "finance", kind: "transaction" }, { id: "GLST002", label: "القيد اليومي", module: "finance", kind: "transaction" }, { id: "GLST004", label: "السندات والقيود المالية", module: "finance", kind: "transaction" }, { id: "GLST005", label: "تفاصيل اليومية", module: "finance", kind: "inquiry" }, { id: "GLST006", label: "ملاحظات القيود", module: "finance", kind: "inquiry" }, { id: "GLSI001", label: "استعلام القيود", module: "finance", kind: "inquiry" }] },
  { id: "sales", label: "المبيعات والعملاء", code: "AR", icon: Receipt, windows: [{ id: "ARST003", label: "تعريف العملاء", module: "sales", kind: "transaction" }, { id: "ARST004", label: "فاتورة المبيعات", module: "sales", kind: "transaction" }, { id: "ARST006", label: "كشف حساب العميل", module: "sales", kind: "inquiry" }, { id: "ARSR041", label: "كشف حساب عميل", module: "sales", kind: "report" }] },
  { id: "purchasing", label: "المشتريات والموردون", code: "AP", icon: ShoppingCart, windows: [{ id: "APST003", label: "فاتورة المشتريات", module: "purchasing", kind: "transaction" }, { id: "APST005", label: "كشف حساب المورد", module: "purchasing", kind: "inquiry" }, { id: "APSI002", label: "الموردون", module: "purchasing", kind: "transaction" }] },
  { id: "inventory", label: "المخزون", code: "INV", icon: Package, windows: [{ id: "INVT003", label: "بطاقة الصنف", module: "inventory", kind: "transaction" }, { id: "INVT004", label: "حركة المخزون", module: "inventory", kind: "inquiry" }] },
  { id: "mrp", label: "التخطيط والتصنيع", code: "MRP", icon: BarChart3, windows: [{ id: "MRPACS004", label: "إعدادات التخطيط والتصنيع", module: "mrp", kind: "transaction" }] },
  { id: "hr", label: "الموارد البشرية", code: "HR", icon: Users, windows: [{ id: "HRSI002", label: "ملف الموظف", module: "hr", kind: "transaction" }, { id: "HRSR002", label: "تقارير الموظفين", module: "hr", kind: "report" }] },
  { id: "pos", label: "نقطة البيع", code: "POS", icon: LayoutDashboard, windows: [{ id: "POSLGN", label: "تشغيل نقطة البيع", module: "pos", kind: "transaction" }, { id: "POST001", label: "مبيعات نقطة البيع", module: "pos", kind: "transaction" }] },
  { id: "reports", label: "التقارير", code: "RPT", icon: FileBarChart, windows: [{ id: "GLSR001", label: "تقارير الحسابات", module: "reports", kind: "report" }, { id: "ARSR041", label: "سجل فواتير المبيعات", module: "reports", kind: "report" }, { id: "MRPREP001", label: "تقارير التخطيط والمخزون", module: "reports", kind: "report" }] },
];
const kindLabel = { transaction: "معاملة", inquiry: "استعلام", report: "تقرير" };

function FieldControl({ field, value, disabled, onChange }: { field: LegacyField; value: string; disabled: boolean; onChange: (value: string) => void }) {
  if (field.type === "select") return <select value={value || "all"} disabled={disabled} onChange={(event) => onChange(event.target.value)}><option value="all">الكل</option><option value="1">نعم / الرئيسي</option><option value="0">لا / الفرع</option></select>;
  return <input type={field.type} value={value} disabled={disabled} required={field.required} onChange={(event) => onChange(event.target.value)} placeholder={field.id} />;
}

function WindowBody({ window, records, values, editing, onChange, onSelectRecord }: { window: RuntimeWindow; records: GenericRecord[]; values: Record<string, string>; editing: boolean; onChange: (id: string, value: string) => void; onSelectRecord: (record: GenericRecord) => void }) {
  const contract = getLegacyContract(window.id);
  const fields: LegacyField[] = contract?.fields ?? ["رقم المستند", "التاريخ", "الحالة", "ملاحظات"].map((label) => ({ id: label, label, type: "text" as const, evidence: "inferred" as const }));
  return <div className="legacy-window-body"><div className="legacy-form-caption"><span>{window.label}</span><code>{window.id}.fmx</code></div><div className="contract-field-note">عقد FMX: {contract ? `${contract.source.namespace} · ${contract.fields.filter((field) => field.evidence === "extracted").length} حقول مستخرجة` : "عقد عام"} · {editing ? "وضع التحرير" : "وضع القراءة"}</div><div className="legacy-form-fields">{fields.map((field) => <label key={field.id}><span>{field.label}{field.required ? " *" : ""}</span><FieldControl field={field} value={values[field.id] || ""} disabled={!editing || window.kind !== "transaction"} onChange={(value) => onChange(field.id, value)} /></label>)}</div><div className="legacy-grid"><div className="legacy-grid-head"><span>#</span><span>السجل / البيان</span><span>القيمة</span><span>الحالة</span></div>{records.length ? records.slice(0, 20).map((record, index) => <button type="button" className="legacy-grid-row legacy-grid-select" key={`${String(record.id ?? record.docNo ?? record.code ?? index)}-${index}`} onClick={() => onSelectRecord(record)}><span>R{index + 1}</span><span>{String(record.docNo ?? record.code ?? record.legalName ?? record.name ?? "سجل")}</span><span>{String(record.grandTotal ?? record.unitCost ?? record.amount ?? record.status ?? "—")}</span><span className="state-ready">{String(record.status ?? "جاهز")}</span></button>) : <div className="legacy-grid-row"><span>—</span><span>لا توجد سجلات مطابقة</span><span>—</span><span>—</span></div>}</div><div className="legacy-form-footer"><span>F6 جديد</span><span>F2 تعديل</span><span>F7 بحث</span><span>F10 حفظ</span><span>Del حذف</span><strong>{contract?.notes ?? "دورة النافذة: إدراج ← بحث ← تعديل ← حفظ ← تدقيق"}</strong></div></div>;
}

function AuthenticatedWorkbench() {
  const [, setLocation] = useLocation();
  const manager = useWindowManager();
  const [expanded, setExpanded] = useState<ModuleKey | null>("finance");
  const [query, setQuery] = useState("");
  const [sidebar, setSidebar] = useState(true);
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const windowCatalog = trpc.windows.list.useQuery({ search: query || undefined, limit: 80 });
  const activeContract = trpc.windows.contract.useQuery({ legacyForm: manager.activeId ?? "__none__" }, { enabled: Boolean(manager.activeId) });
  const records = trpc.windows.records.useQuery({ legacyForm: manager.activeId ?? "__none__", search: query || undefined, limit: 20 }, { enabled: Boolean(manager.activeId) });
  const masterData = trpc.masterData.useQuery();
  const createInvoice = trpc.invoices.create.useMutation();
  const saveAccount = trpc.windows.saveAccount.useMutation();
  const saveCustomer = trpc.windows.saveCustomer.useMutation();
  const saveSupplier = trpc.windows.saveSupplier.useMutation();
  const saveItem = trpc.windows.saveItem.useMutation();
  const saveJournal = trpc.windows.saveJournal.useMutation();
  const saveSystemUser = trpc.windows.saveSystemUser.useMutation();
  const saveBranch = trpc.windows.saveBranch.useMutation();
  const saveWarehouse = trpc.windows.saveWarehouse.useMutation();
  const executeWindowAction = trpc.windows.executeAction.useMutation();
  const filteredModules = useMemo(() => modules.map((module) => ({ ...module, windows: module.windows.filter((window) => `${window.id} ${window.label}`.toLowerCase().includes(query.toLowerCase())) })).filter((module) => module.windows.length || module.label.includes(query)), [query]);
  const active = manager.activeWindow;
  const activeRecords = (records.data || []) as GenericRecord[];
  const setField = (id: string, value: string) => { setValues((current) => ({ ...current, [id]: value })); if (active) manager.markDirty(active.id); };

  useEffect(() => { setEditing(false); setValues({}); }, [manager.activeId]);

  const openWindow = async (window: RuntimeWindow) => {
    const contract = getLegacyContract(window.id);
    const ok = await manager.openWindow(window, { beforeOpen: () => { toast.info(`فتح ${window.id} · ${contract?.source.namespace ?? "GENERIC"}`); }, onInit: () => { toast.success(`تمت تهيئة ${window.id}`); }, afterCommit: () => { toast.success(`تم حفظ ${window.id}`); }, onClose: () => { toast.info(`إغلاق ${window.id}`); } });
    if (!ok) toast.error(`تعذر فتح ${window.id}`);
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
    if (["GLST002", "GLST004"].includes(active.id)) return saveJournal.mutate({ journalNo: v.DOC_NO || `${active.id}-${Date.now()}`, entryType: active.id, actor: "workbench.user", lines: [{ accountCode: v.A_CODE || "1100", description: v.REMARKS || "قيد من النافذة", debit: v.DEBIT || v.AMT || "0", credit: "0" }, { accountCode: "4100", description: v.REMARKS || "الطرف المقابل", debit: "0", credit: v.CREDIT || v.AMT || "0" }] }, { onSuccess: done, onError });
    if (["ARST004", "POST001"].includes(active.id)) { const customer = masterData.data?.customers?.[0]; const warehouse = masterData.data?.warehouses?.[0]; const item = masterData.data?.items?.[0]; if (!customer || !warehouse || !item) return toast.error("لا توجد بيانات أساسية كافية لإنشاء الفاتورة"); return createInvoice.mutate({ docNo: v.DOC_NO || `${active.id}-${Date.now()}`, customerId: customer.id, warehouseId: warehouse.id, actor: "workbench.user", lines: [{ itemId: item.id, quantity: v.QTY || "1", unitPrice: v.PRICE || "0", taxAmount: v.TAX_AMT || "0" }] }, { onSuccess: done, onError }); }
    try { await executeWindowAction.mutateAsync({ legacyForm: `${active.id}.fmx`, action: "save" }); toast.success("تم حفظ دورة النافذة؛ لا يوجد جدول D1 متخصص لهذه النافذة بعد"); setEditing(false); manager.markClean(active.id); } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر الحفظ"); }
  };

  const handleAction = async (action: WindowAction) => {
    const id = manager.activeId; if (!id || !active) return;
    if (action === "new") { setValues({}); setEditing(true); manager.markDirty(id); return toast.info(`سجل جديد في ${id}`); }
    if (action === "edit") { if (active.kind !== "transaction") return toast.info("الاستعلامات والتقارير للقراءة فقط"); setEditing(true); return manager.markDirty(id); }
    if (action === "save") return saveDraft();
    if (action === "query") { await records.refetch(); return toast.success(`تم البحث وتحديث سجلات ${id}`); }
    if (action === "undo" || action === "cancel") { setEditing(false); setValues({}); manager.markClean(id); return; }
    if (action === "delete") return toast.info("الحذف غير مفعّل افتراضيًا لحماية السجلات؛ استخدم عكس المستند عند الحاجة");
    if (action === "post") { try { const result = await executeWindowAction.mutateAsync({ legacyForm: `${id}.fmx`, action: "post" }); toast.success(result.message || `تم ترحيل ${id}`); manager.markClean(id); } catch (error) { toast.error(error instanceof Error ? error.message : `تعذر ترحيل ${id}`); } return; }
    if (action === "print") return toast.info(`تجهيز تقرير ${id}`);
    return toast.info(`مساعدة ${id}: الإدراج F6، التعديل F2، البحث F7، الحفظ F10`);
  };

  useEffect(() => { const onKeyDown = (event: KeyboardEvent) => { if (event.key === "F10") { event.preventDefault(); void handleAction("save"); } else if (event.key === "F7") { event.preventDefault(); void handleAction("query"); } else if (event.key === "F6") { event.preventDefault(); void handleAction("new"); } else if (event.key === "F2") { event.preventDefault(); void handleAction("edit"); } else if (event.key === "Escape" && manager.activeId) { event.preventDefault(); void handleAction("cancel"); } else if (event.key === "Delete") { event.preventDefault(); void handleAction("delete"); } }; window.addEventListener("keydown", onKeyDown); return () => window.removeEventListener("keydown", onKeyDown); });

  return <div className="workbench-shell" dir="rtl"><header className="workbench-menubar"><button className="workbench-brand" onClick={() => setLocation("/")}><span className="brand-mark">ON</span><span><b>YS ERP</b><small>Oracle Forms Workbench</small></span></button><button className="menubar-item" onClick={() => setLocation("/home")}><LayoutDashboard size={15} /> لوحة التحكم</button><button className="menubar-item"><Menu size={15} /> النظام</button><button className="menubar-item"><FolderTree size={15} /> النوافذ</button><button className="menubar-item"><FileBarChart size={15} /> التقارير</button><button className="menubar-item" onClick={() => setLocation("/setup")}><Settings2 size={15} /> تهيئة</button><span className="menubar-spacer" /><span className="connection-state"><i /> نواة دورة الحياة</span><button className="icon-button" title="مساعدة"><CircleHelp size={17} /></button></header><div className="workbench-toolbar"><button className="toolbar-main" onClick={() => setSidebar((value) => !value)}><PanelLeft size={16} /> شجرة النظام</button><span className="toolbar-path">النظام الرئيسي <ChevronLeft size={14} /> مساحة تشغيل النوافذ</span><span className="toolbar-spacer" /><label className="window-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="بحث عن نافذة أو سجل..." /></label></div><div className="workbench-layout">{sidebar && <aside className="workbench-sidebar"><div className="sidebar-title"><div><span>قائمة النظام</span><small>MODULE NAVIGATOR</small></div><button className="icon-button"><ChevronDown size={15} /></button></div><div className="tree-root"><BookOpen size={17} /><div><b>YS Enterprise Resource Planning</b><small>الإصدار 6.20 · بيئة التشغيل</small></div></div>{filteredModules.map((module) => { const Icon = module.icon; const isOpen = expanded === module.id; return <div className="module-tree" key={module.id}><button className="module-row" onClick={() => setExpanded(isOpen ? null : module.id)}><Icon size={16} /><span><b>{module.label}</b><small>{module.code} · {module.windows.length} نوافذ</small></span>{isOpen ? <ChevronDown size={15} /> : <ChevronLeft size={15} />}</button>{isOpen && <div className="module-children">{module.windows.map((window) => <button key={window.id} className={`tree-window ${active?.id === window.id ? "selected" : ""}`} onClick={() => void openWindow(window)}><span className="window-dot" /><span><b>{window.label}</b><small>{window.id} · {kindLabel[window.kind]}</small></span><FilePlus2 size={13} /></button>)}</div>}</div>})}</aside>}<main className="workbench-main"><div className="open-tabs">{manager.sessions.map((session) => <button key={session.id} className={`open-tab ${manager.activeId === session.id ? "active" : ""}`} onClick={() => manager.restoreWindow(session.id)}><span className="tab-icon"><Archive size={13} /></span><span>{session.id}</span><small>{session.phase}</small><X size={13} onClick={(event) => { event.stopPropagation(); void manager.closeWindow(session.id); }} /></button>)}<span className="open-tabs-spacer" /><span className="session-label"><ShieldCheck size={14} /> جلسة آمنة · {manager.sessions.length} نافذة</span></div><div className="window-stage">{active && !active.minimized ? <section className="legacy-window"><WindowTitleBar label={active.label} id={active.id} kind={kindLabel[active.kind]} onMinimize={() => manager.minimizeWindow(active.id)} onClose={() => void manager.closeWindow(active.id)} /><div className="contract-ribbon">{activeContract.isLoading ? "جارٍ تحميل عقد النافذة..." : `${activeContract.data?.coreApi || "ONEX_WINDOW_API"} · ${active.phase} · ${activeContract.data?.status || "NOT_READY"}`} {windowCatalog.isFetching ? " · تحديث الفهرس" : ""}</div><WindowToolbar phase={active.phase} onAction={handleAction} onClose={() => void manager.closeWindow(active.id)} disabled={createInvoice.isPending || saveAccount.isPending || saveCustomer.isPending || saveSupplier.isPending || saveItem.isPending || saveJournal.isPending || saveSystemUser.isPending || saveBranch.isPending || saveWarehouse.isPending} /><WindowBody window={active as RuntimeWindow} records={activeRecords} values={values} editing={editing} onChange={setField} onSelectRecord={selectRecord} /></section> : <div className="empty-workbench"><LayoutDashboard size={44} /><h2>مساحة تشغيل النظام</h2><p>{active?.minimized ? "النافذة مصغرة؛ اختر تبويبها لاستعادتها." : "اختر نافذة من شجرة النظام لفتحها في جلسة العمل."}</p></div>}</div><footer className="workbench-status"><span><i className="status-green" /> {active?.phase === "error" ? active.lastError : active?.phase === "committed" ? "تم الحفظ" : active?.phase === "dirty" ? "تعديلات غير محفوظة" : "جاهز"}</span><span>المستخدم: administrator</span><span>الفرع: الرئيسي</span><span className="status-spacer" /><span>F6 جديد</span><span>F2 تعديل</span><span>F7 بحث</span><span>F10 حفظ</span><span>الإصدار 6.20</span></footer></main></div></div>;
}

function WorkbenchAuthGate() { const auth = trpc.auth.me.useQuery(undefined, { retry: false, refetchOnWindowFocus: false }); if (auth.isLoading) return <main className="local-login-shell" dir="rtl"><section className="local-login-card"><p className="local-login-kicker">ONEX ERP · SECURE SESSION</p><h1>جارٍ التحقق من الجلسة...</h1></section></main>; if (!auth.data) return <LocalLogin />; return <AuthenticatedWorkbench />; }
export default function WindowWorkbench() { return <WindowManagerProvider><WorkbenchAuthGate /></WindowManagerProvider>; }
