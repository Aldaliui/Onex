import { useMemo, useState } from "react";
import {
  Banknote,
  Building2,
  Coins,
  Download,
  Landmark,
  Save,
  Trash2,
  Upload,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

type Mode = "accounts" | "warehouse" | "cash" | "bank";
type Row = Record<string, unknown>;
const val = (row: Row, key: string, fallback = "") =>
  row[key] === null || row[key] === undefined ? fallback : String(row[key]);

export default function ReferenceDataPanel({
  mode,
  records,
  onRefresh,
}: {
  mode: Mode;
  records: Row[];
  onRefresh: () => void;
}) {
  const [tab, setTab] = useState<"entry" | "import" | "currency">(
    mode === "accounts" ? "entry" : "entry"
  );
  const [form, setForm] = useState({
    id: "",
    code: "",
    name: "",
    accountType: "ASSET",
    parentCode: "",
    currencyCode: "SAR",
    decimalScale: "2",
    accountNumber: "",
  });
  const [csv, setCsv] = useState(
    "code,name,accountType,parentCode,currencyCode,active\n"
  );
  const currencies = trpc.windows.currencies.useQuery(undefined, {
    enabled: mode === "accounts",
  });
  const saveAccount = trpc.windows.saveAccount.useMutation();
  const importAccounts = trpc.windows.importAccounts.useMutation();
  const saveCurrency = trpc.windows.saveCurrency.useMutation();
  const saveWarehouse = trpc.windows.saveWarehouse.useMutation();
  const saveCashBox = trpc.windows.saveCashBox.useMutation();
  const saveBank = trpc.windows.saveBank.useMutation();
  const deleteRecord = trpc.windows.deleteRecord.useMutation();
  const pending =
    saveAccount.isPending ||
    importAccounts.isPending ||
    saveCurrency.isPending ||
    saveWarehouse.isPending ||
    saveCashBox.isPending ||
    saveBank.isPending ||
    deleteRecord.isPending;
  const title =
    mode === "accounts"
      ? "دليل الحسابات والعملات"
      : mode === "warehouse"
        ? "المستودعات"
        : mode === "cash"
          ? "الصناديق"
          : "البنوك";
  const icon =
    mode === "accounts" ? (
      <Coins size={18} />
    ) : mode === "warehouse" ? (
      <Building2 size={18} />
    ) : mode === "cash" ? (
      <Wallet size={18} />
    ) : (
      <Landmark size={18} />
    );
  const update = (key: string, value: string) =>
    setForm(current => ({ ...current, [key]: value }));
  const parseRows = () =>
    csv
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .slice(1)
      .map(line => {
        const [code, name, accountType, parentCode, currencyCode, active] = line
          .split(",")
          .map(part => part.trim());
        return {
          code,
          name,
          accountType: accountType || "ASSET",
          parentCode: parentCode || undefined,
          currencyCode: currencyCode || "SAR",
          active: active === "0" ? 0 : 1,
        };
      })
      .filter(row => row.code && row.name);
  const save = async () => {
    try {
      if (mode === "accounts") {
        if (!form.code || !form.name) throw new Error("أدخل كود واسم الحساب");
        await saveAccount.mutateAsync({
          id: form.id ? Number(form.id) : undefined,
          code: form.code,
          name: form.name,
          accountType: form.accountType,
          parentCode: form.parentCode || undefined,
          currencyCode: form.currencyCode,
        });
      } else if (mode === "warehouse")
        await saveWarehouse.mutateAsync({
          id: form.id ? Number(form.id) : undefined,
          code: form.code,
          name: form.name,
        });
      else if (mode === "cash")
        await saveCashBox.mutateAsync({
          id: form.id ? Number(form.id) : undefined,
          code: form.code,
          name: form.name,
          currencyCode: form.currencyCode,
        });
      else
        await saveBank.mutateAsync({
          id: form.id ? Number(form.id) : undefined,
          code: form.code,
          name: form.name,
          accountNumber: form.accountNumber,
          currencyCode: form.currencyCode,
        });
      toast.success(`تم حفظ ${title} وربطه بقاعدة البيانات`);
      setForm({
        id: "",
        code: "",
        name: "",
        accountType: "ASSET",
        parentCode: "",
        currencyCode: "SAR",
        decimalScale: "2",
        accountNumber: "",
      });
      onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر الحفظ");
    }
  };
  const saveImported = async () => {
    const rows = parseRows();
    if (!rows.length) return toast.error("لا توجد صفوف صالحة للاستيراد");
    try {
      await importAccounts.mutateAsync({ rows });
      toast.success(`تم استيراد ${rows.length} حساب إلى دليل الحسابات`);
      onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر الاستيراد");
    }
  };
  const saveCurrencyEntry = async () => {
    if (!form.code || !form.name) return toast.error("أدخل رمز واسم العملة");
    try {
      await saveCurrency.mutateAsync({
        code: form.code.toUpperCase(),
        name: form.name,
        decimalScale: Number(form.decimalScale) || 2,
      });
      toast.success("تم حفظ العملة وتحديثها في D1");
      void currencies.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ العملة");
    }
  };
  const deleteWarehouse = async () => {
    if (
      mode !== "warehouse" ||
      !form.id ||
      !window.confirm(
        "سيتم حذف المستودع إذا لم يرتبط بحركات أو أرصدة. هل تريد المتابعة؟"
      )
    )
      return;
    try {
      await deleteRecord.mutateAsync({
        legacyForm: "MRPACS004.fmx",
        id: Number(form.id),
        actor: "workbench.user",
      });
      toast.success("تم حذف المستودع أو رفض الحذف بسبب وجود ارتباطات");
      setForm({
        id: "",
        code: "",
        name: "",
        accountType: "ASSET",
        parentCode: "",
        currencyCode: "SAR",
        decimalScale: "2",
        accountNumber: "",
      });
      onRefresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "تعذر حذف المستودع؛ تحقق من وجود حركات أو أرصدة"
      );
    }
  };
  const list = useMemo(() => records.slice(0, 30), [records]);
  return (
    <section className="reference-data-panel" dir="rtl">
      <div className="reference-heading">
        <div>
          <span className="financial-report-kicker">MASTER DATA · LIVE D1</span>
          <h2>
            {icon}
            {title}
          </h2>
          <p>إضافة وتعديل مباشر مع تسجيل العملية في قاعدة Cloudflare D1</p>
        </div>
        <span className="reference-live">متصل حيًا</span>
      </div>
      <div className="reference-tabs">
        <button
          className={tab === "entry" ? "active" : ""}
          onClick={() => setTab("entry")}
        >
          {mode === "accounts" ? "إضافة / تعديل حساب" : "إضافة / تعديل"}
        </button>
        {mode === "accounts" && (
          <>
            <button
              className={tab === "import" ? "active" : ""}
              onClick={() => setTab("import")}
            >
              <Upload size={14} /> استيراد دليل الحسابات
            </button>
            <button
              className={tab === "currency" ? "active" : ""}
              onClick={() => setTab("currency")}
            >
              <Banknote size={14} /> العملات
            </button>
          </>
        )}
      </div>
      {tab === "import" ? (
        <div className="reference-import">
          <label>
            CSV: code,name,accountType,parentCode,currencyCode,active
            <textarea
              value={csv}
              onChange={event => setCsv(event.target.value)}
              rows={10}
            />
          </label>
          <button
            className="toolbar-main"
            disabled={pending}
            onClick={() => void saveImported()}
          >
            <Upload size={15} /> استيراد إلى D1
          </button>
          <p>
            يمكن استخدام الفاصلة للفصل، والحساب الموجود بنفس الكود سيتم تحديثه.
          </p>
        </div>
      ) : (
        <div className="reference-form">
          <label>
            الكود
            <input
              value={form.code}
              onChange={event => update("code", event.target.value)}
              placeholder={
                mode === "accounts"
                  ? "1300-0001"
                  : mode === "warehouse"
                    ? "MAIN-02"
                    : mode === "cash"
                      ? "CASH-02"
                      : "BANK-02"
              }
            />
          </label>
          <label>
            الاسم
            <input
              value={form.name}
              onChange={event => update("name", event.target.value)}
              placeholder="الاسم"
            />
          </label>
          {mode === "accounts" && (
            <>
              <label>
                نوع الحساب
                <select
                  value={form.accountType}
                  onChange={event => update("accountType", event.target.value)}
                >
                  <option>ASSET</option>
                  <option>LIABILITY</option>
                  <option>EQUITY</option>
                  <option>REVENUE</option>
                  <option>EXPENSE</option>
                  <option>OTHER</option>
                </select>
              </label>
              <label>
                الحساب الأب
                <input
                  value={form.parentCode}
                  onChange={event => update("parentCode", event.target.value)}
                  placeholder="1300"
                />
              </label>
            </>
          )}
          {mode === "bank" && (
            <label>
              رقم الحساب
              <input
                value={form.accountNumber}
                onChange={event => update("accountNumber", event.target.value)}
              />
            </label>
          )}
          {mode !== "warehouse" && (
            <label>
              العملة
              <select
                value={form.currencyCode}
                onChange={event => update("currencyCode", event.target.value)}
              >
                {(currencies.data as Row[] | undefined)?.map(currency => (
                  <option
                    key={val(currency, "code")}
                    value={val(currency, "code")}
                  >
                    {val(currency, "code")} · {val(currency, "name")}
                  </option>
                )) || <option>SAR</option>}
              </select>
            </label>
          )}
          <div className="reference-form-actions">
            <button
              className="toolbar-main reference-save"
              disabled={pending}
              onClick={() => void save()}
            >
              <Save size={15} /> حفظ مباشر
            </button>
            {mode === "warehouse" && form.id && (
              <button
                className="report-action danger"
                disabled={pending}
                onClick={() => void deleteWarehouse()}
              >
                <Trash2 size={14} /> حذف المستودع
              </button>
            )}
          </div>
        </div>
      )}
      {tab === "currency" && (
        <div className="reference-form currency-form">
          <label>
            رمز العملة
            <input
              maxLength={3}
              value={form.code}
              onChange={event => update("code", event.target.value)}
              placeholder="USD"
            />
          </label>
          <label>
            اسم العملة
            <input
              value={form.name}
              onChange={event => update("name", event.target.value)}
              placeholder="US Dollar"
            />
          </label>
          <label>
            المنازل العشرية
            <input
              type="number"
              min="0"
              max="6"
              value={form.decimalScale}
              onChange={event => update("decimalScale", event.target.value)}
            />
          </label>
          <button
            className="toolbar-main reference-save"
            disabled={pending}
            onClick={() => void saveCurrencyEntry()}
          >
            <Save size={15} /> حفظ / تعديل العملة
          </button>
        </div>
      )}
      <div className="reference-list">
        <div className="reference-list-title">
          <b>السجلات الحالية</b>
          <span>{list.length} سجل</span>
        </div>
        {list.map((row, index) => (
          <button
            className="reference-row"
            key={String(row.id ?? row.code ?? index)}
            onClick={() =>
              setForm(current => ({
                ...current,
                id: val(row, "id"),
                code: val(row, "code"),
                name: val(row, "name") || val(row, "description"),
                accountType: val(row, "accountType"),
                currencyCode: val(row, "currencyCode", "SAR"),
              }))
            }
          >
            <span>{val(row, "code")}</span>
            <strong>
              {val(row, "name") ||
                val(row, "description") ||
                val(row, "legalName")}
            </strong>
            <small>
              {val(row, "accountType") || val(row, "status") || "ACTIVE"}
            </small>
          </button>
        ))}
      </div>
    </section>
  );
}
