# Madtech Forge

A manufacturing ERP with a React and TypeScript interface, Express API, and
PostgreSQL persistence. Office, warehouse, production, and finance teams work
from connected documents in their permitted company workspace.

## Run locally

Use Node.js 24 and your existing ignored .env PostgreSQL settings.

```powershell
cd D:\Projects\Mad-erp
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

| Development demo | Email | Password |
| --- | --- | --- |
| Owner | demo@madtech.local | ForgeDemo@2026! |
| Read-only viewer | viewer@madtech.local | ForgeDemo@2026! |

These are deliberately public development-demo credentials, not deployment
accounts. Sign-up creates a new account and a separate, empty company.

For development, run `npm run dev` for the API and `npm run dev:web` in another
terminal for the interface at port 5176. The frontend proxy calls the API at
3030. Stop development mode before running `npm start` on the same port.

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
npm run build
npm run test:integration
```

Tests create their own company/user fixtures and remove only those fixtures.
They use real PostgreSQL and HTTP calls. Migrations record names and normalized
SQL checksums; add a new migration instead of editing one already applied.

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
