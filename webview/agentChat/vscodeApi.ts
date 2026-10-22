/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * The webview's handle on VS Code, acquired once: VS Code hands it out a
 * single time per page, and both the entry (`index`) and the page (`main`)
 * need it.
 *
 * @module webview/agentChat/vscodeApi
 */

declare const acquireVsCodeApi: () => VsCodeApi;

/** What VS Code gives a webview. */
export interface VsCodeApi {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
}

export const vscode: VsCodeApi = acquireVsCodeApi();
