import { Router } from "express";
import { pool } from "../../config/db.js";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  res.json({ status: "ok" });
});

healthRouter.get("/db", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", database: "connected" });
  } catch (error) {
    console.error(
      "Database health check failed:",
      error instanceof Error ? error.message : "Unknown database error"
    );

    res.status(503).json({ status: "error", database: "unavailable" });
  }
});
