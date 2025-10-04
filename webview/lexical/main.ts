/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * @module lexical/main
 * Entry point for the lexical webview application.
 * Handles WASM configuration and global setup before React initialization.
 */

import { initializeRequireJSStub } from "../utils/requirejsStub";
import "./LexicalWebview";

// Configure webpack public path for WASM loading (loro-crdt)
declare let __webpack_public_path__: string;
declare global {
  interface Window {
    __webpack_public_path__?: string;
  }
}

if (
  typeof __webpack_public_path__ !== "undefined" &&
  !window.__webpack_public_path__
) {
  const baseUri = document.querySelector("base")?.getAttribute("href");
  if (baseUri) {
    __webpack_public_path__ = baseUri;
    window.__webpack_public_path__ = baseUri;
  }
}

// Initialize RequireJS stub for ClassicWidgetManager
initializeRequireJSStub();
