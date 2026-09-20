import { useMemo, useState } from "react";
import { Package, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

type Line = { itemId: number; itemCode: string; description: string; quantity: string; unitPrice: string; taxAmount: string };

export default function PurchaseInvoiceForm() {
  const master = trpc.masterData.useQuery();
  const create = trpc.purchases.create.useMutation();
  const post = trpc.purchases.post.useMutation();
  const [docNo, setDocNo] = useState(`PUR-${new Date().getFullYear()}-0001`);
  const [invoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [rowSearch, setRowSearch] = useState<Record<number, string>>({});
  const [supplierId, setSupplierId] = useState(0);
  const [warehouseId, setWarehouseId] = useState(0);
  const [currencyCode, setCurrencyCode] = useState("SAR");
  const [exchangeRate, setExchangeRate] = useState("1");
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "CREDIT" | "CHECK">("CREDIT");
  const [paidAmount, setPaidAmount] = useState("0");
  const [paymentReference, setPaymentReference] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"DRAFT" | "POSTED">("DRAFT");
  const [lines, setLines] = useState<Line[]>([]);
  const suppliers = master.data?.suppliers ?? [];
  const warehouses = master.data?.warehouses ?? [];
  const items = master.data?.items ?? [];
  const currencies = master.data?.currencies?.filter((currency: any) => currency.active !== 0) ?? [];
  const supplier = suppliers.find((row: any) => row.id === supplierId) ?? suppliers[0];
  const warehouse = warehouses.find((row: any) => row.id === warehouseId) ?? warehouses[0];
  const filtered = items.filter((item: any) => `${item.code} ${item.description}`.toLowerCase().includes(search.toLowerCase())).slice(0, 8);
  const totals = useMemo(() => ({ subtotal: lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0), 0), tax: lines.reduce((sum, line) => sum + Number(line.taxAmount || 0), 0) }), [lines]);
  const addLine = (item: any) => { setLines((current) => [...current, { itemId: item.id, itemCode: item.code, description: item.description, quantity: "1", unitPrice: String(item.unitCost ?? "0"), taxAmount: "0" }]); setSearch(""); };
  const update = (index: number, patch: Partial<Line>) => setLines((current) => current.map((line, i) => i === index ? { ...line, ...patch } : line));
  const selectLineItem = (index: number, item: any) => { update(index, { itemId: item.id, itemCode: item.code, description: item.description, unitPrice: String(item.unitCost ?? "0") }); setRowSearch((current) => ({ ...current, [index]: "" })); };
  const rowMatches = (index: number) => items.filter((item: any) => `${item.code} ${item.description}`.toLowerCase().includes((rowSearch[index] || "").toLowerCase())).slice(0, 6);
  const save = async (postNow: boolean) => {
    if (!supplier || !warehouse || !lines.length) return toast.error("اختر المورد والمستودع وأضف صنفاً واحداً على الأقل");
    if (paymentMethod === "CHECK" && Number(paidAmount) > 0 && !paymentReference.trim()) return toast.error("أدخل مرجع الشيك");
    try {
      const created = await create.mutateAsync({ docNo, supplierId: supplier.id, warehouseId: warehouse.id, currencyCode, exchangeRate, paymentMethod, paidAmount, paymentReference: paymentReference || undefined, actor: "workbench.user", lines: lines.map((line) => ({ itemId: line.itemId, quantity: line.quantity, unitPrice: line.unitPrice, taxAmount: line.taxAmount })) });
      if (postNow) { await post.mutateAsync({ invoiceId: created.invoiceId, actor: "workbench.user" }); setStatus("POSTED"); toast.success(`تم حفظ وترحيل ${created.docNo}`); } else toast.success(`تم حفظ ${created.docNo} كمسودة`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر حفظ فاتورة المشتريات"); }
  };
  return <section className="ar-workspace classic-invoice"><div className="workspace-banner"><div><div className="breadcrumb">AP / PURCHASING / <b>APST003</b></div><h2>فاتورة مشتريات ومخزون</h2><p>رأس الفاتورة للمورد والمستودع، وتفاصيل الأصناف من قاعدة البيانات في الجدول السفلي.</p></div><span className={`doc-chip ${status === "POSTED" ? "posted" : ""}`}>{status}</span></div><div className="ar-grid"><Card className="panel invoice-form"><CardHeader><div><p className="panel-kicker">PURCHASE HEADER</p><CardTitle>بيانات فاتورة المشتريات</CardTitle></div></CardHeader><CardContent><div className="form-grid"><label>التاريخ<input type="date" value={invoiceDate} readOnly /></label><label>الرقم التصاعدي<Input value={docNo} disabled={status === "POSTED"} onChange={(event) => setDocNo(event.target.value)} /></label><label>الرصيد السابق<input value="0.00" readOnly /></label><label>المورد<select value={supplier?.id ?? ""} disabled={status === "POSTED"} onChange={(event) => setSupplierId(Number(event.target.value))}>{suppliers.map((row: any) => <option key={row.id} value={row.id}>{row.code} · {row.legalName}</option>)}</select></label><label>المستودع<select value={warehouse?.id ?? ""} disabled={status === "POSTED"} onChange={(event) => setWarehouseId(Number(event.target.value))}>{warehouses.map((row: any) => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}</select></label><label>العملة<select value={currencyCode} disabled={status === "POSTED"} onChange={(event) => setCurrencyCode(event.target.value)}>{currencies.map((currency: any) => <option key={currency.code} value={currency.code}>{currency.code} · {currency.name || currency.code}</option>)}</select></label><label>سعر الصرف<Input value={exchangeRate} disabled={status === "POSTED"} onChange={(event) => setExchangeRate(event.target.value)} /></label><label>نوع الفاتورة / الدفع<select value={paymentMethod} disabled={status === "POSTED"} onChange={(event) => setPaymentMethod(event.target.value as "CASH" | "CREDIT" | "CHECK")}><option value="CREDIT">آجل</option><option value="CASH">نقداً</option><option value="CHECK">شيك</option></select></label><label>المبلغ المدفوع<Input value={paidAmount} disabled={status === "POSTED"} onChange={(event) => setPaidAmount(event.target.value)} /></label><label>رقم الشيك / المرجع<Input value={paymentReference} disabled={status === "POSTED"} onChange={(event) => setPaymentReference(event.target.value)} /></label></div><Separator /><div className="line-title"><div><p className="panel-kicker">PURCHASE LINES</p><h3>أصناف الفاتورة</h3></div><div className="invoice-item-search"><Input value={search} disabled={status === "POSTED"} placeholder="ابحث بكود أو اسم الصنف..." onChange={(event) => setSearch(event.target.value)} />{search && <div className="item-results">{filtered.map((item: any) => <button type="button" key={item.id} onClick={() => addLine(item)}><Package size={14} /><span><b>{item.code}</b> {item.description}<small>التكلفة: {item.unitCost}</small></span></button>)}</div>}</div><Button variant="outline" size="sm" disabled={status === "POSTED" || !items[0]} onClick={() => items[0] && addLine(items[0])}><Plus size={14} />سطر جديد</Button></div>{lines.map((line, index) => <div className="line-card" key={`${line.itemId}-${index}`}><div className="line-product"><div className="product-icon"><Package size={18} /></div><div className="line-item-picker"><Input disabled={status === "POSTED"} value={rowSearch[index] ?? line.itemCode} placeholder="رقم الصنف أو الاسم" onChange={(event) => setRowSearch((current) => ({ ...current, [index]: event.target.value }))} />{rowSearch[index] && <div className="item-results inline-item-results">{rowMatches(index).map((item: any) => <button type="button" key={item.id} onClick={() => selectLineItem(index, item)}><b>{item.code}</b> {item.description}</button>)}</div>}<span>{line.description} · {line.itemCode}</span></div></div><div className="line-input"><span>الكمية</span><Input disabled={status === "POSTED"} value={line.quantity} onChange={(event) => update(index, { quantity: event.target.value })} /></div><div className="line-input"><span>تكلفة الوحدة</span><Input disabled={status === "POSTED"} value={line.unitPrice} onChange={(event) => update(index, { unitPrice: event.target.value })} /></div><div className="line-input"><span>الضريبة</span><Input disabled={status === "POSTED"} value={line.taxAmount} onChange={(event) => update(index, { taxAmount: event.target.value })} /></div><div className="line-total"><span>الإجمالي</span><b>{(Number(line.quantity || 0) * Number(line.unitPrice || 0) + Number(line.taxAmount || 0)).toFixed(2)}</b></div><button className="remove-line" disabled={status === "POSTED"} onClick={() => setLines((current) => current.filter((_, i) => i !== index))}><Trash2 size={15} /></button></div>)}{!lines.length && <div className="empty-detail"><Package size={25} /><p>ابحث عن صنف لإضافته إلى فاتورة الشراء.</p></div>}<Separator /><div className="preview-rows"><div><span>صافي المشتريات</span><b>{totals.subtotal.toFixed(2)}</b></div><div><span>الضريبة</span><b>{totals.tax.toFixed(2)}</b></div><div><span>الإجمالي</span><b>{(totals.subtotal + totals.tax).toFixed(2)}</b></div></div><div className="form-actions"><Button disabled={create.isPending || post.isPending || status === "POSTED"} onClick={() => save(true)}><Send size={15} />حفظ وترحيل المشتريات</Button></div></CardContent></Card></div></section>;
}
