/*
 * Copyright (c) 2021-2023 Datalayer, Inc.
 *
 * MIT License
 */

import typescriptEslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    files: ["**/*.ts"],
  },
  {
    plugins: {
      "@typescript-eslint": typescriptEslint,
    },

    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: "module",
    },

    rules: {
      "@typescript-eslint/naming-convention": [
        "warn",
        {
          selector: "import",
          format: ["camelCase", "PascalCase"],
        },
      ],

      // Forbid explicit 'any' type - enforce type safety everywhere
      // This catches both ': any' type annotations and 'as any' type assertions
      "@typescript-eslint/no-explicit-any": [
        "error",
        {
          fixToUnknown: true, // Suggest 'unknown' instead of 'any'
          ignoreRestArgs: false, // Apply to rest parameters too
        },
      ],

      // Enforce consistent type assertion style (prefer 'as' over angle brackets)
      "@typescript-eslint/consistent-type-assertions": [
        "error",
        {
          assertionStyle: "as",
          objectLiteralTypeAssertions: "allow-as-parameter",
        },
      ],

      curly: "warn",
      eqeqeq: "warn",
      "no-throw-literal": "warn",
      semi: "warn",
    },
  },
  // Allow 'any' in test files where mocking may require flexibility
  {
    files: ["**/*.test.ts", "**/__tests__/**/*.ts", "**/test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn", // Downgrade to warning for tests
    },
  },
];
