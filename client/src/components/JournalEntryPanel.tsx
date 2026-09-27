import { useMemo, useReducer, useState } from "react";
import {
  Plus,
  Save,
  Trash2,
  CheckCircle2,
  Send,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  AccountingPanel,
  ValidationSummary,
} from "@/components/accounting/AccountingPrimitives";
import {
  emptyJournalLine,
  journalReducer,
  type JournalLineState,
} from "@/state/journalReducer";
import { journalSchema } from "@/forms/journalSchema";

type Line = JournalLineState;
const statusLabels: Record<string, string> = {
  DRAFT: "مسودة",
  VALIDATED: "متحقق",
  APPROVED: "معتمد",
  POSTED: "مرحّل",
  REVERSED: "معكوس",
};

export default function JournalEntryPanel() {
  const accounts = trpc.windows.accountCatalog.useQuery({ limit: 500 });
  const createDraft = trpc.windows.createJournalDraft.useMutation();
  const validate = trpc.windows.validateJournal.useMutation();
  const approve = trpc.windows.approveJournal.useMutation();
  const post = trpc.windows.postJournal.useMutation();
  const reverse = trpc.windows.reverseJournal.useMutation();
  const [journalId, setJournalId] = useState<number>();
  const [status, setStatus] = useState("DRAFT");
  const [companyId] = useState("1");
  const [errors, setErrors] = useState<string[]>([]);
  const [draft, dispatch] = useReducer(journalReducer, {
    journalNo: `JV-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`,
    journalDate: new Date().toISOString().slice(0, 10),
    entryType: "MANUAL",
    sourceType: "MANUAL",
    branchId: "1",
    warehouseId: "1",
    periodId: "",
    description: "",
    lines: [emptyJournalLine(), emptyJournalLine()],
  });
  const {
    journalNo,
    journalDate,
    entryType,
    sourceType,
    branchId,
    warehouseId,
    periodId,
    description,
    lines,
  } = draft;
  const accountRows = (accounts.data || []) as {
    code: string;
    name: string;
    active?: number;
    status?: string;
    allowPosting?: number;
  }[];
  const totals = useMemo(
    () =>
      lines.reduce(
        (result, line) => ({
          debit: result.debit + Number(line.debit || 0),
          credit: result.credit + Number(line.credit || 0),
        }),
        { debit: 0, credit: 0 }
      ),
    [lines]
  );
  const difference = totals.debit - totals.credit;
  const balanced = Math.abs(difference) < 0.000001;
  const canPost = Boolean(journalId) && status === "APPROVED" && balanced;
  const update = (index: number, key: keyof Line, value: string) =>
    dispatch({ type: "updateLine", index, field: key, value });
  const validateLocal = () => {
    const result = journalSchema.safeParse(draft);
    const next = result.success
      ? []
      : result.error.issues.map(issue => issue.message);
    if (lines.some(line => Number(line.debit) > 0 && Number(line.credit) > 0))
      next.push("السطر لا يحتوي مدينًا ودائنًا معًا");
    if (!balanced)
      next.push(`القيد غير متوازن؛ الفرق ${difference.toFixed(2)}`);
    setErrors(next);
    return !next.length;
  };
  const create = async () => {
    if (!validateLocal()) return;
    try {
      const result = await createDraft.mutateAsync({
        journalNo,
        journalDate,
        entryType,
        sourceType,
        description,
        context: {
          companyId: Number(companyId),
          branchId: Number(branchId),
          warehouseId: Number(warehouseId),
          fiscalPeriodId: Number(periodId),
          currencyCode: "SAR",
          languageCode: "ar",
        },
        lines,
      });
      setJournalId(result.id);
      setStatus("DRAFT");
      toast.success(`حُفظت المسودة ${journalNo}`);
    } catch (error) {
      setErrors([error instanceof Error ? error.message : "تعذر حفظ المسودة"]);
    }
  };
  const runTransition = async (
    action: "validate" | "approve" | "post" | "reverse"
  ) => {
    if (!journalId) return;
    if (action === "post" && !canPost) return;
    try {
      const result =
        action === "validate"
          ? await validate.mutateAsync({ id: journalId })
          : action === "approve"
            ? await approve.mutateAsync({ id: journalId })
            : action === "post"
              ? await post.mutateAsync({ id: journalId })
              : await reverse.mutateAsync({ id: journalId });
      setStatus(result.status);
      toast.success(
        `تم تحديث حالة القيد إلى ${statusLabels[result.status] || result.status}`
      );
    } catch (error) {
      setErrors([
        error instanceof Error ? error.message : "تعذر تحديث حالة القيد",
      ]);
    }
  };
  return (
    <AccountingPanel
      title="القيد اليومي"
      subtitle="مسودة ← تحقق ← اعتماد ← ترحيل، مع منع الترحيل للقيد غير المتوازن"
      actions={
        <span className={`journal-status ${status.toLowerCase()}`}>
          {statusLabels[status] || status}
        </span>
      }
    >
      <ValidationSummary errors={errors} />
      <div className="journal-header-fields">
        <label>
          رقم القيد
          <input
            value={journalNo}
            disabled={status !== "DRAFT"}
            onChange={event =>
              dispatch({
                type: "setField",
                field: "journalNo",
                value: event.target.value,
              })
            }
          />
        </label>
        <label>
          التاريخ
          <input
            type="date"
            value={journalDate}
            disabled={status !== "DRAFT"}
            onChange={event =>
              dispatch({
                type: "setField",
                field: "journalDate",
                value: event.target.value,
              })
            }
          />
        </label>
        <label>
          الشركة
          <input value={companyId} disabled />
        </label>
        <label>
          الفرع
          <input
            value={branchId}
            disabled={status !== "DRAFT"}
            onChange={event =>
              dispatch({
                type: "setField",
                field: "branchId",
                value: event.target.value,
              })
            }
          />
        </label>
        <label>
          المستودع
          <input
            value={warehouseId}
            disabled={status !== "DRAFT"}
            onChange={event =>
              dispatch({
                type: "setField",
                field: "warehouseId",
                value: event.target.value,
              })
            }
          />
        </label>
        <label>
          الفترة المالية
          <input
            value={periodId}
            disabled={status !== "DRAFT"}
            onChange={event =>
              dispatch({
                type: "setField",
                field: "periodId",
                value: event.target.value,
              })
            }
            placeholder="رقم الفترة"
          />
        </label>
        <label>
          نوع القيد
          <select
            value={entryType}
            disabled={status !== "DRAFT"}
            onChange={event =>
              dispatch({
                type: "setField",
                field: "entryType",
                value: event.target.value,
              })
            }
          >
            <option value="MANUAL">قيد يومي</option>
            <option value="ADJUSTMENT">تسوية</option>
            <option value="OPENING">افتتاحي</option>
          </select>
        </label>
        <label>
          المصدر
          <select
            value={sourceType}
            disabled={status !== "DRAFT"}
            onChange={event =>
              dispatch({
                type: "setField",
                field: "sourceType",
                value: event.target.value,
              })
            }
          >
            <option value="MANUAL">يدوي</option>
            <option value="SALES_INVOICE">فاتورة مبيعات</option>
            <option value="PURCHASE_INVOICE">فاتورة مشتريات</option>
            <option value="ADJUSTMENT_NOTE">تسوية</option>
          </select>
        </label>
        <label className="journal-description">
          الوصف العام
          <input
            value={description}
            disabled={status !== "DRAFT"}
            onChange={event =>
              dispatch({
                type: "setField",
                field: "description",
                value: event.target.value,
              })
            }
            placeholder="وصف العملية"
          />
        </label>
      </div>
      <div className="journal-grid">
        <div className="journal-grid-head">
          <span>الحساب</span>
          <span>بيان السطر</span>
          <span>العملة / الصرف</span>
          <span>مرجع</span>
          <span>مدين</span>
          <span>دائن</span>
          <span />
        </div>
        {lines.map((line, index) => (
          <div className="journal-grid-row" key={index}>
            <select
              value={line.accountCode}
              disabled={status !== "DRAFT"}
              onChange={event =>
                update(index, "accountCode", event.target.value)
              }
            >
              <option value="">اختر الحساب</option>
              {accountRows
                .filter(
                  account =>
                    account.status !== "BLOCKED" &&
                    account.status !== "CLOSED" &&
                    account.allowPosting !== 0 &&
                    account.active !== 0
                )
                .map(account => (
                  <option key={account.code} value={account.code}>
                    {account.code} · {account.name}
                  </option>
                ))}
            </select>
            <input
              value={line.description}
              disabled={status !== "DRAFT"}
              onChange={event =>
                update(index, "description", event.target.value)
              }
              placeholder="بيان السطر"
            />
            <span className="journal-currency">
              <input
                maxLength={3}
                value={line.currencyCode}
                disabled={status !== "DRAFT"}
                onChange={event =>
                  update(
                    index,
                    "currencyCode",
                    event.target.value.toUpperCase()
                  )
                }
              />
              <input
                inputMode="decimal"
                value={line.exchangeRate}
                disabled={status !== "DRAFT"}
                onChange={event =>
                  update(
                    index,
                    "exchangeRate",
                    event.target.value.replace(/[^0-9.]/g, "")
                  )
                }
              />
            </span>
            <input
              value={line.reference}
              disabled={status !== "DRAFT"}
              onChange={event => update(index, "reference", event.target.value)}
              placeholder="مرجع"
            />
            <input
              inputMode="decimal"
              value={line.debit}
              disabled={status !== "DRAFT"}
              onChange={event =>
                update(
                  index,
                  "debit",
                  event.target.value.replace(/[^0-9.]/g, "")
                )
              }
            />
            <input
              inputMode="decimal"
              value={line.credit}
              disabled={status !== "DRAFT"}
              onChange={event =>
                update(
                  index,
                  "credit",
                  event.target.value.replace(/[^0-9.]/g, "")
                )
              }
            />
            <button
              className="remove-line"
              disabled={status !== "DRAFT"}
              onClick={() => dispatch({ type: "removeLine", index })}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
      <div className="journal-status-board">
        <span>
          المدين <b>{totals.debit.toFixed(2)}</b>
        </span>
        <span>
          الدائن <b>{totals.credit.toFixed(2)}</b>
        </span>
        <span>
          الفرق{" "}
          <b className={balanced ? "ok" : "error"}>{difference.toFixed(2)}</b>
        </span>
        <span>
          التوازن <b>{balanced ? "متوازن" : "غير متوازن"}</b>
        </span>
        <span>
          الفترة <b>{periodId ? "محددة" : "تحتاج تحديدًا"}</b>
        </span>
        <span>
          الاعتماد <b>{statusLabels[status] || status}</b>
        </span>
      </div>
      <div className="journal-footer">
        <button
          className="report-action"
          disabled={status !== "DRAFT"}
          onClick={() => dispatch({ type: "addLine" })}
        >
          <Plus size={14} /> إضافة سطر
        </button>
        <div className="journal-workflow-actions">
          <button
            className="toolbar-main"
            disabled={createDraft.isPending || status !== "DRAFT" || !balanced}
            onClick={() => void create()}
          >
            <Save size={15} /> حفظ مسودة
          </button>
          <button
            className="report-action"
            disabled={!journalId || status !== "DRAFT"}
            onClick={() => void runTransition("validate")}
          >
            <CheckCircle2 size={14} /> تحقق
          </button>
          <button
            className="report-action"
            disabled={!journalId || status !== "VALIDATED"}
            onClick={() => void runTransition("approve")}
          >
            <CheckCircle2 size={14} /> اعتماد
          </button>
          <button
            className="toolbar-main"
            disabled={!canPost || post.isPending}
            onClick={() => void runTransition("post")}
          >
            <Send size={14} /> ترحيل
          </button>
          <button
            className="report-action danger"
            disabled={!journalId || status !== "POSTED"}
            onClick={() => void runTransition("reverse")}
          >
            <RotateCcw size={14} /> عكس
          </button>
        </div>
      </div>
    </AccountingPanel>
  );
}
