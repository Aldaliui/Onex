export const EPSILON = 0.000001;

function numeric(value: string | number | undefined | null, field: string): number {
  const result = Number(value ?? 0);
  if (!Number.isFinite(result)) throw new Error(`${field}_INVALID`);
  return result;
}

export type JournalLineInput = { accountCode: string; accountName?: string; description?: string; debit?: string | number; credit?: string | number };
export type NormalizedJournal = { description: string; source: string; lines: Array<JournalLineInput & { accountCode: string; debit: number; credit: number }>; totalDebit: number; totalCredit: number };

export function validateJournal(input: { description?: string; source?: string; lines: JournalLineInput[] }): NormalizedJournal {
  const description = String(input.description || "").trim();
  if (!description) throw new Error("JOURNAL_DESCRIPTION_REQUIRED");
  if (!Array.isArray(input.lines) || input.lines.length < 2) throw new Error("JOURNAL_NEEDS_TWO_LINES");
  const lines = input.lines.map((line, index) => {
    const debit = numeric(line.debit, `DEBIT_LINE_${index + 1}`);
    const credit = numeric(line.credit, `CREDIT_LINE_${index + 1}`);
    if (debit < -EPSILON || credit < -EPSILON) throw new Error("JOURNAL_NEGATIVE_AMOUNT");
    if (debit > EPSILON && credit > EPSILON) throw new Error("JOURNAL_LINE_BOTH_SIDES");
    if (debit <= EPSILON && credit <= EPSILON) throw new Error("JOURNAL_EMPTY_LINE");
    if (!String(line.accountCode || "").trim()) throw new Error("JOURNAL_ACCOUNT_REQUIRED");
    return { ...line, accountCode: String(line.accountCode).trim(), debit, credit };
  });
  const totalDebit = lines.reduce((sum, line) => sum + line.debit, 0);
  const totalCredit = lines.reduce((sum, line) => sum + line.credit, 0);
  if (Math.abs(totalDebit - totalCredit) > EPSILON) throw new Error("JOURNAL_NOT_BALANCED");
  return { description, source: input.source || "MANUAL", lines, totalDebit, totalCredit };
}
