# Kayan AI Owner Console

The owner console is served from this repository and uses the central Railway PostgreSQL database through `DATABASE_URL`. Owner authentication, sessions, audit logs, billing catalog data, subscriptions, and organization controls are stored in PostgreSQL by migration `0074_admin_postgres_control_plane_and_billing_extensions.sql`.

The console does not create or use a local database. Any historical import utility is optional, is not part of startup, and must never be required for production operation.
