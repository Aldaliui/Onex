import { useMemo } from "react";
import { Activity, ArrowDownToLine, ArrowUpFromLine, Boxes, Calculator, ClipboardList, FileBarChart, Package, Receipt, RefreshCw, ShoppingCart, Users, Warehouse } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useErpWorkspaceData } from "@/hooks/useErpWorkspaceData";

type OpenWindow = (windowId: string) => void;

type WorkspaceOverviewProps = {
  onOpen: OpenWindow;
};

const money = (value: unknown) => `${Number(value || 0).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
const date = (value: unknown) => value ? new Intl.DateTimeFormat("ar-SA", { day: "2-digit", month: "short" }).format(new Date(String(value))) : "—";

export default function WorkspaceOverview({ onOpen }: WorkspaceOverviewProps) {
  const dashboard = trpc.dashboard.useQuery(undefined, { refetchOnWindowFocus: false });
  const workspace = useErpWorkspaceData();
  const data = dashboard.data;
  const { masterData, accounts, fiscalPeriods } = workspace;
  const recentInvoices = (data?.recentInvoices || []) as Array<Record<string, unknown>>;
  const balanceRows = (masterData?.balances || []) as Array<Record<string, any>>;
  const stockQuantity = useMemo(() => balanceRows.reduce((sum, row) => sum + Number(row.balance?.quantity || 0), 0), [balanceRows]);
  const activePeriod = fiscalPeriods.find((period: any) => period.status === "OPEN") as any;

  const kpis = [
    { label: "فواتير مسجلة", value: data?.invoices ?? "—", hint: "كل الحالات", icon: Receipt, tone: "cyan" },
    { label: "قيمة المخزون", value: data ? money(data.stockValue) : "—", hint: `${stockQuantity.toLocaleString("ar-SA")} وحدة متاحة`, icon: Boxes, tone: "violet" },
    { label: "القيود اليومية", value: data?.journals ?? "—", hint: "دفتر الأستاذ", icon: Calculator, tone: "amber" },
    { label: "الفترة المالية", value: activePeriod?.code || "2026", hint: activePeriod ? "مفتوحة للترحيل" : "جاري التحقق", icon: Activity, tone: "green" },
  ];

  const quickActions = [
    { id: "ARST004", label: "فاتورة مبيعات", detail: "بيع نقدي أو آجل", icon: ArrowUpFromLine, tone: "cyan" },
    { id: "APST003", label: "فاتورة مشتريات", detail: "توريد إلى المخزون", icon: ArrowDownToLine, tone: "violet" },
    { id: "GLST002", label: "قيد يومي", detail: "قيد متوازن مع تدقيق", icon: Calculator, tone: "amber" },
    { id: "INVT004", label: "حركة المخزون", detail: "تتبع الكمية والتكلفة", icon: Package, tone: "green" },
  ];

  const domains = [
    { id: "sales", label: "المبيعات والعملاء", detail: `${masterData?.customers?.length ?? 0} عميل · فواتير ومرتجعات`, icon: Receipt, windows: ["ARST004", "ARST007", "ARST006"] },
    { id: "purchasing", label: "المشتريات والموردون", detail: `${masterData?.suppliers?.length ?? 0} مورد · أوامر وتوريد`, icon: ShoppingCart, windows: ["APST003", "APST007", "APSI002"] },
    { id: "inventory", label: "المخزون والمستودعات", detail: `${masterData?.items?.length ?? 0} صنف · ${masterData?.warehouses?.length ?? 0} مستودع`, icon: Warehouse, windows: ["INVT003", "INVT004", "MRPACS004"] },
    { id: "finance", label: "المالية والحسابات", detail: `${accounts.length} حساب نشط · دورة مالية`, icon: Calculator, windows: ["GLST001", "GLST002", "GLST004"] },
  ];

  return <section className="workspace-overview" dir="rtl">
    <div className="workspace-overview-hero">
      <div>
        <span className="workspace-overview-kicker">ONEX ERP · OPERATION CONTROL</span>
        <h1>مساحة التشغيل الموحدة</h1>
        <p>ابدأ المعاملة من هنا، ثم تابع دورة المستند من الإدخال إلى الاعتماد والترحيل والتدقيق داخل النظام نفسه.</p>
      </div>
      <button type="button" className="overview-refresh" onClick={() => { void dashboard.refetch(); void workspace.refresh(); }}><RefreshCw size={15} /> تحديث البيانات</button>
    </div>

    <div className="overview-kpis">{kpis.map(({ label, value, hint, icon: Icon, tone }) => <article className={`overview-kpi ${tone}`} key={label}><span className="overview-kpi-icon"><Icon size={18} /></span><div><span>{label}</span><strong>{value}</strong><small>{hint}</small></div></article>)}</div>

    <div className="overview-columns">
      <section className="overview-panel overview-quick-panel"><div className="overview-panel-heading"><div><span className="panel-kicker">TRANSACTION CENTER</span><h2>بدء معاملة</h2></div><ClipboardList size={19} /></div><div className="overview-action-grid">{quickActions.map(({ id, label, detail, icon: Icon, tone }) => <button type="button" className={`overview-action ${tone}`} key={id} onClick={() => onOpen(id)}><span><Icon size={18} /></span><b>{label}</b><small>{detail}</small><em>فتح النافذة ←</em></button>)}</div></section>
      <section className="overview-panel"><div className="overview-panel-heading"><div><span className="panel-kicker">RECENT ACTIVITY</span><h2>آخر الفواتير</h2></div><button type="button" className="overview-link" onClick={() => onOpen("ARSR041")}>عرض الكل</button></div><div className="overview-invoice-list">{dashboard.isLoading ? <div className="overview-empty">جارٍ تحميل النشاط...</div> : recentInvoices.length ? recentInvoices.map((invoice, index) => <button type="button" className="overview-invoice" key={`${String(invoice.id || invoice.docNo || index)}`} onClick={() => onOpen(invoice.invoiceType === "PURCHASE" ? "APST003" : "ARST004")}><span className={`invoice-status ${String(invoice.status || "").toLowerCase()}`} /> <span><b>{String(invoice.docNo || "مستند")}</b><small>{String(invoice.invoiceType === "PURCHASE" ? "مشتريات" : "مبيعات")} · {date(invoice.createdAt)}</small></span><strong>{money(invoice.grandTotal)}</strong></button>) : <div className="overview-empty">لا توجد فواتير مسجلة بعد.</div>}</div></section>
    </div>

    <section className="overview-panel overview-domain-panel"><div className="overview-panel-heading"><div><span className="panel-kicker">ERP WORKSPACES</span><h2>مساحات العمل</h2></div><span className="overview-live"><i /> متصل بقاعدة البيانات</span></div><div className="overview-domain-grid">{domains.map(({ id, label, detail, icon: Icon, windows }) => <article className="overview-domain" key={id}><div className="overview-domain-title"><span><Icon size={18} /></span><div><b>{label}</b><small>{detail}</small></div></div><div className="overview-domain-actions">{windows.map((windowId, index) => <button type="button" key={windowId} onClick={() => onOpen(windowId)}>{index === 0 ? "فتح المساحة" : windowId}</button>)}</div></article>)}</div></section>

    <div className="overview-footer-note"><Users size={15} /><span>البيانات المعروضة تشغيلية ومتصلة بعقود الإجراءات في الخادم، وليست بطاقات عرض ثابتة.</span><FileBarChart size={15} /><button type="button" onClick={() => onOpen("GLSR001")}>فتح مركز التقارير</button></div>
  </section>;
}
