import { useMemo, useState } from "react";
import { ArrowDownToLine, ArrowLeftRight, ClipboardCheck, FileText, PackageCheck, Send, Warehouse } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

type DocumentMode = "receipt" | "transfer" | "count";

const modes: Array<{ id: DocumentMode; label: string; hint: string; icon: typeof FileText }> = [
  { id: "receipt", label: "إذن استلام", hint: "إدخال بضاعة وتحديث متوسط التكلفة", icon: ArrowDownToLine },
  { id: "transfer", label: "تحويل بين مستودعين", hint: "إخراج من المصدر وإدخال للوجهة في معاملة واحدة", icon: ArrowLeftRight },
  { id: "count", label: "محضر جرد", hint: "مطابقة الفعلي مع الدفتري وترحيل الفروقات", icon: ClipboardCheck },
];

export default function InventoryDocumentCenter({ initialMode = "receipt" }: { initialMode?: DocumentMode }) {
  const [mode, setMode] = useState<DocumentMode>(initialMode);
  const [warehouseId, setWarehouseId] = useState("1");
  const [destinationWarehouseId, setDestinationWarehouseId] = useState("2");
  const [itemId, setItemId] = useState("1");
  const [quantity, setQuantity] = useState("1");
  const [unitCost, setUnitCost] = useState("0");
  const [documentNo, setDocumentNo] = useState(() => `INV-${Date.now()}`);
  const [notes, setNotes] = useState("");
  const warehouses = trpc.inventory.warehouses.useQuery();
  const receive = trpc.inventory.receive.useMutation();
  const createTransfer = trpc.inventory.transferCreate.useMutation();
  const postTransfer = trpc.inventory.transferPost.useMutation();
  const createCount = trpc.inventory.countCreate.useMutation();
  const postCount = trpc.inventory.countPost.useMutation();
  const busy = receive.isPending || createTransfer.isPending || postTransfer.isPending || createCount.isPending || postCount.isPending;
  const warehouseOptions = warehouses.data || [{ id: 1, code: "MAIN", name: "المستودع الرئيسي" }, { id: 2, code: "SEC", name: "المستودع الفرعي" }];
  const selectedMode = useMemo(() => modes.find((entry) => entry.id === mode) || modes[0], [mode]);

  const submit = async () => {
    try {
      const actor = "workbench.user";
      if (mode === "receipt") {
        const result = await receive.mutateAsync({ itemId: Number(itemId), context: { companyId: 1, branchId: 1, warehouseId: Number(warehouseId), fiscalPeriodId: 1, currencyCode: "SAR", languageCode: "ar" }, quantity, unitCost, actor, reference: documentNo });
        toast.success(`تم ترحيل الاستلام ${result.reference || documentNo}`);
      } else if (mode === "transfer") {
        const draft = await createTransfer.mutateAsync({ transferNo: documentNo, sourceWarehouseId: Number(warehouseId), destinationWarehouseId: Number(destinationWarehouseId), actor, lines: [{ itemId: Number(itemId), quantity }] });
        await postTransfer.mutateAsync({ transferId: Number(draft.id), actor });
        toast.success(`تم ترحيل التحويل ${documentNo}`);
      } else {
        const draft = await createCount.mutateAsync({ countNo: documentNo, warehouseId: Number(warehouseId), countMode: "PERIODIC", actor, notes, lines: [{ itemId: Number(itemId), countedQuantity: quantity }] });
        await postCount.mutateAsync({ countId: Number(draft.countId), actor });
        toast.success(`تم ترحيل محضر الجرد ${documentNo}`);
      }
      setDocumentNo(`INV-${Date.now()}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تنفيذ المستند");
    }
  };

  return <section className="setup-card inventory-document-center" dir="rtl">
    <div className="setup-card-title"><PackageCheck size={19} /><div><b>مركز مستندات المخزون</b><small>INVENTORY DOCUMENT LIFECYCLE · DRAFT → VALIDATED → POSTED</small></div></div>
    <div className="setup-note"><FileText size={16} /> كل عملية تمر بإنشاء مستند ثم ترحيل ذري؛ ويُسجل أثرها في الرصيد والحركة والتدقيق والقيد عند الحاجة.</div>
    <div className="inventory-document-tabs">{modes.map((entry) => { const Icon = entry.icon; return <button type="button" key={entry.id} className={mode === entry.id ? "active" : ""} onClick={() => setMode(entry.id)}><Icon size={17} /><span><b>{entry.label}</b><small>{entry.hint}</small></span></button>; })}</div>
    <div className="form-grid">
      <label>رقم المستند<input value={documentNo} onChange={(event) => setDocumentNo(event.target.value)} /></label>
      <label>المستودع<select value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}>{warehouseOptions.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}</select></label>
      {mode === "transfer" && <label>المستودع الوجهة<select value={destinationWarehouseId} onChange={(event) => setDestinationWarehouseId(event.target.value)}>{warehouseOptions.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}</select></label>}
      <label>رقم الصنف<input inputMode="numeric" value={itemId} onChange={(event) => setItemId(event.target.value)} /></label>
      <label>{mode === "count" ? "الكمية الفعلية" : "الكمية"}<input inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
      {mode === "receipt" && <label>تكلفة الوحدة<input inputMode="decimal" value={unitCost} onChange={(event) => setUnitCost(event.target.value)} /></label>}
      {mode === "count" && <label>ملاحظات الجرد<input value={notes} onChange={(event) => setNotes(event.target.value)} /></label>}
    </div>
    <div className="inventory-document-footer"><span><Warehouse size={15} /> الحالة: <b>مسودة قبل الترحيل</b></span><button className="toolbar-main setup-primary" type="button" disabled={busy} onClick={() => void submit()}><Send size={16} />{busy ? "جارٍ الترحيل..." : `إنشاء وترحيل ${selectedMode.label}`}</button></div>
  </section>;
}
