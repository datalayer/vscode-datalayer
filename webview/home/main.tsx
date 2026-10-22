/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Entry point for the Datalayer home page webview (`datalayer.home`): the
 * initial color mode read from VS Code's body classes, then the page.
 *
 * @module webview/home/main
 */

import React from "react";
import { createRoot } from "react-dom/client";
import { HomePage } from "./HomePage";

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

function render() {
  root.render(<HomePage colorMode={currentTheme} />);
}

// Theme changes from the extension; the page's data is HomePage's own.
window.addEventListener("message", (event) => {
  const message = event.data;
  if (message?.type === "theme-changed" && message.theme !== currentTheme) {
    currentTheme = message.theme;
    render();
  }
});

render();
