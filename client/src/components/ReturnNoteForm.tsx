import { useMemo, useState } from "react";
import { Search, RefreshCw, Save, Send } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

type ReturnKind = "SALES_RETURN" | "PURCHASE_RETURN";
type ReturnLine = { itemId: number; itemCode?: string | null; description?: string | null; unit?: string | null; quantity: string; unitPrice: string; taxAmount: string };

export default function ReturnNoteForm({ initialKind = "SALES_RETURN" }: { initialKind?: ReturnKind }) {
  const [kind, setKind] = useState<ReturnKind>(initialKind);
  const [partySearch, setPartySearch] = useState("");
  const [partyId, setPartyId] = useState<number>();
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoiceId, setInvoiceId] = useState<number>();
  const [reason, setReason] = useState("");
  const [lines, setLines] = useState<ReturnLine[]>([]);
  const invoiceType = kind === "SALES_RETURN" ? "SALE" : "PURCHASE";
  const documentKind = kind;
  const partyQuery = kind === "SALES_RETURN" ? trpc.windows.records.useQuery({ legacyForm: "ARST003", search: partySearch || undefined, limit: 8 }) : trpc.windows.records.useQuery({ legacyForm: "APSI002", search: partySearch || undefined, limit: 8 });
  const invoiceQuery = trpc.adjustments.searchInvoices.useQuery({ invoiceType, search: invoiceSearch || undefined, partyId, limit: 8 }, { enabled: Boolean(partyId) });
  const sourceQuery = trpc.adjustments.source.useQuery({ invoiceId: invoiceId!, invoiceType }, { enabled: Boolean(invoiceId) });
  const nextNumber = trpc.adjustments.nextNumber.useQuery({ documentKind });
  const create = trpc.adjustments.create.useMutation();
  const post = trpc.adjustments.post.useMutation();
  const partyRows = Array.isArray(partyQuery.data) ? partyQuery.data : ((partyQuery.data as any)?.rows ?? []);
  const invoiceRows = Array.isArray(invoiceQuery.data) ? invoiceQuery.data : ((invoiceQuery.data as any)?.rows ?? []);
  const selectedParty = useMemo(() => partyRows.find((row: any) => Number(row.id) === partyId), [partyRows, partyId]);
  const source = sourceQuery.data as any;
  const total = lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0) + Number(line.taxAmount || 0), 0);
  const chooseInvoice = (row: any) => { setInvoiceId(Number(row.id || row.invoiceId)); setInvoiceSearch(String(row.docNo || row.id)); };
  const loadSource = () => { if (!source?.lines) return; setLines(source.lines.map((line: any) => ({ itemId: Number(line.itemId), itemCode: line.itemCode, description: line.description, unit: line.unit || "وحدة", quantity: String(line.quantity || "0"), unitPrice: String(line.unitPrice || "0"), taxAmount: String(line.taxAmount || "0") }))); };
  const updateLine = (index: number, key: keyof ReturnLine, value: string) => setLines((current) => current.map((line, i) => i === index ? { ...line, [key]: value } : line));
  const save = async (shouldPost = false) => { if (!invoiceId || !lines.length) { toast.error("اختر الفاتورة وأضف صنفاً واحداً على الأقل"); return; } try { const result = await create.mutateAsync({ docNo: nextNumber.data || `${kind === "SALES_RETURN" ? "SR" : "PR"}-${Date.now()}`, documentKind, originalInvoiceId: invoiceId, reason: reason || undefined, lines: lines.map(({ itemId, quantity, unitPrice, taxAmount }) => ({ itemId, quantity, unitPrice, taxAmount })), actor: "workbench.user" }); if (shouldPost) await post.mutateAsync({ adjustmentId: Number((result as any).adjustmentId), actor: "workbench.user" }); toast.success(shouldPost ? "تم حفظ وترحيل المرتجع" : "تم حفظ المرتجع كمسودة"); } catch (error: any) { toast.error(error?.message || "تعذر حفظ المرتجع"); } };
  return <section className="return-note-panel classic-invoice" dir="rtl">
    <div className="return-note-heading"><div><span className="financial-report-kicker">ONEX · RETURNS / ADJUSTMENT NOTE</span><h2>{kind === "SALES_RETURN" ? "مرتجع مبيعات" : "مرتجع مشتريات"}</h2><p>ربط مباشر بالفاتورة الأصلية والتحقق من كميات الإرجاع</p></div><span className="report-status-dot">{sourceQuery.isFetching ? "جارٍ الجلب" : "متصل"}</span></div>
    <div className="return-note-top">
      <label>نوع الفاتورة<select value={kind} onChange={(e) => { setKind(e.target.value as ReturnKind); setPartyId(undefined); setInvoiceId(undefined); setLines([]); }}><option value="SALES_RETURN">مرتجع مبيعات</option><option value="PURCHASE_RETURN">مرتجع مشتريات</option></select></label>
      <label>التاريخ<input type="date" value={new Date().toISOString().slice(0, 10)} readOnly /></label>
      <label>الرقم التصاعدي<input value={nextNumber.data || "جارٍ التوليد..."} readOnly /></label>
      <label>{kind === "SALES_RETURN" ? "رقم العميل" : "رقم المورد"}<input value={partySearch} onChange={(e) => { setPartySearch(e.target.value); setPartyId(undefined); }} placeholder={kind === "SALES_RETURN" ? "CUST-001" : "SUP-001"} />{partySearch && !partyId && <div className="return-autocomplete">{partyRows.map((row: any) => <button type="button" key={row.id} onClick={() => { setPartyId(Number(row.id)); setPartySearch(`${row.code} · ${row.legalName}`); }}>{row.code} · {row.legalName}</button>)}</div>}</label>
      <label>الرصيد السابق<input value={source?.previousBalance ?? "0.00"} readOnly /></label>
      <label>الفاتورة الأصلية<input value={invoiceSearch} onChange={(e) => setInvoiceSearch(e.target.value)} disabled={!partyId} placeholder={partyId ? "ابحث برقم الفاتورة" : "اختر العميل/المورد أولاً"} />{partyId && invoiceSearch && !invoiceId && <div className="return-autocomplete">{invoiceRows.map((row: any) => <button type="button" key={row.id} onClick={() => chooseInvoice(row)}>{row.docNo} · {row.grandTotal} · {row.status}</button>)}</div>}</label>
      <label className="return-note-reason">السبب<input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="سبب الإرجاع أو ملاحظة" /></label>
    </div>
    <div className="return-source-actions"><span>{selectedParty ? `الطرف: ${(selectedParty as any).legalName}` : "لم يتم اختيار الطرف"}</span><span>{source?.invoice?.docNo ? `الفاتورة: ${source.invoice.docNo}` : "لم يتم اختيار الفاتورة"}</span><button type="button" className="report-action" onClick={loadSource} disabled={!source?.lines}><RefreshCw size={14} /> جلب أصناف الفاتورة</button></div>
    <div className="return-grid-wrap"><table className="return-grid"><thead><tr><th>#</th><th>رقم الصنف / البحث</th><th>وصف الصنف</th><th>الكمية</th><th>السعر</th><th>الوحدة</th><th>الضريبة</th><th>الإجمالي</th></tr></thead><tbody>{lines.length ? lines.map((line, index) => <tr key={`${line.itemId}-${index}`}><td>{index + 1}</td><td><input value={line.itemCode || line.itemId} onChange={(e) => updateLine(index, "itemCode", e.target.value)} /></td><td>{line.description || "—"}</td><td><input type="number" min="0.001" step="0.001" value={line.quantity} onChange={(e) => updateLine(index, "quantity", e.target.value)} /></td><td><input type="number" min="0" step="0.01" value={line.unitPrice} onChange={(e) => updateLine(index, "unitPrice", e.target.value)} /></td><td>{line.unit || "وحدة"}</td><td><input type="number" min="0" step="0.01" value={line.taxAmount} onChange={(e) => updateLine(index, "taxAmount", e.target.value)} /></td><td>{(Number(line.quantity || 0) * Number(line.unitPrice || 0) + Number(line.taxAmount || 0)).toFixed(2)}</td></tr>) : <tr><td colSpan={8} className="return-empty">اختر الطرف ثم الفاتورة، واضغط «جلب أصناف الفاتورة» لإظهار الكمية والسعر والوحدة.</td></tr>}</tbody><tfoot><tr><td colSpan={7}>الإجمالي</td><td>{total.toFixed(2)}</td></tr></tfoot></table></div>
    <div className="return-note-footer"><span>يدعم العمل دون اتصال عبر طابور المزامنة</span><div><button type="button" className="report-action" onClick={() => void save(false)} disabled={create.isPending}><Save size={14} /> حفظ مسودة</button><button type="button" className="report-action primary" onClick={() => void save(true)} disabled={create.isPending || post.isPending}><Send size={14} /> حفظ وترحيل</button></div></div>
  </section>;
}
