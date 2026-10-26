from pathlib import Path
import json, hashlib
from collections import Counter
from docx import Document
from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT
DOWNLOADS = ROOT / '02_Research/Inputs'
FILES = ['Student_Project_Platform_Opisanie_Proekta.docx', 'Опросник по проекту (Ответы) (2).xlsx', 'Opportunity_Content_Aggregator_TZ_v1.docx']

def digest(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

def main():
    original = DOWNLOADS
    extracted = OUT / '02_Research/Analysis'
    original.mkdir(parents=True, exist_ok=True)
    extracted.mkdir(parents=True, exist_ok=True)
    manifest = []
    for name in FILES:
        source, target = DOWNLOADS / name, original / name
        if target.exists() and digest(target) != digest(source):
            raise RuntimeError(f'Existing copy differs: {target}')
        manifest.append({'source': str(source), 'copy': str(target.relative_to(OUT)), 'sha256': digest(source), 'copy_verified': digest(source) == digest(target)})
        if source.suffix == '.docx':
            doc = Document(source)
            parts = [p.text for p in doc.paragraphs if p.text.strip()]
            for i, table in enumerate(doc.tables, 1):
                parts.append(f'\nTABLE {i}')
                parts.extend(' | '.join(c.text for c in row.cells) for row in table.rows)
            (extracted / (source.stem + '.txt')).write_text('\n'.join(parts), encoding='utf-8')
        else:
            book = load_workbook(source, read_only=True, data_only=True)
            stats = []
            for sheet in book:
                rows = list(sheet.values)
                nonempty = [row for row in rows[1:] if any(v is not None for v in row)]
                columns = []
                for i, header in enumerate(rows[0]):
                    values = [str(row[i]).strip() for row in nonempty if i < len(row) and row[i] is not None and str(row[i]).strip()]
                    # Do not expose respondent timestamps or identifiers in derived analysis.
                    if i in (0, 1, 3, 15, 17) or any(term in str(header).lower() for term in ['email', 'почт', 'телефон', 'имя', 'фио']):
                        columns.append({'column': i + 1, 'question': str(header), 'answered': len(values), 'values_omitted': True})
                    else:
                        columns.append({'column': i + 1, 'question': str(header), 'answered': len(values), 'counts': dict(Counter(values))})
                stats.append({'sheet': sheet.title, 'range': sheet.calculate_dimension(force=True), 'responses': len(nonempty), 'columns': columns})
            (extracted / 'survey_counts.json').write_text(json.dumps(stats, ensure_ascii=False, indent=2), encoding='utf-8')
    research = ROOT / '02_Research/Corpus/student-business-platform'
    for source in sorted(research.rglob('*')):
        if source.is_file() and not any(part in {'node_modules', '__pycache__', '.venv'} for part in source.relative_to(research).parts):
            target = source
            target.parent.mkdir(parents=True, exist_ok=True)
            if target.exists() and digest(target) != digest(source):
                raise RuntimeError(f'Existing copy differs: {target}')
            manifest.append({'source': str(source), 'copy': str(target.relative_to(OUT)), 'sha256': digest(source), 'copy_verified': digest(source) == digest(target)})
    source = original / 'опросник.pdf'
    target = source
    manifest.append({'source': str(source), 'copy': str(target.relative_to(OUT)), 'sha256': digest(source), 'copy_verified': digest(source) == digest(target)})
    (extracted / 'source_manifest.current.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Verified copies: {len(manifest)}')

if __name__ == '__main__':
    main()
