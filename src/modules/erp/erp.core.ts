import { createHash, randomUUID } from "node:crypto";
import type { Request } from "express";
import type { PoolClient, QueryResultRow } from "pg";
import { pool } from "../../config/db.js";
import { AppError } from "../../shared/app-error.js";

export type Workspace = { userId: string; companyId: string; role: string };
export type Body = Record<string, unknown>;
export type Domain = "masters" | "purchasing" | "warehouse" | "production" | "sales" | "finance";

const roles: Record<Domain, string[]> = {
  masters: ["owner", "admin", "purchasing", "warehouse", "production"],
  purchasing: ["owner", "admin", "purchasing"],
  warehouse: ["owner", "admin", "warehouse"],
  production: ["owner", "admin", "production"],
  sales: ["owner", "admin", "purchasing"],
  finance: ["owner", "admin", "finance"]
};

export function workspace(req: Request): Workspace {
  const context = (req as unknown as { workspace?: Workspace }).workspace;
  if (!context) throw new AppError(401, "Sign in and select a company first");
  return context;
}
export function body(value: unknown): Body {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AppError(400, "A JSON object is required");
  return value as Body;
}
export function text(value: unknown, name: string, max = 150, optional = false): string | null {
  if (optional && (value === undefined || value === null)) return null;
  if (typeof value !== "string" || value.includes("\u0000")) {
    throw new AppError(400, `${name} must be valid text without null characters`);
  }
  const normalized = value.trim();
  if (optional && !normalized) return null;
  if (!normalized || [...normalized].length > max) {
    throw new AppError(400, `${name} must contain 1–${max} characters`);
  }
  return normalized;
}
export function id(value: unknown, name = "ID"): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new AppError(400, `${name} must be a valid UUID`);
  }
  return value;
}
export function decimal(value: unknown, name: string, options: { zero?: boolean; signed?: boolean; places?: number; fallback?: string } = {}): string {
  const candidate = value === undefined ? options.fallback : value;
  const str = typeof candidate === "number" ? String(candidate) : candidate;
  const places = options.places ?? 6;
  const regex = new RegExp(`^${options.signed ? "-?" : ""}\\d{1,11}(?:\\.\\d{1,${places}})?$`);
  if (typeof str !== "string" || !regex.test(str) || (!options.zero && Number(str) === 0)) {
    throw new AppError(400, `${name} must be ${options.signed ? "a signed" : options.zero ? "a non-negative" : "a positive"} decimal with at most ${places} decimal places`);
  }
  return str;
}
export function list(value: unknown, name = "lines"): Body[] {
  if (!Array.isArray(value) || !value.length || value.length > 100) throw new AppError(400, `${name} must contain 1–100 entries`);
  return value.map(body);
}
export function unique(values: string[]): void {
  if (new Set(values).size !== values.length) throw new AppError(400, "Duplicate line items are not allowed");
}
export function choice(value: unknown, options: string[], name: string): string {
  if (typeof value !== "string" || !options.includes(value)) throw new AppError(400, `${name} must be one of: ${options.join(", ")}`);
  return value;
}
export function date(value: unknown, name: string, optional = false): string | null {
  if (optional && (value === undefined || value === null || value === "")) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) {
    throw new AppError(400, `${name} must be a real date in YYYY-MM-DD format`);
  }
  return value;
}
export async function first<T extends QueryResultRow = QueryResultRow>(client: PoolClient, sql: string, params: unknown[]): Promise<T> {
  const result = await client.query<T>(sql, params);
  if (!result.rows[0]) throw new AppError(404, "Record not found in this company");
  return result.rows[0];
}
export async function code(client: PoolClient, company: string, prefix: string): Promise<string> {
  const row = await first(client, `INSERT INTO erp_sequences(company_id,prefix,value) VALUES($1,$2,1)
    ON CONFLICT(company_id,prefix) DO UPDATE SET value=erp_sequences.value+1 RETURNING value`, [company, prefix]);
  return `${prefix}-${String(row.value).padStart(5, "0")}`;
}
export async function audit(client: PoolClient, w: Workspace, action: string, entityType: string, entityId: string, description: string): Promise<void> {
  await client.query(`INSERT INTO erp_audit(id,company_id,actor_id,action,entity_type,entity_id,description) VALUES($1,$2,$3,$4,$5,$6,$7)`,
    [randomUUID(), w.companyId, w.userId, action, entityType, entityId, description]);
}

export async function stock(client: PoolClient, w: Workspace, input: { warehouseId: string; itemId: string; quantity: string; unitCost: string; movement: string; referenceId: string; referenceCode: string; note?: string | null; releaseReservation?: string }): Promise<void> {
  await client.query(`INSERT INTO erp_stock_balances(company_id,warehouse_id,item_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`, [w.companyId, input.warehouseId, input.itemId]);
  const result = await client.query(`UPDATE erp_stock_balances SET on_hand=on_hand+$4::numeric,reserved=reserved-$5::numeric
    WHERE company_id=$1 AND warehouse_id=$2 AND item_id=$3
      AND reserved>=$5::numeric AND on_hand+$4::numeric>=reserved-$5::numeric
    RETURNING on_hand`, [w.companyId, input.warehouseId, input.itemId, input.quantity, input.releaseReservation ?? "0"]);
  if (!result.rowCount) throw new AppError(409, "Insufficient available stock. Stock reserved for other orders cannot be consumed.");
  await client.query(`INSERT INTO erp_stock_ledger(id,company_id,warehouse_id,item_id,quantity,unit_cost,movement,reference_id,reference_code,note,actor_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [randomUUID(), w.companyId, input.warehouseId, input.itemId, input.quantity, input.unitCost, input.movement, input.referenceId, input.referenceCode, input.note ?? null, w.userId]);
}

export async function write(req: Request, domain: Domain, execute: (client: PoolClient, w: Workspace, input: Body) => Promise<Body>, message: string): Promise<Body> {
  const w = workspace(req);
  if (!roles[domain].includes(w.role)) throw new AppError(403, "Your role does not permit this action");
  const key = req.get("X-Idempotency-Key");
  if (!key || key.length < 8 || key.length > 100 || !/^[a-zA-Z0-9_-]+$/.test(key)) throw new AppError(400, "Provide an X-Idempotency-Key of 8–100 letters, numbers, hyphens or underscores");
  const input = body(req.body ?? {});
  const fingerprint = createHash("sha256").update(JSON.stringify([w.userId, req.method, req.originalUrl, input])).digest("hex");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout='8s'");
    // Serialize this small factory's posting transactions. Different companies remain independent.
    await client.query("SELECT pg_advisory_xact_lock(73103,hashtext($1))", [w.companyId]);
    const previous = await client.query("SELECT fingerprint,response FROM erp_idempotency WHERE company_id=$1 AND key=$2", [w.companyId, key]);
    if (previous.rows[0]) {
      if (previous.rows[0].fingerprint !== fingerprint) throw new AppError(409, "This idempotency key was already used for a different request");
      await client.query("COMMIT");
      return previous.rows[0].response as Body;
    }
    const data = await execute(client, w, input);
    const response = { data, message };
    await client.query("INSERT INTO erp_idempotency(company_id,key,fingerprint,response) VALUES($1,$2,$3,$4::jsonb)", [w.companyId, key, fingerprint, JSON.stringify(response)]);
    await client.query("COMMIT");
    return response;
  } catch (error) {
    await client.query("ROLLBACK");
    if (error instanceof AppError) throw error;
    const pgCode = (error as { code?: string }).code;
    if (pgCode === "23505") throw new AppError(409, "This code or document already exists in the company");
    if (pgCode === "23503") throw new AppError(400, "A related record does not belong to this company or no longer exists");
    if (["23514", "22003", "22008", "22P02"].includes(pgCode ?? "")) throw new AppError(400, "One or more values exceed the permitted limits");
    if (["55P03", "57014", "40P01"].includes(pgCode ?? "")) throw new AppError(409, "Another posting is in progress. Retry with the same idempotency key.");
    throw error;
  } finally {
    client.release();
  }
}
