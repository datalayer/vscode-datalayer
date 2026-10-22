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
  /** Posts a message to the extension host. */
  postMessage: (message: unknown) => void;
  /** The state the page kept, across its hiding and showing. */
  getState: () => unknown;
  /** Keeps the page's state, across its hiding and showing. */
  setState: (state: unknown) => void;
}

/** The page's one handle on VS Code. */
export const vscode: VsCodeApi = acquireVsCodeApi();
