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
