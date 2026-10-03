import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    // The core must stay portable: browser, Node and CLI. No React, DOM-only or Node-only imports.
    files: ["src/core/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "node:*",
            "react",
            "react-dom",
            "next",
            "next/*",
            "fs",
            "path",
            "crypto",
            "@/components/*",
            "@/lib/*",
          ],
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "reports/**",
    "test-results/**",
    "playwright-report/**",
  ]),
]);

export default eslintConfig;
