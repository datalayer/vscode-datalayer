# Documentation Guide

## Overview

This project enforces strict documentation at multiple levels: JSDoc via ESLint, TypeDoc for API docs, README.md per directory, and spell checking. All checks run in CI and pre-commit hooks.

## Commands

```bash
# Generate HTML documentation (0 warnings required)
npm run docs

# Validate documentation coverage
npm run docs:coverage

# Check README.md exists in every directory
npm run docs:check-readmes

# Combined check (READMEs + TypeDoc validation)
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

## README.md per Directory

Every directory under `src/`, `webview/`, and `scripts/` must have a `README.md` documenting:

- What the directory contains and its purpose
- Every file with a description of exports, patterns, and key details
- Subdirectories with brief descriptions

Enforced by `scripts/check-readmes.sh` and included in `npm run check`. Currently 69 directories covered.

## Spell Checking

Uses `cspell` with a domain-specific dictionary in `cspell.json`. Run `npm run check:spelling` to check. Add new domain words to the `words` array in `cspell.json`.

## CI Integration

The GitHub Actions Code Quality workflow runs on every PR:

1. Format check (Prettier)
2. Lint (ESLint with 17+ JSDoc rules)
3. Type check (TypeScript strict mode)
4. README check (every directory)
5. TypeDoc generation and validation (0 warnings)
6. Spell check (cspell)

## API Documentation

- **Generated docs**: `docs/` directory (git-ignored)
- **Live site**: [vscode-datalayer.netlify.app](https://vscode-datalayer.netlify.app) (auto-deployed)
