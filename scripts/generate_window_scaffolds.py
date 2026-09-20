from __future__ import annotations
import csv, json
from pathlib import Path

ROOT = Path('/home/ubuntu/cloud-onex')
source = ROOT / 'docs/window-parity/window-parity-matrix.csv'
out = ROOT / 'generated-windows'
out.mkdir(exist_ok=True)
rows=[]
with source.open(encoding='utf-8-sig', newline='') as f:
    for row in csv.DictReader(f):
        actions=[x for x in row['actions'].split('|') if x]
        packages=[x for x in row['packages'].split('|') if x]
        scaffold={
            'windowId': row['window'],
            'screen': {'legacyForm': row['screen'], 'domain': row['domain']},
            'status': 'GENERATED_SCAFFOLD',
            'sourceStatus': row['status'],
            'evidence': row['evidence'],
            'fields': {
                'observedCount': int(row['fields_observed'] or 0),
                'standardCount': int(row['fields_standard'] or 0),
                'names': [],
                'note': 'Field names/types require FMB or detailed field catalog.'
            },
            'actions': actions or ['initialize','query','new','validate','save','update','delete','approve','post','reverse','print','refresh','exit'],
            'triggers': {'observedCount': int(row['triggers'] or 0), 'definitions': [], 'note': 'Trigger bodies require FMB/PLL evidence.'},
            'database': {'tableIndicatorCount': int(row['tables'] or 0), 'tables': [], 'packages': packages, 'note': 'Exact relations require DDL and PKS/PKB.'},
            'reports': {'printOrExportEvidence': row['reports'], 'definitions': []},
            'permissions': {'roles': ['ROLE_USER'], 'adminOverride': row['domain'] == 'ADMIN', 'scope': ['COMPANY','BRANCH'], 'operations': ['OPEN','QUERY','CREATE','UPDATE','DELETE','POST','REVERSE','PRINT'], 'note': 'Detailed legacy privileges require security matrix.'},
            'useCases': [x for x in row['use_cases'].split('|') if x],
            'gaps': [x for x in row['missing'].split('؛ ') if x],
            'risks': [x for x in row['risks'].split('|') if x],
            'generation': {'generator': 'scripts/generate_window_scaffolds.py', 'source': row['source']}
        }
        rows.append(scaffold)
index={'schemaVersion':'1.0.0','generatedStatus':'SCAFFOLD_ONLY','windowCount':len(rows),'windows':rows}
(out/'window-scaffolds.json').write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding='utf-8')
(out/'README.md').write_text('''# حزم النوافذ المولدة\n\nتم توليد عقد موحد لكل نافذة من مصفوفة `docs/window-parity/window-parity-matrix.csv`. هذه الحزم تمنح كل نافذة هيكلاً قابلاً للتحميل في طبقة التشغيل، لكنها لا تدّعي استعادة منطق Oracle غير الموجود في الأدلة.\n\n## الملف\n\n`window-scaffolds.json` يحتوي 1,490 عقدة، ولكل عقدة الشاشة والحقول المرصودة والإجراءات والـTriggers والجداول والحزم والتقارير والصلاحيات وحالات الاستخدام والفجوات.\n\n## الحالة\n\nالحالة `GENERATED_SCAFFOLD` تعني أن الهيكل مولد وقابل للتوسعة. لا تصبح النافذة `VERIFIED` إلا بعد توفير المصدر القديم وإجراء اختبار مقارنة على بيانات متطابقة.\n''', encoding='utf-8')
print(f'generated {len(rows)} window scaffolds')
