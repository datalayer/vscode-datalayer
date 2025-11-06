/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Entry point for Primer Showcase webview
 */

import React from "react";
import { createRoot } from "react-dom/client";
import { PrimerShowcase } from "./PrimerShowcase";

// Get initial theme from VS Code
const getInitialTheme = (): "light" | "dark" => {
  const isDark = document.body.classList.contains("vscode-dark") ||
    document.body.classList.contains("vscode-high-contrast");
  return isDark ? "dark" : "light";
};

let currentTheme: "light" | "dark" = getInitialTheme();

// Listen for theme changes from extension
window.addEventListener("message", (event) => {
  const message = event.data;
  if (message.type === "theme-changed") {
    currentTheme = message.theme;
    render();
  }
});

// Render function
function render() {
  const container = document.getElementById("root");
  if (!container) return;

  const root = createRoot(container);
  root.render(<PrimerShowcase colorMode={currentTheme} />);
}

// Initial render
render();
