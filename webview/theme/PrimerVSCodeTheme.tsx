/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import React, { type ReactNode } from "react";
import { ThemeProvider } from "@primer/react";

export interface PrimerVSCodeThemeProps {
  colorMode: "light" | "dark";
  children: ReactNode;
}

export function PrimerVSCodeTheme({
  colorMode,
  children,
}: PrimerVSCodeThemeProps) {
  console.log("PrimerVSCodeTheme rendering with colorMode:", colorMode);
  console.log(
    "Using Primer's default theme with CSS variable overrides in HTML",
  );

  // Just use Primer's default theme - CSS variables in HTML will override
  return <ThemeProvider colorMode={colorMode}>{children}</ThemeProvider>;
}
