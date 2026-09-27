export type JournalLineState = {
  accountCode: string;
  description: string;
  currencyCode: string;
  exchangeRate: string;
  reference: string;
  debit: string;
  credit: string;
};
export type JournalDraftState = {
  journalNo: string;
  journalDate: string;
  entryType: string;
  sourceType: string;
  branchId: string;
  warehouseId: string;
  periodId: string;
  description: string;
  lines: JournalLineState[];
};
export type JournalAction =
  | {
      type: "setField";
      field: keyof Omit<JournalDraftState, "lines">;
      value: string;
    }
  | {
      type: "updateLine";
      index: number;
      field: keyof JournalLineState;
      value: string;
    }
  | { type: "addLine" }
  | { type: "removeLine"; index: number };

export const emptyJournalLine = (): JournalLineState => ({
  accountCode: "",
  description: "",
  currencyCode: "SAR",
  exchangeRate: "1",
  reference: "",
  debit: "0",
  credit: "0",
});
export const journalReducer = (
  state: JournalDraftState,
  action: JournalAction
): JournalDraftState => {
  if (action.type === "setField")
    return { ...state, [action.field]: action.value };
  if (action.type === "updateLine")
    return {
      ...state,
      lines: state.lines.map((line, index) =>
        index === action.index
          ? { ...line, [action.field]: action.value }
          : line
      ),
    };
  if (action.type === "addLine")
    return { ...state, lines: [...state.lines, emptyJournalLine()] };
  if (action.type === "removeLine")
    return state.lines.length > 2
      ? {
          ...state,
          lines: state.lines.filter((_, index) => index !== action.index),
        }
      : state;
  return state;
};
