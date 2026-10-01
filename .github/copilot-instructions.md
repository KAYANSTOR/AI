# Repository AI Boundaries and Routing

## Keep the Two AI Systems Separate

- The FrontDesk product agent is a tenant-specific customer-service runtime powered by the server-side Gemini API key. Its prompts, business data, tools, permissions, and conversations belong to the application.
- Agents in `.github/agents/` are VS Code development assistants. They help change this repository and must never be registered, exposed, or treated as agents inside the product.
- Keep API keys out of source code, browser bundles, prompts, and commits. Use server-only environment variables for product credentials and VS Code secret inputs for development-provider credentials.

## Route Development Work

- For every requested code change, route the task through `AI Orchestrator` first. It decides whether to implement a small isolated change itself or assign work to the best-fit specialist agents. It owns the task graph, non-overlapping file ownership, integration, independent review, and final verification.
- For independent work, invoke specialists in parallel. Serialize work that touches the same files or depends on unfinished contracts.
- Use `Researcher` for read-only codebase discovery, `Architect` for boundaries and contracts, `Database` for schema and migrations, `Backend` for server logic and integrations, and `Frontend` for UI/UX. Use `Integration` after specialist changes and `Reviewer` for an independent findings-first review.
- For a small, isolated change, Orchestrator should use one responsible specialist or implement it directly; do not fan out a full team unless the scope warrants it.
- Preserve the user's scope, current working-tree changes, project conventions, and verification requirements. Do not push or change branches unless asked.