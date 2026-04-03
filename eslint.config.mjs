/*
 * Copyright (c) 2021-2023 Datalayer, Inc.
 *
 * MIT License
 */

import typescriptEslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import jsdoc from "eslint-plugin-jsdoc";

export default [
  {
    files: ["**/*.ts"],
  },
  {
    plugins: {
      "@typescript-eslint": typescriptEslint,
      jsdoc,
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
      "@typescript-eslint/no-explicit-any": [
        "error",
        {
          fixToUnknown: true,
          ignoreRestArgs: false,
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

      // =============================================
      // JSDoc enforcement (strict)
      // =============================================

      // --- Structure rules ---

      // Require JSDoc on exported functions, classes, methods, interfaces, and type aliases
      "jsdoc/require-jsdoc": [
        "error",
        {
          require: {
            FunctionDeclaration: true,
            ClassDeclaration: true,
            MethodDefinition: true,
          },
          contexts: [
            "ExportNamedDeclaration > FunctionDeclaration",
            "ExportNamedDeclaration > ClassDeclaration",
            "ExportDefaultDeclaration > FunctionDeclaration",
            "ExportNamedDeclaration > TSInterfaceDeclaration",
            "ExportNamedDeclaration > TSTypeAliasDeclaration",
          ],
          checkConstructors: false,
        },
      ],

      // Require a text description in every JSDoc block
      "jsdoc/require-description": [
        "error",
        {
          contexts: [
            "ExportNamedDeclaration > FunctionDeclaration",
            "ExportNamedDeclaration > ClassDeclaration",
            "ExportNamedDeclaration > TSInterfaceDeclaration",
            "ExportNamedDeclaration > TSTypeAliasDeclaration",
          ],
        },
      ],

      // Require @param for every function parameter (constructors exempt - TypeDoc conflicts with private/destructured params)
      "jsdoc/require-param": [
        "error",
        {
          checkConstructors: false,
        },
      ],

      // Require description text on every @param tag
      "jsdoc/require-param-description": "error",

      // Require @returns for non-void functions
      "jsdoc/require-returns": [
        "error",
        {
          checkGetters: false,
        },
      ],

      // Require description text on every @returns tag
      "jsdoc/require-returns-description": "error",

      // Require @throws for functions that throw
      "jsdoc/require-throws": "error",

      // --- Validation rules ---

      // Ensure @param names match actual parameter names
      "jsdoc/check-param-names": "error",

      // Reject invalid/unknown JSDoc tags
      "jsdoc/check-tag-names": "error",

      // Disallow {type} annotations in JSDoc - TypeScript handles types
      "jsdoc/no-types": "error",

      // Reject empty /** */ blocks (leftover from auto-fix)
      "jsdoc/no-blank-blocks": "error",

      // Reject descriptions that just restate the name
      // e.g., "@param name - The name" or "/** Gets value. */ getValue()"
      "jsdoc/informative-docs": "error",

      // --- Formatting rules ---

      // Enforce consistent tag order: @param -> @returns -> @throws -> @example
      "jsdoc/sort-tags": [
        "error",
        {
          tagSequence: [
            { tags: ["module", "@"] },
            { tags: ["param"] },
            { tags: ["returns"] },
            { tags: ["throws"] },
            { tags: ["example"] },
            { tags: ["see", "link"] },
            { tags: ["since", "deprecated"] },
          ],
        },
      ],

      // Enforce @param name - Description (with hyphen separator)
      "jsdoc/require-hyphen-before-param-description": ["error", "always"],

      // Enforce descriptions start with uppercase, end with period
      "jsdoc/match-description": [
        "error",
        {
          matchDescription: "^[A-Z`@][\\s\\S]*\\.\\s*$",
          tags: {
            param: {
              match: "^[A-Z`@][\\s\\S]*\\.\\s*$",
              message:
                "Parameter description must start with uppercase and end with period.",
            },
            returns: {
              match: "^[A-Z`@][\\s\\S]*\\.\\s*$",
              message:
                "Return description must start with uppercase and end with period.",
            },
            throws: {
              match: "^[A-Z`@][\\s\\S]*\\.\\s*$",
              message:
                "Throws description must start with uppercase and end with period.",
            },
          },
        },
      ],

      // @example tags not enforced - internal extension, not a public library API
      "jsdoc/require-example": "off",
    },
  },
  // Relax rules in test files
  {
    files: ["**/*.test.ts", "**/__tests__/**/*.ts", "**/test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "jsdoc/require-jsdoc": "off",
      "jsdoc/require-param": "off",
      "jsdoc/require-returns": "off",
      "jsdoc/require-throws": "off",
      "jsdoc/informative-docs": "off",
      "jsdoc/match-description": "off",
    },
  },
];
