/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Entry point for a snapshot's details page
 * (`datalayer.snapshots.viewDetails`): the initial color mode read from VS
 * Code's body classes, then the page.
 *
 * @module webview/snapshot/main
 */

import React from "react";
import { createRoot } from "react-dom/client";
import { SnapshotPage } from "./SnapshotPage";

// Get initial theme from VS Code
const getInitialTheme = (): "light" | "dark" => {
  const isDark =
    document.body.classList.contains("vscode-dark") ||
    document.body.classList.contains("vscode-high-contrast");
  return isDark ? "dark" : "light";
};

let currentTheme: "light" | "dark" = getInitialTheme();

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root container not found");
}
const root = createRoot(container);

/** Renders the page in the current color mode. */
function render(): void {
  root.render(<SnapshotPage colorMode={currentTheme} />);
}

// Theme changes from the extension; the snapshot is SnapshotPage's own.
window.addEventListener("message", (event) => {
  const message = event.data;
  if (message?.type === "theme-changed" && message.theme !== currentTheme) {
    currentTheme = message.theme;
    render();
  }
});

render();
