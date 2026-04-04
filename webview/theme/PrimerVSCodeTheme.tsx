/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

// Keep unused React import for JSX.
import React, { type ReactNode } from "react";
import { ThemeProvider } from "@primer/react";

/** Props for the PrimerVSCodeTheme component. */
export interface PrimerVSCodeThemeProps {
  colorMode: "light" | "dark";
  children: ReactNode;
}

/** Wraps children with Primer ThemeProvider configured for VS Code color modes. */
export function PrimerVSCodeTheme({
  colorMode,
  children,
}: PrimerVSCodeThemeProps) {
  // Just use Primer's default theme - CSS variables in HTML will override
  return <ThemeProvider colorMode={colorMode}>{children}</ThemeProvider>;
}
