export type CurrencyPolicy = {
  code: string;
  decimalScale: number;
  rounding: "HALF_UP";
  baseCurrency: string;
};

export function currencyPolicy(input: { code?: string; decimalScale?: number; baseCurrency?: string } = {}): CurrencyPolicy {
  const code = String(input.code || "SAR").trim().toUpperCase();
  const baseCurrency = String(input.baseCurrency || "SAR").trim().toUpperCase();
  const decimalScale = input.decimalScale ?? 2;
  if (!/^[A-Z]{3}$/.test(code) || !/^[A-Z]{3}$/.test(baseCurrency)) throw new Error("CURRENCY_CODE_INVALID");
  if (!Number.isInteger(decimalScale) || decimalScale < 0 || decimalScale > 6) throw new Error("CURRENCY_SCALE_INVALID");
  return { code, decimalScale, rounding: "HALF_UP", baseCurrency };
}

export function roundCurrency(value: number | string, policy: CurrencyPolicy): number {
  const amount = Number(value);
  if (!Number.isFinite(amount)) throw new Error("CURRENCY_AMOUNT_INVALID");
  const factor = 10 ** policy.decimalScale;
  return Math.sign(amount) * Math.round(Math.abs(amount) * factor + Number.EPSILON) / factor;
}

export function assertExchangeRate(value: number | string): number {
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("EXCHANGE_RATE_INVALID");
  return rate;
}
