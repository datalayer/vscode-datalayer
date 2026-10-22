/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * The extension's theme around a view that holds Jupyter components (the
 * notebook, the document): Datalayer's `vscode` theme, then jupyter-react's
 * own provider, which those components need for their context and for
 * JupyterLab's stylesheets.
 *
 * jupyter-react loads Primer's primitive color sheets, so its own box would
 * wear Primer's blues over the theme; the theme's variables are laid on that
 * box inline, where nothing beats them. That is the one thing the theme in
 * primer addons cannot do by itself: primer addons knows no jupyter-react.
 * Everything else — the colors, the JupyterLab variables, CodeMirror's
 * selection, Excalidraw's palette — is the theme's.
 *
 * @module theme/DatalayerVSCodeTheme
 */

// React stays in scope: the webviews compile JSX with the classic runtime.
import React, { type ReactNode } from "react";
import { JupyterReactTheme } from "@datalayer/jupyter-react";
import { vscodeTheme, vscodeThemeStyles } from "@datalayer/primer-addons";
import { PrimerVSCodeTheme } from "./PrimerVSCodeTheme";

/** What {@link DatalayerVSCodeTheme} is given. */
export interface DatalayerVSCodeThemeProps {
  /** The editor's color mode, followed by the theme. */
  colorMode: "light" | "dark";
  /** Whether jupyter-react loads JupyterLab's stylesheets (a notebook needs them). */
  loadJupyterLabCss?: boolean;
  /** What the theme wraps. */
  children: ReactNode;
}

// JupyterReactTheme forwards unknown props (`style`) to its BaseStyles; its
// typings do not list `style`, so the type is widened here.
const StyledJupyterReactTheme = JupyterReactTheme as unknown as React.FC<
  React.PropsWithChildren<{
    colormode?: "light" | "dark";
    loadJupyterLabCss?: boolean;
    style?: React.CSSProperties;
    theme?: Record<string, unknown>;
  }>
>;

/** Datalayer's `vscode` theme, with jupyter-react's provider inside it. */
export function DatalayerVSCodeTheme({
  colorMode,
  loadJupyterLabCss = true,
  children,
}: DatalayerVSCodeThemeProps) {
  return (
    <PrimerVSCodeTheme colorMode={colorMode}>
      <StyledJupyterReactTheme
        colormode={colorMode}
        loadJupyterLabCss={loadJupyterLabCss}
        theme={vscodeTheme}
        style={vscodeThemeStyles[colorMode] as React.CSSProperties}
      >
        {children}
      </StyledJupyterReactTheme>
    </PrimerVSCodeTheme>
  );
}
