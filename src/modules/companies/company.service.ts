import { randomUUID } from "node:crypto";
import { AppError } from "../../shared/app-error.js";
import { pool } from "../../config/db.js";
import { findCompanyById, insertCompany } from "./company.repository.js";
import type { Company } from "./company.types.js";
import { validateCompanyId, validateCompanyInput } from "./company.validation.js";

export async function createCompany(body: unknown, userId: string): Promise<Company> {
  const input = validateCompanyInput(body);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const company = await insertCompany(randomUUID(), input, client);
    await client.query("INSERT INTO public.company_memberships (user_id, company_id, role) VALUES ($1, $2, 'owner')", [
      userId,
      company.id,
    ]);
    await client.query("COMMIT");
    return company;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getCompany(id: unknown): Promise<Company> {
  const company = await findCompanyById(validateCompanyId(id));
  if (!company) throw new AppError(404, "Company not found.");
  return company;
}
