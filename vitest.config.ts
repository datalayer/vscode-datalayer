/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Two vitest projects (VSCODE VS-14):
 *
 * - `webview`: `webview/test/**` under jsdom, `vscode` aliased to the stub —
 *   the webview's components and the pure modules it imports.
 * - `pure`: `src/test/vitest/**` under node — the extension's pure modules
 *   (`src/chat/*.ts`, `src/services/localRuntime/*.ts`: no `vscode`, no
 *   React), one file at a time on a shared machine
 *   (`npx vitest run src/test/vitest/<name>.test.ts`).
 *
 * The extension-host suite (`src/test/**` under mocha, `.vscode-test.mjs`)
 * is CI's: its compile runs out of memory on a developer's machine.
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
    globals: true,
    // One worker: the suites are small, and the machine is shared.
    maxWorkers: 1,
    coverage: {
      provider: "v8",
      include: [
        "webview/**/*.ts",
        "webview/**/*.tsx",
        "src/chat/*.ts",
        "src/services/localRuntime/*.ts",
      ],
      exclude: [
        "webview/**/*.test.ts",
        "webview/**/*.test.tsx",
        "webview/**/main.ts",
        "webview/**/*.d.ts",
        "src/chat/chatContextProvider.ts",
        "src/chat/datalayerChatParticipant.ts",
      ],
      reporter: ["text-summary", "html", "lcov"],
      reportsDirectory: "./coverage-webview",
    },
    projects: [
      {
        extends: true,
        test: {
          name: "webview",
          environment: "jsdom",
          include: ["webview/test/**/*.test.ts", "webview/test/**/*.test.tsx"],
        },
        resolve: {
          alias: {
            vscode: resolve(__dirname, "webview/test/__mocks__/vscode.ts"),
          },
        },
      },
      {
        extends: true,
        test: {
          name: "pure",
          environment: "node",
          include: ["src/test/vitest/**/*.test.ts"],
        },
      },
    ],
  },
});
