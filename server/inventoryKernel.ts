export type StockRuleInput = { beforeQuantity: number; movementQuantity: number; direction: "IN" | "OUT"; allowNegative?: boolean };

export function assertStockRule(input: StockRuleInput) {
  if (!Number.isFinite(input.beforeQuantity) || !Number.isFinite(input.movementQuantity) || input.movementQuantity < 0) throw new Error("INVALID_STOCK_QUANTITY");
  const afterQuantity = input.direction === "IN" ? input.beforeQuantity + input.movementQuantity : input.beforeQuantity - input.movementQuantity;
  if (!input.allowNegative && afterQuantity < -0.000001) throw new Error("INSUFFICIENT_STOCK");
  return afterQuantity;
}

export function calculateMovingAverage(beforeQuantity: number, beforeTotalCost: number, incomingQuantity: number, incomingUnitCost: number) {
  if ([beforeQuantity, beforeTotalCost, incomingQuantity, incomingUnitCost].some((value) => !Number.isFinite(value)) || beforeQuantity < 0 || beforeTotalCost < 0 || incomingQuantity <= 0 || incomingUnitCost < 0) throw new Error("INVALID_COST_INPUT");
  const quantity = beforeQuantity + incomingQuantity;
  const totalCost = beforeTotalCost + incomingQuantity * incomingUnitCost;
  return { quantity, totalCost, unitCost: quantity ? totalCost / quantity : 0 };
}

export function normalizeUnitQuantity(quantity: number, conversionToBase: number) {
  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(conversionToBase) || conversionToBase <= 0) throw new Error("INVALID_UNIT_CONVERSION");
  return quantity * conversionToBase;
}

export function validateSerialSet(serials: string[], expectedQuantity: number) {
  const normalized = serials.map((serial) => serial.trim()).filter(Boolean);
  if (normalized.length !== expectedQuantity) throw new Error("SERIAL_COUNT_MISMATCH");
  if (new Set(normalized).size !== normalized.length) throw new Error("DUPLICATE_SERIAL_NUMBER");
  return normalized;
}
