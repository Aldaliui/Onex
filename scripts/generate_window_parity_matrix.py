from __future__ import annotations
import csv, re
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path('/home/ubuntu/cloud-onex')
SRC = ROOT / 'legacy-source'
OUT = ROOT / 'docs' / 'window-parity'
OUT.mkdir(parents=True, exist_ok=True)

def read_csv(name):
    path = SRC / name
    with path.open(encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))

def clean_window(value):
    value = (value or '').strip().replace('\\', '/')
    value = value.rsplit('/', 1)[-1]
    return re.sub(r'\.fmx$', '', value, flags=re.I).upper()

def int_value(value):
    try: return int(value or 0)
    except ValueError: return 0

def unique(values, limit=None):
    out=[]; seen=set()
    for value in values:
        value=(value or '').strip()
        if value and value not in seen:
            seen.add(value); out.append(value)
    return out[:limit] if limit else out

catalog = read_csv('window_catalog.csv')
runtime = read_csv('window_runtime_contracts.csv')
unified = read_csv('unified_window_contracts.csv')
manifest = read_csv('generated_code_manifest.csv')
trace = read_csv('function_traceability.csv')

by_runtime=defaultdict(list); by_unified=defaultdict(list); by_manifest=defaultdict(list); by_trace=defaultdict(list)
for row in runtime: by_runtime[clean_window(row.get('window'))].append(row)
for row in unified: by_unified[clean_window(row.get('legacy_form'))].append(row)
for row in manifest: by_manifest[clean_window(row.get('window'))].append(row)
for row in trace: by_trace[clean_window(row.get('window'))].append(row)

rows=[]
for c in catalog:
    wid=clean_window(c.get('file'))
    r=by_runtime[wid][0] if by_runtime[wid] else {}
    u=by_unified[wid][0] if by_unified[wid] else {}
    m=by_manifest[wid][0] if by_manifest[wid] else {}
    t=by_trace[wid]
    domain=(r.get('domain') or c.get('category') or 'UNKNOWN').strip()
    actions=unique((u.get('actions') or '').split('|') + (r.get('inferred_operations') or '').split(';'))
    packages=unique((r.get('legacy_packages') or '').split(';'))
    risks=unique((c.get('risks') or '').split(','))
    observed_fields=int_value(r.get('observed_field_count'))
    standard_fields=int_value(u.get('standard_field_count'))
    triggers=int_value(c.get('triggers') or r.get('observed_trigger_count'))
    tables=int_value(c.get('tables') or r.get('observed_table_count'))
    procedures=int_value(c.get('procedures') or r.get('observed_procedure_count'))
    status=(u.get('production_status') or m.get('status') or 'CATALOG_ONLY').strip()
    if observed_fields or standard_fields or triggers or tables or procedures:
        evidence='CATALOG_EVIDENCE'
    else:
        evidence='NO_STRUCTURED_EVIDENCE'
    missing=[]
    if not observed_fields: missing.append('أسماء الحقول وأنواعها وقيمها الافتراضية')
    if not t and not procedures: missing.append('الإجراءات/Program Units بأسمائها ومصادرها')
    if not triggers: missing.append('تعريفات Triggers ومتى تُنفذ')
    if not tables: missing.append('علاقات الجداول وعمليات القراءة والكتابة')
    if not packages: missing.append('PKS/PKB للحزم Oracle')
    missing += ['التقارير والطباعة المرتبطة', 'مصفوفة الصلاحيات التفصيلية', 'حالات الاستخدام والسيناريوهات المرجعية']
    rows.append({
        'window': wid, 'screen': f'{wid}.fmx', 'domain': domain,
        'fields_observed': observed_fields, 'fields_standard': standard_fields,
        'actions': '|'.join(actions), 'triggers': triggers, 'tables': tables,
        'procedures': procedures, 'packages': '|'.join(packages),
        'reports': 'PRINT/EXPORT (استدلال من العقد)' if 'print' in [a.lower() for a in actions] or 'export' in [a.lower() for a in actions] else 'غير موثق',
        'permissions': 'ROLE_ADMIN للإدارة؛ ROLE_USER لباقي النوافذ + نطاق الشركة/الفرع (قاعدة ONEX العامة)',
        'use_cases': 'تهيئة|استعلام|إضافة|تحقق|حفظ|تعديل|حذف/إلغاء|اعتماد|ترحيل|عكس|طباعة|تحديث|خروج',
        'status': status, 'evidence': evidence, 'missing': '؛ '.join(unique(missing)),
        'risks': '|'.join(risks), 'source': 'legacy-source/*.csv + *.rebuild.md'
    })

fields=['window','screen','domain','fields_observed','fields_standard','actions','triggers','tables','procedures','packages','reports','permissions','use_cases','status','evidence','missing','risks','source']
with (OUT/'window-parity-matrix.csv').open('w', encoding='utf-8-sig', newline='') as f:
    w=csv.DictWriter(f, fieldnames=fields); w.writeheader(); w.writerows(rows)

counts=Counter(r['status'] for r in rows)
domains=Counter(r['domain'] for r in rows)
with (OUT/'README.md').open('w', encoding='utf-8') as f:
    f.write('# مصفوفة توافق نوافذ ONEX مع النظام القديم\n\n')
    f.write('## النتيجة\n\n')
    f.write(f'تم توليد مصفوفة واحدة لكل **{len(rows):,}** نافذة من `legacy-source/window_catalog.csv`. المصفوفة تجمع الشاشة والحقول والإجراءات وTriggers والجداول والحزم والتقارير والصلاحيات وحالات الاستخدام، وتفصل بين الدليل المرصود وبين ما يزال مفقوداً.\n\n')
    f.write('> هذه ليست مطابقة نهائية. ملفات الكتالوج تستخرج مؤشرات من FMX/PLX ولا تعادل ملفات FMB أو PKS/PKB الأصلية. لذلك لا تُحوّل المؤشرات إلى أسماء حقول أو قواعد عمل مؤكدة.\n\n')
    f.write('## الملفات المولدة\n\n')
    f.write('- `window-parity-matrix.csv`: صف مستقل لكل نافذة، مناسب للاستيراد إلى Excel أو Sheets.\n')
    f.write('- `generation-rules.md`: ما تم توليده آلياً وما يتطلب مصدراً أصلياً.\n\n')
    f.write('## التغطية الحالية\n\n')
    f.write('| المؤشر | العدد |\n|---|---:|\n')
    f.write(f'| إجمالي النوافذ | {len(rows):,} |\n')
    for k,v in counts.most_common(): f.write(f'| الحالة: `{k}` | {v:,} |\n')
    f.write('\n### التوزيع حسب المجال\n\n| المجال | النوافذ |\n|---|---:|\n')
    for k,v in domains.most_common(): f.write(f'| `{k}` | {v:,} |\n')
    f.write('\n## ما تم توليده\n\n')
    f.write('يُولّد لكل نافذة اسم الشاشة القياسي، المجال، عدد الحقول المرصودة، عدد الحقول القياسية في العقد، الإجراءات القياسية، عدد Triggers والإجراءات والجداول، الحزم المرصودة، مؤشر التقارير والطباعة، نطاق الصلاحيات العام، وحالات الاستخدام القياسية.\n\n')
    f.write('## ما لا يجوز اختلاقه\n\n')
    f.write('لا يمكن من المؤشرات وحدها توليد أسماء الحقول وأنواعها، ولا ترتيب التنقل، ولا نصوص Triggers، ولا علاقات الجداول، ولا قواعد الحزم، ولا صيغ التقارير، ولا حدود الصلاحيات الخاصة بكل دور. هذه العناصر تحتاج ملفات `FMB` و`PLL` و`PKS` و`PKB` و`DDL` وملفات التقارير وبيانات اختبارية.\n\n')
    f.write('## معيار اعتماد النافذة\n\n')
    f.write('تنتقل النافذة من `CATALOG_ONLY` إلى `SPEC_ONLY` بعد توثيق الحقول والقواعد، ثم إلى `IN_PROGRESS` بعد بناء التنفيذ، ولا تصبح `VERIFIED` إلا بعد مقارنة القراءة والحفظ والتعديل والإلغاء والترحيل والعكس والطباعة مع النظام القديم على بيانات متطابقة.\n\n')
    f.write('## الأولوية المقترحة للتوليد\n\n')
    f.write('يبدأ التوليد التفصيلي من النوافذ ذات الصلة بدورة الأعمال: فواتير المبيعات والمشتريات، المرتجعات، المخزون، القيود، القبض والصرف، ثم التقارير. بعد ذلك تُستكمل النوافذ الإدارية والاستعلامية.\n\n')
    f.write('## مراجع المستودع\n\n')
    f.write('- `legacy-source/window_catalog.csv`\n- `legacy-source/window_runtime_contracts.csv`\n- `legacy-source/unified_window_contracts.csv`\n- `legacy-source/form_field_trigger_catalog.csv`\n- `legacy-source/generated_code_manifest.csv`\n')

with (OUT/'generation-rules.md').open('w', encoding='utf-8') as f:
    f.write('# قواعد التوليد وحدود المطابقة\n\n')
    f.write('## قواعد التوليد\n\n')
    f.write('1. الشاشة تُؤخذ من اسم ملف FMX/اسم النافذة.\n2. عدد الحقول وTriggers والجداول والإجراءات يُؤخذ من سجلات الكتالوجات كما هو.\n3. الإجراءات تُجمع من عقد النافذة ومن العمليات المستنتجة.\n4. الحزم تُؤخذ من `window_runtime_contracts.csv` دون إعادة تسمية أو استنتاج.\n5. التقارير تُسجل كمؤشر PRINT/EXPORT فقط عند وجود الإجراء في العقد.\n6. الصلاحيات وحالات الاستخدام العامة تُسجل كقالب ONEX، وتُعلّم كغير موثقة على مستوى النافذة حتى وصول مصفوفة الصلاحيات القديمة.\n\n')
    f.write('## فجوات التوليد\n\n')
    f.write('العناصر غير الموجودة في الملفات المصدرية لا تُملأ بقيم تخمينية. بدلاً من ذلك تُسجل في عمود `missing` حتى يمكن إغلاقها عندما يوفّر المستخدم ملفات FMB وPLL وPKS وPKB وDDL والتقارير وبيانات الاختبار.\n')

print(f'generated {len(rows)} windows in {OUT}')
print('statuses:', dict(counts))
