"""Verify preserved content before producing a narrow deletion manifest."""
import json
import zipfile
from plan_reorganization import BASE, REPORT, ARCHIVE, sha
from hashlib import sha256

rows = json.loads((REPORT / 'relocation-map.json').read_text(encoding='utf-8'))
approved = []
with zipfile.ZipFile(ARCHIVE / 'pre-relocation-documents.zip') as archive:
    for row in rows:
        if row['action'] != 'DELETE_DUPLICATE':
            continue
        source, canonical = BASE / row['old'], BASE / row['new']
        if sha(source) != row['sha256']:
            raise RuntimeError('Duplicate changed: ' + row['old'])
        proof = str(canonical)
        if not canonical.is_file() or sha(canonical) != row['sha256']:
            original = next(r['old'] for r in rows if r['new'] == row['new'] and r['action'] != 'DELETE_DUPLICATE')
            if sha256(archive.read(original)).hexdigest() != row['sha256']:
                raise RuntimeError('Preserved original mismatch: ' + original)
            proof = '99_Archive/2026-10-25-reorganization/pre-relocation-documents.zip :: ' + original
        approved.append({**row, 'preserved_copy': proof, 'reason': 'Identical SHA256; canonical content retained, references redirected'})
(REPORT / 'approved-duplicate-deletions.json').write_text(json.dumps(approved, ensure_ascii=False, indent=2), encoding='utf-8')
print('Verified exact duplicates:', len(approved))
