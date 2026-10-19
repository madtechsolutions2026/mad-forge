const { spawnSync } = require("node:child_process");
const path = require("node:path");
const root = path.resolve(__dirname, "..");

for (const args of [
  [path.join(root, "node_modules/typescript/bin/tsc")],
  [path.join(root, "scripts/web.cjs"), "build"],
]) {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: "inherit", windowsHide: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
