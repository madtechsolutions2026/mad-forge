import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { errorHandler } from "./middleware/error-handler.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { requireAuth, requireWorkspace } from "./modules/auth/auth.middleware.js";
import { companyRouter } from "./modules/companies/company.routes.js";
import { erpRouter } from "./modules/erp/erp.routes.js";
import { healthRouter } from "./modules/health/health.routes.js";

export const app = express();

app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  next();
});
app.use(express.json({ limit: "1mb" }));
app.use("/health", healthRouter);
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
app.use("/api/auth", authRouter);
app.use("/api/companies", requireAuth, companyRouter);
app.use("/api/erp", requireAuth, requireWorkspace, erpRouter);

const webRoot = path.resolve(__dirname, "../frontend/dist");
const webIndex = path.join(webRoot, "index.html");
app.use(express.static(webRoot, { index: false }));
app.use((req, res, next) => {
  if (
    req.method !== "GET" ||
    req.path === "/api" ||
    req.path.startsWith("/api/") ||
    req.path.startsWith("/health") ||
    !existsSync(webIndex)
  ) {
    next();
    return;
  }
  res.setHeader("Cache-Control", "no-cache");
  res.sendFile("index.html", { root: webRoot });
});

app.use((_req, res) => {
  res.status(404).json({ status: "error", message: "Route not found" });
});

app.use(errorHandler);
