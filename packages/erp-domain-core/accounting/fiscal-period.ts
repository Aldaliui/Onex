export function canPostToPeriod(period: { status?: string; startsOn?: Date | string; endsOn?: Date | string } | undefined, postingDate: Date | string = new Date()) {
  if (!period) return { allowed: false, reason: "PERIOD_NOT_FOUND" as const };
  const status = String(period.status || "").toUpperCase();
  if (status !== "OPEN" && status !== "REOPENED") return { allowed: false, reason: "PERIOD_CLOSED" as const };
  const date = new Date(postingDate).getTime();
  const start = new Date(period.startsOn || "").getTime();
  const end = new Date(period.endsOn || "").getTime();
  if (![date, start, end].every(Number.isFinite)) return { allowed: false, reason: "PERIOD_DATE_INVALID" as const };
  if (date < start || date > end) return { allowed: false, reason: "DATE_OUTSIDE_PERIOD" as const };
  return { allowed: true as const, reason: null };
}
