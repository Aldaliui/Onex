import { useRef, useState } from "react";
import { Cloud, Download, FileDown, HardDrive, RefreshCcw, ShieldCheck, Upload } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { importOfflineOperations, listOfflineOperations } from "@/lib/offlineSync";

export default function BackupRestorePanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const create = trpc.backups.create.useMutation();
  const upload = trpc.backups.upload.useMutation();
  const validate = trpc.backups.validate.useMutation();
  const downloadJson = (value: unknown, name: string) => { const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url); };
  const localBackup = async () => { setBusy(true); try { const operations = await listOfflineOperations(); const snapshot = await create.mutateAsync({ offlineOperations: operations }); downloadJson(snapshot, `onex-backup-${new Date().toISOString().slice(0, 10)}.json`); toast.success("تم تنزيل النسخة الاحتياطية المحلية"); } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر إنشاء النسخة المحلية"); } finally { setBusy(false); } };
  const cloudBackup = async () => { setBusy(true); try { const operations = await listOfflineOperations(); const result = await upload.mutateAsync({ offlineOperations: operations }); toast.success(`تم رفع النسخة السحابية المشفرة (${Object.values(result.tableCounts).reduce((a, b) => a + b, 0)} سجل)`); } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر رفع النسخة السحابية"); } finally { setBusy(false); } };
  const restore = async (file: File) => { setBusy(true); try { const parsed = JSON.parse(await file.text()); const result = await validate.mutateAsync({ backup: parsed }); const imported = await importOfflineOperations(Array.isArray(parsed.offlineOperations) ? parsed.offlineOperations : []); toast.success(`${result.message} تمت إضافة ${imported} عملية محلية إلى الطابور.`); } catch (error) { toast.error(error instanceof Error ? error.message : "النسخة غير صالحة أو تعذر استعادتها"); } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; } };
  return <section className="backup-panel setup-card" dir="rtl"><div className="setup-card-title"><ShieldCheck size={18} /><div><b>النسخ الاحتياطي والاستعادة</b><small>BACKUP / RESTORE CENTER</small></div></div><p className="backup-description">أنشئ لقطة زمنية من بيانات ONEX وطابور العمليات المحلي. النسخة السحابية تُشفّر قبل رفعها، والاستعادة تتحقق من الإصدار قبل استيراد العمليات.</p><div className="backup-actions"><button disabled={busy} onClick={localBackup}><HardDrive size={16} /> نسخة محلية</button><button disabled={busy} onClick={cloudBackup}><Cloud size={16} /> نسخة سحابية مشفرة</button><button disabled={busy} onClick={() => fileRef.current?.click()}><Upload size={16} /> استعادة من ملف</button><input ref={fileRef} type="file" accept="application/json,.onex-backup" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void restore(file); }} /></div><div className="backup-notes"><span><Download size={14} /> النسخة المحلية لا تغادر جهازك.</span><span><FileDown size={14} /> الاستعادة لا تحذف بيانات الخادم تلقائيًا.</span><span><RefreshCcw size={14} /> راجع النسخة قبل الاستعادة.</span></div></section>;
}
