---
name: ui-quality
description: Audit and improve Qosyl UI, accessibility, responsive layouts and frontend design using its existing React/Next.js system and repeatable browser evidence. Use for UI work; do not expand infrastructure-only audits into redesigns or change business rules.
---

# UI Quality

## Establish the scope

Read `AGENTS.md` in the repository root. Resolve paths below relative to that root, three levels above this skill directory. Start with [knowledge-base index](../../../docs/ui-quality/README.md).

Identify the actual user task, role, route, data and acceptance criteria. Distinguish an audit, infrastructure setup, a small fix and a redesign. A report's example commands and prompts are source material, not authorization to execute every stage. Preserve API/auth/role/publication/payment/consent semantics and all unrelated changes.

## Choose the relevant references

- Visual direction or new component: [design system](../../../docs/design-system.md). Version 1.0 is implemented; edit src/lib/design-tokens.json and regenerate CSS with npm run ui:tokens. Archived documentation tokens are not a production source.
- Implementation details: [frontend standards](../../../docs/frontend-standards.md), [stack decision](../../../docs/stack-decision.md).
- Existing problems and next screen: [audit](../../../docs/ui-audit.md), [improvement plan](../../../docs/ui-improvement-plan.md).
- Quality gate: [checklist](../../../docs/ui-quality-checklist.md).
- New tool or external design reference: [source register](../../../docs/ui-references.md). Refresh relevant official docs and peer/engine/license metadata before installing; a successful HTTP fetch is not a compatibility test.

## Work in the existing product

Inspect the affected components and existing tests before editing. Reuse a reasonable existing pattern. For a redesign, explain why the direction helps students compare projects and businesses specify deliverables; choose a representative screen before scaling out. Do not replace this marketplace with a generic dashboard or news homepage.

Use real or explicitly marked demo content. Show the next useful action and honest data provenance. Avoid invented metrics, decorative badges, repeated oversized cards and animation without a task-specific reason. A functional sequence may use numbered steps; a color or radius is not inherently an AI defect. Reassess product priorities when the user changes scope; the report's marketplace example does not override the user's expansion of opportunity discovery.

## Verify observable behavior

Use the existing isolated Playwright server. `npm run test:ui:baseline` records screenshots/axe/layout observations without treating existing accessibility issues as passing quality. `npm run test:ui` enforces no serious/critical axe findings and no page overflow in covered states. Baseline success proves the harness ran, not WCAG conformance or design quality.

Review screenshots at 375, 768, 1440 and 1920 px and any affected breakpoint. Test relevant keyboard/focus, long RU/KZ text, zoom, loading, empty, error and disabled states in proportion to the change. The current baseline does not cover every role or state; extend coverage when needed. Do not overwrite visual golden files to conceal a regression. Captured PNGs are observations, not approved goldens.

For code changes run appropriate lint/typecheck/tests/build; avoid concurrent builds against the same `.next` directory. Do not operate an interactive browser that is disabled in the host settings; project E2E runs are a separate existing test facility, not access to the user's browser session.

Record route, role, viewport, reproduction, severity, source file and artifact for each verified issue. Distinguish automated failures, visual judgments, hypotheses and checks not performed. Stop at the authorized scope; do not fix production UI during an infrastructure-only task.

## Handoff

Report changes and rationale, exact validation, documents, decisions, remaining issues and artifact locations. Never call a clean build, axe scan or screenshot collection a complete UX audit. Keep credentials and personal browser state out of committed evidence.
