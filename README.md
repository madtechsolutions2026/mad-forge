# Madtech Forge

A manufacturing ERP with a React and TypeScript interface, Express API, and
PostgreSQL persistence. Office, warehouse, production, and finance teams work
from connected documents in their permitted company workspace.

## Run locally

Use Node.js 24, npm and a local PostgreSQL instance. Run these commands in
PowerShell. From an existing checkout, skip the clone and directory steps.

```powershell
git clone https://github.com/madtechsolutions2026/mad-forge.git
Set-Location mad-forge
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
notepad .env
```

Set the `PG...` values for a database and role you have created locally. Keep
`.env` private; it is ignored by Git. Then run:

```powershell
npm ci
npm --prefix frontend ci
npm run db:migrate
npm run build
npm run db:seed
npm start
```

Open **http://127.0.0.1:3030**. The login page has an **Explore demo workspace**
button. Demo seeding is explicit, development-only, repeat-safe, and does not
clear business documents.

| Development demo | Email                | Password        |
| ---------------- | -------------------- | --------------- |
| Owner            | demo@madtech.local   | ForgeDemo@2026! |
| Read-only viewer | viewer@madtech.local | ForgeDemo@2026! |

These are deliberately public development-demo credentials, not deployment
accounts. Sign-up creates a new account and a separate, empty company.

For development, run `npm run dev` for the API and `npm run dev:web` in another
terminal for the interface at port 5176. The frontend proxy calls the API at 3030. Stop development mode before running `npm start` on the same port.

## Connected workflows

- Procurement: suppliers, purchase orders, partial receipts, supplier bills,
  and partial payments.
- Inventory: items, warehouses, on-hand/reserved/available stock, reasoned
  adjustments, and an immutable stock ledger.
- Production: versioned recipes, work orders, material issues, unused-material
  returns, accepted/rejected output, and job costs.
- Sales: customers, stock reservations, partial dispatches, invoices, and
  collections.
- Finance: operational payables, receivables, payment records, and expenses.
- Workspace: company profiles, team membership, roles, and audit history.

Posting uses transactions, company membership and role checks, CSRF tokens,
and idempotency keys. Company-scoped composite keys prevent foreign document
references. Concurrent reservation checks prevent overselling available stock.

## Understand the product

Start with [the plain-language product guide](docs/FORGE-GUIDE.md), then the
[API contract](docs/API-CONTRACT.md) and
[identity/access notes](docs/identity-and-access.md).

```text
frontend/                  React screens, forms, styling and API client
src/app.ts                 API registration and compiled frontend serving
src/server.ts              Startup and clean shutdown
src/config/                Environment checks and PostgreSQL pool
src/modules/auth/          Accounts, sessions, membership and team access
src/modules/companies/     Company profiles
src/modules/erp/           Operational services and workspace reads
src/middleware/            Error response handling
database/migrations/       Versioned SQL changes
scripts/                   Build, migrations and explicit demo seeds
tests/integration/         Real PostgreSQL and HTTP checks
docs/                      Product, API and setup explanations
```

## Verification

```powershell
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run db:migrate
npm run test:integration
```

Tests create their own company/user fixtures and remove only those fixtures.
They use real PostgreSQL and HTTP calls. Migrations record names and normalized
SQL checksums; add a new migration instead of editing one already applied.

## Tooling and review

`npm run format` formats the repository with Prettier (120-column print width).
`npm run format:check` and `npm run lint` check both API and frontend sources;
the frontend also exposes its own `format`, `format:check` and `lint` scripts.
Prettier ignores generated files, dependency lockfiles, secrets, backups and
checksummed SQL migrations. Never reformat or edit applied migrations 001-004.

Both packages use TypeScript 6.0.3 because the installed `typescript-eslint`
supports TypeScript below 6.1. No forced or legacy-peer dependency install is
needed. Strict compiler checking remains enabled.

The dedicated formatting commit is `a81dcba`. Verify that every change in it
is exactly formatter output from its parent:

```powershell
npm run verify:format-commit -- a81dcba
```

Lint enforces the recommended JavaScript/TypeScript checks and Rules of Hooks.
To preserve current behavior, unused variables, Hook dependency-array checks,
empty catch blocks, CommonJS `require` in scripts/tests, Express ambient
namespace declarations and existing test error wrapping have targeted
exceptions. The CSV formula guard intentionally recognizes control characters.
See [the Phase 0 report](docs/PHASE-0.md) for the precise rules and verification.

## Docker (PowerShell)

Install Docker Desktop with Linux containers and Compose v2. From the repository
root, copy `.env.example` to `.env` if needed and set a strong `PGPASSWORD`.
Compose uses that file for interpolation; it does not copy it into the image.

```powershell
docker compose up --build --wait --wait-timeout 180
docker compose ps
docker compose logs --tail 100 app
```

Open **http://localhost:3030**. If the local server already uses that port:

```powershell
$env:FORGE_PORT = "3031"
docker compose up --build --wait --wait-timeout 180
```

Open **http://localhost:3031** instead. The app is published only on host
loopback; PostgreSQL has no published host port. Inside Docker the app binds
`0.0.0.0`; non-Docker runs still default to `127.0.0.1`.

The multi-stage image builds the API and frontend, removes development packages
and runs as the non-root `node` user. Startup applies the existing checksummed
migrations before serving requests and fails if migration fails. Compose waits
for PostgreSQL 17 to be healthy. The database persists in the named
`forge_postgres_data` volume, separate from your existing local database.

A new container database has no demo users. Use the existing account-creation
screen; automatic demo seeding stays disabled in production. Production cookies
are Secure, so use `localhost` for local container testing and HTTPS for an
actual deployment. No authentication policy has been changed in this phase.

Stop the containers without deleting the database:

```powershell
docker compose down
```

Do not add `--volumes` unless you intentionally want to delete container data.
Changing the PostgreSQL user/password after the volume is initialized does not
change the credentials stored in that database. Maintain backups before any
production use; containers alone do not make the application production-ready.

## Continuous integration and security reports

GitHub Actions uses Node 24, a PostgreSQL 17 service and PowerShell commands to
install both packages, check types/lint/formatting, build, migrate and run the
real integration suite. It also builds and starts Compose with `--wait` and
stops the containers afterwards. The CI database credentials are disposable test
values, not deployment credentials.

See [SECURITY.md](SECURITY.md) for private reporting instructions. The owner must
replace its contact placeholder before deployment. See [CHANGELOG.md](CHANGELOG.md)
for the Phase 0 summary.

## Current boundaries

This is a working local operational ERP, not a statutory accounting product.
Production is single-stage with one completion per work order. Inventory value
is an indicative standard-cost estimate. Payments are recorded, not sent through
a bank or payment gateway. GST/e-invoices, general ledger/statutory statements,
payroll, returns/credit notes, cancellations/reversals, warehouse transfers,
and multiple currencies are later phases.

The app binds to loopback by default; no public deployment is configured.
Production launch needs real accounts, the correct HTTPS APP_ORIGINS,
backup/restore validation, a migration/runtime database-role split, and
access review. Company-scoped queries and membership checks are implemented;
database row-level security is not yet configured.

## Purchase order pages

Create at `/#procurement/purchase/new`; saved orders use `/#procurement/purchase/<id>`. Supplier references, payment terms, dates, delivery instructions and notes persist in PostgreSQL. Apply migration 004 before running the updated API.

Saved orders have a CSV download (spreadsheet formulas neutralized) and Print / Save PDF, which uses the browser print dialog. The print stylesheet removes workspace navigation and repeats table headers across pages. No new PDF dependency is required.
