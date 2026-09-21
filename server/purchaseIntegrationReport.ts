export type PurchaseIntegrationReportInput = { supplierId?: number; status?: "OPEN" | "SETTLED" | "ALL" };

export type ThreeWayMatchInput = { orderedQuantity: number; receivedQuantity: number; invoicedQuantity: number; orderedUnitPrice: number; invoicedUnitPrice: number; quantityTolerance?: number; priceTolerance?: number };

export function validateThreeWayMatch(input: ThreeWayMatchInput) {
  const quantityTolerance = input.quantityTolerance ?? 0.02;
  const priceTolerance = input.priceTolerance ?? 0.01;
  const quantityVariance = input.invoicedQuantity - input.receivedQuantity;
  const priceVariance = input.invoicedUnitPrice - input.orderedUnitPrice;
  const quantityLimit = Math.max(input.receivedQuantity, 1) * quantityTolerance;
  const priceLimit = Math.max(input.orderedUnitPrice, 1) * priceTolerance;
  const orderedExceeded = input.receivedQuantity > input.orderedQuantity + quantityLimit;
  const quantityBlocked = Math.abs(quantityVariance) > quantityLimit;
  const priceBlocked = Math.abs(priceVariance) > priceLimit;
  return { status: orderedExceeded || quantityBlocked || priceBlocked ? "BLOCKED" : quantityVariance === 0 && priceVariance === 0 ? "MATCHED" : "PARTIALLY_MATCHED", orderedExceeded, quantityBlocked, priceBlocked, quantityVariance, priceVariance } as const;
}

export function buildPurchaseIntegrationReport(rows: Array<{ orderNo: string; receiptNo: string; supplierId: number; amount: string | number; grniStatus: string; invoiceNo?: string | null; invoiceStatus?: string | null; paidAmount?: string | number | null }>, input: PurchaseIntegrationReportInput = {}) {
  const filtered = rows.filter((row) => (!input.supplierId || row.supplierId === input.supplierId) && (!input.status || input.status === "ALL" || row.grniStatus === input.status));
  const totals = filtered.reduce((result, row) => { result.grni += Number(row.amount || 0); result.paid += Number(row.paidAmount || 0); return result; }, { grni: 0, paid: 0 });
  return { rows: filtered, totals: { openGrni: totals.grni.toFixed(6), paid: totals.paid.toFixed(6), count: filtered.length }, reconciliation: Math.abs(totals.grni) < 0.000001 ? "BALANCED" : "REVIEW" };
}
