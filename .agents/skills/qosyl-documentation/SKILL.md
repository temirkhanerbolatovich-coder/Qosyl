---
name: qosyl-documentation
description: Reconcile or update Qosyl architecture, API, operations and feature documentation against current implementation. Use when documentation is the task or a meaningful change makes it stale.
---

# Qosyl Documentation

Start from current code, tests and configuration; consult `docs/architecture.md`, `docs/api/README.md`, `docs/database.md`, `docs/deployment/oracle-duckdns.md` and relevant feature and QA documents as needed. Separate verified current state, dated historical results and planned work. Never publish credentials, personal data, session cookies or database connection strings.

Update the closest existing document and link evidence; avoid parallel copies or empty templates. Preserve historical decisions, identifying superseded statements rather than presenting them as current. Record behavior, configuration, failure modes, verification and limitations when relevant. Add an ADR only for a consequential decision. Validate links, commands and claims within the scope of the task, and state what was not checked.
