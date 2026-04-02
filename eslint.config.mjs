// @ts-check
import eslint from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["eslint.config.mjs"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      // Enforce explicit return types on exported functions for public API clarity
      "@typescript-eslint/explicit-function-return-type": [
        "error",
        {
          allowExpressions: true,
          allowHigherOrderFunctions: true,
          allowTypedFunctionExpressions: true,
        },
      ],
      // Require explicit accessibility modifiers on class members
      "@typescript-eslint/explicit-member-accessibility": "error",
      // Enforce consistent type imports
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      // Enforce consistent type exports
      "@typescript-eslint/consistent-type-exports": [
        "error",
        { fixMixedExportsWithInlineTypeSpecifier: true },
      ],
      // Prevent unused variables (stricter than default)
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      // Require switch exhaustiveness checking
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      // Disallow non-null assertions in favor of proper narrowing
      "@typescript-eslint/no-non-null-assertion": "error",
      // Enforce naming conventions
      "@typescript-eslint/naming-convention": [
        "error",
        {
          selector: "typeLike",
          format: ["PascalCase"],
        },
        {
          selector: "enumMember",
          format: ["PascalCase"],
        },
      ],
      // Core ESLint rules
      eqeqeq: ["error", "always"],
      "no-console": "warn",
      curly: ["error", "all"],
      "no-eval": "error",
      "no-implied-eval": "off", // covered by @typescript-eslint/no-implied-eval
      "prefer-const": "error",
      "no-var": "error",
      "object-shorthand": "error",
      "prefer-template": "error",
    },
  },
  {
    files: ["tests/**/*.ts"],
    rules: {
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
      "no-console": "off",
    },
  },
  {
    files: ["examples/**/*.ts"],
    rules: {
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
      "no-console": "off",
    },
  },
  globalIgnores([
    "dist/",
    "node_modules/",
    "examples/generated-schema.ts",
    "tests/fixtures/pagila-schema.ts",
  ]),
);
