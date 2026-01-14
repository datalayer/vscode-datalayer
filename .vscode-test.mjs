/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import { defineConfig } from '@vscode/test-cli';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  // Skip activation tests - blocked by @datalayer/core dependency issue
  // Run only tests that don't import the SDK
  files: [
    'out/src/test/extension.preload.test.js',
    'out/src/test/services/**/*.test.js',
    'out/src/test/utils-tests/**/*.test.js',
  ],
  version: '1.107.0',
  workspaceFolder: './src/test/fixtures',
  mocha: {
    ui: 'tdd',
    timeout: 20000,
    color: true,
  },
  launchArgs: [
    '--disable-extensions',
    '--disable-workspace-trust',
  ],
  coverage: {
    reporter: ['text-summary', 'html', 'lcov'],
    output: './coverage',
    includeAll: true,
    include: ['out/src/**/*.js'],
    exclude: [
      'out/src/test/**',
      'out/webview/**',
      '**/node_modules/**',
    ],
  },
});
