const { createHash } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { Pool } = require("pg");

const root = path.resolve(__dirname, "..");
require("dotenv").config({ path: path.join(root, ".env"), quiet: true });

async function migrate() {
  for (const name of ["PGHOST", "PGDATABASE", "PGUSER", "PGPASSWORD"]) {
    if (!process.env[name]?.trim()) {
      throw new Error(`Missing ${name}. Check the project root .env file.`);
    }
  }

  const pool = new Pool({ max: 1, connectionTimeoutMillis: 3000 });
  pool.on("error", (error) => console.error("Migration pool error:", error.message));
  let client;
  let transactionStarted = false;

  try {
    const directory = path.join(root, "database", "migrations");
    const files = (await fs.readdir(directory)).filter((file) => /^\d+_[a-z0-9_]+\.sql$/i.test(file)).sort();

    client = await pool.connect();
    await client.query("BEGIN");
    transactionStarted = true;
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '30s'");
    await client.query("SELECT pg_advisory_xact_lock(73101, 1)");
    await client.query(`
      CREATE TABLE IF NOT EXISTS public._mad_erp_migrations (
        filename TEXT PRIMARY KEY,
        checksum CHAR(64) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const history = await client.query("SELECT filename, checksum FROM public._mad_erp_migrations");
    const applied = new Map(history.rows.map((row) => [row.filename, row.checksum]));
    const messages = [];

    for (const filename of applied.keys()) {
      if (!files.includes(filename)) {
        throw new Error(`Applied migration is missing: ${filename}`);
      }
    }

    for (const filename of files) {
      const sql = await fs.readFile(path.join(directory, filename), "utf8");
      const checksum = createHash("sha256").update(sql.replace(/\r\n/g, "\n")).digest("hex");

      if (applied.has(filename)) {
        if (applied.get(filename) !== checksum) {
          throw new Error(`Applied migration changed: ${filename}. Add a new migration instead.`);
        }
        messages.push(`Already applied: ${filename}`);
        continue;
      }

      await client.query(sql);
      await client.query("INSERT INTO public._mad_erp_migrations (filename, checksum) VALUES ($1, $2)", [
        filename,
        checksum,
      ]);
      messages.push(`Applied: ${filename}`);
    }

    await client.query("COMMIT");
    transactionStarted = false;
    for (const message of messages) console.log(message);
    console.log("Database migrations are up to date.");
  } catch (error) {
    if (client && transactionStarted) {
      await client.query("ROLLBACK");
    }
    throw error;
  } finally {
    client?.release();
    await pool.end();
  }
}

migrate().catch((error) => {
  console.error("Migration failed:", error.message);
  process.exitCode = 1;
});
