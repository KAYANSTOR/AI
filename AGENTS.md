# Project rules

- **Execution** — Strict Edit Only. Terminal commands are allowed only to list, search, and read task-related files. Never read `.env` or secrets. Do not run local installs, builds, typechecks, lint, or tests. GitHub Actions handles validation.
- **Security & Isolation** — Enforce `organization_id` tenant isolation and owner/admin checks on all API routes, actions, and DB queries. Verify webhook signatures. Use `AbortSignal.timeout` for external HTTP calls. Do not hardcode real phone numbers or secrets. Do not use silent catch blocks.
- **UI/UX Mobile-First RTL QA** — Preserve the palette (`#D8E2D0`, `#1F3B22`, `#F2D600`), Arabic RTL layout, and card hierarchy. Keep modals and bottom sheets above `MobileTabBar` without clipping. Avoid raw English technical labels.
- **Code Quality** — Use strict TypeScript without `any`. Write unit tests using synthetic dummy data only, list changed files, and stop.
