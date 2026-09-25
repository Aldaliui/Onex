import { useMemo, useState } from "react";
import { Boxes, ClipboardList, FolderTree, Package, Plus, RefreshCw, Settings2, Tags, Warehouse, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import ItemMasterPanel from "@/components/ItemMasterPanel";
import InventoryDocumentCenter from "@/components/InventoryDocumentCenter";
import ItemTracePanel from "@/components/ItemTracePanel";

type WindowId = "groups" | "subgroups" | "items" | "documents" | "movement";
type Group = { code: string; name: string; parentCode?: string; active: boolean };

const readGroups = (key: string, fallback: Group[]) => {
  if (typeof window === "undefined") return fallback;
  try { return JSON.parse(window.localStorage.getItem(key) || "null") || fallback; } catch { return fallback; }
};

const mainDefaults: Group[] = [
  { code: "001", name: "المواد الغذائية", active: true },
  { code: "002", name: "المستلزمات التشغيلية", active: true },
  { code: "003", name: "قطع الغيار", active: true },
];
const subDefaults: Group[] = [
  { code: "001-001", parentCode: "001", name: "المعلبات", active: true },
  { code: "001-002", parentCode: "001", name: "المشروبات", active: true },
  { code: "002-001", parentCode: "002", name: "مواد التعبئة", active: true },
];

function ClassicToolbar({ title, onRefresh, onClose }: { title: string; onRefresh?: () => void; onClose?: () => void }) {
  return <div className="legacy-window-toolbar" role="toolbar" aria-label="شريط أدوات نافذة المخزون">
    <button type="button" title="جديد"><Plus size={14} /></button><button type="button" title="حفظ"><span className="legacy-save-icon">✓</span></button>
    <span className="legacy-toolbar-separator" /><button type="button" title="تحديث" onClick={onRefresh}><RefreshCw size={13} /></button><button type="button" title="إعدادات"><Settings2 size={13} /></button>
    <span className="legacy-window-title">{title}</span><button type="button" className="legacy-close" title="إغلاق" onClick={onClose}><X size={13} /></button>
  </div>;
}

function GroupWindow({ kind, groups, setGroups, parents, onClose }: { kind: "main" | "sub"; groups: Group[]; setGroups: (rows: Group[]) => void; parents: Group[]; onClose?: () => void }) {
  const [selected, setSelected] = useState<Group | null>(null);
  const [code, setCode] = useState(""); const [name, setName] = useState(""); const [parentCode, setParentCode] = useState("");
  const title = kind === "main" ? "بيانات المجموعات الرئيسية" : "بيانات المجموعات الفرعية";
  const reset = () => { setSelected(null); setCode(""); setName(""); setParentCode(parents[0]?.code || ""); };
  const select = (row: Group) => { setSelected(row); setCode(row.code); setName(row.name); setParentCode(row.parentCode || parents[0]?.code || ""); };
  const save = () => {
    if (!code.trim() || !name.trim() || (kind === "sub" && !parentCode)) return toast.error("أدخل الرقم والاسم والمجموعة الرئيسية");
    if (!selected && groups.some((row) => row.code === code.trim())) return toast.error("رقم المجموعة مستخدم مسبقًا");
    const row: Group = { code: code.trim(), name: name.trim(), active: selected?.active ?? true, ...(kind === "sub" ? { parentCode } : {}) };
    setGroups(selected ? groups.map((item) => item.code === selected.code ? row : item) : [...groups, row]); toast.success(selected ? "تم تعديل المجموعة" : "تمت إضافة المجموعة"); reset();
  };
  const toggle = () => { if (!selected) return; setGroups(groups.map((row) => row.code === selected.code ? { ...row, active: !row.active } : row)); toast.success("تم تحديث حالة المجموعة"); reset(); };
  return <section className="legacy-window" dir="rtl">
    <ClassicToolbar title={title} onClose={onClose} />
    <div className="legacy-window-body"><div className="legacy-form-ribbon"><span>رمز النافذة: {kind === "main" ? "INVT001" : "INVT002"}</span><span>الحالة: جاهزة للإدخال</span></div>
      <div className="legacy-group-layout"><div className="legacy-record-list"><div className="legacy-list-heading"><b>{kind === "main" ? "المجموعات الرئيسية" : "المجموعات الفرعية"}</b><span>{groups.length} سجل</span></div>{groups.map((row) => <button type="button" key={row.code} className={selected?.code === row.code ? "selected" : ""} onClick={() => select(row)}><span className="legacy-code">{row.code}</span><span>{row.name}</span><em className={row.active ? "active" : "inactive"}>{row.active ? "فعال" : "موقوف"}</em></button>)}{!groups.length && <p className="legacy-empty">لا توجد مجموعات مسجلة</p>}</div>
        <div className="legacy-editor"><div className="legacy-editor-title"><FolderTree size={17} /><b>{selected ? "تعديل بيانات المجموعة" : "إضافة مجموعة جديدة"}</b></div><div className="legacy-fields"><label>رقم المجموعة<input value={code} onChange={(e) => setCode(e.target.value)} placeholder={kind === "main" ? "001" : "001-001"} disabled={Boolean(selected)} /></label>{kind === "sub" && <label>المجموعة الرئيسية<select value={parentCode} onChange={(e) => setParentCode(e.target.value)}><option value="">اختر المجموعة</option>{parents.map((row) => <option key={row.code} value={row.code}>{row.code} · {row.name}</option>)}</select></label>}<label>اسم المجموعة<input value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم المجموعة" /></label></div><div className="legacy-actions"><button type="button" className="legacy-primary" onClick={save}>حفظ وتسجيل</button><button type="button" onClick={reset}>جديد</button>{selected && <button type="button" className="legacy-danger" onClick={toggle}>{selected.active ? "إيقاف" : "تفعيل"}</button>}</div><div className="legacy-hint"><Tags size={15} /><span>يستخدم التصنيف في تقارير المخزون واختيار الصنف. لا يتم حذف السجل المرتبط بحركات.</span></div></div></div>
    </div><div className="legacy-statusbar"><span>الشركة: ONEX</span><span>الفرع: الرئيسي</span><span>المستخدم: مدير النظام</span><span>F9 بحث · Ctrl+S حفظ</span></div>
  </section>;
}

export default function LegacyInventoryWindows() {
  const [active, setActive] = useState<WindowId>("groups");
  const [mainGroups, setMainGroups] = useState<Group[]>(() => readGroups("onex.inventory.main-groups", mainDefaults));
  const [subGroups, setSubGroups] = useState<Group[]>(() => readGroups("onex.inventory.sub-groups", subDefaults));
  const master = trpc.masterData.useQuery();
  const warehouses = trpc.inventory.warehouses.useQuery();
  const items = useMemo(() => (master.data?.items || []) as Record<string, unknown>[], [master.data?.items]);
  const saveGroups = (key: string, setter: (rows: Group[]) => void) => (rows: Group[]) => { setter(rows); window.localStorage.setItem(key, JSON.stringify(rows)); };
  const setMain = saveGroups("onex.inventory.main-groups", setMainGroups);
  const setSub = saveGroups("onex.inventory.sub-groups", setSubGroups);
  const nav: Array<{ id: WindowId; label: string; code: string; icon: typeof Package }> = [
    { id: "groups", label: "المجموعات الرئيسية", code: "INVT001", icon: FolderTree }, { id: "subgroups", label: "المجموعات الفرعية", code: "INVT002", icon: Tags },
    { id: "items", label: "بيانات الأصناف", code: "INVT003", icon: Package }, { id: "documents", label: "مستندات المخزون", code: "INVT005", icon: ClipboardList }, { id: "movement", label: "حركة ورصيد الصنف", code: "INVT006", icon: Boxes },
  ];
  const current = nav.find((entry) => entry.id === active) || nav[0];
  const Icon = current.icon;
  return <div className="legacy-inventory-shell" dir="rtl"><header className="legacy-module-header"><div className="legacy-module-mark"><Warehouse size={22} /></div><div><span>ONEX · ERP</span><h1>مدخلات المخزون</h1><p>إعادة بناء النوافذ الكلاسيكية مع ربط البيانات والحركات الحديثة</p></div><div className="legacy-module-meta"><b>2026</b><span>الفترة الحالية مفتوحة</span></div></header>
    <nav className="legacy-window-tabs" aria-label="نوافذ المخزون">{nav.map((entry) => { const TabIcon = entry.icon; return <button type="button" key={entry.id} className={active === entry.id ? "active" : ""} onClick={() => setActive(entry.id)}><TabIcon size={15} /><span><b>{entry.label}</b><small>{entry.code}</small></span></button>; })}</nav>
    <div className="legacy-breadcrumb"><Icon size={14} /><span>المخزون</span><b>/</b><strong>{current.label}</strong><span className="legacy-connected">● متصل بقاعدة البيانات</span></div>
    {active === "groups" && <GroupWindow kind="main" groups={mainGroups} setGroups={setMain} parents={[]} />}{active === "subgroups" && <GroupWindow kind="sub" groups={subGroups} setGroups={setSub} parents={mainGroups.filter((row) => row.active)} />}
    {active === "items" && <div className="legacy-embedded-window"><ClassicToolbar title="بيانات الأصناف · INVT003" onRefresh={() => void master.refetch()} /><ItemMasterPanel /></div>}
    {active === "documents" && <div className="legacy-embedded-window"><ClassicToolbar title="مستندات وحركات المخزون · INVT005" /><InventoryDocumentCenter /></div>}
    {active === "movement" && <div className="legacy-embedded-window"><ClassicToolbar title="بطاقة حركة ورصيد الصنف · INVT006" /><ItemTracePanel records={items} mode="movement" /></div>}
    <footer className="legacy-module-footer"><span>{mainGroups.filter((row) => row.active).length} مجموعات رئيسية</span><span>{subGroups.filter((row) => row.active).length} مجموعات فرعية</span><span>{items.length} صنف</span><span>{(warehouses.data || []).length} مستودع</span><span className="legacy-footer-shortcuts">F9 بحث · F10 حفظ · Esc إغلاق النافذة</span></footer>
  </div>;
}
