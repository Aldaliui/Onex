import { useState } from "react";
import { ClipboardCheck, FileCheck2, PackagePlus, Send } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export default function PurchaseCycleCenter() {
  const master = trpc.masterData.useQuery();
  const orderCreate = trpc.purchases.orderCreate.useMutation();
  const orderApprove = trpc.purchases.orderApprove.useMutation();
  const receiptCreate = trpc.purchases.receiptCreate.useMutation();
  const receiptPost = trpc.purchases.receiptPost.useMutation();
  const [orderNo, setOrderNo] = useState(() => `PO-${Date.now()}`);
  const [receiptNo, setReceiptNo] = useState(() => `GRN-${Date.now()}`);
  const [supplierId, setSupplierId] = useState("1");
  const [warehouseId, setWarehouseId] = useState("1");
  const [itemId, setItemId] = useState("1");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("100");
  const [orderId, setOrderId] = useState<number>();
  const [orderLineId, setOrderLineId] = useState<number>();
  const [receiptId, setReceiptId] = useState<number>();
  const busy = orderCreate.isPending || orderApprove.isPending || receiptCreate.isPending || receiptPost.isPending;
  const suppliers = master.data?.suppliers || [{ id: 1, code: "SUP-001", legalName: "مورد تجريبي" }];
  const warehouses = master.data?.warehouses || [{ id: 1, code: "MAIN", name: "المستودع الرئيسي" }];
  const run = async (action: "order" | "approve" | "receipt" | "post") => {
    try {
      if (action === "order") { const result = await orderCreate.mutateAsync({ orderNo, supplierId: Number(supplierId), warehouseId: Number(warehouseId), actor: "workbench.user", lines: [{ itemId: Number(itemId), quantity, unitPrice, taxAmount: "0" }] }); setOrderId(Number(result.id)); setOrderLineId(1); toast.success(`تم إنشاء أمر الشراء ${orderNo}`); }
      if (action === "approve") { if (!orderId) throw new Error("أنشئ أمر الشراء أولاً"); await orderApprove.mutateAsync({ orderId, actor: "workbench.user" }); toast.success("تم اعتماد أمر الشراء"); }
      if (action === "receipt") { if (!orderId || !orderLineId) throw new Error("أنشئ واعتمد أمر الشراء أولاً"); const result = await receiptCreate.mutateAsync({ receiptNo, purchaseOrderId: orderId, actor: "workbench.user", lines: [{ purchaseOrderLineId: orderLineId, itemId: Number(itemId), quantity, unitCost: unitPrice }] }); setReceiptId(Number(result.id)); toast.success(`تم إنشاء إذن الاستلام ${receiptNo}`); }
      if (action === "post") { if (!receiptId) throw new Error("أنشئ إذن الاستلام أولاً"); await receiptPost.mutateAsync({ receiptId, actor: "workbench.user" }); toast.success("تم ترحيل الاستلام وتحديث المخزون"); }
    } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر تنفيذ الخطوة"); }
  };
  return <section className="setup-card purchase-cycle-center" dir="rtl"><div className="setup-card-title"><ClipboardCheck size={19} /><div><b>دورة المشتريات والموردين</b><small>PURCHASE ORDER → GOODS RECEIPT → SUPPLIER INVOICE · THREE-WAY MATCH</small></div></div><div className="setup-note"><FileCheck2 size={16} /> لا يمكن إنشاء الاستلام إلا من أمر معتمد، ولا تزيد الكمية المستلمة عن رصيد الأمر. ربط الفاتورة بإذن مرحل يمنع تحديث المخزون مرتين.</div><div className="form-grid"><label>رقم أمر الشراء<input value={orderNo} onChange={(event) => setOrderNo(event.target.value)} /></label><label>المورد<select value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>{suppliers.map((row: any) => <option key={row.id} value={row.id}>{row.code} · {row.legalName}</option>)}</select></label><label>المستودع<select value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}>{warehouses.map((row: any) => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}</select></label><label>رقم الصنف<input value={itemId} onChange={(event) => setItemId(event.target.value)} /></label><label>الكمية<input inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label><label>سعر الوحدة<input inputMode="decimal" value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} /></label><label>رقم إذن الاستلام<input value={receiptNo} onChange={(event) => setReceiptNo(event.target.value)} /></label></div><div className="purchase-cycle-steps"><button type="button" disabled={busy} onClick={() => void run("order")}><Send size={15} /> إنشاء الأمر</button><button type="button" disabled={busy || !orderId} onClick={() => void run("approve")}><FileCheck2 size={15} /> اعتماد الأمر</button><button type="button" disabled={busy || !orderId} onClick={() => void run("receipt")}><PackagePlus size={15} /> إنشاء الاستلام</button><button type="button" disabled={busy || !receiptId} onClick={() => void run("post")}><ClipboardCheck size={15} /> ترحيل الاستلام</button></div><p className="setup-note">بعد ترحيل الاستلام افتح نافذة فاتورة المشتريات واربطها بـ <b>goodsReceiptId</b> لإتمام المطابقة الثلاثية دون تكرار المخزون.</p></section>;
}
