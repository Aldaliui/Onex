import { z } from "zod";

export const journalLineSchema = z.object({
  accountCode: z.string().trim().min(1, "يجب اختيار حساب لكل سطر"),
  description: z.string(),
  currencyCode: z
    .string()
    .trim()
    .length(3, "رمز العملة يجب أن يتكون من 3 أحرف"),
  exchangeRate: z
    .string()
    .refine(value => Number(value) > 0, "سعر الصرف يجب أن يكون أكبر من صفر"),
  reference: z.string(),
  debit: z
    .string()
    .refine(value => Number(value) >= 0, "لا يسمح بقيم مدينة سالبة"),
  credit: z
    .string()
    .refine(value => Number(value) >= 0, "لا يسمح بقيم دائنة سالبة"),
});

export const journalSchema = z.object({
  journalNo: z.string().trim().min(1, "رقم القيد مطلوب"),
  journalDate: z.string().min(1, "تاريخ القيد مطلوب"),
  entryType: z.string(),
  sourceType: z.string(),
  branchId: z.string(),
  warehouseId: z.string(),
  periodId: z.string().min(1, "الفترة المالية مطلوبة"),
  description: z.string().trim().min(1, "الوصف العام مطلوب"),
  lines: z
    .array(journalLineSchema)
    .min(2, "يجب أن يحتوي القيد على سطرين على الأقل"),
});
