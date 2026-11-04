# Автоматические проверки Qosyl

04.11.2026 workflow опубликован: [PR run](https://github.com/temirkhanerbolatovich-coder/Qosyl/actions/runs/41855899213) и [main run](https://github.com/temirkhanerbolatovich-coder/Qosyl/actions/runs/41858480924) успешны на Ubuntu — 509 unit, 90 E2E, 280 UI и остальные именованные шаги. Required status check ветки ещё не настроен. Отрицательные проверки ниже относятся к локальной проверке валидатора/`test.only`, а не к отдельному намеренно ошибочному PR.

[Workflow](../../.github/workflows/ci.yml) подготовлен для GitHub Actions: push в `main`, pull request и ручной запуск. Он проверяет выбранную GitHub ревизию; локальные незакоммиченные файлы в него не попадут. Деплой, публикации, миграции рабочей БД и внешние сообщения не выполняются.

## Что проверяется

Один job на `ubuntu-24.04` использует Node.js 24 и временный PostgreSQL 18. После `npm ci` последовательно выполняются:

1. Генерация Prisma Client, ESLint, соответствие OpenAPI runtime-валидаторам и unit-тесты.
2. `npm audit --omit=dev`, production build и TypeScript.
3. Установка Chromium с системными зависимостями, полный E2E и строгий UI-набор.

E2E и UI запускаются друг за другом: оба используют порт 3100 и одну готовую `.next` сборку. Каждый runner выбирает новое имя БД `student_marketplace_e2e_ui_<случайный суффикс>`, применяет миграции и синтетический seed через существующий [защищённый setup](../../scripts/test-db.mjs). Локальный почтовый режим сохраняет письма только в файловой системе job. Google использует синтетические OAuth-параметры из Playwright-конфигурации; реальный callback не выполняется. Threads отключён.

Любая неуспешная команда возвращает ошибку job; `continue-on-error`, подавление exit code и повторные попытки тестов не добавлены. Следующие обычные шаги после ошибки не выполняются. При `CI=true` Playwright также запрещает случайно оставленные `test.only`: нельзя получить зелёный результат, выполнив только выбранный тест. Runtime-аудит зависимостей может остановить job при новой опубликованной уязвимости. Dev-зависимости проверяются отдельно при сопровождении и не скрываются за зелёным runtime-аудитом.

Job ограничен 45 минутами. Новый запуск для той же ветки/PR отменяет предыдущий незавершённый. Workflow не включает `pull_request_target` и не выполняет публикацию из PR.

## Изоляция и доступ

- PostgreSQL опубликован только на loopback runner, порт 55432. Учётные данные в YAML предназначены исключительно для этого одноразового сервиса и не являются production-секретами. Его роль создаёт тестовые БД; такую роль нельзя переносить в рабочее окружение.
- `LOCAL_DEV_MODE=true` и `DEMO_ENABLED=true` допускаются только внутри проверки. Никакие repository/environment secrets, SMTP, Google или Threads учётные данные workflow не запрашивает.
- `GITHUB_TOKEN` ограничен `contents: read`, checkout не сохраняет авторизацию в Git. Официальные checkout/setup-node закреплены полными SHA; при обновлении сверять SHA с тегом и читать изменения action.
- Npm cache содержит загруженные пакеты; `.env`, БД и пользовательские сессии не кешируются.
- Playwright отчёты, trace, `.local/mail` и `demo-accounts.json` автоматически не загружаются в artifacts: они могут содержать тестовые cookies, ссылки восстановления и другие значения сессий. Для диагностики доступны именованные шаги и их журналы. При добавлении артефактов нужна отдельная очистка содержимого.

Workflow не проверяет доставку SMTP, полный Google callback, production-состояние сервера, нагрузочную ёмкость, весь набор интеграционных тестов, прокси Caddy или восстановление production-копии. Эти проверки имеют отдельные локальные/эксплуатационные сценарии. Успех job не равен эксплуатационной или юридической готовности пилота.

## Проверка самого workflow

Перед публикацией проверить YAML, Actions expressions, action inputs и ссылки на шаги с помощью доверенного локального [actionlint](https://github.com/rhysd/actionlint):

```powershell
& 'C:/path/to/actionlint.exe' -color .github/workflows/ci.yml
```

Команда не устанавливает инструмент. Для проверки, что валидатор обнаруживает ошибку, можно создать временную копию workflow вне `.github/workflows`, добавить в неё ссылку на неизвестный Actions context и ожидать ненулевой exit code. Исходный workflow при этом не изменять. Такой отрицательный тест подтверждает локальную валидацию синтаксиса/expressions, а не защиту ветки на GitHub.

На этапе локальной подготовки hosted Linux run ещё не был выполнен; позднее оба запуска, указанные выше, прошли. Локальные Windows-результаты [90 E2E и 280 UI](../qa/stabilization-2026-11-04.md) сохраняются отдельно от выполнения Actions. Блокировка отдельного намеренно ошибочного PR и required status check ветки остаются непроверенными/ненастроенными; настройки GitHub в этом выпуске не менялись.

Локально actionlint 1.7.12 принял настоящий workflow с exit 0 и отклонил временную копию с неизвестным Actions context с exit 1. Оригинал при отрицательной проверке не менялся. Валидатор скачан из официального release, SHA256 архива сверена; установка в PATH и изменения глобальных настроек не выполнялись. Свидетельства находятся в игнорируемом `.local/ci-validation-2026-11-04/`.

В отдельной копии проекта `CI=true` и `playwright test --list` успешно собрали обычный набор; временный тест с `test.only` был отклонён с exit 1. Затем удалён только созданный диагностический файл. Режим `--list` не запускал приложение, тестовые действия или подключение к БД. Это проверка предохранителя от фокусировки, а не повтор полного браузерного набора и не hosted CI.

Дополнительно в независимой Windows-копии без junction зависимостей выполнена чистая установка `npm ci`: установлены 598 пакетов. С этой установкой прошли production build, 509 unit-тестов и `api:check`; runtime-аудит вернул 0 уязвимостей. Журналы находятся в `.local/ci-install-2026-11-04/`. Это подтверждает локальную воспроизводимость установки/сборки из lockfile, но не заменяет первый Ubuntu/GitHub run.

## Первичные инструкции

- [PostgreSQL service containers](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers) — Linux runner и связь с временной БД.
- [Исходник GitHub runner](https://github.com/actions/runner/blob/main/src/Runner.Worker/Container/DockerCommandManager.cs) передаёт значение service port в `docker create -p`; [документация Docker](https://docs.docker.com/engine/network/port-publishing/) подтверждает loopback-привязку `127.0.0.1:55432:5432`.
- [Официальный checkout v7.0.1](https://github.com/actions/checkout/tree/v7.0.1) и [setup-node v7.1.0](https://github.com/actions/setup-node/tree/v7.1.0) — проверенные actions и их inputs.
- [Playwright CI](https://playwright.dev/docs/ci-intro) — установка браузера и запуск тестов.
- [Actionlint usage](https://github.com/rhysd/actionlint/blob/main/docs/usage.md) — локальная проверка workflow.
