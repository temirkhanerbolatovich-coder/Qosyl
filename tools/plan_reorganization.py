"""Prepare an auditable relocation map. Does not move or delete files."""
import csv
import hashlib
import json
import os
import zipfile
from pathlib import Path

BASE = Path(__file__).resolve().parents[2]
ROOT = BASE / 'Qosyl'
REPORT = ROOT / '11_Reports/Audit_Reports'
ARCHIVE = ROOT / '99_Archive/2026-10-25-reorganization'
PREFIXES = {
    'Qosyl/01_sources/attachments/': 'Qosyl/02_Research/Inputs/',
    'Qosyl/02_evidence/': 'Qosyl/02_Research/Analysis/',
    'research/': 'Qosyl/02_Research/Corpus/',
    'Qosyl/05_delivery/': 'Qosyl/01_Project_Overview/Roadmap/',
    'Qosyl/04_audit/': 'Qosyl/11_Reports/Audit_Reports/initial-audit/',
}
EXACT = {
    'README.md': 'Qosyl/docs/development-guide.md',
    'Qosyl/README.md': 'Qosyl/99_Archive/2026-10-25-reorganization/audit-package-README.md',
    'Qosyl/.gitignore': 'Qosyl/99_Archive/2026-10-25-reorganization/audit-package.gitignore',
    'Qosyl/03_product/vision.md': 'Qosyl/01_Project_Overview/vision.md',
    'Qosyl/03_product/requirements.md': 'Qosyl/03_Product_Requirements/requirements.md',
    'Qosyl/03_product/aggregator.md': 'Qosyl/05_Modules/Opportunity_Content_Aggregator/specification.md',
}

def destination(old):
    if old in EXACT:
        return EXACT[old]
    for prefix, target in PREFIXES.items():
        if old.startswith(prefix):
            return target + old[len(prefix):]
    return old if old.startswith('Qosyl/') else 'Qosyl/' + old

def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1048576), b''):
            h.update(block)
    return h.hexdigest()

def main():
    rows = list(csv.DictReader((REPORT / 'inventory-before.csv').open(encoding='utf-8-sig')))
    external = Path.home() / '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'
    operations = []
    for row in rows:
        old = row['path']
        canonical = None
        if old.startswith('Qosyl/01_sources/research/scripts/node_modules/'):
            canonical = external / old.split('scripts/node_modules/', 1)[1]
        elif old.startswith('Qosyl/01_sources/research/'):
            canonical = BASE / 'research/student-business-platform' / old.split('Qosyl/01_sources/research/', 1)[1]
        elif old == 'опросник.pdf':
            canonical = ROOT / '01_sources/attachments/опросник.pdf'
        if canonical is not None:
            duplicate = canonical.is_file() and sha(canonical) == row['sha256']
            target = destination(canonical.relative_to(BASE).as_posix()) if canonical.is_relative_to(BASE) else str(canonical)
            if duplicate:
                action = 'DELETE_DUPLICATE'
            else:
                action = 'REVIEW'
                target = 'Qosyl/99_Archive/Review/' + old.removeprefix('Qosyl/')
        else:
            target = destination(old)
            action = 'KEEP' if old == target else 'MOVE'
            if '/99_Archive/' in target or '/initial-audit/' in target:
                action = 'ARCHIVE'
        operations.append(dict(old=old, new=target, action=action, sha256=row['sha256']))
    (REPORT / 'relocation-map.json').write_text(json.dumps(operations, ensure_ascii=False, indent=2), encoding='utf-8')
    # Preserve exact pre-edit documents/configuration, not another copy of runtime dependencies.
    ARCHIVE.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(ARCHIVE / 'pre-relocation-documents.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
        for row in rows:
            path = Path(row['path'])
            if any(p in {'.git', '.local', '.next', 'node_modules', '01_sources'} for p in path.parts):
                continue
            if path.suffix in {'.md', '.py', '.json', '.mjs'} or path.name in {'.gitignore', '.dockerignore', '.prettierignore'}:
                if path.parts[0] not in {'src', 'tests', 'prisma'}:
                    archive.write(BASE / path, path.as_posix())
    cold = []
    for folder in ['.git', '.local']:
        for directory, dirs, files in os.walk(BASE / folder):
            dirs[:] = [d for d in dirs if not (Path(directory)/d).is_junction()]
            for name in files:
                path = Path(directory) / name
                cold.append({'path': path.relative_to(BASE).as_posix(), 'sha256': sha(path)})
    (REPORT / 'cold-state-hashes.json').write_text(json.dumps(cold, ensure_ascii=False, indent=2), encoding='utf-8')
    from collections import Counter
    print(dict(Counter(item['action'] for item in operations)))

if __name__ == '__main__':
    main()
