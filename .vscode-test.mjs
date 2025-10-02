/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'out/src/test/**/*.test.js',
  version: '1.98.0',
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
