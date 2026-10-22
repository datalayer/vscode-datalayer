/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * The extension's theme for Primer React: Datalayer's `vscode` theme
 * variant, whose every token reads the editor's own `--vscode-*` variable,
 * so a webview is drawn in the colour theme the editor has and follows it
 * the moment the person picks another. The colour mode is the editor's
 * (`theme-change`), passed down from the webview's root.
 *
 * @module theme/PrimerVSCodeTheme
 */

// React stays in scope: the webviews compile JSX with the classic runtime.
import React, { type ReactNode } from "react";
import {
  DatalayerThemeProvider,
  vscodeTheme,
  vscodeThemeStyles,
} from "@datalayer/primer-addons";

/** Props for the PrimerVSCodeTheme component. */
export interface PrimerVSCodeThemeProps {
  colorMode: "light" | "dark";
  /**
   * Laid on the theme's own box. A view filling its parent by height passes
   * `{ height: "100%" }`, or `{ display: "contents" }` for no box at all.
   */
  style?: React.CSSProperties;
  children: ReactNode;
}

/** Wraps children in Datalayer's `vscode` theme, in the editor's colour mode. */
export function PrimerVSCodeTheme({
  colorMode,
  style,
  children,
}: PrimerVSCodeThemeProps) {
  return (
    <DatalayerThemeProvider
      colorMode={colorMode}
      theme={vscodeTheme}
      themeStyles={vscodeThemeStyles}
      baseStyles={style}
    >
      {children}
    </DatalayerThemeProvider>
  );
}
