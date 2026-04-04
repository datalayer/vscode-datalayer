/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Stub module for the vscode API in webview test environment.
 * Used as a Vitest resolve alias so tests work cross-platform.
 */
export const Uri = {
  parse: (value: string): { toString: () => string } => ({
    toString: () => value,
  }),
};
