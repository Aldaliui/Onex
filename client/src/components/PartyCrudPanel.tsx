import { useMemo, useState } from "react";
import { Pencil, Plus, Save, Trash2, Users, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  windowCrudRegistry,
  type PartyCrudKind,
} from "@/window-runtime/windowCrudRegistry";

type PartyRecord = {
  id?: number;
  code?: string;
  legalName?: string;
  currencyCode?: string;
  status?: "ACTIVE" | "BLOCKED" | "CLOSED";
  accountId?: number;
};
type Props = {
  kind: PartyCrudKind;
  records: PartyRecord[];
  onRefresh: () => void;
};
type FormState = {
  id?: number;
  code: string;
  legalName: string;
  currencyCode: string;
  status: "ACTIVE" | "BLOCKED" | "CLOSED";
};

const blank = (kind: PartyCrudKind): FormState => ({
  code: kind === "customer" ? "CUST-NEW" : "SUP-NEW",
  legalName: "",
  currencyCode: "SAR",
  status: "ACTIVE",
});

export default function PartyCrudPanel({ kind, records, onRefresh }: Props) {
  const isCustomer = kind === "customer";
  const definition = Object.values(windowCrudRegistry).find(
    item => item.kind === kind
  )!;
  const saveCustomer = trpc.windows.saveCustomer.useMutation();
  const saveSupplier = trpc.windows.saveSupplier.useMutation();
  const deleteCustomer = trpc.windows.deleteCustomer.useMutation();
  const deleteSupplier = trpc.windows.deleteSupplier.useMutation();
  const [form, setForm] = useState<FormState>(() => blank(kind));
  const [search, setSearch] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const pending =
    saveCustomer.isPending ||
    saveSupplier.isPending ||
    deleteCustomer.isPending ||
    deleteSupplier.isPending;
  const visible = useMemo(
    () =>
      records.filter(
        row =>
          !search ||
          `${row.code || ""} ${row.legalName || ""}`
            .toLowerCase()
            .includes(search.toLowerCase())
      ),
    [records, search]
  );
  const select = (row: PartyRecord) => {
    setForm({
      id: row.id,
      code: row.code || "",
      legalName: row.legalName || "",
      currencyCode: row.currencyCode || "SAR",
      status: row.status || "ACTIVE",
    });
    setErrors([]);
  };
  const reset = () => {
    setForm(blank(kind));
    setErrors([]);
  };
  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm(current => ({ ...current, [key]: value }));
  const save = async () => {
    const next: string[] = [];
    if (!form.code.trim()) next.push("الكود مطلوب");
    if (!form.legalName.trim()) next.push("الاسم القانوني مطلوب");
    if (!/^[A-Z]{3}$/.test(form.currencyCode.trim().toUpperCase()))
      next.push("رمز العملة يجب أن يتكون من 3 أحرف");
    if (next.length) {
      setErrors(next);
      return;
    }
    try {
      const input = {
        id: form.id,
        companyId: 1,
        code: form.code.trim().toUpperCase(),
        legalName: form.legalName.trim(),
        currencyCode: form.currencyCode.trim().toUpperCase(),
        status: form.status,
      };
      if (isCustomer) await saveCustomer.mutateAsync(input);
      else await saveSupplier.mutateAsync(input);
      toast.success(
        form.id
          ? "تم تحديث السجل والحساب المرتبط"
          : "تم إنشاء السجل والحساب المرتبط"
      );
      reset();
      onRefresh();
    } catch (error) {
      setErrors([error instanceof Error ? error.message : "تعذر حفظ السجل"]);
    }
  };
  const remove = async () => {
    if (
      !form.id ||
      !window.confirm(
        "سيتم حذف السجل إذا لم يكن مرتبطًا، أو إيقافه عند وجود حركة. هل تريد المتابعة؟"
      )
    )
      return;
    try {
      if (isCustomer) await deleteCustomer.mutateAsync({ id: form.id });
      else await deleteSupplier.mutateAsync({ id: form.id });
      toast.success("تم تنفيذ الحذف أو الإيقاف الآمن");
      reset();
      onRefresh();
    } catch (error) {
      setErrors([error instanceof Error ? error.message : "تعذر حذف السجل"]);
    }
  };
  return (
    <section className="accounting-panel party-crud-panel" dir="rtl">
      <header className="party-crud-header">
        <div>
          <span className="panel-kicker">
            {isCustomer ? "AR / CUSTOMER MASTER" : "AP / SUPPLIER MASTER"}
          </span>
          <h2>{definition.title}</h2>
          <p>
            CRUD فعلي مع إنشاء الحساب الفرعي وربط السجل بدورة{" "}
            {isCustomer ? "المبيعات والقبض" : "المشتريات والصرف"}.
          </p>
        </div>
        <button className="report-action" type="button" onClick={reset}>
          <Plus size={14} /> سجل جديد
        </button>
      </header>
      {!!errors.length && (
        <div className="validation-summary">
          <b>تحقق مطلوب</b>
          {errors.map(error => (
            <span key={error}>{error}</span>
          ))}
        </div>
      )}
      <div className="party-crud-grid">
        <div className="party-crud-list">
          <div className="accounting-toolbar">
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="بحث بالكود أو الاسم..."
            />
            <span className="accounting-count">{visible.length} سجل</span>
          </div>
          {visible.map((row, index) => (
            <button
              type="button"
              className={`party-row ${form.id === row.id ? "selected" : ""}`}
              key={row.id ?? `${row.code}-${index}`}
              onClick={() => select(row)}
            >
              <span className="party-row-icon">
                <Users size={15} />
              </span>
              <span>
                <b>{row.code || "—"}</b>
                <small>{row.legalName || "—"}</small>
              </span>
              <em>{row.currencyCode || "SAR"}</em>
              <strong>
                {row.status === "ACTIVE"
                  ? "نشط"
                  : row.status === "CLOSED"
                    ? "مغلق"
                    : "موقوف"}
              </strong>
            </button>
          ))}
          {!visible.length && (
            <div className="account-empty">لا توجد سجلات مطابقة.</div>
          )}
        </div>
        <div className="party-crud-editor">
          <div className="account-detail-heading">
            <div>
              <span className="panel-kicker">
                {form.id ? "UPDATE RECORD" : "CREATE RECORD"}
              </span>
              <h3>{form.id ? "تعديل السجل" : "سجل جديد"}</h3>
            </div>
            {form.id && (
              <button className="report-action" type="button" onClick={reset}>
                <X size={14} />
              </button>
            )}
          </div>
          <label>
            {definition.codeLabel}
            <input
              value={form.code}
              onChange={event =>
                update("code", event.target.value.toUpperCase())
              }
            />
          </label>
          <label>
            الاسم القانوني
            <input
              value={form.legalName}
              onChange={event => update("legalName", event.target.value)}
            />
          </label>
          <label>
            العملة
            <input
              maxLength={3}
              value={form.currencyCode}
              onChange={event =>
                update("currencyCode", event.target.value.toUpperCase())
              }
            />
          </label>
          <label>
            الحالة
            <select
              value={form.status}
              onChange={event =>
                update("status", event.target.value as FormState["status"])
              }
            >
              <option value="ACTIVE">نشط</option>
              <option value="BLOCKED">موقوف</option>
              <option value="CLOSED">مغلق</option>
            </select>
          </label>
          <div className="account-editor-actions">
            <button
              className="toolbar-main"
              type="button"
              disabled={pending}
              onClick={() => void save()}
            >
              <Save size={15} /> {form.id ? "حفظ التعديل" : "إنشاء وربط الحساب"}
            </button>
            {form.id && (
              <button
                className="report-action danger"
                type="button"
                disabled={pending || form.status === "CLOSED"}
                onClick={() => void remove()}
              >
                <Trash2 size={14} /> حذف/إيقاف
              </button>
            )}
          </div>
          <p className="setup-note">
            <Pencil size={14} /> الحساب المرتبط يُنشأ تلقائيًا تحت{" "}
            {definition.accountPrefix} ويُحدّث عند تعديل الاسم أو العملة أو
            الحالة.
          </p>
        </div>
      </div>
    </section>
  );
}
