# Q11 — приёмка 26.10.2026

Этап завершён локально: worker истечения, три вида внутренних напоминаний, постоянные ключи дедупликации, advisory/row locks, атомарные изменения и round-robin cursor. Системные события actor=null; фоновые запуски доступны только admin через read-only backgroundJobs. GET не запускает работу.

Проверено:168 unit,22 SQL,4 интеграции worker на PostgreSQL,18 E2E, production build, TypeScript, lint, api:check. Интеграции проверили повтор/параллельность, busy-lock, rollback при сбое и обход следующих пакетов. Runtime9 тестов включает гибель supervisor и уборку дочерних процессов. Первый integrationпрогон выявил void-результат pg_advisory_xact_lock в тесте; SELECT исправлен без изменения worker.

Основная миграция применена после backup/restore: до .local/backups/2026-10-26T09-55-32.914Z-bb917b (25таблиц), после .local/backups/2026-10-26T09-55-36.042Z-088ded (26таблиц). Обе копии проверены восстановлением. Supervisor PID9288 запущен локально. Следующий запуск: npm start или START_DEMO.cmd; отдельный проход npm run worker:lifecycle:once. Ограничения: внутренние уведомления, не email; выключенный компьютер не исполняет задачи; production Docker конфигурация обновлена, реальный облачный запуск не проверялся.

Настройки и правила: [worker](../project-lifecycle.md), [runtime](../project-lifecycle-runtime.md). Следующий этап — минимальный агрегатор RSS/ручного ввода после продуктовых уточнений.
