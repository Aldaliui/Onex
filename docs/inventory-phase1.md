# المرحلة الأولى — Inventory Master Data

تضيف هذه المرحلة مسارات Cloudflare Worker المباشرة إلى D1 لنوافذ `INVT003` (الأصناف) و`INVT004` (المستودعات). بقية المسارات غير الخاصة بالمخزون ما زالت تمر إلى Origin القديم مؤقتاً.

## Migration

طبّق الملفات بالترتيب:

```bash
npx wrangler d1 migrations apply onex-production \
  --remote \
  --config cloudflare/wrangler.jsonc
```

أضافت `0003_inventory_master_data.sql` الجداول التالية:

- `item_units`
- `warehouse_locations`
- `item_warehouse_settings`
- `user_warehouse_permissions`
- `inventory_settings`

وتستخدم الجداول الموجودة مسبقاً `items` و`warehouses` و`users` و`audit_events`.

## Worker secrets

يجب ضبط سر API في بيئة Worker:

```bash
npx wrangler secret put ONEX_API_TOKEN \
  --config cloudflare/wrangler.jsonc
```

ويجب ضبط أصول الواجهة المسموحة في `wrangler.jsonc` أو عبر متغير بيئي مثل:

```text
CORS_ORIGINS=https://your-frontend.example.com
```

كل طلب Inventory يحتاج:

```http
Authorization: Bearer <ONEX_API_TOKEN>
X-Onex-Actor: <validated-user-id>
X-Onex-Company-Id: <company-id>
```

`X-Onex-Actor` لا ينبغي أن يأتي مباشرة من متصفح عام؛ يجب أن تضيفه طبقة هوية موثوقة بعد التحقق من المستخدم. الرمز الحالي `ONEX_API_TOKEN` هو بوابة خدمة أولية، وليس بديلاً عن JWT أو جلسة مستخدم كاملة.

## المسارات

| الطريقة | المسار | الوظيفة |
|---|---|---|
| `GET` | `/api/inventory/items` | قائمة الأصناف، مع `search`, `active`, `limit` |
| `GET` | `/api/inventory/items/:id` | تفاصيل الصنف ووحداته |
| `POST` | `/api/inventory/items` | إنشاء صنف ووحدة الأساس |
| `PATCH` | `/api/inventory/items/:id` | تعديل الاسم والوصف والحالة والتكلفة |
| `GET` | `/api/inventory/warehouses` | قائمة المستودعات، مع `search`, `active` |
| `GET` | `/api/inventory/warehouses/:id` | تفاصيل المستودع ومواقعه |
| `POST` | `/api/inventory/warehouses` | إنشاء مستودع |
| `PATCH` | `/api/inventory/warehouses/:id` | تعديل الاسم أو الحالة |

## أمثلة

إنشاء صنف:

```bash
curl -X POST https://your-worker.example.com/api/inventory/items \
  -H 'Authorization: Bearer <token>' \
  -H 'X-Onex-Actor: admin-1' \
  -H 'X-Onex-Company-Id: 1' \
  -H 'content-type: application/json' \
  -d '{
    "code": "ITEM-001",
    "name": "صنف تجريبي",
    "description": "وصف الصنف",
    "itemType": "STOCK",
    "unitCode": "EA",
    "unitName": "قطعة",
    "unitCost": "12.500000"
  }'
```

إنشاء مستودع:

```bash
curl -X POST https://your-worker.example.com/api/inventory/warehouses \
  -H 'Authorization: Bearer <token>' \
  -H 'X-Onex-Actor: admin-1' \
  -H 'X-Onex-Company-Id: 1' \
  -H 'content-type: application/json' \
  -d '{"code":"WH-001","name":"المستودع الرئيسي"}'
```

## قواعد التنفيذ الحالية

- يتم تطبيع `unitCost` إلى ست منازل عشرية.
- يمنع تكرار كود الصنف داخل الشركة ويرجع `409 ITEM_CODE_EXISTS`.
- يمنع تكرار كود المستودع داخل الشركة ويرجع `409 WAREHOUSE_CODE_EXISTS`.
- القيم غير الصالحة مثل `NaN` و`Infinity` والقيم النصية غير الرقمية ترفض.
- استعلامات D1 تستخدم `prepare().bind()`.
- إنشاء الصنف يسجل وحدة الأساس وسجل التدقيق في `batch()` واحدة.
- لا يتم حذف الصنف أو المستودع فعلياً؛ استخدم `active = 0` للإيقاف المنطقي.
- كل قراءة مقيدة بـ`companyId` لمنع تسرب بيانات شركة أخرى.

## ما يتبقى قبل الإنتاج الكامل

1. استبدال بوابة `ONEX_API_TOKEN` بمصادقة مستخدم JWT/جلسة موثقة.
2. تنفيذ API لإدارة وحدات إضافية، المواقع، صلاحيات المستودعات، والأرصدة.
3. ربط Workbench بهذه المسارات بدلاً من tRPC/Origin عند شاشة INVT003 وINVT004.
4. إضافة سياسة صلاحيات فعلية لكل إجراء (`VIEW`, `CREATE`, `UPDATE`, `POST`).
5. تطبيق migration على D1 البعيدة بعد النسخ الاحتياطي والمراجعة.
