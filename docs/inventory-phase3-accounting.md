# المرحلة الثالثة — الربط المحاسبي الآلي

تربط هذه المرحلة ترحيل مستندات المخزون بالقيود المحاسبية في D1. عند ترحيل مستند `RECEIPT` أو `ISSUE` أو `TRANSFER` ينشأ قيد GL متوازن ويرتبط مباشرة بالمستند.

## Migration

الملف:

```text
cloudflare/d1/0005_inventory_accounting.sql
```

ويضيف:

- `journalEntryId` إلى `inventory_documents`.
- `sourceInventoryDocumentId` إلى `journal_entries`.
- جدول `inventory_account_mappings`.
- الحساب `2100` باسم Goods Received Not Invoiced.
- mapping افتراضي لكل نوع حركة.

التطبيق على D1 البعيدة:

```bash
npx wrangler d1 migrations apply onex-production \
  --remote \
  --config cloudflare/wrangler.jsonc
```

## الحسابات الافتراضية

| نوع المستند | مدين | دائن | المعنى |
|---|---:|---:|---|
| `RECEIPT` | `1300` | `2100` | زيادة المخزون مقابل بضاعة مستلمة غير مفوترة |
| `ISSUE` | `5100` | `1300` | تكلفة المبيعات مقابل تخفيض المخزون |
| `TRANSFER` | `1300` | `1300` | نقل داخلي بين مستودعات |

يمكن تعديل هذه الحسابات لكل شركة ونوع حركة عبر:

```sql
UPDATE inventory_account_mappings
SET debitAccountCode = '1300',
    creditAccountCode = '2100'
WHERE companyId = 1 AND docType = 'RECEIPT';
```

يجب أن تكون الحسابات موجودة ونشطة في `accounts` قبل الترحيل. إذا لم يوجد mapping أو حساب نشط، يرفض Worker الترحيل ويرجع:

```text
INVENTORY_ACCOUNT_MAPPING_NOT_FOUND
INVENTORY_ACCOUNT_NOT_FOUND
```

## دورة الترحيل

عند استدعاء:

```http
POST /api/inventory/documents/:id/post
```

ينفذ Worker الخطوات التالية داخل `D1 batch` واحدة:

1. يتحقق من أن المستند موجود في نفس الشركة.
2. يتحقق من أن حالته `DRAFT`.
3. يتحقق من توفر الرصيد للصرف والتحويل.
4. يقرأ mapping الحسابات.
5. يحسب إجمالي القيد من `quantity × unitCost` لكل سطر.
6. ينشئ رأس القيد في `journal_entries`.
7. ينشئ سطر المدين.
8. ينشئ سطر الدائن.
9. يحدّث `stock_balances`.
10. ينشئ `stock_movements`.
11. يغيّر حالة المستند إلى `POSTED`.
12. يضع `journalEntryId` داخل المستند.
13. يسجل العملية في `audit_events`.

أي فشل في عملية D1 batch يمنع حفظ التغييرات الجزئية.

## شكل القيد

مثال استلام 10 وحدات بسعر 10:

```text
مدين  1300 Inventory       100
دائن  2100 GRNI            100
```

مثال صرف 3 وحدات بسعر 10:

```text
مدين  5100 Cost of Sales    30
دائن  1300 Inventory         30
```

مثال تحويل وحدتين:

```text
مدين  1300 Inventory        20
دائن  1300 Inventory        20
```

ويجب أن يطابق دائماً:

```text
SUM(debit) = SUM(credit)
```

## التتبع

كل مستند مرحّل يحتوي على:

```text
inventory_documents.journalEntryId
```

وكل قيد يحتوي على:

```text
journal_entries.sourceInventoryDocumentId
```

لذلك يمكن الانتقال من:

```text
المستند → القيد → أسطر القيد
```

أو من:

```text
القيد → مستند المخزون → حركات المخزون
```

## الاختبار المنفذ

تم اختباراً محلياً:

- استلام بقيمة `100` — القيد متوازن `100/100`.
- صرف بقيمة `30` — القيد متوازن `30/30`.
- تحويل بقيمة `20` — القيد متوازن `20/20`.
- كل مستند احتوى على `journalEntryId` صحيح.
- كل قيد احتوى على سطرين.
- الحسابات المستخدمة كانت `1300`, `2100`, `5100`.
- تم التحقق من رصيد المدين والدائن عبر SQL.
- تم التحقق من جميع migrations حتى `0005`.

## الحدود الحالية

1. التكلفة الحالية تعتمد على `unitCost` الموجود في سطر المستند؛ FIFO وMoving Average الفعليان يحتاجان طبقات تكلفة مستقلة.
2. التحويل يستخدم نفس حساب المخزون مديناً ودائناً، وهو قيد محاسبي متوازن للتتبع لكنه لا يغيّر إجمالي قيمة المخزون.
3. لا يوجد حتى الآن قيد عكس تلقائي؛ يجب إنشاء مستند عكس مستقل بدلاً من تعديل قيد مرحّل.
4. صلاحيات الترحيل حسب المستخدم والمستودع تحتاج ربطاً بجدول `user_warehouse_permissions`.
5. يلزم ضبط fiscal period والتحقق من إغلاق الفترة قبل الترحيل الإنتاجي.
6. يجب تنفيذ reconciliation دوري بين `stock_balances` و`journal_entry_lines`.
