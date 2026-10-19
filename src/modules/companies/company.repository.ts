import { pool } from "../../config/db.js";
import type { PoolClient } from "pg";
import type { Company, CreateCompanyInput } from "./company.types.js";

export async function insertCompany(id: string, input: CreateCompanyInput, client?: PoolClient): Promise<Company> {
  const result = await (client ?? pool).query<Company>(
    `INSERT INTO public.companies (id, name, address, phone)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, address, phone, created_at, updated_at`,
    [id, input.name, input.address, input.phone],
  );
  return result.rows[0]!;
}

export async function findCompanyById(id: string): Promise<Company | undefined> {
  const result = await pool.query<Company>(
    `SELECT id, name, address, phone, created_at, updated_at
     FROM public.companies
     WHERE id = $1`,
    [id],
  );
  return result.rows[0];
}
