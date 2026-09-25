import { useMemo, useState } from "react";
import { ArrowDownToLine, BadgeCheck, CalendarDays, CircleDollarSign, FileText, Package, Pencil, Plus, RotateCcw, Search, Send, Trash2, UserRound, Warehouse } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import EInvoiceStatusPanel from "@/components/EInvoiceStatusPanel";

type Line = { itemId: number; itemCode: string; description: string; quantity: string; unitPrice: string; taxAmount: string };

const formatMoney = (value: number, currency = "SAR") => `${value.toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

export default function SalesInvoiceForm() {
  const master = trpc.masterData.useQuery();
  const createInvoice = trpc.invoices.create.useMutation();
  const updateInvoice = trpc.invoices.update.useMutation();
  const postInvoice = trpc.invoices.post.useMutation();
  const reverseInvoice = trpc.invoices.reverse.useMutation();
  const offline = useOfflineSync(async (operation) => {
    if (operation.type !== "SALES_INVOICE_CREATE") return "CONFLICT";
    const payload = operation.payload as { invoice: Parameters<typeof createInvoice.mutateAsync>[0]; postNow: boolean };
    const created = await createInvoice.mutateAsync(payload.invoice);
    setInvoiceId(Number(created.invoiceId));
    if (payload.postNow) {
      await postInvoice.mutateAsync({ invoiceId: Number(created.invoiceId), actor: payload.invoice.actor });
      setStatus("POSTED");
    }
    return "SYNCED";
  });
  const [docNo, setDocNo] = useState(`INV-${new Date().getFullYear()}-0001`);
  const [invoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [rowSearch, setRowSearch] = useState<Record<number, string>>({});
  const [customerId, setCustomerId] = useState(0);
  const [warehouseId, setWarehouseId] = useState(0);
  const [currencyCode, setCurrencyCode] = useState("SAR");
  const [exchangeRate, setExchangeRate] = useState("1");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [paidAmount, setPaidAmount] = useState("0");
  const [paymentReference, setPaymentReference] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [status, setStatus] = useState<"DRAFT" | "POSTED" | "REVERSED">("DRAFT");
  const [invoiceId, setInvoiceId] = useState<number | null>(null);
  const [lines, setLines] = useState<Line[]>([]);

  const customers = master.data?.customers ?? [];
  const warehouses = master.data?.warehouses ?? [];
  const items = master.data?.items ?? [];
  const balances = (master.data?.balances ?? []) as any[];
  const currencies = master.data?.currencies?.filter((currency: any) => currency.active !== 0) ?? [];
  const selectedCustomer = customers.find((customer: any) => customer.id === customerId) ?? customers[0];
  const selectedWarehouse = warehouses.find((warehouse: any) => warehouse.id === warehouseId) ?? warehouses[0];
  const availableFor = (itemId: number) => {
    const row = balances.find((entry: any) => entry.item?.id === itemId && entry.warehouse?.id === (selectedWarehouse?.id ?? warehouseId));
    return Number(row?.balance?.quantity ?? 0) - Number(row?.balance?.reservedQuantity ?? 0);
  };
  const filteredItems = items.filter((item: any) => `${item.code} ${item.description}`.toLowerCase().includes(itemSearch.toLowerCase())).slice(0, 8);
  const totals = useMemo(() => {
    const subtotal = lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0), 0);
    const tax = lines.reduce((sum, line) => sum + Number(line.taxAmount || 0), 0);
    const total = subtotal + tax;
    const paid = Math.min(Math.max(Number(paidAmount || 0), 0), total);
    return { subtotal, tax, total, paid, remaining: total - paid, localTotal: total * Number(exchangeRate || 0) };
  }, [lines, paidAmount, exchangeRate]);

  const addLine = (item: any) => {
    setLines((current) => [...current, { itemId: item.id, itemCode: item.code, description: item.description, quantity: "1", unitPrice: String(item.salePrice ?? item.unitCost ?? "0"), taxAmount: "0" }]);
    setItemSearch("");
  };
  const updateLine = (index: number, patch: Partial<Line>) => setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));
  const selectLineItem = (index: number, item: any) => { updateLine(index, { itemId: item.id, itemCode: item.code, description: item.description, unitPrice: String(item.salePrice ?? item.unitCost ?? "0") }); setRowSearch((current) => ({ ...current, [index]: "" })); };
  const rowMatches = (index: number) => items.filter((item: any) => `${item.code} ${item.description}`.toLowerCase().includes((rowSearch[index] || "").toLowerCase())).slice(0, 6);
  const reset = () => { setLines([]); setPaidAmount("0"); setPaymentReference(""); setStatus("DRAFT"); setInvoiceId(null); };

  const save = async (postNow: boolean) => {
    if (master.isLoading) return toast.info("جارٍ تحميل بيانات Cloud Onex...");
    if (master.error) return toast.error("تعذر تحميل بيانات العملاء والمخازن والعملات");
    if (!selectedCustomer || !selectedWarehouse || !lines.length) return toast.error("اختر العميل والمستودع وأضف صنفاً واحداً على الأقل");
    if (lines.some((line) => !Number(line.quantity) || Number(line.quantity) <= 0)) return toast.error("يجب أن تكون كمية كل سطر أكبر من صفر");
    const stockIssue = lines.find((line) => { const item = items.find((candidate: any) => candidate.id === line.itemId) as any; return item?.stockFlag !== 0 && Number(line.quantity) > availableFor(line.itemId); });
    if (stockIssue) return toast.error(`الرصيد غير كافٍ للصنف ${stockIssue.itemCode}`);
    if (Number(paidAmount) > totals.total) return toast.error("المبلغ المدفوع لا يمكن أن يتجاوز إجمالي الفاتورة");
    if (["CHECK", "WALLET", "BANK_TRANSFER"].includes(paymentMethod) && Number(paidAmount) > 0 && !paymentReference.trim()) return toast.error("أدخل مرجع الشيك أو عملية الدفع");
    const invoice = { docNo, customerId: selectedCustomer.id, warehouseId: selectedWarehouse.id, currencyCode, exchangeRate, paymentMethod: paymentMethod as "CASH" | "CREDIT" | "CHECK" | "WALLET" | "BANK_TRANSFER", paidAmount, paymentReference: paymentReference || undefined, actor: "workbench.user", lines: lines.map((line) => ({ itemId: line.itemId, quantity: line.quantity, unitPrice: line.unitPrice, taxAmount: line.taxAmount })) };
    const updatingDraft = invoiceId !== null && status === "DRAFT";
    try {
      if (!offline.online) {
        if (updatingDraft) return toast.error("لا يمكن تحديث مسودة محفوظة أثناء عدم الاتصال؛ أعد الاتصال ثم احفظ التعديلات.");
        await offline.enqueue("SALES_INVOICE_CREATE", { invoice, postNow }, `SALES_INVOICE:${docNo}`);
        toast.info("تم حفظ الفاتورة محلياً وستتم مزامنتها عند عودة الاتصال");
        return;
      }
      const saved = updatingDraft
        ? await updateInvoice.mutateAsync({ ...invoice, invoiceId, requestId: `SALES-INVOICE-UPDATE:${invoiceId}:${Date.now()}` })
        : await createInvoice.mutateAsync(invoice);
      setInvoiceId(Number(saved.invoiceId));
      await master.refetch();
      if (postNow) { await postInvoice.mutateAsync({ invoiceId: Number(saved.invoiceId), actor: "workbench.user" }); setStatus("POSTED"); toast.success(`تم حفظ وترحيل ${saved.docNo}`); }
      else toast.success(updatingDraft ? `تم تحديث المسودة ${saved.docNo}` : `تم حفظ ${saved.docNo} كمسودة`);
    } catch (error) { if (!offline.online && !updatingDraft) { await offline.enqueue("SALES_INVOICE_CREATE", { invoice, postNow }, `SALES_INVOICE:${docNo}`); toast.info("تعذر الاتصال؛ أضيفت الفاتورة إلى طابور المزامنة"); } else if (!offline.online) toast.error("تعذر تحديث المسودة؛ أعد الاتصال قبل المحاولة مجددًا."); else toast.error(error instanceof Error ? error.message : "تعذر حفظ الفاتورة"); }
  };

  const reverse = async () => {
    if (!invoiceId || status !== "POSTED") return;
    try {
      await reverseInvoice.mutateAsync({ invoiceId, actor: "workbench.user" });
      setStatus("REVERSED");
      toast.success(`تم عكس الفاتورة ${docNo}`);
      await master.refetch();
    } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر عكس الفاتورة"); }
  };

  return <section className="sales-window ar-workspace" dir="rtl">
    <div className="sales-window-header">
      <div><div className="breadcrumb">ONEX / AR / SALES / <b>ARST004</b></div><h2>فاتورة مبيعات</h2><p>أنشئ الفاتورة، راجع المخزون، ثم رحّلها إلى الحسابات والمخزون من شاشة واحدة.</p></div>
      <div className="sales-header-meta"><span className={`doc-chip ${status === "POSTED" ? "posted" : ""}`}><i />{status === "POSTED" ? "مرحّلة" : status === "REVERSED" ? "معكوسة" : "مسودة"}</span><span className="sync-chip"><i />{offline.online ? "متصل بـ Cloud Onex" : "وضع عدم الاتصال"}</span></div>
    </div>
    <div className="sales-kpis"><div><span>قيمة المستند</span><strong>{formatMoney(totals.total, currencyCode)}</strong><small>قبل الترحيل</small></div><div><span>بنود الفاتورة</span><strong>{lines.length.toString().padStart(2, "0")}</strong><small>صنف في المستند</small></div><div><span>المتبقي للتحصيل</span><strong>{formatMoney(totals.remaining, currencyCode)}</strong><small>{paymentMethod === "CREDIT" ? "فاتورة آجلة" : "بعد الدفع"}</small></div><div><span>حالة المخزون</span><strong className="kpi-success">جاهز</strong><small>فحص الرصيد تلقائي</small></div></div>
    <div className="sales-flow"><div className="flow-label"><BadgeCheck size={16} /><span>مسار المستند</span></div>{["بيانات الفاتورة", "الأصناف", "الدفع", "الترحيل"].map((step, index) => <div className={`flow-step ${index === 0 || lines.length > 0 && index < 3 ? "active" : ""}`} key={step}><b>{index + 1}</b><span>{step}</span></div>)}</div>
    <div className="ar-grid sales-form-grid">
      <Card className="panel invoice-form"><CardHeader><div><p className="panel-kicker">DOCUMENT HEADER · ARST004</p><CardTitle>بيانات الفاتورة</CardTitle></div><div className="invoice-toolbar"><Button size="sm" variant="outline" onClick={reset}><RotateCcw size={14} />جديد</Button><Button size="sm" variant="outline" onClick={() => toast.info("أدخل رقم المستند ثم استخدم البحث") }><Search size={14} />بحث</Button><Button size="sm" variant="outline" disabled={status !== "DRAFT"} onClick={() => toast.info("الفاتورة في وضع التعديل") }><Pencil size={14} />تعديل</Button></div></CardHeader>
        <CardContent><div className="form-grid sales-header-fields">
          <label><span><CalendarDays size={13} /> التاريخ</span><input type="date" value={invoiceDate} readOnly /></label><label><span><FileText size={13} /> رقم المستند</span><Input value={docNo} disabled={status !== "DRAFT"} onChange={(event) => setDocNo(event.target.value)} /></label><label><span>العميل</span><select value={selectedCustomer?.id ?? ""} disabled={status !== "DRAFT"} onChange={(event) => setCustomerId(Number(event.target.value))}>{customers.map((customer: any) => <option key={customer.id} value={customer.id}>{customer.code} · {customer.legalName}</option>)}</select><small><UserRound size={11} /> العملة الافتراضية: {selectedCustomer?.currencyCode ?? "SAR"}</small></label><label><span><Warehouse size={13} /> المستودع</span><select value={selectedWarehouse?.id ?? ""} disabled={status !== "DRAFT"} onChange={(event) => setWarehouseId(Number(event.target.value))}>{warehouses.map((warehouse: any) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}</select></label><label><span>عملة الفاتورة</span><select value={currencyCode} disabled={status !== "DRAFT"} onChange={(event) => setCurrencyCode(event.target.value)}>{currencies.map((currency: any) => <option key={currency.code} value={currency.code}>{currency.code} · {currency.name || currency.label || currency.code}</option>)}</select></label><label><span>سعر الصرف</span><Input value={exchangeRate} disabled={status !== "DRAFT"} inputMode="decimal" onChange={(event) => setExchangeRate(event.target.value)} /></label>
        </div><Separator />
        <div className="line-title"><div><p className="panel-kicker">INVOICE LINES</p><h3>الأصناف والخدمات</h3></div><div className="invoice-item-search"><Search size={15} /><Input value={itemSearch} disabled={status !== "DRAFT"} placeholder="ابحث بالكود أو اسم الصنف..." onChange={(event) => setItemSearch(event.target.value)} />{itemSearch && <div className="item-results">{filteredItems.map((item: any) => <button type="button" key={item.id} onClick={() => addLine(item)}><Package size={14} /><span><b>{item.code}</b> {item.description}<small>المتاح: {availableFor(item.id).toFixed(3)} · سعر البيع: {item.salePrice ?? item.unitCost ?? "0"}</small></span></button>)}{!filteredItems.length && <span className="empty-search">لا توجد أصناف مطابقة</span>}</div>}</div><Button variant="outline" size="sm" disabled={status !== "DRAFT" || !items[0]} onClick={() => items[0] && addLine(items[0])}><Plus size={14} />إضافة صنف</Button></div>
        {lines.map((line, index) => <div className="line-card" key={`${line.itemId}-${index}`}><div className="line-product"><div className="product-icon"><Package size={18} /></div><div className="line-item-picker"><Input disabled={status !== "DRAFT"} value={rowSearch[index] ?? line.itemCode} placeholder="كود أو اسم الصنف" onChange={(event) => setRowSearch((current) => ({ ...current, [index]: event.target.value }))} />{rowSearch[index] && <div className="item-results inline-item-results">{rowMatches(index).map((item: any) => <button type="button" key={item.id} onClick={() => selectLineItem(index, item)}><b>{item.code}</b> {item.description}</button>)}</div>}<span>{line.description}</span></div></div><div className="line-input"><span>الكمية</span><Input disabled={status !== "DRAFT"} value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} /></div><div className="line-input"><span>السعر</span><Input disabled={status !== "DRAFT"} value={line.unitPrice} onChange={(event) => updateLine(index, { unitPrice: event.target.value })} /></div><div className="line-input"><span>الضريبة</span><Input disabled={status !== "DRAFT"} value={line.taxAmount} onChange={(event) => updateLine(index, { taxAmount: event.target.value })} /></div><div className="line-total"><span>الإجمالي</span><b>{formatMoney(Number(line.quantity || 0) * Number(line.unitPrice || 0) + Number(line.taxAmount || 0), currencyCode)}</b></div><button className="remove-line" disabled={status !== "DRAFT"} aria-label="حذف السطر" onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}><Trash2 size={15} /></button></div>)}
        {!lines.length && <div className="empty-detail sales-empty"><Package size={25} /><p>ابدأ بالبحث عن صنف لإضافته إلى الفاتورة.</p><small>سيتم فحص الرصيد والسعر تلقائياً قبل الحفظ</small></div>}
        <Separator /><div className="form-grid payment-grid"><label><span>طريقة الدفع</span><select value={paymentMethod} disabled={status !== "DRAFT"} onChange={(event) => setPaymentMethod(event.target.value)}><option value="CASH">نقداً</option><option value="CREDIT">آجل</option><option value="CHECK">شيك</option><option value="WALLET">محفظة إلكترونية</option><option value="BANK_TRANSFER">حوالة بنكية</option></select></label><label><span>المبلغ المدفوع</span><Input value={paidAmount} disabled={status !== "DRAFT"} inputMode="decimal" onChange={(event) => setPaidAmount(event.target.value)} /></label><label><span>المبلغ المتبقي</span><Input value={totals.remaining.toFixed(2)} readOnly /></label><label><span>مرجع العملية</span><Input value={paymentReference} disabled={status !== "DRAFT"} placeholder="رقم الشيك أو الحوالة" onChange={(event) => setPaymentReference(event.target.value)} /></label></div>
        <div className="posting-contract"><div className="contract-icon"><CircleDollarSign size={17} /></div><div><b>ترحيل مترابط وآمن</b><p>العميل ← المبيعات ← المخزون ← القيد ← التدقيق الإلكتروني</p></div><span>{offline.online ? "D1 LIVE" : "LOCAL QUEUE"}</span></div><div className="form-actions"><Button variant="outline" disabled={createInvoice.isPending || updateInvoice.isPending || status !== "DRAFT"} onClick={() => save(false)}><Pencil size={15} />{updateInvoice.isPending ? "جارٍ التحديث..." : invoiceId ? "حفظ المسودة" : "حفظ كمسودة"}</Button><Button disabled={createInvoice.isPending || updateInvoice.isPending || postInvoice.isPending || status !== "DRAFT"} onClick={() => save(true)}><Send size={15} />{createInvoice.isPending || updateInvoice.isPending || postInvoice.isPending ? "جارٍ التنفيذ..." : "حفظ وترحيل"}</Button>{status === "POSTED" && <Button variant="destructive" disabled={reverseInvoice.isPending} onClick={() => void reverse()}><RotateCcw size={15} />{reverseInvoice.isPending ? "جارٍ العكس..." : "عكس الفاتورة"}</Button>}</div></CardContent></Card>
      <Card className="panel posting-preview sales-summary"><CardHeader><div><p className="panel-kicker">POSTING PREVIEW</p><CardTitle>ملخص الفاتورة</CardTitle></div><span className="summary-icon"><CircleDollarSign size={17} /></span></CardHeader><CardContent><div className="summary-customer"><div className="customer-avatar"><UserRound size={18} /></div><div><b>{selectedCustomer?.legalName || "لم يتم اختيار العميل"}</b><span>{selectedCustomer?.code || "—"} · حساب العميل</span></div></div><Separator /><div className="preview-total"><span>الإجمالي المستحق</span><strong>{formatMoney(totals.total, currencyCode)}</strong></div><div className="preview-rows"><div><span>صافي المبيعات</span><b>{formatMoney(totals.subtotal, currencyCode)}</b></div><div><span>الضريبة</span><b>{formatMoney(totals.tax, currencyCode)}</b></div><div><span>المدفوع مقدماً</span><b>{formatMoney(totals.paid, currencyCode)}</b></div><div className="highlight"><span>المعادل المحلي</span><b>{formatMoney(totals.localTotal, "SAR")}</b></div></div><Separator /><div className="check-list"><div><span className="check">✓</span> التحقق من رصيد المخزون</div><div><span className="check">✓</span> دعم العملات وسعر الصرف</div><div><span className="check">✓</span> حفظ كمسودة قبل الترحيل</div><div><span className="check">✓</span> قيد محاسبي وسجل تدقيق</div></div>{invoiceId && <EInvoiceStatusPanel invoiceId={invoiceId} invoiceStatus={status} documentNumber={docNo} />}</CardContent></Card>
    </div>
  </section>;
}
