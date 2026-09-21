import { validateJournal, type JournalLineInput } from "./journal";

export function closeFiscalYear(input: { revenue?: string | number; expenses?: string | number; retainedEarningsAccount?: string; openingYear?: string | number }) {
  const revenue = Number(input.revenue ?? 0);
  const expenses = Number(input.expenses ?? 0);
  if (!Number.isFinite(revenue) || !Number.isFinite(expenses)) throw new Error("YEAR_CLOSE_AMOUNT_INVALID");
  if (revenue < 0 || expenses < 0) throw new Error("YEAR_CLOSE_NEGATIVE_AMOUNT");
  const retainedEarningsAccount = input.retainedEarningsAccount || "3201";
  const lines: JournalLineInput[] = [
    { accountCode: "4101", debit: revenue, credit: 0, description: "إقفال حسابات الإيرادات" },
    { accountCode: "3900", debit: 0, credit: revenue, description: "ترحيل الإيرادات إلى ملخص الدخل" },
    { accountCode: "3900", debit: expenses, credit: 0, description: "إقفال ملخص الدخل بالمصروفات" },
    { accountCode: "5101", debit: 0, credit: expenses, description: "إقفال حسابات المصروفات" },
  ];
  const net = revenue - expenses;
  if (net >= 0) lines.push({ accountCode: "3900", debit: net, credit: 0, description: "إقفال صافي الربح من ملخص الدخل" }, { accountCode: retainedEarningsAccount, debit: 0, credit: net, description: "ترحيل صافي ربح العام" });
  else lines.push({ accountCode: retainedEarningsAccount, debit: Math.abs(net), credit: 0, description: "ترحيل صافي خسارة العام" }, { accountCode: "3900", debit: 0, credit: Math.abs(net), description: "إقفال صافي الخسارة من ملخص الدخل" });
  return validateJournal({ description: `إقفال السنة المالية وترحيل نتيجة العام إلى ${input.openingYear || ""}`.trim(), source: "YEAR_CLOSE", lines });
}
