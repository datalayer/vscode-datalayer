/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import * as l10n from "@vscode/l10n";
import React, { Component, type ErrorInfo, type ReactNode } from "react";

/** Props for the ErrorBoundary component. */
export interface ErrorBoundaryProps {
  /** Child components to render inside the boundary. */
  children: ReactNode;
  /** Name of the editor context for error messages. */
  editorName: string;
}

/** Internal state for the ErrorBoundary. */
export interface ErrorBoundaryState {
  /** Whether an error has been caught. */
  hasError: boolean;
  /** The caught error, if any. */
  error: Error | null;
}

/**
 * React error boundary that catches rendering errors in webview editors
 * and displays a recovery UI instead of crashing the entire panel.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  /**
   * Derives error state from a caught error.
   *
   * @param error - The error thrown during rendering.
   * @returns Updated state with the error captured.
   */
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  /** Initial state with no error. */
  override state: ErrorBoundaryState = { hasError: false, error: null };

  /**
   * Logs error details when a child component throws.
   *
   * @param error - The error that was thrown.
   * @param errorInfo - React component stack trace information.
   */
  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error(
      `[${this.props.editorName}] Rendering error:`,
      error,
      errorInfo.componentStack,
    );
  }

  /**
   * Renders children normally, or a fallback UI if an error was caught.
   *
   * @returns The children or an error recovery panel.
   */
  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: "20px",
            fontFamily: "var(--vscode-font-family, sans-serif)",
            color: "var(--vscode-errorForeground, #f44)",
            backgroundColor: "var(--vscode-editor-background, #1e1e1e)",
            height: "100%",
          }}
        >
          <h2>
            {l10n.t("Something went wrong in the {0}.", this.props.editorName)}
          </h2>
          <p style={{ color: "var(--vscode-foreground, #ccc)" }}>
            {this.state.error?.message}
          </p>
          <button
            onClick={(): void =>
              this.setState({ hasError: false, error: null })
            }
            style={{
              padding: "8px 16px",
              cursor: "pointer",
              backgroundColor: "var(--vscode-button-background, #0e639c)",
              color: "var(--vscode-button-foreground, #fff)",
              border: "none",
              borderRadius: "2px",
            }}
          >
            {l10n.t("Try Again")}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
