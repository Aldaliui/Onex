# مصفوفة توسعة نوافذ النظام القديم

**المصدر:** `aldalistor/cloud-onex` — Catalog وRuntime Contracts وUnified Contracts وRebuild Manifest.
**ملاحظة:** فسّرت اختصار المستخدم «AV» على أنه **AP / الدائنون والمشتريات**؛ إذا كان المقصود وحدة أخرى يمكن تغيير قاعدة التصنيف.

## النتيجة الرئيسية

يوجد **1490** نافذة في Catalog. الموصول حالياً في Workbench/الـAPI هو **25** نافذة، والمفقود تشغيلياً **1465** نافذة. جميع النوافذ المفهرسة حالياً مصنفة في الـmanifest على `catalog_specification` ومصدرها `FMB_PLL_not_found`; لذلك كلمة «مفقودة» تعني غير موصولة كوظيفة فعلية في الواجهة/الـAPI، وليس أنها غير معروفة في المصدر.

## حسب الوحدة

| الوحدة | الإجمالي | موصول حالياً | مفقود للتوسعة | مؤشرات الإجراءات | Triggers | الحقول المرصودة |
|---|---:|---:|---:|---:|---:|---:|
| GL | 52 | 6 | 46 | 3,581 | 420 | 29,595 |
| AR | 70 | 3 | 67 | 3,485 | 559 | 36,197 |
| AP | 35 | 3 | 32 | 2,091 | 278 | 21,970 |
| INVENTORY | 271 | 2 | 269 | 4,528 | 732 | 74,398 |
| POS | 52 | 2 | 50 | 1,661 | 322 | 18,785 |
| MRP | 95 | 1 | 94 | 742 | 77 | 29,237 |
| HR | 148 | 1 | 147 | 8,239 | 1,079 | 58,882 |
| ADMIN | 517 | 4 | 513 | 20,385 | 3,151 | 219,144 |
| REPORTS | 250 | 3 | 247 | 4,464 | 527 | 69,287 |

## النوافذ الموصولة حالياً

| الوحدة | النوافذ |
|---|---|
| GL | GLSI001, GLST001, GLST002, GLST004, GLST005, GLST006 |
| AR | ARST003, ARST004, ARST006 |
| AP | APSI002, APST003, APST005 |
| INVENTORY | INVT003, INVT004 |
| POS | POSLGN, POST001 |
| MRP | MRPACS004 |
| HR | HRSI002 |
| ADMIN | ADMT027, ERP_DBA, ERP_DBA_DFLT_DATA, ERP_JOURNAL |
| REPORTS | ARSR041, GLSR001, HRSR002 |

## موجات التوسعة المقترحة

### الموجة 1 — إكمال النواة المالية والمخزون

ابدأ بالنوافذ التالية لأنها الأقرب إلى الدورة التي يعمل عليها النظام حالياً:

| الوحدة | النوافذ المقترحة | الهدف |
|---|---|---|
| GL | `GLST001`, `GLST002`, `GLST004`, `GLST005`, `GLST006`, `GLSI001`, ثم `GLST008`, `GLST010`, `GLST017`, `GLST018`, `GLST020` | دليل الحسابات، القيود، الاستعلام، العكس والإقفال |
| AR | `ARST002`, `ARST005`, `ARST007`, `ARST012`, `ARST023`, ثم `ARSI002–ARSI023`, `ARSR001–ARSR041` حسب الدليل | العملاء، مستندات البيع، التحصيل، كشوف الحساب والتقارير |
| AP | `APST001`, `APST002`, `APST004`, `APST008`, `APST010`, `APST015`, `APST019`, ثم `APSI001`, `APSI003`, `APSS001–APSS010` | الموردون، المشتريات، الدفع وكشوف الموردين |
| INVENTORY | `INVT001`, `INVT002`, `INVT005`, `INVT006`, `INVT007`, `INVT008`, `INVT011`, `INVT016`, `INVT017`, `INVT018`, ثم `INVI001–INVI023` | الأصناف، الأرصدة، الحركات، الجرد والتحويلات |

### الموجة 2 — POS والتقارير والتكاملات

| الوحدة | النوافذ المقترحة |
|---|---|
| POS | `POS_INSTALL`, `POSI001–POSI014`, `POSS001–POSS003`, `POSR001–POSR011` |
| Reports | كل `GLSR`, `ARSR`, `APSR`, `INVR`, `MRPR`, `HRSR`, و`FASR` بعد تعريف parameter contracts |
| ADMIN | `ADMT020–ADMT031`, `ERP_DBA_TRK`, `ADMI001–ADMI021`, ثم الصلاحيات والمراقبة |

### الموجة 3 — MRP وHR والأصول

هذه الوحدات موجودة في المصدر بكثافة، لكنها تحتاج نماذج أعمال مستقلة قبل ربطها بـD1: التصنيع، BOM، التخطيط، الموظفون، الحضور، الرواتب، الأصول والصيانة.

## ما الذي نستخرجه من كل نافذة؟

| المجال | المصدر/الحقل | المعنى |
|---|---|---|
| الهوية والترتيب | `nodes_catalog_links.csv`: `f_sys`, `sys_no`, `form_no`, `parent_no`, `file_name`, `order_no`, `scr_type`, `doc_type`, `name_ar`, `name_en` | موقع النافذة في شجرة النظام، الأب، نوع الشاشة، وترتيب العرض |
| حقوق الوصول | `bt_priv`, وعبارات SQL مثل `S_BRN_USR_PRIV`, `PRIVILEGE_WH`, `PRIV_ACC`, `IAS_PRIV_PROJECTS`, `Ias_Priv_Actvty` | صلاحيات المستخدم والفرع والمستودع والحساب والمشروع ومركز النشاط |
| دورة العمل | `window_runtime_contracts.csv`: `inferred_operations`, `core_api`, `legacy_packages` | العمليات المتوقعة، واجهة النواة، وحزم Oracle المرتبطة |
| الإجراءات | `form_field_trigger_catalog.csv`: `procedures` | إجراءات الحفظ والحذف والتحقق والترحيل والطباعة وغيرها |
| الأحداث | `form_field_trigger_catalog.csv`: `triggers` | `PRE_FORM`, `WHEN_NEW_FORM_INSTANCE`, `KEY_ENTQRY`, `KEY_EXEQRY`, `POST_FORMS_COMMIT`, و`LOV_TRG` وغيرها |
| البيانات | `fields`, `tables`, `sql_fragments` | الحقول، الجداول المشار إليها، واستعلامات/آثار SQL |
| المخاطر | `window_catalog.csv` و`rebuild-manifest` | dynamic SQL، destructive، credentials، network، windows_native وغيرها |

## نموذج الحقوق والإجراءات المقترح في النظام الجديد

لا ننقل النصوص القديمة كما هي إلى صلاحيات عشوائية؛ نطبعها إلى عقد موحد لكل نافذة:

| العنصر | أمثلة |
|---|---|
| View | `WINDOW:ARST004:VIEW` |
| Create | `WINDOW:ARST004:CREATE` |
| Update | `WINDOW:ARST004:UPDATE` |
| Delete/Void | `WINDOW:ARST004:VOID` |
| Approve | `WINDOW:ARST004:APPROVE` |
| Post | `WINDOW:ARST004:POST` |
| Reverse/Return | `WINDOW:ARST004:REVERSE` |
| Print/Export | `WINDOW:ARST004:PRINT` |
| Scope | `COMPANY`, `BRANCH`, `WAREHOUSE`, `ACCOUNT`, `PROJECT`, `ACTIVITY` |

لكل نافذة يجب حفظ عقد من الشكل التالي:

```json
{
  "legacyForm": "ARST004.fmx",
  "module": "AR",
  "parentId": "...",
  "displayOrder": 42,
  "permissions": ["VIEW", "CREATE", "UPDATE", "POST", "REVERSE", "PRINT"],
  "scope": ["COMPANY", "BRANCH", "WAREHOUSE"],
  "procedures": ["B4SAVE_PRC", "POST_FORMS_COMMIT"],
  "triggers": ["PRE_FORM", "KEY_EXEQRY", "POST_FORMS_COMMIT"],
  "tables": ["..."],
  "evidence": "FMX_STRING_EVIDENCE",
  "runtimeStatus": "CATALOG_ONLY"
}
```

## ملاحظات جودة المصدر

- بعض النوافذ تحمل أسماء أو نسخاً مكررة/غير طبيعية مثل `ADMT022ث` و`بADMT022`؛ يجب تنظيف الهوية قبل إنشاء route أو table key.
- `unified_window_contracts.csv` يضع أحياناً `domain=OTHER` رغم أن runtime يصنف النافذة في `INVENTORY`؛ استخدم runtime + prefix + hierarchy معاً ولا تعتمد على عمود واحد.
- `nodes_catalog_links.csv` يحتوي 39 صفاً فقط في النسخة الحالية، لذلك الترتيب الكامل لا يمكن استنتاجه لكل 1490 نافذة من هذا الملف وحده؛ الباقي يحتاج مصدر hierarchy أوسع أو استخراجاً إضافياً.
- الأرقام في `procedures`, `triggers`, `fields`, `tables` هي أدلة/مؤشرات استخراج وليست بالضرورة عدد وظائف سليمة قابلة للتنفيذ.

## الملفات الناتجة

- `cloud-onex-window-matrix.csv`: صف مستقل لكل نافذة، مناسب للفرز والتصفية في Excel.
- `window_gap_matrix.json`: مصفوفة الأدلة الخام الكاملة.
- `window_gap_summary.txt`: ملخص التوزيع والأولوية.

