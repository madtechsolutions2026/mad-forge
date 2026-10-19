const { spawn, spawnSync } = require("node:child_process");
const path = require("node:path");

const migration = spawnSync(process.execPath, [path.join(__dirname, "migrate.cjs")], {
  stdio: "inherit",
  windowsHide: true,
});
if (migration.error) console.error("Database migration could not start:", migration.error.message);
if (migration.status !== 0) process.exit(migration.status ?? 1);

// Keep the existing server's graceful shutdown when it runs behind the startup wrapper.
const server = spawn(process.execPath, [path.join(__dirname, "../dist/server.js")], {
  stdio: "inherit",
  windowsHide: true,
});
server.on("error", (error) => {
  console.error("Server could not start:", error.message);
  process.exitCode = 1;
});
server.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal === "SIGINT" || signal === "SIGTERM" ? 0 : 1);
});
process.on("SIGINT", () => server.kill("SIGINT"));
process.on("SIGTERM", () => server.kill("SIGTERM"));
