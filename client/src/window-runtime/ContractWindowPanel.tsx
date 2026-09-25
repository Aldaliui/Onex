import { ClipboardCheck, Database, FileSearch, ListChecks, LockKeyhole, Play, Printer, Save, ShieldCheck, Table2 } from "lucide-react";
import type { WindowAction, WindowRecord } from "./WindowManager";
import type { LegacyField, LegacyWindowContract } from "./legacyContracts";

type ContractWindow = WindowRecord & { module: string };
type RecordValue = Record<string, unknown>;

type ContractWindowPanelProps = {
  window: ContractWindow;
  contract?: LegacyWindowContract;
  records: RecordValue[];
  values: Record<string, string>;
  editing: boolean;
  onChange: (id: string, value: string) => void;
  onSelectRecord: (record: RecordValue) => void;
  onAction: (action: WindowAction) => void;
};

const actionLabels: Partial<Record<WindowAction, string>> = {
  new: "سجل جديد",
  create: "CREATE · إنشاء",
  edit: "تعديل السجل",
  update: "UPDATE · تعديل",
  save: "حفظ العقد",
  approve: "APPROVE · اعتماد",
  post: "POST · ترحيل",
  reverse: "REVERSE · عكس",
  void: "DELETE/VOID · إبطال",
  query: "تشغيل الاستعلام",
  print: "طباعة / تصدير",
  cancel: "إلغاء التعديل",
  delete: "DELETE/VOID · إبطال",
};

const workflowByKind = {
  transaction: ["بيانات المعاملة", "تحقق العقد", "حفظ", "تدقيق"],
  inquiry: ["معايير البحث", "تشغيل الاستعلام", "نتائج موثقة", "تصدير"],
  report: ["معلمات التقرير", "تشغيل", "معاينة", "طباعة"],
} as const;

function fieldValue(values: Record<string, string>, field: LegacyField) {
  return values[field.id] ?? values[field.id.toUpperCase()] ?? "";
}

function fieldControl(field: LegacyField, value: string, editing: boolean, onChange: (value: string) => void) {
  if (field.type === "select") {
    return <select value={value || "all"} disabled={!editing} onChange={(event) => onChange(event.target.value)}><option value="all">الكل</option><option value="1">نعم / نشط</option><option value="0">لا / غير نشط</option></select>;
  }
  return <input type={field.type} value={value} disabled={!editing} required={field.required} placeholder={field.id} onChange={(event) => onChange(event.target.value)} />;
}

function displayValue(record: RecordValue, field: LegacyField) {
  const target = Object.entries(record).find(([key]) => key.toUpperCase() === field.id.toUpperCase());
  return target?.[1] === null || target?.[1] === undefined ? "—" : String(target[1]);
}

export function ContractWindowPanel({ window, contract, records, values, editing, onChange, onSelectRecord, onAction }: ContractWindowPanelProps) {
  const fields = contract?.fields ?? [];
  const workflow = workflowByKind[window.kind];
  const supportedActions = (contract?.actions ?? ["query", "print"]).filter((action) => actionLabels[action]);
  const source = contract?.source;

  return <div className="contract-window-panel" dir="rtl">
    <div className="contract-window-heading">
      <div>
        <span className="contract-window-kicker"><ShieldCheck size={13} /> عقد تشغيل موثق</span>
        <h2>{contract?.label ?? window.label}</h2>
        <p>{window.id}.fmx · {source?.namespace ?? "ONEX_WINDOW_API"} · {window.kind === "transaction" ? "معاملة" : window.kind === "inquiry" ? "استعلام" : "تقرير"}</p>
      </div>
      <div className="contract-window-badges"><span><Database size={13} /> {source?.tables.length ?? 0} مصادر</span><span><ClipboardCheck size={13} /> {source?.procedures.length ?? 0} إجراءات</span></div>
    </div>

    <div className="contract-workflow">{workflow.map((step, index) => <div className={`contract-step ${index === 0 ? "active" : ""}`} key={step}><span>{index + 1}</span><b>{step}</b>{index < workflow.length - 1 && <i />}</div>)}</div>

    <div className="contract-window-meta"><span><LockKeyhole size={12} /> الحقول المستخرجة: {fields.filter((field) => field.evidence === "extracted").length}</span><span><Table2 size={12} /> {records.length} سجل متاح</span><strong>{editing ? "وضع التحرير" : "وضع القراءة"}</strong></div>

    {fields.length ? <div className="contract-field-groups"><section><div className="contract-section-title"><span>01</span><div><b>{window.kind === "report" ? "معلمات التشغيل" : "بيانات العقد"}</b><small>الحقول المرتبطة بعقد {window.id}</small></div></div><div className="contract-field-grid">{fields.slice(0, Math.max(4, Math.ceil(fields.length / 2))).map((field) => <label key={field.id}><span>{field.label}{field.required ? " *" : ""}<small>{field.evidence === "extracted" ? "مستخرج" : "مستنتج"}</small></span>{fieldControl(field, fieldValue(values, field), editing, (value) => onChange(field.id, value))}</label>)}</div></section><section><div className="contract-section-title"><span>02</span><div><b>{window.kind === "transaction" ? "التحقق والربط" : "خيارات العرض"}</b><small>{source?.tables.slice(0, 3).join(" · ") || "ONEX data contract"}</small></div></div><div className="contract-field-grid">{fields.slice(Math.max(4, Math.ceil(fields.length / 2))).map((field) => <label key={field.id}><span>{field.label}{field.required ? " *" : ""}<small>{field.evidence === "extracted" ? "مستخرج" : "مستنتج"}</small></span>{fieldControl(field, fieldValue(values, field), editing, (value) => onChange(field.id, value))}</label>)}</div></section></div> : <div className="contract-empty-fields"><FileSearch size={20} /><span>لا توجد حقول معرفة لهذا العقد بعد.</span></div>}

    <div className="contract-actions-row">{supportedActions.map((action) => <button type="button" key={action} className={action === "save" || action === "query" ? "primary" : ""} onClick={() => onAction(action)}>{action === "save" ? <Save size={14} /> : action === "query" ? <Play size={14} /> : action === "print" ? <Printer size={14} /> : <ListChecks size={14} />}{actionLabels[action]}</button>)}</div>

    <section className="contract-records"><div className="contract-records-heading"><div><b>{window.kind === "transaction" ? "سجلات العقد" : "نتائج العقد"}</b><small>اختر سجلًا لتحميله إلى دورة {window.id}</small></div><span>{records.length} نتيجة</span></div>{records.length ? <div className="contract-record-list">{records.slice(0, 12).map((record, index) => <button type="button" key={`${String(record.id ?? record.ID ?? index)}-${index}`} onClick={() => onSelectRecord(record)}><span className="contract-record-index">{String(index + 1).padStart(2, "0")}</span><span className="contract-record-main"><b>{displayValue(record, fields[0] ?? { id: "code", label: "السجل", type: "text", evidence: "inferred" })}</b><small>{displayValue(record, fields[1] ?? { id: "name", label: "الاسم", type: "text", evidence: "inferred" })}</small></span><span className="contract-record-state">جاهز</span></button>)}</div> : <div className="contract-empty-records"><FileSearch size={18} /><span>لا توجد سجلات مطابقة؛ ابدأ بسجل جديد أو شغّل الاستعلام.</span></div>}</section>
  </div>;
}
