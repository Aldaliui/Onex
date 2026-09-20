import { AlertCircle, CheckCircle2, Clock3, ExternalLink, FileCheck2, Loader2, RefreshCw, Send, ShieldAlert, XCircle } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

export type EInvoiceStatusPanelProps = {
  invoiceId: number;
  invoiceStatus?: "DRAFT" | "POSTED" | "REVERSED";
  documentNumber?: string;
  actor?: string;
  compact?: boolean;
};

type EInvoiceStatus = "QUEUED" | "SUBMITTED" | "ACCEPTED" | "REJECTED" | "FAILED";

type EInvoiceSubmissionView = {
  status?: EInvoiceStatus | string;
  provider?: string | null;
  externalId?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  updatedAt?: Date | string | null;
  submittedAt?: Date | string | null;
  createdAt?: Date | string | null;
};

type StatusMeta = {
  label: string;
  description: string;
  tone: "neutral" | "info" | "success" | "warning" | "danger";
  icon: typeof Clock3;
};

const statusMeta: Record<EInvoiceStatus, StatusMeta> = {
  QUEUED: { label: "في قائمة الانتظار", description: "تم تسجيل الطلب وسيبدأ الإرسال قريبًا.", tone: "neutral", icon: Clock3 },
  SUBMITTED: { label: "تم الإرسال", description: "استلم المزود الطلب ويجري التحقق منه.", tone: "info", icon: Loader2 },
  ACCEPTED: { label: "مقبولة", description: "تم قبول الفاتورة من مزود الفوترة الإلكترونية.", tone: "success", icon: CheckCircle2 },
  REJECTED: { label: "مرفوضة", description: "استلم المزود الطلب لكنه رفض محتوى الفاتورة.", tone: "danger", icon: XCircle },
  FAILED: { label: "فشل الإرسال", description: "تعذر الاتصال بالمزود أو معالجة الطلب.", tone: "warning", icon: AlertCircle },
};

function normalizeStatus(value: unknown): EInvoiceStatus | null {
  return typeof value === "string" && value in statusMeta ? (value as EInvoiceStatus) : null;
}

function formatDate(value: unknown) {
  if (!value) return "غير متوفر";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "غير متوفر";
  return new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function statusText(status: EInvoiceStatus | null) {
  return status ? statusMeta[status] : { label: "لم تُرسل بعد", description: "يمكن إرسال الفاتورة بعد ترحيلها.", tone: "neutral" as const, icon: FileCheck2 };
}

export default function EInvoiceStatusPanel({ invoiceId, invoiceStatus = "POSTED", documentNumber, actor = "workbench.user", compact = false }: EInvoiceStatusPanelProps) {
  const utils = trpc.useUtils();
  const enabled = Number.isInteger(invoiceId) && invoiceId > 0;
  const statusQuery = trpc.eInvoices.status.useQuery({ invoiceId }, {
    enabled,
    refetchInterval: (query) => {
      const latest = normalizeStatus(query.state.data?.[0]?.status);
      return latest === "QUEUED" || latest === "SUBMITTED" ? 5000 : false;
    },
  });
  const providerQuery = trpc.eInvoices.provider.useQuery(undefined, { enabled });
  const submitMutation = trpc.eInvoices.submit.useMutation({
    onSuccess: async (result) => {
      await utils.eInvoices.status.invalidate({ invoiceId });
      if (result.status === "ACCEPTED") toast.success("تم قبول الفاتورة إلكترونيًا");
      else if (result.status === "REJECTED") toast.error("رفض مزود الفوترة الإلكترونية الفاتورة");
      else if (result.status === "FAILED") toast.error(result.errorMessage || "تعذر إرسال الفاتورة");
      else toast.info("تم إرسال الفاتورة وجارٍ التحقق منها");
    },
    onError: (error) => toast.error(error.message || "تعذر إرسال الفاتورة الإلكترونية"),
  });

  const latest = statusQuery.data?.[0] as EInvoiceSubmissionView | undefined;
  const currentStatus = normalizeStatus(latest?.status);
  const meta = statusText(currentStatus);
  const Icon = meta.icon;
  const locked = invoiceStatus !== "POSTED";
  const pending = currentStatus === "QUEUED" || currentStatus === "SUBMITTED";
  const accepted = currentStatus === "ACCEPTED";
  const canSubmit = enabled && !locked && !pending && !accepted && !submitMutation.isPending;

  const submit = () => {
    if (locked) {
      toast.info("يجب ترحيل الفاتورة قبل إرسالها للفوترة الإلكترونية");
      return;
    }
    submitMutation.mutate({
      invoiceId,
      actor,
      requestId: `FRONTEND:EINVOICE:${invoiceId}:${Date.now()}`,
    });
  };

  return (
    <section className={`einvoice-panel einvoice-panel-${meta.tone}${compact ? " einvoice-panel-compact" : ""}`} dir="rtl" aria-label="حالة الفاتورة الإلكترونية">
      <div className="einvoice-panel-heading">
        <div className="einvoice-panel-title-wrap">
          <div className="einvoice-panel-icon" aria-hidden="true"><ShieldAlert size={17} /></div>
          <div>
            <p className="einvoice-panel-kicker">E-INVOICE GATEWAY</p>
            <h3>الفوترة الإلكترونية</h3>
            {documentNumber && <span className="einvoice-panel-document">{documentNumber} · #{invoiceId}</span>}
          </div>
        </div>
        <span className={`einvoice-status-badge ${meta.tone}`}><Icon className={pending ? "einvoice-spin" : undefined} size={14} />{meta.label}</span>
      </div>

      <div className="einvoice-status-message">
        <Icon size={18} aria-hidden="true" />
        <div><strong>{meta.label}</strong><p>{meta.description}</p></div>
      </div>

      <div className="einvoice-panel-details">
        <div><span>المزود</span><strong>{latest?.provider || (providerQuery.data?.configured ? "مزود خارجي" : "LOCAL_SANDBOX")}</strong></div>
        <div><span>آخر تحديث</span><strong>{formatDate(latest?.updatedAt || latest?.submittedAt || latest?.createdAt)}</strong></div>
        {latest?.externalId && <div><span>رقم المزود</span><strong className="einvoice-ltr">{latest.externalId}</strong></div>}
      </div>

      {(latest?.errorMessage || latest?.errorCode) && (
        <div className="einvoice-error-box" role="alert"><AlertCircle size={15} /><div><strong>{latest.errorCode || "خطأ في الإرسال"}</strong><p>{latest.errorMessage || "تحقق من بيانات الفاتورة وإعدادات المزود."}</p></div></div>
      )}

      {!compact && (
        <div className="einvoice-flow" aria-label="مراحل الفوترة الإلكترونية">
          {(["QUEUED", "SUBMITTED", "ACCEPTED"] as EInvoiceStatus[]).map((step, index) => {
            const stepMeta = statusMeta[step];
            const completed = currentStatus === "ACCEPTED" || (currentStatus === "SUBMITTED" && index < 2);
            const active = currentStatus === step;
            return <div className="einvoice-flow-step" key={step}><span className={`${completed ? "completed" : ""} ${active ? "active" : ""}`}>{completed ? "✓" : index + 1}</span><small>{stepMeta.label}</small>{index < 2 && <i className={completed ? "completed" : ""} />}</div>;
          })}
        </div>
      )}

      <div className="einvoice-panel-actions">
        <Button type="button" variant="outline" size="sm" onClick={() => void statusQuery.refetch()} disabled={statusQuery.isFetching || submitMutation.isPending}>
          <RefreshCw className={statusQuery.isFetching ? "einvoice-spin" : undefined} size={14} />تحديث
        </Button>
        <Button type="button" size="sm" onClick={submit} disabled={!canSubmit}>
          {submitMutation.isPending ? <Loader2 className="einvoice-spin" size={14} /> : currentStatus === "FAILED" || currentStatus === "REJECTED" ? <RefreshCw size={14} /> : <Send size={14} />}
          {submitMutation.isPending ? "جارٍ الإرسال..." : currentStatus === "FAILED" || currentStatus === "REJECTED" ? "إعادة الإرسال" : "إرسال للمزود"}
        </Button>
        {latest?.externalId && <a className="einvoice-external-link" href={`#einvoice-${latest.externalId}`}><ExternalLink size={13} />تفاصيل المزود</a>}
      </div>

      {locked && <p className="einvoice-panel-hint">الحالة الحالية للفاتورة {invoiceStatus}. يتاح الإرسال بعد اكتمال الترحيل.</p>}
      {statusQuery.error && <p className="einvoice-panel-hint einvoice-hint-error">تعذر قراءة حالة الإرسال. حاول التحديث مرة أخرى.</p>}
    </section>
  );
}
