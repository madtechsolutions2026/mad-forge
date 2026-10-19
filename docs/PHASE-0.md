# Phase 0 - tooling and hygiene

## What changed

- Branch: `feat/phase-0-tooling-hygiene`; no changes are pushed or merged to `main`.
- Prettier uses print width 120 and LF line endings, with root/frontend scripts.
- ESLint flat configs check the root and frontend separately. EditorConfig sets
  two-space indentation and final newlines.
- Formatting is isolated in commit `a81dcba`. The verification helper confirms
  that all 45 changed files are exactly Prettier output from the parent commit.
- Frontend records, form input props, line callbacks and mutation payloads have
  explicit types. The shared `Entity` type no longer has an `any` index signature.
  Payment, expense, stock movement and purchase-order metadata types match the
  existing API fields. Generic dialog TODOs explain the remaining non-null/type
  assertions; there are no explicit frontend `any` annotations left.
- Add a multi-stage, non-root Node 24 image, PostgreSQL 17 Compose service with
  named storage, migration-before-start wrapper and container health checks.
- Add CI installs, typecheck, lint, format check, build, migrations, integration
  tests and Compose startup checks. Host commands use PowerShell.
- Document generic setup, private security reporting and the changelog.

## Decisions

### Compiler and dependencies

The existing TypeScript 7.0.2 does not satisfy the current `typescript-eslint`
peer range (`>=4.8.4 <6.1.0`). Both packages therefore pin the development compiler
to `~6.0.3`, a supported version that passes the same strict checks. No `--force`
or `--legacy-peer-deps` install is required. Node 24 and the runtime dependencies
are unchanged.

Development-only additions are Prettier (formatting), ESLint and `@eslint/js`
(flat recommended JavaScript rules), `typescript-eslint` (TypeScript parsing and
rules), `globals` (Node/browser environments), and `eslint-plugin-react-hooks`
(Hook call order). They are installed in each package so each package's scripts
resolve their own declared tools. No application dependency was added.

### Lint exceptions to preserve behavior

- Disable `no-unused-vars` and `@typescript-eslint/no-unused-vars`: keep existing
  imports, debugging and unused handler parameters in this zero-behavior phase.
- Disable `react-hooks/exhaustive-deps`; enable `react-hooks/rules-of-hooks`.
  Changing dependency arrays or enabling new React Compiler-style rules would
  require functional review beyond Phase 0.
- Allow empty catch blocks through `no-empty`'s `allowEmptyCatch` option because
  existing optional-session handling deliberately ignores unsuccessful lookups.
- Allow ambient namespace declarations for the existing Express Request typing.
- Disable `@typescript-eslint/no-require-imports` only for CommonJS `.cjs` files.
- Disable `preserve-caught-error` only for existing test helpers so their error
  wrapping remains unchanged.
- Disable `no-control-regex` only in `purchase-export.ts`; its existing CSV
  formula-injection guard intentionally recognizes leading control characters.
- Keep the remaining recommended JavaScript/TypeScript checks enabled, including
  `no-explicit-any`. There are no file-wide `any` exemptions.

### Runtime and data boundaries

No business operation, UI copy/design, authentication policy, SQL calculation or
API contract is changed. Migrations 001-004 are excluded from formatting and are
unchanged. No new migration is introduced. Docker's `HOST=0.0.0.0` is confined to
the container environment; the non-container server still defaults to loopback.

The Docker image defaults to production, so Secure cookies and the existing
production seeding prohibition still apply. Use `localhost` for local container
testing and HTTPS for actual deployment. Compose never seeds demonstration users
or deletes named database volumes automatically.

## Verification

Before changes, these PowerShell commands succeeded:

```powershell
npm ci
npm --prefix frontend ci
npm run typecheck
npm --prefix frontend run build
npm run db:migrate
npm run test:integration
```

Baseline result: 34 integration tests passed, 0 failed. Migrations 001-004 were
already applied. Typecheck, frontend build and the same 34 integration tests also
passed immediately after the dedicated formatting commit.

Final verification on 19 October 2026, using Node 24.18.0 and the existing local
PostgreSQL service:

| Command                                   | Actual result                                                    |
| ----------------------------------------- | ---------------------------------------------------------------- |
| `npm ci`                                  | Exit 0; 233 packages installed; audit reported 0 vulnerabilities |
| `npm --prefix frontend ci`                | Exit 0; 159 packages installed; audit reported 0 vulnerabilities |
| `npm run typecheck`                       | Exit 0                                                           |
| `npm run lint`                            | Exit 0; root and frontend; no lint warnings                      |
| `npm run format:check`                    | Exit 0; all matched files use Prettier code style                |
| `npm --prefix frontend run build`         | Exit 0; 1,930 modules transformed                                |
| `npm run build`                           | Exit 0; API and frontend built                                   |
| `npm run db:migrate`                      | Exit 0; migrations 001-004 already applied; no SQL changes       |
| `npm run test:integration`                | 34 tests passed; 0 failed, skipped, cancelled or todo            |
| `npm run verify:format-commit -- a81dcba` | All 45 files are exactly formatter output from the parent        |
| `git diff main -- database/migrations`    | Empty diff                                                       |

An additional compiler-API comparison confirmed the four type-cleanup files emit
identical runtime ASTs to their formatting-commit versions, ignoring comments and
redundant parentheses. No existing integration test assertion was changed.

Clean installs printed the existing esbuild install-script notice but exited
successfully; no script-approval policy was changed, and both builds succeeded.
The `main` branch still points to `06ad8ff8f782160db759266578ed706003f87aac`.

## Known gaps and manual actions

Docker/Compose is not installed on the development machine, so a local image
build and `docker compose up` boot cannot be claimed as tested. CI includes a
Compose smoke test; that workflow cannot run until the owner chooses to push.
After installing Docker Desktop with Linux containers, follow the README's
Compose commands to verify locally. No remote CI run or push is performed here.

Replace `security@<your-domain>` in SECURITY.md with a monitored contact before
deployment. Future UoM, correctness, security, pagination and design phases remain
out of scope and have not been started.
