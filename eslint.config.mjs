import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["node_modules/**", "dist/**", "coverage/**", "frontend/**", ".setup-backups/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: globals.node },
    rules: {
      // Retain existing debugging and unused parameters during this behavior-neutral phase.
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
      // Express Request augmentation is intentionally an ambient namespace.
      "@typescript-eslint/no-namespace": ["error", { allowDeclarations: true }],
    },
  },
  {
    files: ["**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    files: ["tests/**/*.cjs"],
    // Preserve the existing test diagnostics instead of changing thrown error shapes in Phase 0.
    rules: { "preserve-caught-error": "off" },
  },
);
