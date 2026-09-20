import { useMemo, useState } from "react";
import { RefreshCw, Warehouse, ArrowDownToLine, ArrowUpFromLine, Package } from "lucide-react";
import { trpc } from "@/lib/trpc";

type RecordValue = Record<string, unknown>;
const text = (value: unknown, fallback = "—") => value === null || value === undefined || value === "" ? fallback : String(value);
const number = (value: unknown) => Number(value || 0).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 6 });

export default function ItemTracePanel({ records }: { records: RecordValue[] }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [warehouseId, setWarehouseId] = useState<number | undefined>();
  const selected = useMemo(() => records.find((row) => Number(row.id) === selectedId) || records[0], [records, selectedId]);
  const itemId = selected ? Number(selected.id) : 0;
  const trace = trpc.windows.itemTrace.useQuery({ itemId, warehouseId }, { enabled: itemId > 0 });
  const item = (trace.data?.item || selected || {}) as RecordValue;
  const balances = Array.isArray(item.balances) ? item.balances as RecordValue[] : [];
  const movements = (trace.data?.movements || []) as RecordValue[];
  const selectedWarehouse = warehouseId ? balances.find((row) => Number(row.warehouseId) === warehouseId) : balances[0];
  return <section className="item-trace-panel" dir="rtl">
    <div className="item-trace-heading"><div><span className="financial-report-kicker">INVENTORY · ITEM MASTER</span><h2>بطاقة الصنف</h2><p>عرض الوحدة والعملة والأرصدة والحركة الفعلية من قاعدة البيانات</p></div><button type="button" className="report-action" onClick={() => void trace.refetch()} disabled={!itemId}><RefreshCw size={14} /> تحديث</button></div>
    <div className="item-trace-selector"><label>الصنف<select value={itemId || ""} onChange={(event) => setSelectedId(Number(event.target.value))}>{records.length ? records.map((row, index) => <option key={String(row.id ?? index)} value={Number(row.id)}>{text(row.code)} · {text(row.description ?? row.name)}</option>) : <option value="">لا توجد أصناف</option>}</select></label><label>المستودع<select value={warehouseId ?? ""} onChange={(event) => setWarehouseId(event.target.value ? Number(event.target.value) : undefined)}><option value="">كل المستودعات</option>{balances.map((row) => <option key={String(row.warehouseId)} value={Number(row.warehouseId)}>{text(row.warehouseCode)} · {text(row.warehouseName)}</option>)}</select></label></div>
    <div className="item-trace-summary"><div><Package size={18} /><span>الكود<strong>{text(item.code)}</strong></span></div><div><span>الوحدة<strong>{text(item.unitCode, "EA")}</strong></span></div><div><span>العملة<strong>{text(item.currencyCode, "SAR")}</strong></span></div><div><span>تكلفة الوحدة<strong>{number(item.unitCost)}</strong></span></div><div><span>سعر البيع<strong>{number(item.salePrice)}</strong></span></div></div>
    <div className="item-trace-balance-grid">{selectedWarehouse ? <div className="item-trace-balance-card"><Warehouse size={18} /><div><span>{text(selectedWarehouse.warehouseName, "المستودع")}</span><strong>{number(selectedWarehouse.quantity)} {text(item.unitCode, "EA")}</strong><small>قيمة المخزون {number(selectedWarehouse.totalCost)} {text(item.currencyCode, "SAR")}</small></div></div> : balances.map((row) => <button type="button" className="item-trace-balance-card" key={String(row.warehouseId)} onClick={() => setWarehouseId(Number(row.warehouseId))}><Warehouse size={18} /><div><span>{text(row.warehouseName, row.warehouseCode as string)}</span><strong>{number(row.quantity)} {text(item.unitCode, "EA")}</strong><small>{number(row.totalCost)} {text(item.currencyCode, "SAR")}</small></div></button>)}{!balances.length && <div className="item-trace-empty">لا يوجد رصيد مسجل لهذا الصنف.</div>}</div>
    <div className="item-trace-table-wrap"><div className="item-trace-table-title"><b>سجل الحركة</b><span>{trace.isFetching ? "جارٍ التحديث..." : `${movements.length} حركة`}</span></div><table className="item-trace-table"><thead><tr><th>النوع</th><th>المستودع</th><th>داخل</th><th>خارج</th><th>التكلفة</th><th>الرصيد بعد الحركة</th><th>المرجع</th></tr></thead><tbody>{movements.map((row, index) => <tr key={String(row.id ?? index)}><td><span className={`movement-pill ${String(row.movementType).includes("IN") || String(row.movementType).includes("RECEIPT") ? "in" : "out"}`}>{String(row.movementType).includes("IN") || String(row.movementType).includes("RECEIPT") ? <ArrowDownToLine size={13} /> : <ArrowUpFromLine size={13} />}{text(row.movementType)}</span></td><td>{text(row.warehouseName ?? row.warehouseCode ?? row.warehouseId)}</td><td>{number(row.quantityIn)}</td><td>{number(row.quantityOut)}</td><td>{number(row.totalCost)} {text(item.currencyCode, "SAR")}</td><td>{number(row.balanceAfter)} {text(item.unitCode, "EA")}</td><td dir="ltr">{text(row.docNo ?? row.reference)}</td></tr>)}{!movements.length && <tr><td colSpan={7} className="item-trace-empty">لا توجد حركات لهذا الصنف.</td></tr>}</tbody></table></div>
  </section>;
}
