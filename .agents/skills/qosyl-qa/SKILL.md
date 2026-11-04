---
name: qosyl-qa
description: Test and assess Qosyl student, customer and administrative workflows, including regressions, access boundaries and browser evidence. Use for QA or verification of product behavior; use ui-quality as well for visual, responsive or accessibility work.
---

# Qosyl QA

Read `AGENTS.md` and inspect the affected current implementation, tests and working tree. For student and customer paths and evidence gaps, start with [journey matrix](../../../docs/testing/user-journeys.md); treat it as a map, not proof of current behavior. Choose checks for the changed behavior, roles and failure modes; preserve any unrelated changes.

## Execution and isolation

- Use `npm test` for relevant unit behavior, `npm run api:check` for changed OpenAPI contracts and focused Playwright tests or `npm run test:e2e` for user workflows. Inspect the configuration and prerequisites before running; do not claim a check that was not run.
- Use the project-managed local test server and isolated PostgreSQL configured by `playwright.config.ts` and `scripts/test-db.mjs`. Tests can create data and send commands: never aim the mutation suite at the owner's DB, production, an existing external server, or another person's browser session. Do not set `E2E_EXTERNAL_SERVER` or `E2E_BASE_URL` for managed QA. Use a fresh automatically generated database name and verify it does not already exist: the setup script can reuse an existing allowed name. Seed reads or creates `.local/demo-accounts.json`; isolate `.local` in a separate copy when needed. Use synthetic or explicitly marked demo data. A separately authorized read-only public smoke check is not the mutation suite.
- `npm run test:ui` runs its own isolated UI configuration and enforces serious/critical axe and document-overflow checks only on covered states. For visual, keyboard, responsive, localization and screenshot work follow the existing `ui-quality` skill; baseline observations are not acceptance.
- Build and server processes can share `.next`. Do not overwrite an active app's build, kill unknown processes, reset data or clean a working tree. When needed, use a separate project copy with its own build directory and the existing isolated test DB guard.
- E2E may exercise local mail and synthetic external responses. Distinguish these from real SMTP delivery, actual third-party integrations, device testing and public-site acceptance. Do not send messages or trigger live external operations merely to test.

## Coverage and reporting

For every affected journey check the normal path, validation/error state and relevant cross-user or role boundary. For stateful workflows check changes on both sides, reload and relevant conflicts; avoid assertions tied only to implementation. Assess whether the student can identify the next step, especially when no suitable projects exist. Do not imply that off-platform payment is guaranteed or demo orders are real.

Report commands, result counts, environment, roles, data, paths/viewports, evidence locations and any untested areas. For each defect capture reproduction, expected/actual behavior and severity with a source or artifact. Clearly label code existence, test existence, a historical run and a current passing run as different evidence. Protect cookies, private contacts and secrets in reports.
