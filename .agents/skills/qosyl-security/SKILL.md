---
name: qosyl-security
description: Review security of Qosyl authentication, authorization, data handling, integrations, uploads or deployment changes; use for security audits or security-sensitive work, not routine unrelated edits.
---

# Qosyl security review

Inspect the affected code, Git state, relevant tests and current instructions first; treat documentation as context to verify, not proof of present behavior. Use `docs/security-checklist.md` and, for the affected area, `docs/architecture.md`, `docs/project-attachments.md` and `docs/deployment/oracle-duckdns.md`. Use [OWASP Top 10](https://owasp.org/projects/top-ten/) as a risk checklist, not as a claim of compliance.

Trace each affected entry point to its server-side checks and persistence. Check guest, student, client, admin, suspended and unrelated users as applicable: verify role, ownership, state and allowed data projection; an admin is not automatically a project participant. Recheck permissions at the mutation boundary and examine concurrency or replay when the action is sensitive. Check input type, length, content and request body limits, origin, output escaping, error handling, secrets and logging. For uploads or external fetches inspect their specific rules and threat boundary; file format checks are not malware scanning.

Respect the local/public mode boundary, consent, demo labeling, email verification and the distinction between participant payment statements and actual payment. A documented operator-created admin exception is not evidence that email ownership was verified. Do not weaken authentication, authorization or data isolation to make a test pass. Preserve existing data and credentials; use a separate test database and synthetic users for mutation tests, never a production database or a personal browser session. Live scanning, external messages and privileged changes require authorization appropriate to their actual scope.

Use targeted existing tests for the risk: `tests/e2e/workflow.spec.ts`, `tests/e2e/project-attachments.spec.ts`, `tests/project-attachments.integration.mts` and `npm run test:attachments` are starting points, not proof that every route is covered. Check available test setup and prerequisites before running. Add focused regression tests for changed critical behavior when practical; report any tests not run and why. Do not invoke unrelated full suites or risky security tools merely to claim coverage.

Deliver findings with severity, affected file/line, concrete trigger and impact, evidence and a proportionate remedy. Separate verified behavior, hypotheses, historical test reports and untested areas. Do not claim an external pentest, malware scanning, email delivery or OWASP compliance from local tests alone; do not expose credentials or private records in results.
