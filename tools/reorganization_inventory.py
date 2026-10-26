"""Read-only physical inventory; never follows directory junctions."""
import csv
import hashlib
import json
import os
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

BASE = Path(__file__).resolve().parents[2]
OUT = BASE / 'Qosyl/11_Reports/Audit_Reports'

def classify(relative):
    parts = Path(relative).parts
    if '.git' in parts:
        return 'KEEP', 'Git metadata and index; preserve byte-for-byte', 'current technical state'
    if parts[0] == '.local' or Path(relative).name == '.env':
        return 'MOVE', 'Private runtime, database, mail or configuration', 'preserve private state; do not publish'
    if relative.startswith('Qosyl/01_sources/research/scripts/node_modules/'):
        return 'DELETE', 'Accidental copied tool dependencies; canonical research uses external junction', 'reproducible redundant runtime'
    if any(p in {'.next', 'node_modules', 'test-results', 'playwright-report'} for p in parts):
        return 'MOVE', 'Runtime dependencies or generated build/test evidence', 'preserve; rebuild after relocation'
    if relative.startswith('Qosyl/01_sources/research/'):
        return 'REVIEW', 'Research copy; compare SHA256 with original before deduplication', 'candidate duplicate'
    if relative.startswith('Qosyl/04_audit/') or relative == 'Qosyl/README.md':
        return 'ARCHIVE', 'Historical audit before implementation', 'historical; retain'
    if relative.startswith(('research/', 'Qosyl/01_sources/', 'Qosyl/02_evidence/')) or relative.endswith('опросник.pdf'):
        return 'MOVE', 'Research evidence, originals or analysis', 'retain provenance; survey snapshots differ'
    if relative.startswith(('src/', 'tests/', 'prisma/', 'scripts/', 'deploy/')):
        return 'MOVE', 'Application source, tests, migrations or operational scripts', 'current; preserve relative layout'
    if relative.endswith('.md'):
        return 'MOVE', 'Project documentation; links require relocation', 'current or dated historical record'
    return 'MOVE', 'Project configuration or supporting artifact', 'retain'

def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    files, links = [], []
    for directory, dirs, names in os.walk(BASE, followlinks=False):
        for name in list(dirs):
            path = Path(directory) / name
            if path.is_symlink() or path.is_junction():
                links.append({'path': path.relative_to(BASE).as_posix(), 'target': str(path.resolve()), 'type': 'directory link'})
                dirs.remove(name)
        for name in names:
            path = Path(directory) / name
            if path.parent == OUT and name in {'inventory-before.csv', 'inventory-summary.json', 'links-before.json', 'duplicate-groups.json'}:
                continue
            files.append(path)

    def row(path):
        rel = path.relative_to(BASE).as_posix()
        stat = path.stat()
        action, purpose, currency = classify(rel)
        try:
            sha, error = digest(path), ''
        except OSError as exc:
            sha, error = '', type(exc).__name__
        return dict(path=rel, name=path.name, extension=path.suffix, size=stat.st_size,
                    modified_utc=datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
                    sha256=sha, action=action, purpose=purpose, relevance='Qosyl or its tooling',
                    currency=currency, newer_version='not inferred from date', duplicate_of='', error=error)
    with ThreadPoolExecutor(max_workers=4) as pool:
        rows = list(pool.map(row, sorted(files)))
    hashes = defaultdict(list)
    for item in rows:
        if item['sha256']:
            hashes[item['sha256']].append(item['path'])
    for item in rows:
        group = hashes[item['sha256']]
        if len(group) > 1:
            item['duplicate_of'] = next((p for p in group if p != item['path']), '')
    with (OUT / 'inventory-before.csv').open('w', encoding='utf-8-sig', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    for name, data in [('links-before.json', links), ('duplicate-groups.json', {k:v for k,v in hashes.items() if len(v)>1})]:
        (OUT / name).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    summary = {'files': len(rows), 'bytes': sum(r['size'] for r in rows), 'actions': dict(Counter(r['action'] for r in rows)),
               'errors': [r['path'] for r in rows if r['error']], 'links_not_followed': len(links)}
    (OUT / 'inventory-summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(summary, ensure_ascii=False))

if __name__ == '__main__':
    main()
