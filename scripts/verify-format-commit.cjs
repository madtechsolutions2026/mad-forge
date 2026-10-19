const { execFileSync } = require("node:child_process");
const path = require("node:path");

async function main() {
  const prettier = await import("prettier");
  const revision = process.argv[2] || "HEAD";
  const root = path.resolve(__dirname, "..");
  const git = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
  const entries = git(["diff-tree", "--no-commit-id", "--name-status", "-r", revision])
    .trim()
    .split("\n")
    .filter(Boolean);
  for (const entry of entries) {
    const [status, filename] = entry.split("\t");
    if (status !== "M") throw new Error(`Formatting commit added or removed ${filename}`);
    const before = git(["show", `${revision}^:${filename}`]);
    const after = git(["show", `${revision}:${filename}`]);
    const filepath = path.join(root, filename);
    const options = await prettier.resolveConfig(filepath);
    let expected = before;
    // A preserved method-chain layout can take a second pass to settle; accept formatter output only.
    for (let pass = 0; pass < 5; pass++) {
      const formatted = await prettier.format(expected, { ...options, filepath });
      if (formatted === expected) break;
      expected = formatted;
    }
    if (expected !== after) throw new Error(`Non-formatter change found in ${filename}`);
  }
  console.log(`Verified ${entries.length} files: every change is exactly Prettier output from the parent commit.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
