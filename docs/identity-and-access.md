# Identity and workspace access

Forge uses PostgreSQL-backed sessions. The browser holds an opaque 256-bit random session token in an HttpOnly, SameSite=Lax cookie. The database stores its SHA-256 hash, user ID, CSRF token, and a 12-hour expiry. Passwords use scrypt with a random 128-bit salt (N=32768, r=8, p=3). Password hashes and session tokens are never returned in API JSON.

## Endpoints

| Method | Path | Body / result |
| --- | --- | --- |
| POST | /api/auth/register | `{name,email,password,companyName}`; creates the account, company, owner membership, and session atomically |
| POST | /api/auth/login | `{email,password}` |
| GET | /api/auth/me | Current identity and available companies |
| POST | /api/auth/logout | Revokes the current server-side session |
| GET | /api/auth/members | Workspace members as `{members:[{id,name,email,role,createdAt}]}` |
| POST | /api/auth/members | Owner/admin: `{name,email,password,role}` creates a member. Existing accounts can be added with email and role; their name/password are preserved |
| PATCH | /api/auth/members/:userId | Owner/admin: `{role}` updates a member's workspace role |

Login, registration and `/me` return `{user:{id,name,email},companies:[{id,name,role}],csrfToken}`. The frontend sends `credentials: "include"`. Authenticated writes send `X-CSRF-Token`. Workspace APIs also send `X-Company-Id`; the backend verifies membership instead of trusting that header. Stock and document postings use a separate idempotency key.

`requireAuth` populates `req.auth` and enforces CSRF on writes. `requireWorkspace` populates `req.workspace = {userId,companyId,role}`. Roles are owner, admin, purchasing, warehouse, production, finance, and viewer. Business endpoints decide the permitted roles; the viewer must not post transactions.

Team changes require a selected company and CSRF token. An owner may assign every role. An admin cannot assign or change owner/admin access. Role edits serialize on the company row and recheck the actor's current membership, so concurrent requests cannot demote the last owner or continue using a revoked admin role. A new account requires a 12–128 character temporary password; account recovery and forced password change are not implemented yet. No invitation email is sent. Distribute any temporary password through your own trusted channel.

## Local demo access

The optional seed creates `demo@madtech.local`, `viewer@madtech.local`, and `other@madtech.local`, each with the deliberately documented local demo password `ForgeDemo@2026!`. The demo user owns Green Bamboo; the viewer can inspect that same company; the other account owns a separate Northstar company for isolation tests. Running the seed again resets those three demo passwords and keeps existing business data. Demo seeding refuses NODE_ENV=production. Never use seeded accounts for a live deployment.

## Deployment requirements

This is a working local implementation, not a claim of complete enterprise identity management. Set `NODE_ENV=production` behind HTTPS so cookies are Secure. Set `APP_ORIGINS` to the exact public HTTPS application origins (comma-separated); the defaults permit local ports 3030 and 5176 only. Serve the web app and API from the same public origin, or use an explicit same-site proxy. Do not enable wildcard credentialed CORS. Configure proxy trust only for an actual trusted reverse proxy.

The login/register attempt limiter is per-process memory: 25 attempts per IP per 15 minutes. A deployment with multiple instances needs a shared rate limiter. Add recovery/verification, MFA or an external identity provider, session administration, monitoring, secret rotation, least-privilege database credentials, and backups before onboarding live customers. Company filtering is enforced in API queries; this implementation does not claim PostgreSQL row-level security. Keep company predicates and role checks on every new endpoint and test isolation.
