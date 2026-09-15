# مصفوفة ربط API لنظام ONEX Cloud

## نقطة التشغيل

يعمل Worker `onex-workbench` على قاعدة D1 `onex-production` من خلال binding باسم `ONEX_DB`. مسارات المخزون المحمية تتطلب `Authorization: Bearer` و`X-Onex-Actor` و`X-Onex-Company-Id`. وتعيد نقطة الصحة قائمة الجداول الموجودة من نفس binding.

| الوحدة | مسارات Worker | قاعدة البيانات | الأثر |
|---|---|---|---|
| البيانات الأساسية | `/api/erp/master-data`, `/api/erp/customers`, `/api/erp/items` | `companies`, `customers`, `suppliers`, `items`, `warehouses`, `currencies` | قراءة الأصناف والأطراف والمستودعات |
| المبيعات | `/api/erp/invoices`, `/api/erp/invoices/:id`, `/api/erp/invoices/:id/post`, `/api/erp/invoices/:id/reverse` | `invoices`, `invoice_lines` | إنشاء وترحيل وعكس الفاتورة وحركة المخزون والقيد |
| المشتريات | `/api/erp/purchases`, `/api/erp/purchases/:id/post` | `purchase_invoices`, `purchase_lines` | إنشاء وترحيل الشراء والاستلام والقيد |
| المخزون التشغيلي | `/api/inventory/items`, `/api/inventory/warehouses`, `/api/inventory/documents`, `/api/inventory/movements` | `inventory_documents`, `inventory_document_lines`, `stock_balances`, `stock_movements` | أصناف، مستودعات، استلام، صرف، تحويل، حركات |
| الجرد | `/api/inventory/counts`, `/api/inventory/counts/:id`, `/api/inventory/counts/:id/post` | `inventory_counts`, `inventory_count_lines` | جرد دوري ومستمر وتسوية كمية وقيمة وقيد فروقات |
| القيود | `/api/cloud/journals` | `journal_entries`, `journal_entry_lines` | قيد يدوي متوازن وتفاصيله |
| التقارير | `/api/cloud/reports/inventory`, `/api/cloud/reports/accounts`, `/api/cloud/reports/invoices` | جداول المخزون والدليل والفواتير | قراءة التقارير التشغيلية |
| الصحة | `/__health`, `/api/cloud/health`, `/api/inventory/health` | `sqlite_master` | إثبات اتصال Worker بـD1 |

## الجرد

يستخدم إنشاء الجرد رصيد النظام الحالي من `stock_balances`، ثم يحفظ الفرق في `inventory_count_lines`. عند الاعتماد تُحدّث الأرصدة وتسجّل `INVENTORY_GAIN` أو `INVENTORY_LOSS` ويُنشأ قيد مرتبط بـ`sourceInventoryDocumentId` وحسابي `4300` و`5300`.

## التحقق

تم فحص صياغة Worker محلياً عبر `node --check`. كما تم تطبيق ترحيل D1 `0012_inventory_counts` على قاعدة `onex-production` والتحقق من الجداول والفهارس وحسابات الفروقات وسجل الترحيل.

## حدود معروفة

مسارات إشعارات الخصم والإضافة والمرتجعات موجودة في تطبيق ONEX Cloud، لكن Worker الإنتاجي يحتاج ترحيل D1 مستقل لهذه المستندات وربط مساراتها إذا أريد تشغيلها مباشرة من `/api/inventory` أو `/api/erp`. لا تُستخدم مسارات `/api/cloud` العامة للكتابة الحساسة دون إضافة طبقة `requireWriteAuth`؛ المسارات المحمية الموصى بها هي `/api/erp` و`/api/inventory`.
