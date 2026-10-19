import { Router } from "express";
import { requireCompanyMembership } from "../auth/auth.middleware.js";
import { createCompany, getCompany } from "./company.controller.js";

export const companyRouter = Router();

companyRouter.post("/", createCompany);
companyRouter.get("/:id", requireCompanyMembership, getCompany);
