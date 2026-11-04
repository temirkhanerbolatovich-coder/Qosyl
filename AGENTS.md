# Qosyl engineering agreement

Follow the engineering standards supplied by the user. Inspect current code, tests, docs and Git state before changing behavior; preserve unrelated local changes.

- Keep this project local unless the user requests deployment. Never expose `.env`, credentials, cookies, private contacts or database connection strings in artifacts.
- For UI, UX, accessibility, responsive layout or frontend design work, read [.agents/skills/ui-quality/SKILL.md](.agents/skills/ui-quality/SKILL.md). Use its linked references only as needed.
- Prefer existing React/Next.js components, Tailwind/native CSS tokens and Lucide. Justify dependency additions with current official documentation and compatibility evidence.
- Preserve routes, API contracts, authentication, role checks, moderation, publication rules, demo labels, consent and payment limitations during presentation work.
- Build success is not visual acceptance. Inspect rendered screenshots and relevant keyboard/error/empty/loading states; record what was actually checked.
- Use `npm run test:ui:baseline` to observe existing issues, `npm run test:ui` to enforce serious/critical axe and overflow checks. Both use an isolated local E2E database; do not point them at the owner's database.
- The infrastructure-only stage is historical. The user's later Design System request authorizes Deep Blue/Teal, Light/Dark/System and Manrope/Inter presentation work. Current tokens live in `src/lib/design-tokens.json`; run `npm run ui:tokens` to generate CSS and validate both themes.
- Use the supplied Qosyl logo at `public/brand/qosyl-logo.jpg`; preserve its original colors and artwork. Do not restore the temporary letter-q mark or invent a replacement.
- Keep instructions concise; detailed standards and evidence live in [UI knowledge base](docs/ui-quality/README.md).
- For substantial work: understand current code and user outcome, specify acceptance, plan, implement minimally, review, run risk-appropriate checks, update documentation and report evidence. Small changes can use a shorter path.
- Consult the relevant project skills in `.agents/skills/` for architecture, UI, QA, security, performance, review or documentation when their descriptions match the task. Preserve API contracts, roles and sensitive data; validate input and handle errors at the server boundary.
- Delegate independent work when useful and authorized by the active execution environment. Assign exclusive file ownership or isolated worktrees for parallel edits; the coordinating agent integrates and verifies the result. Do not assume worktrees include uncommitted changes.
- Respect existing user authorization and current execution permissions for deployment, external writes, migrations, dependency installation and global configuration. Do not infer permission for unrelated actions. When context is insufficient, inspect evidence, state uncertainty and ask only for decisions that cannot be safely inferred.
- Completion requires checks appropriate to the change and an honest account of results and omissions. Record consequential decisions and changed behavior in existing documentation; distinguish historical evidence from fresh verification.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
