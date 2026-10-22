/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * The extension's theme for Primer React: Datalayer's `vscode` theme
 * variant, whose every token reads the editor's own `--vscode-*` variable,
 * so a webview is drawn in the color theme the editor has and follows it
 * the moment the person picks another. The color mode is the editor's
 * (`theme-change`), passed down from the webview's root.
 *
 * It sits around every view built of Primer components (the Datalayer chat,
 * the home page, the datasource dialogs, the showcase); its portals (menus,
 * dialogs) are themed too. The theme itself lives in primer addons; nothing
 * is mapped here.
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

/** Wraps children in Datalayer's `vscode` theme, in the editor's color mode. */
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
