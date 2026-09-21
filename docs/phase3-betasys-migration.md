# تقرير المرحلة الثالثة: ترحيل واختبار بيانات BetaSys القديمة

**الحالة:** منفذة في وضع التحقق وstaging فقط  
**التاريخ:** 2026-09-21  
**مصدر المستودع:** `aldalistor/betasys`  
**نسخة المصدر:** `83df8019cfdd5081846b2e7f0a8c8af054fe426c`  
**لقطة البيانات:** `data/database_snapshot.sql`  
**SHA-256 للّقطة:** `82d713179ca793bd7c178d3aa2ef3c6a3caf23ebfaa4ce40daf2412df0fe1b55`

## 1. قرار التشغيل

نُفذت المرحلة في وضع `VALIDATE_ONLY`. لم تُكتب أي بيانات إلى قاعدة cloud-onex التشغيلية، ولم تُنفذ عملية تحميل نهائي. هذا القرار مقصود لأن مستودع BetaSys يصرح بأن قيمة المخزون الحالية تحتاج إلى مطابقة إضافية مع جداول الوحدات والمواقع قبل اعتبارها قيمة مالية معتمدة.

المخرج الحالي هو خطة ترحيل وstaging قابلة لإعادة التشغيل، تحتفظ بالحمولة الخام، والحمولة الموحدة، وهوية المصدر، و`sourceHash`، وحالة التحقق، والتحذيرات.

## 2. نتائج القراءة والتحقق

| الكيان | السجلات المقروءة | صالحة بنيويًا | مرفوضة | التحذيرات |
|---|---:|---:|---:|---:|
| الحسابات | 785 | 785 | 0 | 0 |
| الأصناف | 4,548 | 4,548 | 0 | 4,548 |
| الأطراف | 336 | 336 | 0 | 0 |
| العمليات | 210 | 210 | 0 | 0 |
| **الإجمالي** | **5,879** | **5,879** | **0** | **4,548** |

التحقق البنيوي نجح لكل السجلات. التحذير على الأصناف لا يعني أن السجل غير صالح؛ بل يعني أن القيمة المرشحة للمخزون لا تزال غير معتمدة ماليًا.

## 3. تعارضات المصدر المكتشفة

اكتشف المحول **ثلاثة تعارضات في هوية المصدر** داخل `legacy_items`. تكررت المعرفات التالية مع بيانات صنف مختلفة:

- `104146`
- `105562`
- `11386`

لذلك لا يجوز تحميل هذه السجلات إلى جدول يفرض `UNIQUE(source_system, source_id)` قبل اعتماد قرار المجال. الخيارات الآمنة هي ربط الهوية بمفتاح مركب يشمل الموقع أو الوحدة إذا أثبتت البيانات ذلك، أو إنشاء سجل تعارض يدوي، أو اعتماد أحد السجلين وفق مصدر موثق. لم يُتخذ أي من هذه القرارات تلقائيًا.

## 4. نتيجة المخزون

بلغت القيمة المرشحة المحسوبة من `stockQty × averageCost` مقدارًا قدره:

```text
0.00
```

لا تُفسر هذه النتيجة على أنها رصيد مخزون صفري. تقرير BetaSys نفسه يوضح أن بيانات التكلفة والرصيد تحتاج إلى مطابقة مع جداول الوحدات والمواقع. لذلك سُجلت في التقرير الخاصية `inventoryValueApproved: false`، ويجب إبقاء القيمة خارج الأرصدة الافتتاحية إلى أن تُستكمل المطابقة.

## 5. ما تم تنفيذه

أُنشئت حزمة `@erp/adapters`، وتحتوي على:

- قارئ SQL للقطات BetaSys.
- تحويل سجلات `legacy_accounts` إلى staging للحسابات.
- تحويل سجلات `legacy_items` إلى staging للأصناف.
- تحويل سجلات `legacy_parties` إلى staging للعملاء والموردين.
- تحويل سجلات `legacy_operations` إلى staging للحركات.
- حساب SHA-256 للقطة المصدر وhash لكل سجل.
- كشف السجلات المكررة قبل التحميل.
- تحويل التواريخ من صيغة `DD/MM/YYYY` إلى `YYYY-MM-DD`.
- رفض السجلات المشوهة بدل تمريرها بصمت.
- توليد تقرير JSON كامل قابل للمراجعة وإعادة التشغيل.

## 6. الاختبارات

أُضيفت أربعة اختبارات:

1. قراءة عبارة INSERT وتحويلها إلى سجل مصدر.
2. التحقق من أعداد السجلات الفعلية في اللقطة.
3. اختبار خرائط الحساب والصنف والطرف والعملية.
4. التأكد من رفض السجلات الناقصة أو ذات القيم غير الصالحة.

نتيجة التنفيذ:

```text
4 tests
4 passed
0 failed
```

## 7. طريقة إعادة التشغيل

```bash
cd /home/ubuntu/erp-foundation/packages/erp-adapters
pnpm install
pnpm build
pnpm test
pnpm validate-snapshot \
  /home/ubuntu/betasys-source/data/database_snapshot.sql \
  /home/ubuntu/erp-foundation/migration-reports/betasys-validation.json
```

## 8. الملفات الناتجة

- [تقرير التحقق الكامل بصيغة JSON]( /home/ubuntu/erp-foundation/migration-reports/betasys-validation.json)
- `packages/erp-adapters/src/betasys/sql-snapshot-reader.ts`
- `packages/erp-adapters/src/betasys/mapper.ts`
- `packages/erp-adapters/src/betasys/migration-plan.ts`
- `packages/erp-adapters/src/betasys/types.ts`
- `packages/erp-adapters/src/betasys/index.ts`
- `packages/erp-adapters/src/validate-snapshot.ts`
- `packages/erp-adapters/test/betasys-migration.test.mjs`

## 9. قرار الخروج من المرحلة

تخرج المرحلة الثالثة من التحقق الأولي بنجاح، لكنها لا تنتقل إلى `LOAD` أو الإنتاج قبل حل تعارضات الأصناف الثلاثة واعتماد القيمة المالية للمخزون. بعد ذلك يجب إنشاء mapping رسمي للحسابات والأصناف والأطراف إلى كيانات cloud-onex، وتشغيل reconciliation مع أرصدة mido وBetaSys، ثم تنفيذ تحميل تجريبي داخل قاعدة staging منفصلة.

## المراجع

[1]: https://github.com/aldalistor/betasys "مصدر BetaSys على GitHub"
[2]: https://www.rfc-editor.org/rfc/rfc8259 "The JavaScript Object Notation (JSON) Data Interchange Format"

## سجل التغييرات

| الإصدار | التاريخ | التغيير |
|---|---|---|
| 1.0 | 2026-09-21 | تنفيذ التحقق الأولي وبناء محول staging للقطة BetaSys |
|  |  |  |
