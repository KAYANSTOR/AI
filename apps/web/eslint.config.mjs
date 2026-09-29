import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // An underscore prefix marks a deliberately unused binding (for example a test
      // double that accepts a parameter it does not need).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: [
      "src/app/api/copilot/route.ts",
      "src/app/dashboard/copilot/page.tsx",
    ],
    rules: {
      // Legacy Copilot surface intentionally stays unchecked until its SDK types are migrated.
      "@typescript-eslint/ban-ts-comment": "off",
    },
  },
]);

export default eslintConfig;
