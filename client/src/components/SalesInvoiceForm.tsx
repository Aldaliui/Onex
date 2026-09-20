import { useMemo, useState } from "react";
import { CircleDollarSign, Package, Pencil, Plus, RotateCcw, Search, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import EInvoiceStatusPanel from "@/components/EInvoiceStatusPanel";

type Line = { itemId: number; itemCode: string; description: string; quantity: string; unitPrice: string; taxAmount: string };


export default function SalesInvoiceForm() {
  const master = trpc.masterData.useQuery();
  const createInvoice = trpc.invoices.create.useMutation();
  const postInvoice = trpc.invoices.post.useMutation();
  const offline = useOfflineSync(async (operation) => { if (operation.type !== "SALES_INVOICE_CREATE") return "CONFLICT"; const payload = operation.payload as { invoice: Parameters<typeof createInvoice.mutateAsync>[0]; postNow: boolean }; const created = await createInvoice.mutateAsync(payload.invoice); setInvoiceId(Number(created.invoiceId)); if (payload.postNow) { await postInvoice.mutateAsync({ invoiceId: Number(created.invoiceId), actor: payload.invoice.actor }); setStatus("POSTED"); } return "SYNCED"; });
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
  const [status, setStatus] = useState<"DRAFT" | "POSTED">("DRAFT");
  const [invoiceId, setInvoiceId] = useState<number | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const customers = master.data?.customers ?? [];
  const warehouses = master.data?.warehouses ?? [];
  const items = master.data?.items ?? [];
  const currencies = master.data?.currencies?.filter((currency: any) => currency.active !== 0) ?? [];
  const selectedCustomer = customers.find((customer: any) => customer.id === customerId) ?? customers[0];
  const selectedWarehouse = warehouses.find((warehouse: any) => warehouse.id === warehouseId) ?? warehouses[0];
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
    if (master.isLoading) return toast.info("جارٍ تحميل بيانات D1...");
    if (master.error) return toast.error("تعذر تحميل بيانات العملاء والمخازن والعملات من D1");
    if (!selectedCustomer || !selectedWarehouse || !lines.length) return toast.error("اختر العميل والمستودع وأضف صنفاً واحداً على الأقل");
    if (Number(paidAmount) > totals.total) return toast.error("المبلغ المدفوع لا يمكن أن يتجاوز إجمالي الفاتورة");
    if (["CHECK", "WALLET", "BANK_TRANSFER"].includes(paymentMethod) && Number(paidAmount) > 0 && !paymentReference.trim()) return toast.error("أدخل مرجع الشيك أو عملية الدفع");
    const invoice = { docNo, customerId: selectedCustomer.id, warehouseId: selectedWarehouse.id, currencyCode, exchangeRate, paymentMethod: paymentMethod as "CASH" | "CREDIT" | "CHECK" | "WALLET" | "BANK_TRANSFER", paidAmount, paymentReference: paymentReference || undefined, actor: "workbench.user", lines: lines.map((line) => ({ itemId: line.itemId, quantity: line.quantity, unitPrice: line.unitPrice, taxAmount: line.taxAmount })) };
    try {
      if (!offline.online) { await offline.enqueue("SALES_INVOICE_CREATE", { invoice, postNow }, `SALES_INVOICE:${docNo}`); toast.info("تم حفظ فاتورة المبيعات محليًا وستتم مزامنتها عند عودة الاتصال"); return; }
      const created = await createInvoice.mutateAsync(invoice);
      setInvoiceId(Number(created.invoiceId));
      await master.refetch();
      if (postNow) {
        await postInvoice.mutateAsync({ invoiceId: Number(created.invoiceId), actor: "workbench.user" });
        setStatus("POSTED");
        toast.success(`تم حفظ وترحيل ${created.docNo}`);
      } else {
        toast.success(`تم حفظ ${created.docNo} كمسودة`);
      }
    } catch (error) { if (!offline.online) { await offline.enqueue("SALES_INVOICE_CREATE", { invoice, postNow }, `SALES_INVOICE:${docNo}`); toast.info("تعذر الاتصال؛ تم وضع فاتورة المبيعات في طابور المزامنة"); } else toast.error(error instanceof Error ? error.message : "تعذر حفظ الفاتورة"); }
  };

  return <section className="ar-workspace classic-invoice">
    <div className="workspace-banner"><div><div className="breadcrumb">AR / SALES / <b>ARST004</b></div><h2>فاتورة مبيعات متعددة العملات</h2><p>إدخال، بحث، حفظ كمسودة، ثم ترحيل الفاتورة بعد المراجعة.</p></div><span className={`doc-chip ${status === "POSTED" ? "posted" : ""}`}>{status}</span></div>
    <div className="ar-grid">
      <Card className="panel invoice-form"><CardHeader><div><p className="panel-kicker">DOCUMENT HEADER</p><CardTitle>بيانات الفاتورة</CardTitle></div><div className="invoice-toolbar"><Button size="sm" variant="outline" onClick={reset}><RotateCcw size={14} />تراجع</Button><Button size="sm" variant="outline" onClick={() => toast.info("استخدم حقل رقم المستند للبحث عن الفاتورة") }><Search size={14} />بحث</Button><Button size="sm" variant="outline" disabled={status === "POSTED"} onClick={() => toast.info("الفاتورة في وضع التعديل") }><Pencil size={14} />تعديل</Button></div></CardHeader>
        <CardContent><div className="form-grid">
          <label>التاريخ<input type="date" value={invoiceDate} readOnly /></label><label>الرقم التصاعدي<Input value={docNo} disabled={status === "POSTED"} onChange={(event) => setDocNo(event.target.value)} /></label><label>الرصيد السابق<input value="0.00" readOnly /></label>
          <label>العميل<select value={selectedCustomer?.id ?? ""} disabled={status === "POSTED"} onChange={(event) => setCustomerId(Number(event.target.value))}>{customers.map((customer: any) => <option key={customer.id} value={customer.id}>{customer.code} · {customer.legalName}</option>)}</select><small>العملة الافتراضية: {selectedCustomer?.currencyCode ?? "YER"}</small></label>
          <label>المستودع<select value={selectedWarehouse?.id ?? ""} disabled={status === "POSTED"} onChange={(event) => setWarehouseId(Number(event.target.value))}>{warehouses.map((warehouse: any) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}</select></label>
          <label>عملة الفاتورة<select value={currencyCode} disabled={status === "POSTED"} onChange={(event) => setCurrencyCode(event.target.value)}>{currencies.map((currency: any) => <option key={currency.code} value={currency.code}>{currency.code} · {currency.name || currency.label || currency.code}</option>)}</select></label>
          <label>سعر الصرف مقابل العملة الأساسية<Input value={exchangeRate} disabled={status === "POSTED"} inputMode="decimal" onChange={(event) => setExchangeRate(event.target.value)} /></label>
        </div><Separator />
        <div className="line-title"><div><p className="panel-kicker">INVOICE LINES</p><h3>الأصناف والبحث اللحظي</h3></div><div className="invoice-item-search"><Search size={15} /><Input value={itemSearch} disabled={status === "POSTED"} placeholder="ابحث بالكود أو الاسم..." onChange={(event) => setItemSearch(event.target.value)} />{itemSearch && <div className="item-results">{filteredItems.map((item: any) => <button type="button" key={item.id} onClick={() => addLine(item)}><Package size={14} /><span><b>{item.code}</b> {item.description}<small>الرصيد: {item.availableQuantity ?? "0"} · سعر البيع: {item.salePrice ?? item.unitCost ?? "0"}</small></span></button>)}{!filteredItems.length && <span className="empty-search">لا توجد أصناف مطابقة</span>}</div>}</div><Button variant="outline" size="sm" disabled={status === "POSTED" || !items[0]} onClick={() => items[0] && addLine(items[0])}><Plus size={14} />سطر جديد</Button></div>
        {lines.map((line, index) => <div className="line-card" key={`${line.itemId}-${index}`}><div className="line-product"><div className="product-icon"><Package size={18} /></div><div className="line-item-picker"><Input disabled={status === "POSTED"} value={rowSearch[index] ?? line.itemCode} placeholder="رقم الصنف أو الاسم" onChange={(event) => setRowSearch((current) => ({ ...current, [index]: event.target.value }))} />{rowSearch[index] && <div className="item-results inline-item-results">{rowMatches(index).map((item: any) => <button type="button" key={item.id} onClick={() => selectLineItem(index, item)}><b>{item.code}</b> {item.description}</button>)}</div>}<span>{line.description} · {line.itemCode}</span></div></div><div className="line-input"><span>الكمية</span><Input disabled={status === "POSTED"} value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} /></div><div className="line-input"><span>السعر</span><Input disabled={status === "POSTED"} value={line.unitPrice} onChange={(event) => updateLine(index, { unitPrice: event.target.value })} /></div><div className="line-input"><span>الضريبة</span><Input disabled={status === "POSTED"} value={line.taxAmount} onChange={(event) => updateLine(index, { taxAmount: event.target.value })} /></div><div className="line-total"><span>الإجمالي</span><b>{(Number(line.quantity || 0) * Number(line.unitPrice || 0) + Number(line.taxAmount || 0)).toFixed(2)} <small>{currencyCode}</small></b></div><button className="remove-line" disabled={status === "POSTED"} onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}><Trash2 size={15} /></button></div>)}
        {!lines.length && <div className="empty-detail"><Package size={25} /><p>ابحث عن صنف لإضافته إلى الفاتورة.</p></div>}
        <Separator /><div className="form-grid payment-grid"><label>نوع الفاتورة / الدفع<select value={paymentMethod} disabled={status === "POSTED"} onChange={(event) => setPaymentMethod(event.target.value)}><option value="CASH">نقداً</option><option value="CREDIT">آجل</option><option value="CHECK">شيك</option><option value="WALLET">محفظة إلكترونية</option><option value="BANK_TRANSFER">حوالة بنكية</option></select></label><label>المبلغ المدفوع<Input value={paidAmount} disabled={status === "POSTED"} inputMode="decimal" onChange={(event) => setPaidAmount(event.target.value)} /></label><label>المبلغ المتبقي<Input value={totals.remaining.toFixed(2)} readOnly /></label><label>رقم الشيك / مرجع العملية<Input value={paymentReference} disabled={status === "POSTED"} onChange={(event) => setPaymentReference(event.target.value)} /></label></div>
        <div className="posting-contract"><div className="contract-icon"><CircleDollarSign size={17} /></div><div><b>معاينة الترحيل</b><p>الفاتورة ← العميل ← المبيعات ← المخزون ← القيد ← التدقيق</p></div><span>{currencyCode}</span></div><div className="form-actions"><Button variant="outline" disabled={createInvoice.isPending || status === "POSTED"} onClick={() => save(false)}><Pencil size={15} />حفظ كمسودة</Button><Button disabled={createInvoice.isPending || postInvoice.isPending || status === "POSTED"} onClick={() => save(true)}><Send size={15} />{createInvoice.isPending || postInvoice.isPending ? "جارٍ التنفيذ..." : "حفظ وترحيل"}</Button></div></CardContent>
      </Card>
      <Card className="panel posting-preview"><CardHeader><div><p className="panel-kicker">POSTING PREVIEW</p><CardTitle>الإجماليات</CardTitle></div></CardHeader><CardContent><div className="preview-total"><span>الإجمالي بالعملة الأصلية</span><strong>{totals.total.toFixed(2)} <small>{currencyCode}</small></strong></div><div className="preview-rows"><div><span>الصافي</span><b>{totals.subtotal.toFixed(2)}</b></div><div><span>الضريبة</span><b>{totals.tax.toFixed(2)}</b></div><div><span>المدفوع</span><b>{totals.paid.toFixed(2)}</b></div><div><span>المعادل المحلي</span><b>{totals.localTotal.toFixed(2)}</b></div></div><Separator /><div className="check-list"><div><span className="check">✓</span> بحث أصناف داخل الفاتورة</div><div><span className="check">✓</span> تعدد العملات وسعر الصرف</div><div><span className="check">✓</span> دفع جزئي ومتأخر</div><div><span className="check">✓</span> مسودة قبل الترحيل</div></div>{invoiceId && <EInvoiceStatusPanel invoiceId={invoiceId} invoiceStatus={status} documentNumber={docNo} />}</CardContent></Card>
    </div>
  </section>;
}
