const path = require("node:path");
const { Pool } = require("pg");
require("dotenv").config({ path: path.resolve(__dirname, "../.env"), quiet: true });
const { seedAuth } = require("./seed-auth.cjs");
const { seedOperations } = require("./seed-operations.cjs");

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Demo seeding is disabled in production.");
  const pool = new Pool({ connectionTimeoutMillis: 5000 });
  pool.on("error", (error) => console.error("Seed connection error:", error.message));
  try {
    const identity = await seedAuth(pool);
    await seedOperations(pool, identity.companyId, identity.ownerId);
    console.log("Madtech Forge demo workspace is ready.");
    console.log("Demo owner: demo@madtech.local / ForgeDemo@2026!");
    console.log("Read-only demo: viewer@madtech.local / ForgeDemo@2026!");
  } finally {
    await pool.end();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
