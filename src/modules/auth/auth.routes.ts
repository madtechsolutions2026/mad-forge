import { randomBytes, randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import type { PoolClient } from "pg";
import { pool } from "../../config/db.js";
import { AppError } from "../../shared/app-error.js";
import { assertTrustedOrigin, requireAuth, requireWorkspace, sessionCookieName, tokenHash } from "./auth.middleware.js";
import { hashPassword, verifyPassword } from "./password.js";
import type { AuthContext, CompanyRole } from "./auth.types.js";

export const authRouter = Router();
const sessionHours = 12;
const sessionAge = sessionHours * 60 * 60 * 1000;
const secureCookie = process.env.NODE_ENV === "production";
const cookieOptions = { httpOnly: true, sameSite: "lax" as const, secure: secureCookie, path: "/" };
const dummyHash = hashPassword(randomBytes(32).toString("hex"));
const attempts = new Map<string, { count: number; resetsAt: number }>();

function rateLimit(req: Request): void {
  const key = req.ip ?? req.socket.remoteAddress ?? "unknown";
  const now = Date.now();
  let bucket = attempts.get(key);
  if (!bucket || now >= bucket.resetsAt) {
    bucket = { count: 0, resetsAt: now + 15 * 60 * 1000 };
    attempts.set(key, bucket);
  }
  bucket.count += 1;
  if (attempts.size > 5000) for (const [entry, value] of attempts) if (value.resetsAt <= now) attempts.delete(entry);
  if (bucket.count > 25) throw new AppError(429, "Too many sign-in attempts. Please try again in 15 minutes.");
}

function bodyObject(req: Request): Record<string, unknown> {
  if (!req.is("application/json")) throw new AppError(415, "Send an application/json request.");
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) throw new AppError(400, "Provide a valid request body.");
  return req.body as Record<string, unknown>;
}

function text(body: Record<string, unknown>, key: string, min: number, max: number): string {
  const value = body[key];
  if (typeof value !== "string" || value.includes("\u0000") || value.trim().length < min || value.trim().length > max) {
    throw new AppError(400, `Check your ${key === "companyName" ? "company name" : key}.`, { [key]: `Use ${min}–${max} characters.` });
  }
  return value.trim();
}

function emailAddress(body: Record<string, unknown>): string {
  const email = text(body, "email", 3, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError(400, "Enter a valid email address.");
  return email;
}

async function newSession(client: PoolClient, userId: string): Promise<{ token: string; csrfToken: string }> {
  const token = randomBytes(32).toString("hex");
  const csrfToken = randomBytes(32).toString("hex");
  await client.query("DELETE FROM public.auth_sessions WHERE user_id = $1 AND expires_at <= CURRENT_TIMESTAMP", [userId]);
  await client.query(
    `INSERT INTO public.auth_sessions (id, token_hash, user_id, csrf_token, expires_at)
     VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP + INTERVAL '${sessionHours} hours')`,
    [randomUUID(), tokenHash(token), userId, csrfToken]
  );
  return { token, csrfToken };
}

function setSessionCookie(res: Response, token: string): void {
  res.cookie(sessionCookieName, token, { ...cookieOptions, maxAge: sessionAge });
  res.set("Cache-Control", "no-store");
}

async function identity(auth: AuthContext) {
  const companies = await pool.query<{ id: string; name: string; role: CompanyRole }>(
    `SELECT c.id, c.name, m.role FROM public.companies c
     JOIN public.company_memberships m ON m.company_id = c.id
     WHERE m.user_id = $1 ORDER BY c.created_at, c.name`, [auth.userId]
  );
  return { user: { id: auth.userId, name: auth.name, email: auth.email }, companies: companies.rows, csrfToken: auth.csrfToken };
}

authRouter.post("/register", async (req, res) => {
  assertTrustedOrigin(req);
  rateLimit(req);
  const body = bodyObject(req);
  const name = text(body, "name", 2, 100);
  const companyName = text(body, "companyName", 2, 150);
  const email = emailAddress(body);
  const password = body.password;
  if (typeof password !== "string" || password.length < 12 || password.length > 128) {
    throw new AppError(400, "Use a password with 12–128 characters.", { password: "Use at least 12 characters." });
  }
  const passwordHash = await hashPassword(password);
  const userId = randomUUID();
  const companyId = randomUUID();
  const client = await pool.connect();
  let session: { token: string; csrfToken: string };
  try {
    await client.query("BEGIN");
    await client.query("INSERT INTO public.users (id, name, email, password_hash) VALUES ($1, $2, $3, $4)", [userId, name, email, passwordHash]);
    await client.query("INSERT INTO public.companies (id, name) VALUES ($1, $2)", [companyId, companyName]);
    await client.query("INSERT INTO public.company_memberships (user_id, company_id, role) VALUES ($1, $2, 'owner')", [userId, companyId]);
    session = await newSession(client, userId);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") throw new AppError(409, "An account with this email already exists.");
    throw error;
  } finally {
    client.release();
  }
  setSessionCookie(res, session.token);
  res.status(201).json({ user: { id: userId, name, email }, companies: [{ id: companyId, name: companyName, role: "owner" }], csrfToken: session.csrfToken });
});

authRouter.post("/login", async (req, res) => {
  assertTrustedOrigin(req);
  rateLimit(req);
  const body = bodyObject(req);
  const email = emailAddress(body);
  const password = body.password;
  if (typeof password !== "string" || password.length < 1 || password.length > 128) throw new AppError(400, "Enter your password.");
  const result = await pool.query<{ id: string; name: string; email: string; password_hash: string }>(
    "SELECT id, name, email, password_hash FROM public.users WHERE email = $1", [email]
  );
  const user = result.rows[0];
  const valid = await verifyPassword(password, user?.password_hash ?? await dummyHash);
  if (!user || !valid) throw new AppError(401, "The email or password is incorrect.");
  const client = await pool.connect();
  let session: { token: string; csrfToken: string };
  try {
    await client.query("BEGIN");
    session = await newSession(client, user.id);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
  setSessionCookie(res, session.token);
  res.json(await identity({ sessionId: "", userId: user.id, name: user.name, email: user.email, csrfToken: session.csrfToken }));
});

authRouter.get("/me", requireAuth, async (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(await identity(req.auth!));
});

authRouter.post("/logout", requireAuth, async (req, res) => {
  await pool.query("DELETE FROM public.auth_sessions WHERE id = $1", [req.auth!.sessionId]);
  res.clearCookie(sessionCookieName, cookieOptions);
  res.set("Cache-Control", "no-store");
  res.status(204).end();
});

const roles: CompanyRole[] = ["owner", "admin", "purchasing", "warehouse", "production", "finance", "viewer"];

function membershipRole(body: Record<string, unknown>): CompanyRole {
  if (typeof body.role !== "string" || !roles.includes(body.role as CompanyRole)) throw new AppError(400, "Choose a valid team role.");
  return body.role as CompanyRole;
}

async function lockCompanyAdministration(client: PoolClient, userId: string, companyId: string): Promise<CompanyRole> {
  // Serialize membership changes per company, including the last-owner check.
  await client.query("SELECT id FROM public.companies WHERE id = $1 FOR UPDATE", [companyId]);
  const actor = await client.query<{ role: CompanyRole }>(
    "SELECT role FROM public.company_memberships WHERE user_id = $1 AND company_id = $2", [userId, companyId]
  );
  const role = actor.rows[0]?.role;
  if (role !== "owner" && role !== "admin") throw new AppError(403, "Only an owner or admin can manage the team.");
  return role;
}

async function memberRecord(client: PoolClient, userId: string, companyId: string) {
  const result = await client.query<{ id: string; name: string; email: string; role: CompanyRole; createdAt: Date }>(
    `SELECT u.id, u.name, u.email, m.role, m.created_at AS "createdAt"
     FROM public.company_memberships m JOIN public.users u ON u.id = m.user_id
     WHERE m.user_id = $1 AND m.company_id = $2`, [userId, companyId]
  );
  return result.rows[0];
}

authRouter.get("/members", requireAuth, requireWorkspace, async (req, res) => {
  const result = await pool.query(
    `SELECT u.id, u.name, u.email, m.role, m.created_at AS "createdAt"
     FROM public.company_memberships m JOIN public.users u ON u.id = m.user_id
     WHERE m.company_id = $1 ORDER BY m.created_at, u.name`, [req.workspace!.companyId]
  );
  res.set("Cache-Control", "no-store");
  res.json({ members: result.rows });
});

authRouter.post("/members", requireAuth, requireWorkspace, async (req, res) => {
  const body = bodyObject(req);
  const email = emailAddress(body);
  const role = membershipRole(body);
  const client = await pool.connect();
  const { userId: actorId, companyId } = req.workspace!;
  let member;
  try {
    await client.query("BEGIN");
    const actorRole = await lockCompanyAdministration(client, actorId, companyId);
    if (actorRole === "admin" && (role === "owner" || role === "admin")) throw new AppError(403, "Only an owner can assign owner or admin access.");
    const existing = await client.query<{ id: string }>("SELECT id FROM public.users WHERE email = $1", [email]);
    let userId = existing.rows[0]?.id;
    if (!userId) {
      const name = text(body, "name", 2, 100);
      const password = body.password;
      if (typeof password !== "string" || password.length < 12 || password.length > 128) throw new AppError(400, "A new team member needs a temporary password with 12–128 characters.");
      const hash = await hashPassword(password);
      userId = randomUUID();
      await client.query("INSERT INTO public.users (id, name, email, password_hash) VALUES ($1, $2, $3, $4)", [userId, name, email, hash]);
    }
    await client.query("INSERT INTO public.company_memberships (user_id, company_id, role) VALUES ($1, $2, $3)", [userId, companyId, role]);
    member = await memberRecord(client, userId, companyId);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") throw new AppError(409, "This account already belongs to the team, or was just created. Refresh and try again.");
    throw error;
  } finally { client.release(); }
  res.set("Cache-Control", "no-store");
  res.status(201).json({ member });
});

authRouter.patch("/members/:userId", requireAuth, requireWorkspace, async (req, res) => {
  const body = bodyObject(req);
  const role = membershipRole(body);
  const targetId = req.params.userId;
  if (typeof targetId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetId)) throw new AppError(400, "Invalid member ID.");
  const { userId: actorId, companyId } = req.workspace!;
  const client = await pool.connect();
  let member;
  try {
    await client.query("BEGIN");
    const actorRole = await lockCompanyAdministration(client, actorId, companyId);
    const target = await memberRecord(client, targetId, companyId);
    if (!target) throw new AppError(404, "Team member not found.");
    if (actorRole === "admin" && (["owner", "admin"].includes(target.role) || ["owner", "admin"].includes(role))) throw new AppError(403, "Only an owner can change owner or admin access.");
    if (target.role === "owner" && role !== "owner") {
      const owners = await client.query<{ count: number }>("SELECT count(*)::integer AS count FROM public.company_memberships WHERE company_id = $1 AND role = 'owner'", [companyId]);
      if ((owners.rows[0]?.count ?? 0) <= 1) throw new AppError(409, "Keep at least one owner in this workspace.");
    }
    await client.query("UPDATE public.company_memberships SET role = $1 WHERE user_id = $2 AND company_id = $3", [role, targetId, companyId]);
    member = await memberRecord(client, targetId, companyId);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
  res.set("Cache-Control", "no-store");
  res.json({ member });
});
