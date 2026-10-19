# Backend modules

- `health`: server and database health checks.
- `auth`: accounts, password hashing, sessions, CSRF, company membership and team roles.
- `companies`: company profiles and owner membership creation.
- `erp`: inventory, procurement, production, sales, finance and the workspace snapshot.

Other folders are reserved for future modules. The ERP currently implements the
three operational workflows described in `docs/FORGE-GUIDE.md`.

Company routes use controllers, services and repositories. ERP routes call
transactional services; `erp.core.ts` owns shared validation, exact decimal
handling, company locks, permissions and idempotency. `erp.workspace.ts` reads a
consistent workspace snapshot. All queries use parameters and company scope.

Authenticated requests resolve a session; workspace requests also verify the
selected company membership. Writes enforce CSRF and allowed browser origins.
Every multi-statement transaction uses one checked-out PostgreSQL client.
Known validation errors are returned to the client; unexpected server error
details stay in server logs.

See `docs/API-CONTRACT.md` for request bodies and response shapes, and
`docs/identity-and-access.md` for authentication and role rules.
