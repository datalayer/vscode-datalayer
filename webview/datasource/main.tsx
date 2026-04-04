/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Entry point for Datasource Dialog webview
 */

import * as l10n from "@vscode/l10n";
import React from "react";
import { createRoot } from "react-dom/client";

import { DatasourceDialog } from "./DatasourceDialog";

// Initialize l10n with the bundle injected by the extension host.
// The bundle is an empty object when running with the default English locale.
declare const window: Window & { __l10nBundle__?: Record<string, string> };
l10n.config({ contents: window.__l10nBundle__ ?? {} });

// Get initial theme from VS Code
const getInitialTheme = (): "light" | "dark" => {
  const isDark =
    document.body.classList.contains("vscode-dark") ||
    document.body.classList.contains("vscode-high-contrast");
  return isDark ? "dark" : "light";
};

let currentTheme: "light" | "dark" = getInitialTheme();

// Create root once
const container = document.getElementById("root");
if (!container) {
  throw new Error("Root container not found");
}
const root = createRoot(container);

// Render function
function render() {
  root.render(<DatasourceDialog colorMode={currentTheme} />);
}

// Listen for theme changes from extension
window.addEventListener("message", (event) => {
  const message = event.data;
  if (message.type === "theme-changed") {
    currentTheme = message.theme;
    render();
  }
});

// Initial render
render();
