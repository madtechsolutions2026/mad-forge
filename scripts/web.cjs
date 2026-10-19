const { spawn, spawnSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

const root = path.resolve(__dirname, "..");
const frontend = path.join(root, "frontend");
const mode = process.argv[2] ?? "dev";
if (!["dev", "build", "preview"].includes(mode)) throw new Error("Unknown frontend command.");
const vite = path.join(frontend, "node_modules", "vite", "bin", "vite.js");
if (!fs.existsSync(vite)) throw new Error("Frontend dependencies missing. Run npm ci in frontend first.");

if (mode === "build") {
  const result = spawnSync(process.execPath, [path.join(frontend, "node_modules/typescript/bin/tsc"), "--noEmit"], {
    cwd: frontend, stdio: "inherit", windowsHide: true
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const args = mode === "dev" ? [] : [mode];
const child = spawn(process.execPath, [vite, ...args, ...process.argv.slice(3)], {
  cwd: frontend, stdio: "inherit", windowsHide: true
});
child.on("exit", (code) => { process.exitCode = code ?? 1; });
child.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
