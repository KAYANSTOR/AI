# Kayan AI Owner Console integration

- Upstream source: https://github.com/KAYANSTOR/Kayan-Ai-admin (branch: `main`).
- This is a vendored deployment snapshot under `apps/owner-console`; keep UI/backend changes synchronized with the upstream repository.
- Public entry point: `/admin`. Next.js proxies the owner-console UI and `/api/owner/*` requests to the private sidecar on port 8090.
- The owner console uses its own SQLite database at `/data/kayan_owner.db`, persisted on the Railway volume mounted at `/data`. Its encryption key and bootstrap passcode are isolated from the main KAYAN AI secrets.

## Important data boundary

The current upstream owner-console backend uses the Node 22 built-in SQLite adapter. Setting the main platform `DATABASE_URL` does **not** connect its tables to the KAYAN AI PostgreSQL database. The sidecar deliberately does not inherit `DATABASE_URL` so its status cannot falsely report a PostgreSQL connection. The console can authenticate its platform owner and persist its own administration records, but live tenant, usage, subscription, and channel synchronization/mutations still require a separately implemented PostgreSQL integration layer and must not be treated as complete by this deployment alone.
