import json
from pathlib import Path
root=Path('/home/ubuntu/cloud-onex')
data=json.loads((root/'generated-windows/window-scaffolds.json').read_text(encoding='utf-8'))
out=root/'generated-windows/by-domain'; out.mkdir(parents=True, exist_ok=True)
for domain in ('AR','ADMIN'):
    items=[w for w in data['windows'] if w['screen']['domain'].upper()==domain]
    payload={'schemaVersion':data['schemaVersion'],'generatedStatus':data['generatedStatus'],'domain':domain,'windowCount':len(items),'windows':items}
    (out/f'{domain.lower()}-scaffolds.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf-8')
    print(domain, len(items))
(out/'README.md').write_text('# حزم AR وADMIN\n\nهذه الملفات مستخرجة من `generated-windows/window-scaffolds.json` وتحتوي النوافذ الخاصة بالمبيعات والعملاء (`AR`) والإدارة والنظام (`ADMIN`).\n',encoding='utf-8')
