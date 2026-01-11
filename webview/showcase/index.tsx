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
  root.render(<PrimerShowcase colorMode={currentTheme} />);
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
