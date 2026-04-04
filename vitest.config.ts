/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { defineConfig } from "vitest/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  oxc: {
    tsconfig: {
      configFile: "./tsconfig.base.json",
    },
  },
  test: {
    environment: "jsdom",
    include: ["webview/test/**/*.test.ts", "webview/test/**/*.test.tsx"],
    globals: true,
    coverage: {
      provider: "v8",
      include: ["webview/**/*.ts", "webview/**/*.tsx"],
      exclude: [
        "webview/**/*.test.ts",
        "webview/**/*.test.tsx",
        "webview/**/main.ts",
        "webview/**/*.d.ts",
      ],
      reporter: ["text-summary", "html", "lcov"],
      reportsDirectory: "./coverage-webview",
    },
  },
  resolve: {
    alias: {
      vscode: resolve(__dirname, "webview/test/__mocks__/vscode.ts"),
    },
  },
});
