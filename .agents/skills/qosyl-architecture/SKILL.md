---
name: qosyl-architecture
description: Analyze or change Qosyl product architecture, cross-module flows, API or database boundaries. Use for feature planning, architectural decisions and changes crossing application components; not for isolated presentation-only edits.
---

# Qosyl product architecture

Use for architecture-affecting work in Qosyl. First read the repository `AGENTS.md`, inspect Git status, and preserve unrelated changes. Read [architecture](../../../docs/architecture.md), [API contract](../../../docs/api/README.md), [database](../../../docs/database.md) and the affected code and tests selectively; treat docs and old QA reports as evidence to verify against current code, not proof of current operation.

## Map the requested change

1. Identify the user outcome and affected role, routes, client state, server entrypoints, commands/queries, persistence, workers and external systems. Compare with existing flows and tests before proposing new dependencies or layers.
2. Trace the data across trust boundaries: untrusted input → server validation and authentication → role, ownership/participant and state checks → transaction/persistence → permitted projection and response. Check concurrent requests, errors, retries and compatibility where relevant.
3. Preserve existing invariants unless the user authorizes a behavior change: moderation before publication, student/client and admin privileges, participant-only work and attachments, private contacts, consent-gated portfolio, distinct demo data, and payment statements that do not prove or guarantee a transfer. A role or ID from the client does not grant authority.
4. Prefer extending existing patterns: HTTP adapters in `src/app/api`, validation and shared logic in `src/lib`, business operations in `src/server`, schema/migrations in `prisma`. Marketplace commands use `src/server/marketplace/index.ts`; content, leads and attachments have separate boundaries. Verify this mapping in the current checkout before relying on it.
5. For API changes, inspect existing selectors, envelopes, access rules and `src/contracts`; update the OpenAPI generator and docs when the public contract changes. Check `npm run api:check` and relevant contract/security tests. For schema changes, inspect existing migrations, data retention, rollback and deployment implications; never target the owner's database with test fixtures.

## Decide and verify

Choose the smallest coherent design that addresses the requirement. Explain alternatives and create an ADR only for a significant decision that future maintainers will need to understand. Avoid promising scalability without measurement; profile actual query size, latency and resource limits before optimizing. Update architecture and feature documentation only where behavior changes or a verified discrepancy exists.

Report the changed boundaries, compatibility and privacy impact, tests actually run, any unverified assumptions and remaining limitations. Production changes, external publishing and destructive data operations require the authorization applicable to the current task; loading this skill does not grant it.
