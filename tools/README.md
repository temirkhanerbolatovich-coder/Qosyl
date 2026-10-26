# Инструменты проектных материалов

- `validate_package.py`: проверка 85 канонических материалов через карту переноса, пересчёт опроса и проверка Markdown-ссылок. Требует Python с openpyxl. Результат — `11_Reports/Audit_Reports/package_validation.json`.
- `extract_sources.py`: повторное извлечение текста и агрегатов из канонических Inputs; исходники не копирует. Требует python-docx и openpyxl. Новый манифест записывает в `02_Research/Analysis/source_manifest.current.json`, сохраняя исторический `source_manifest.json`.
- `finalize_reorganization_docs.py`, `inventory_after.py`: служебное построение индекса/отчётов и текущего снимка.

Остальные файлы здесь — одноразовые инструменты миграции 25.10.2026 (`reorganization_inventory`, `plan_reorganization`, `move-project`, `repair_reorganization_links`, `approve_exact_duplicates`, `remove-exact-duplicates`, `verify_relocation`). **Не запускать их повторно на уже перенесённом проекте.** Исходная карта и холодные хеши описывают момент до перезапуска БД; позднее обновление рабочих файлов ожидаемо. Эти инструменты сохранены для аудита действий.

Исследовательские скрипты находятся внутри Corpus. Их исторический extract_inputs зависит от внешних документов Downloads/attachments; доступность этих оригиналов нужно проверить перед повторным исследованием. Junction Node-зависимостей ведёт во внешний runtime этой машины; она не является переносимым lockfile.
