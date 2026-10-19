import "./env.js";
import { Pool } from "pg";

// One shared pool. pg reads the PG... connection settings from the environment.
export const pool = new Pool({
  max: 5,
  connectionTimeoutMillis: 3000,
  query_timeout: 3000
});

pool.on("error", (error) => {
  console.error("Database pool error:", error.message);
});
