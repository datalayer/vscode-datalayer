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
  files: [
    'out/src/test/extension.preload.test.js',
    'out/src/test/services/**/*.test.js',
    'out/src/test/utils-tests/**/*.test.js',
    'out/src/test/utils/**/*.test.js',
    'out/src/test/models/**/*.test.js',
    'out/src/test/providers/**/*.test.js',
    'out/src/test/tools/**/*.test.js',
    'out/src/test/kernel/**/*.test.js',
  ],
  version: '1.107.0',
  workspaceFolder: './src/test/fixtures',
  mocha: {
    ui: 'tdd',
    timeout: 20000,
    color: true,
    require: [resolve(__dirname, 'src/test/setup.js')],
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
      // Kernel clients require webpack-bundled assets (.py files, WASM)
      'out/src/kernel/**',
      // Webview-related code runs in browser context
      'out/src/services/pyodide/**',
      // Command handlers register commands and show UI dialogs
      'out/src/commands/**',
      // HTML template generators (string concatenation, no testable logic)
      'out/src/ui/templates/**',
      // Jupyter server provider needs a real Jupyter server
      'out/src/jupyter/**',
      // Custom editor providers need real webviews
      'out/src/providers/notebookProvider.js',
      'out/src/providers/lexicalProvider.js',
    ],
    thresholds: {
      statements: 40,
      branches: 85,
      functions: 33,
      lines: 40,
    },
  },
});
