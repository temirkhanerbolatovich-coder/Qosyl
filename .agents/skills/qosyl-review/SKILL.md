---
name: qosyl-review
description: Review a Qosyl change, branch or pull request for actionable correctness, authorization, data-boundary and regression risks; use for requested code reviews or an independent review of meaningful changes.
---

# Qosyl code review

Identify the requested review scope and current Git state. Read the actual diff and enough surrounding implementation, tests and documentation to assess behavior; distinguish pre-existing and unrelated dirty work. For branch or PR reviews use the requested base, not an assumed revision. Never modify files or perform deployment as part of a review unless separately requested.

Trace changed behavior across the affected UI, HTTP handlers, server commands, authorization, persistence and responses. Prioritize a demonstrable failure or security boundary: role and ownership checks, exposure of private data, consent, state transitions, transaction conflicts, error handling, migrations and backwards compatibility. Pay particular attention to preserved demo/real separation and payment statements. For UI changes check responsive layout, keyboard use and loading/error/empty states in scope; consult `../ui-quality/SKILL.md` when visual or accessibility validation is needed.

Use `docs/architecture.md`, `docs/api/README.md`, `docs/security-checklist.md` and relevant feature docs as starting points, but verify against current code. Inspect appropriate tests and run bounded, isolated checks when useful and authorized; distinguish tests read from tests actually run. Do not equate a build or an old report with a verified end-to-end scenario.

Report only actionable findings introduced by the reviewed change, ordered by severity, with a tight file/line reference, a concrete trigger, consequence and suggested direction. Note important pre-existing risks separately when relevant. If no actionable findings are found, say so and identify remaining test or inspection gaps; avoid speculative claims and stylistic nitpicks. For direct code feedback use the host's supported inline-review format when available.
