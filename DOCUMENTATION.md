# Documentation Guide

## Overview

This project enforces strict documentation at multiple levels: JSDoc via ESLint, TypeDoc for API docs, and spell checking. Code documentation lives with the code, as TSDoc in the source files: there are no per-directory README files. All checks run in CI and pre-commit hooks.

## Commands

```bash
# Generate HTML documentation (0 warnings required)
npm run docs

# Validate documentation coverage
npm run docs:coverage

# TypeDoc validation
npm run docs:check

# Generate Markdown documentation
npm run docs:markdown

# Watch mode for development
npm run docs:watch

# Spell check source files
npm run check:spelling
```

## JSDoc Requirements

All enforced at `error` level via `eslint-plugin-jsdoc`. See `eslint.config.mjs` for full config.

### What Must Be Documented

- Exported functions, classes, methods, interfaces, and type aliases
- Every function parameter (`@param`)
- Every non-void return value (`@returns`)
- Every `throw` statement (`@throws`)

### Required Format

```typescript
/**
 * Connects the webview document to a remote Datalayer runtime kernel.
 *
 * @param uri - The document URI identifying which webview to target.
 * @param runtime - The runtime configuration with ingress URL and auth token.
 * @returns The kernel connection ID for tracking.
 * @throws When no webview is registered for the given URI.
 */
export function connectWebviewDocument(
  uri: string,
  runtime: RuntimeDTO,
): string {
```

### Rules

- Descriptions start with uppercase, end with period
- `@param` uses hyphen separator: `@param name - Description.`
- No `{type}` annotations (TypeScript handles types)
- Don't restate the name: `@param uri - The URI.` is rejected
- Tags ordered: `@param` -> `@returns` -> `@throws` -> `@see`/`@since`
- No `@example` tags (internal extension, not public API)
- No empty `/** */` blocks
- Constructor `@param` for private params exempt (TypeDoc conflict)

### Exemptions

Test files (`*.test.ts`, `test/**`) are exempt from: `require-jsdoc`, `require-param`, `require-returns`, `require-throws`, `informative-docs`, `match-description`.

## TypeDoc Configuration

Settings in `typedoc.json`:

- `treatWarningsAsErrors: true` - Warnings fail the build
- `notDocumented: true` - Undocumented exports flagged
- `invalidLink: true` - Broken `{@link}` references flagged
- `excludePrivate: true` - Private members excluded
- `requiredToBeDocumented`: Class, Function, Enum, Interface, TypeAlias, Variable, Method

### Supported Tags

Use only these tags (others will cause warnings):

- `@param`, `@returns`, `@throws` - Function documentation
- `@see`, `@since`, `@deprecated` - Cross-references and versioning
- `@module` - Module-level documentation
- `@internal` - Exclude from documentation
- `@remarks` - Additional implementation details

Do NOT use: `@class`, `@static`, `@async`, `@extends`, `@constructor`, `@export`, `@description`, `@typedef` - TypeDoc infers these from TypeScript.

## Module Documentation

Each source file under `src/` and `webview/` opens, after its license header, with a TSDoc comment that ends with `@module <path>`: what the file is for, how it fits with its neighbors, and what is not obvious from the code. It must be the first `/** */` comment of the file. A design note about one class or function goes on that class or function. Keep this documentation in the source, next to what it describes, never in a separate Markdown file.

```typescript
/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Kernel bridge service that routes kernel connections to appropriate handlers.
 *
 * A document is connected to a remote runtime, a local ZMQ kernel or Pyodide;
 * the webview is told `kernel-starting`, then `kernel-selected`.
 *
 * @module services/kernelBridge
 */
```

## Spell Checking

Uses `cspell` with a domain-specific dictionary in `cspell.json`. Run `npm run check:spelling` to check. Add new domain words to the `words` array in `cspell.json`.

## CI Integration

The GitHub Actions Code Quality workflow runs on every PR:

1. Format check (Prettier)
2. Lint (ESLint with 17+ JSDoc rules)
3. Type check (TypeScript strict mode)
4. TypeDoc generation and validation (0 warnings)
5. Spell check (cspell)

## API Documentation

- **Generated docs**: `docs/` directory (git-ignored)
- **Live site**: [vscode.netlify.app](https://vscode.netlify.app) (auto-deployed)
