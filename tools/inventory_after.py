"""Current physical snapshot; never follows junctions or prints private content."""
import csv
import hashlib
import json
import os
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / '11_Reports/Audit_Reports'
SELF_REPORTS = {'inventory-after.csv', 'final-summary.json', 'final-content-changes.json', 'links-after.json', 'package_validation.json'}

def digest(path):
    result = hashlib.sha256()
    with path.open('rb') as stream:
        for data in iter(lambda: stream.read(1048576), b''):
            result.update(data)
    return result.hexdigest()

def main():
    for name in SELF_REPORTS:
        if not (REPORT / name).exists():
            (REPORT / name).write_text('', encoding='utf-8')
    files, links, dirs_seen = [], [], []
    for directory, dirs, names in os.walk(ROOT, followlinks=False):
        for name in list(dirs):
            path = Path(directory)/name
            dirs_seen.append(path.relative_to(ROOT).as_posix())
            if path.is_junction() or path.is_symlink():
                links.append({'path': path.relative_to(ROOT).as_posix(), 'target': str(path.resolve()), 'target_exists': path.exists()})
                dirs.remove(name)
        files.extend(Path(directory)/name for name in names)
    report = REPORT / 'CLEANUP_REPORT.md'
    text = report.read_text(encoding='utf-8')
    text = re.sub(r'- После: .*?\n', f'- После: **{len(files):,} файлов** в снимке; точные данные — [final-summary.json](final-summary.json) и [inventory-after.csv](inventory-after.csv). Сюда входят новые отчёты и результаты пересборки.\n'.replace(',', ' '), text, count=1)
    report.write_text(text, encoding='utf-8')
    def row(path):
        relative = path.relative_to(ROOT).as_posix()
        category = 'PROJECT'
        if path.parent == REPORT and path.name in SELF_REPORTS:
            category = 'SELF_REPORT'
        elif relative.startswith(('.local/', '.next/')):
            category = 'MUTABLE_RUNTIME'
        try:
            stat = path.stat()
            return dict(path=relative, size=stat.st_size, sha256='' if category == 'SELF_REPORT' else digest(path), category=category, error='')
        except OSError as exc:
            return dict(path=relative, size=0, sha256='', category=category, error=type(exc).__name__)
    with ThreadPoolExecutor(max_workers=4) as pool:
        rows = list(pool.map(row, sorted(files)))
    current = {r['path']:r for r in rows}
    originals = json.loads((REPORT / 'relocation-map.json').read_text(encoding='utf-8'))
    edits, core_errors = [], []
    core_prefixes = ('src/', 'tests/', 'prisma/', 'scripts/', 'deploy/')
    for original in originals:
        if original['action'] == 'DELETE_DUPLICATE':
            continue
        relative = original['new'].removeprefix('Qosyl/')
        actual = current.get(relative)
        if not actual or actual['sha256'] != original['sha256']:
            kind = 'runtime/build/test output' if relative.startswith(('.local/', '.next/', 'node_modules/', 'test-results/', 'playwright-report/')) or relative in {'tsconfig.tsbuildinfo', 'next-env.d.ts'} else 'document, configuration, or audit tool update'
            edits.append({'old': original['old'], 'new': relative, 'before_sha256': original['sha256'], 'after_sha256': actual['sha256'] if actual else None, 'reason': kind})
            if relative.startswith(core_prefixes) or relative in {'.env', '.git/index', 'package.json', 'package-lock.json'}:
                core_errors.append(relative)
    names = [r['path'].casefold() for r in rows]
    collision = len(names) != len(set(names))
    result = {
        'snapshot_utc': datetime.now(timezone.utc).isoformat(),
        'files_before': len(originals), 'files_after': len(rows),
        'moved_original_files_including_archived': sum(r['action'] in {'MOVE', 'ARCHIVE'} for r in originals),
        'renamed_original_files': sum(Path(r['old']).name != Path(r['new']).name for r in originals if r['action'] in {'MOVE', 'ARCHIVE'}),
        'archived_original_files': sum(r['action'] == 'ARCHIVE' for r in originals),
        'deleted_duplicates': sum(r['action'] == 'DELETE_DUPLICATE' for r in originals),
        'files_requiring_deletion_approval': sum(r['action'] == 'REVIEW' for r in originals),
        'directory_links': len(links), 'broken_directory_links': [r['path'] for r in links if not r['target_exists']],
        'case_insensitive_file_collision': collision,
        'nested_qosyl': [d for d in dirs_seen if d.casefold() == 'qosyl' or d.casefold().startswith('qosyl/')],
        'unexpected_core_content_changes': core_errors,
        'read_errors': [r for r in rows if r['error']],
        'parent_items': sorted(p.name for p in ROOT.parent.iterdir()),
        'note': 'Includes generated reports and regenerated build/runtime state. Self-report hashes omitted to avoid recursive checksums; mutable DB files are a live snapshot, not a backup.'
    }
    with (REPORT / 'inventory-after.csv').open('w', encoding='utf-8-sig', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    for name, content in [('final-summary.json', result), ('final-content-changes.json', edits), ('links-after.json', links)]:
        (REPORT / name).write_text(json.dumps(content, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False))
    if core_errors or collision or result['broken_directory_links'] or result['nested_qosyl'] or result['read_errors']:
        raise SystemExit(1)

if __name__ == '__main__':
    main()
