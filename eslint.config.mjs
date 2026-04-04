/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import typescriptEslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import jsdoc from "eslint-plugin-jsdoc";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import header from "eslint-plugin-header";

// eslint-plugin-header requires this workaround for flat config
header.rules.header.meta.schema = false;

export default [
  {
    files: ["**/*.ts"],
  },
  {
    // Ignore JS files that can't be parsed with TypeScript parser
    ignores: [
      "**/*.worker.js",
      "commitlint.config.js",
      "webpack.config.js",
      "*.config.js",
      "*.config.mjs",
    ],
  },
  {
    plugins: {
      "@typescript-eslint": typescriptEslint,
      jsdoc,
      "simple-import-sort": simpleImportSort,
      header,
    },

    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: {
        project: ["./tsconfig.json", "./tsconfig.webview.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },

    rules: {
      // =============================================
      // TypeScript rules
      // =============================================

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

      // Catch unhandled async calls - silent failure prevention
      "@typescript-eslint/no-floating-promises": "error",

      // Stricter unused vars - catch dead code
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],

      // Force return types on exported functions - catches accidental any returns
      "@typescript-eslint/explicit-function-return-type": [
        "warn",
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: true,
          allowDirectConstAssertionInArrowFunctions: true,
          allowConciseArrowFunctionExpressionsStartingWithVoid: true,
          allowedNames: [],
        },
      ],

      // =============================================
      // General rules
      // =============================================

      curly: "warn",
      eqeqeq: "warn",
      "no-throw-literal": "warn",
      semi: "warn",

      // Ban console.log in production code - use the logger infrastructure
      "no-console": [
        "warn",
        {
          allow: ["warn", "error"],
        },
      ],

      // Complexity limits - flag overly complex functions
      complexity: ["warn", 20],
      "max-depth": ["warn", 5],

      // =============================================
      // Import sorting (auto-fixable)
      // =============================================

      "simple-import-sort/imports": "error",
      "simple-import-sort/exports": "error",

      // =============================================
      // License header enforcement
      // =============================================

      "header/header": [
        "error",
        "block",
        [
          "",
          " * Copyright (c) 2021-2025 Datalayer, Inc.",
          " *",
          " * MIT License",
          " ",
        ],
      ],

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

      // Require @param for every function parameter (constructors exempt - TypeDoc conflicts)
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

      "jsdoc/check-param-names": "error",
      "jsdoc/check-tag-names": "error",
      "jsdoc/no-types": "error",
      "jsdoc/no-blank-blocks": "error",
      "jsdoc/informative-docs": "error",

      // --- Formatting rules ---

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

      "jsdoc/require-hyphen-before-param-description": ["error", "always"],

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

      "jsdoc/require-example": "off",
    },
  },
  // Relax rules in test files
  {
    files: ["**/*.test.ts", "**/__tests__/**/*.ts", "**/test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/explicit-function-return-type": "off",
      "no-console": "off",
      "jsdoc/require-jsdoc": "off",
      "jsdoc/require-param": "off",
      "jsdoc/require-returns": "off",
      "jsdoc/require-throws": "off",
      "jsdoc/informative-docs": "off",
      "jsdoc/match-description": "off",
      "header/header": "off",
    },
  },
  // Relax rules in scripts (JS files, not TS)
  {
    files: ["scripts/**/*.js", "scripts/**/*.ts"],
    rules: {
      "no-console": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
      "header/header": "off",
    },
  },
  // Relax rules in declaration files
  {
    files: ["**/*.d.ts"],
    rules: {
      "header/header": "off",
    },
  },
  // Relax rules in webview worker files
  {
    files: ["**/*.worker.js"],
    rules: {
      "no-console": "off",
      "header/header": "off",
    },
  },
];
