from pathlib import Path
from urllib.parse import unquote
import hashlib
import json
import re
import os
from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parents[1]

def main():
    report = ROOT / '11_Reports/Audit_Reports'
    manifest = json.loads((ROOT / '02_Research/Analysis/source_manifest.json').read_text(encoding='utf-8'))
    mapping = {r['old']: r['new'] for r in json.loads((report / 'relocation-map.json').read_text(encoding='utf-8'))}
    edits = {r['path']:r['after_sha256'] for r in json.loads((report / 'path-edits.json').read_text(encoding='utf-8'))}
    failures = []
    for record in manifest:
        path = ROOT.parent / mapping['Qosyl/' + record['copy'].replace('\\', '/')]
        expected = edits.get(path.relative_to(ROOT).as_posix(), record['sha256'])
        if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            failures.append(f'Changed canonical source: {path}')
    book = load_workbook(ROOT / '02_Research/Inputs/Опросник по проекту (Ответы) (2).xlsx', read_only=True, data_only=True)
    rows = list(book.active.values)[1:]
    rows = [r for r in rows if any(v is not None for v in r)]
    def count(column, value):
        return sum(value in str(row[column]) for row in rows if len(row) > column)
    metrics = {
        'responses': len(rows),
        'interest_4_5': sum(float(r[16]) in (4, 5) for r in rows),
        'payment_guarantee': count(14, 'Гарантия оплаты'),
        'clear_brief': count(14, 'Чёткое техническое задание'),
        'verified_client': count(14, 'Проверенный заказчик'),
        'up_to_5_hours': count(10, 'Менее 3 часов') + count(10, '3–5 часов'),
        'paid_experience': count(7, 'Да, за оплату'),
        'short_tasks': count(11, 'Небольшие задания на 1–3 дня'),
    }
    expected = dict(responses=45, interest_4_5=41, payment_guarantee=35, clear_brief=28, verified_client=22, up_to_5_hours=26, paid_experience=21, short_tasks=20)
    if metrics != expected:
        failures.append('Survey metrics differ from report')
    documents = []
    for directory, dirs, names in os.walk(ROOT, followlinks=False):
        dirs[:] = [d for d in dirs if d not in {'.git', '.local', '.next', 'node_modules', 'playwright-report', 'test-results', '__pycache__'} and not (Path(directory)/d).is_junction()]
        documents.extend(Path(directory)/n for n in names if n.endswith('.md'))
    checked_links = 0
    for path in documents:
        for target in re.findall(r'\]\((<[^>]+>|(?:[^()\n]|\([^()\n]*\))+)\)', path.read_text(encoding='utf-8-sig')):
            target = target.strip('<>').split('#')[0]
            if not target or '://' in target:
                continue
            checked_links += 1
            if not (path.parent / unquote(target)).exists():
                failures.append(f'Broken link: {path.name}: {target}')
    counts = json.loads((ROOT / '02_Research/Analysis/survey_counts.json').read_text(encoding='utf-8'))[0]
    for column in counts['columns']:
        if 'counts' in column and sum(column['counts'].values()) != column['answered']:
            failures.append(f'Count mismatch: {column["column"]}')
    registry = json.loads((ROOT / '02_Research/Corpus/student-business-platform/data/evidence_normalized.json').read_text(encoding='utf-8'))
    result = {'source_copies_verified': len(manifest), 'survey_metrics': metrics, 'research_registry_records': len(registry), 'documents_checked': len(documents), 'local_links_checked': checked_links, 'failures': failures, 'passed': not failures}
    (report / 'package_validation.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if failures:
        raise SystemExit(1)

if __name__ == '__main__':
    main()
