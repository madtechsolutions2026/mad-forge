import { createHash, timingSafeEqual } from "node:crypto";
import type { Request, RequestHandler } from "express";
import { pool } from "../../config/db.js";
import { AppError } from "../../shared/app-error.js";
import type { AuthContext, CompanyRole } from "./auth.types.js";

export const sessionCookieName = "madtech_session";
export const tokenHash = (token: string): string => createHash("sha256").update(token).digest("hex");
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function assertTrustedOrigin(req: Request): void {
  const origin = req.get("origin");
  if (!origin) {
    if (req.get("sec-fetch-site") === "cross-site") throw new AppError(403, "Request origin is not allowed.");
    return;
  }
  const configured = process.env.APP_ORIGINS?.split(",").map((value) => value.trim()).filter(Boolean);
  const origins = configured?.length ? configured : [
    "http://127.0.0.1:3030", "http://localhost:3030",
    "http://127.0.0.1:5176", "http://localhost:5176"
  ];
  if (!origins.includes(origin)) throw new AppError(403, "Request origin is not allowed.");
}

function readSessionToken(req: Request): string | undefined {
  const entry = req.headers.cookie?.split(";").map((value) => value.trim()).find((value) => value.startsWith(`${sessionCookieName}=`));
  const token = entry?.slice(sessionCookieName.length + 1);
  return token && /^[a-f0-9]{64}$/.test(token) ? token : undefined;
}

function assertCsrf(req: Request, csrfToken: string): void {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  assertTrustedOrigin(req);
  const supplied = req.get("x-csrf-token") ?? "";
  const expected = Buffer.from(csrfToken);
  const actual = Buffer.from(supplied);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new AppError(403, "Your security token is missing or expired. Refresh and try again.");
  }
}

export const requireAuth: RequestHandler = async (req, _res, next) => {
  const token = readSessionToken(req);
  if (!token) throw new AppError(401, "Sign in to continue.");
  const result = await pool.query<{
    session_id: string; user_id: string; name: string; email: string; csrf_token: string;
  }>(
    `SELECT s.id AS session_id, u.id AS user_id, u.name, u.email, s.csrf_token
     FROM public.auth_sessions s JOIN public.users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > CURRENT_TIMESTAMP`, [tokenHash(token)]
  );
  const row = result.rows[0];
  if (!row) throw new AppError(401, "Your session expired. Sign in again.");
  const auth: AuthContext = { sessionId: row.session_id, userId: row.user_id, name: row.name, email: row.email, csrfToken: row.csrf_token };
  assertCsrf(req, auth.csrfToken);
  req.auth = auth;
  next();
};

export const requireWorkspace: RequestHandler = async (req, _res, next) => {
  if (!req.auth) throw new AppError(401, "Sign in to continue.");
  const companyId = req.get("x-company-id");
  if (!companyId || !uuidPattern.test(companyId)) throw new AppError(400, "Select a valid company workspace.");
  const result = await pool.query<{ role: CompanyRole }>(
    "SELECT role FROM public.company_memberships WHERE user_id = $1 AND company_id = $2", [req.auth.userId, companyId]
  );
  if (!result.rows[0]) throw new AppError(403, "You do not have access to this company.");
  req.workspace = { userId: req.auth.userId, companyId, role: result.rows[0].role };
  next();
};

export function allowRoles(...roles: CompanyRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.workspace) throw new AppError(403, "A company workspace is required.");
    if (!roles.includes(req.workspace.role)) throw new AppError(403, "Your role cannot perform this action.");
    next();
  };
}

/** Protect a legacy company-by-ID route without trusting a caller's company header. */
export const requireCompanyMembership: RequestHandler = async (req, _res, next) => {
  if (!req.auth) throw new AppError(401, "Sign in to continue.");
  const companyId = req.params.id;
  if (typeof companyId !== "string" || !uuidPattern.test(companyId)) throw new AppError(400, "Invalid company ID.");
  const result = await pool.query<{ role: CompanyRole }>(
    "SELECT role FROM public.company_memberships WHERE user_id = $1 AND company_id = $2", [req.auth.userId, companyId]
  );
  if (!result.rows[0]) throw new AppError(404, "Company not found.");
  req.workspace = { userId: req.auth.userId, companyId, role: result.rows[0].role };
  next();
};
