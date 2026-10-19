import type { Request, Response } from "express";
import * as companyService from "./company.service.js";
import { AppError } from "../../shared/app-error.js";

export async function createCompany(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new AppError(401, "Sign in to create a company.");
  const company = await companyService.createCompany(req.body, req.auth.userId);
  res.location(`/api/companies/${company.id}`).status(201).json({
    status: "ok",
    data: company,
  });
}

export async function getCompany(req: Request, res: Response): Promise<void> {
  const company = await companyService.getCompany(req.params.id);
  res.json({ status: "ok", data: company });
}
