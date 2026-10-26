"""One-time path migration; preserves requirements and research conclusions."""
import hashlib
import json
import os
import re
from pathlib import Path
from urllib.parse import unquote
from plan_reorganization import BASE, ROOT, REPORT, destination

def digest(data):
    return hashlib.sha256(data).hexdigest()

def main():
    operations = json.loads((REPORT / 'relocation-map.json').read_text(encoding='utf-8'))
    mapping = {row['old']: row['new'] for row in operations}
    changed = []
    def target_path(old_file, value):
        value = unquote(value.replace('\\', '/'))
        if re.match(r'^(https?://|mailto:|data:|#)', value):
            return None
        absolute = Path(os.path.abspath(BASE / Path(old_file).parent / value))
        if not absolute.is_relative_to(BASE):
            return None
        old = absolute.relative_to(BASE).as_posix()
        # Mapping handles canonical duplicates and unchanged technical subpaths.
        new = mapping.get(old, destination(old))
        return BASE / new
    def repair(old_file, new_file, content):
        def replace(match):
            raw = match.group(1)
            angle = raw.startswith('<')
            clean = raw[1:-1] if angle else raw
            path, separator, anchor = clean.partition('#')
            target = target_path(old_file, path)
            if not target or not target.exists():
                return match.group(0)
            relative = os.path.relpath(target, new_file.parent).replace('\\', '/')
            if separator:
                relative += '#' + anchor
            return '](' + ('<' + relative + '>' if angle or ' ' in relative else relative) + ')'
        content = re.sub(r'\]\((<[^>]+>|(?:[^()\n]|\([^()\n]*\))+)\)', replace, content)
        def inline(match):
            value = match.group(1)
            if not value.startswith(('../', './', 'C:/', 'C:\\')):
                return match.group(0)
            target = target_path(old_file, value)
            if target and target.exists():
                return '`' + os.path.relpath(target, new_file.parent).replace('\\', '/') + '`'
            return match.group(0)
        return re.sub(r'`([^`\n]+)`', inline, content)
    def write(path, text):
        before = path.read_bytes()
        after = text.encode('utf-8')
        if before != after:
            changed.append({'path': path.relative_to(ROOT).as_posix(), 'before_sha256': digest(before), 'after_sha256': digest(after), 'reason': 'relocation paths or scope exclusions'})
            path.write_bytes(after)
    for row in operations:
        if row['action'] == 'DELETE_DUPLICATE' or not row['old'].endswith('.md'):
            continue
        if any(p in {'.git', '.local', '.next', 'node_modules'} for p in Path(row['old']).parts):
            continue
        path = BASE / row['new']
        if path.is_file():
            write(path, repair(row['old'], path, path.read_text(encoding='utf-8-sig')))
    for name in ['.gitignore', '.dockerignore', '.prettierignore']:
        path = ROOT / name
        text = path.read_text(encoding='utf-8')
        extra = ['02_Research/Inputs/', '02_Research/Corpus/', '99_Archive/', '**/__pycache__/'] if name == '.gitignore' else ['01_Project_Overview/', '02_Research/', '03_Product_Requirements/', '05_Modules/', '11_Reports/', '99_Archive/', 'tools/']
        write(path, text.rstrip() + '\n\n# Consolidated project materials; keep raw research and private archives local.\n' + '\n'.join(extra) + '\n')
    path = ROOT / 'eslint.config.mjs'
    write(path, path.read_text().replace("'research/**',", "'02_Research/**',\n    '99_Archive/**',").replace("    'Qosyl/01_sources/**',\n", ''))
    path = ROOT / 'tsconfig.json'
    write(path, path.read_text().replace('"research",', '"02_Research", "99_Archive",'))
    path = ROOT / '02_Research/Corpus/student-business-platform/scripts/extract_inputs.py'
    write(path, path.read_text(encoding='utf-8').replace("ROOT.parents[1] / 'опросник.pdf'", "ROOT.parents[1] / 'Inputs' / 'опросник.pdf'"))
    (REPORT / 'path-edits.json').write_text(json.dumps(changed, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Path edits: {len(changed)}')

if __name__ == '__main__':
    main()
