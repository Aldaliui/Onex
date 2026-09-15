# المرحلة الثانية — حركات المخزون

تضيف هذه المرحلة دورة مستندات Inventory على D1 للعمليات التالية:

- `RECEIPT` الاستلام.
- `ISSUE` الصرف.
- `TRANSFER` التحويل بين المستودعات.

## Migration

الملف الجديد:

```text
cloudflare/d1/0004_inventory_movements.sql
```

ويضيف:

- `inventory_documents`
- `inventory_document_lines`
- `stock_batches`
- `stock_serials`
- إضافة `inventoryDocumentId` إلى `stock_movements`

طبّق على البيئة المطلوبة بعد أخذ نسخة احتياطية:

```bash
npx wrangler d1 migrations apply onex-production \
  --remote \
  --config cloudflare/wrangler.jsonc
```

## مسارات Worker

| الطريقة | المسار | الوظيفة |
|---|---|---|
| `POST` | `/api/inventory/documents` | إنشاء مستند DRAFT مع الأسطر |
| `GET` | `/api/inventory/documents` | قائمة المستندات مع `status`, `docType`, `limit` |
| `GET` | `/api/inventory/documents/:id` | تفاصيل المستند والأسطر |
| `POST` | `/api/inventory/documents/:id/post` | ترحيل المستند وتحديث الأرصدة |
| `GET` | `/api/inventory/movements` | قائمة الحركات مع `itemId`, `warehouseId`, `limit` |

كل المسارات تحتاج نفس رؤوس المصادقة المستخدمة في المرحلة الأولى:

```http
Authorization: Bearer <ONEX_API_TOKEN>
X-Onex-Actor: <validated-user-id>
X-Onex-Company-Id: <company-id>
```

## إنشاء استلام

```bash
curl -X POST https://your-worker.example.com/api/inventory/documents \
  -H 'Authorization: Bearer <token>' \
  -H 'X-Onex-Actor: admin-1' \
  -H 'X-Onex-Company-Id: 1' \
  -H 'content-type: application/json' \
  -d '{
    "docNo": "REC-0001",
    "docType": "RECEIPT",
    "toWarehouseId": 1,
    "idempotencyKey": "REC-0001",
    "referenceNo": "PO-1001",
    "lines": [
      {
        "itemId": 10,
        "quantity": "25",
        "unitCost": "12.500000",
        "unitCode": "EA",
        "batchNo": "B-2026-01",
        "expireDate": "2027-01-31"
      }
    ]
  }'
```

ثم الترحيل:

```bash
curl -X POST https://your-worker.example.com/api/inventory/documents/1/post \
  -H 'Authorization: Bearer <token>' \
  -H 'X-Onex-Actor: admin-1' \
  -H 'X-Onex-Company-Id: 1'
```

## إنشاء صرف

يستخدم الصرف `fromWarehouseId`:

```json
{
  "docNo": "ISS-0001",
  "docType": "ISSUE",
  "fromWarehouseId": 1,
  "idempotencyKey": "ISS-0001",
  "lines": [
    {
      "itemId": 10,
      "quantity": "3",
      "unitCost": "12.500000",
      "unitCode": "EA"
    }
  ]
}
```

إذا كان الرصيد غير كافٍ يرجع الترحيل:

```http
409 INSUFFICIENT_STOCK
```

ويبقى المستند `DRAFT` ولا تتغير الأرصدة.

## إنشاء تحويل

يستخدم التحويل مستودع المصدر والوجهة:

```json
{
  "docNo": "TRF-0001",
  "docType": "TRANSFER",
  "fromWarehouseId": 1,
  "toWarehouseId": 2,
  "idempotencyKey": "TRF-0001",
  "lines": [
    {
      "itemId": 10,
      "quantity": "2",
      "unitCost": "12.500000",
      "unitCode": "EA"
    }
  ]
}
```

ينشئ الترحيل حركتين:

```text
TRANSFER_OUT للمستودع المصدر
TRANSFER_IN للمستودع الوجهة
```

## قواعد الترحيل

- المستند يبدأ بحالة `DRAFT`.
- لا يمكن ترحيل المستند أكثر من مرة.
- لا يمكن استخدام مستودع غير نشط أو خارج الشركة.
- لا يمكن استخدام صنف غير نشط أو خارج الشركة.
- يمنع الرصيد السالب افتراضياً.
- يسجل كل سطر في `stock_movements`.
- يحدث `stock_balances` مع زيادة `versionNo`.
- يستخدم `idempotencyKey` لمنع تكرار المستند.
- يسجل الإنشاء والترحيل في `audit_events`.
- يحفظ الدفعة في `stock_batches` عند إرسال `batchNo`.
- يظل الترحيل والعكس المنطقي القادم بحاجة إلى مسار عكس مستقل.

تستخدم العملية `env.ONEX_DB.batch()` لتجميع تحديثات الرصيد والحركات وتغيير حالة المستند والتدقيق في معاملة D1 واحدة.

## ما تم اختباره محلياً

- استلام كمية `10` بسعر `10` — نجح.
- محاولة صرف `15` من رصيد `10` — رفضت بـ`409` وبقي المستند `DRAFT`.
- صرف `3` — نجح، وبقي الرصيد `7`.
- تحويل `2` — نجح، فأصبح المصدر `5` والوجهة `2`.
- إنشاء حركات `RECEIPT`, `ISSUE`, `TRANSFER_OUT`, `TRANSFER_IN` — نجح.
- استعلام الحركات حسب الصنف — نجح.
- التحقق من migration والـForeign Keys محلياً — نجح.

## حدود هذه المرحلة

1. صلاحيات المستودعات الموجودة في `user_warehouse_permissions` لم تُفرض بعد داخل المسارات؛ المصادقة الحالية هي بوابة API ونطاق شركة.
2. العكس `REVERSE` يحتاج مستند عكس مستقل، ولا يجوز تغيير مستند مرحّل مباشرة.
3. حساب FIFO/Moving Average المتقدم لم يُنفذ بعد؛ يتم حالياً تحديث `unitCost` من تكلفة السطر.
4. التحقق من الرقم التسلسلي يحتاج مساراً منفصلاً عندما يصبح `useSerialNo = 1`.
5. ربط الحركة بالقيد المحاسبي سيأتي مع مرحلة التكامل المالي.
6. اختبار التزامن عالي الحمل مطلوب قبل الإنتاج، خصوصاً للصرف المتزامن من نفس الرصيد.
