# مرحلة AP — ربط المشتريات بالمخزون

تضيف هذه المرحلة ترحيل فاتورة الشراء إلى المخزون والمحاسبة. عند ترحيل فاتورة AP، تدخل الكمية إلى المستودع وتعيد حساب متوسط التكلفة المتحرك، ثم ينشأ قيد مخزون مقابل الالتزام بالمورد.

## Migration

```text
cloudflare/d1/0009_ap_inventory_posting.sql
```

تضيف:

- `inventoryJournalNo` إلى `purchase_invoices`.
- `inventoryPostedAt` إلى `purchase_invoices`.
- `appliedUnitCost` و`appliedCostTotal` إلى `purchase_lines`.
- `sourcePurchaseInvoiceId` إلى `journal_entries`.
- `sourcePurchaseInvoiceId` إلى `stock_movements`.

## API

إنشاء فاتورة شراء:

```http
POST /api/erp/purchases
```

مع الترحيل الفوري:

```json
{"postNow": true}
```

أو إنشاء الفاتورة كمسودة ثم ترحيلها:

```http
POST /api/erp/purchases/:id/post
```

## المتوسط المتحرك

عند شراء كمية جديدة:

```text
القيمة الجديدة = القيمة السابقة + كمية الشراء × التكلفة المحلية
الكمية الجديدة = الكمية السابقة + كمية الشراء
متوسط التكلفة الجديد = القيمة الجديدة ÷ الكمية الجديدة
```

في حالة العملة الأجنبية، تحسب التكلفة المحلية كالتالي:

```text
localUnitCost = unitPrice × exchangeRate
```

## مثال

شراء أول:

```text
10 وحدات × 12 = 120
```

شراء ثانٍ:

```text
10 وحدات × 16 = 160
```

بعد العمليتين:

```text
الكمية: 20
القيمة: 280
متوسط التكلفة: 14
```

## القيد المحاسبي

لكل فاتورة شراء مرحّلة ينشأ قيد:

```text
مدين  1300 المخزون                  120
دائن  2100 Goods Received Not Invoiced 120
```

ويتم ربط القيد بالفاتورة من خلال:

```text
journal_entries.sourcePurchaseInvoiceId
purchase_invoices.inventoryJournalNo
```

## الحركات المسجلة

كل سطر شراء مرحّل ينشئ حركة:

```text
movementType = PURCHASE_RECEIPT
sourcePurchaseInvoiceId = purchase invoice id
quantityIn = received quantity
unitCost = local applied cost
```

## الحماية

- الفاتورة المرحّلة لا تُرحّل مرة ثانية.
- يتم رفض الفاتورة التي لا تحتوي على أسطر.
- يتم تنفيذ تحديث الرصيد والحركة والقيد وتغيير حالة الفاتورة في `D1 batch` واحدة.
- يتم تسجيل التكلفة المحلية الفعلية في أسطر الشراء.
- يتم حفظ أسعار العملة والتكلفة المطبقة لأغراض التدقيق.

## الاختبار المنفذ

تم اختبار:

- شراء 10 وحدات بسعر 12.
- شراء 10 وحدات بسعر 16.
- الوصول إلى متوسط تكلفة 14 وقيمة مخزون 280.
- إنشاء قيدين متوازنين 120/120 و160/160.
- إنشاء حركات `PURCHASE_RECEIPT`.
- الترحيل الفوري `postNow`.
- الترحيل من مسودة عبر endpoint مستقل.
- منع إعادة الترحيل عبر idempotency.
- نجاح `PRAGMA foreign_key_check`.
