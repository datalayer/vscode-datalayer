/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Common authentication dialog utilities for consistent user experience
 * across native VS Code notebooks and Datalayer notebooks.
 *
 * @module utils/authDialog
 */

import * as vscode from "vscode";

/**
 * Shows a non-intrusive authentication notification with login option.
 * Uses a bottom-right notification instead of blocking modal dialog.
 * This ensures a better user experience that doesn't interrupt workflow.
 *
 * @param source - Optional source description (e.g., "Datalayer Platform", "Runtime Selection")
 * @returns Promise that resolves to true if user clicked Login, false otherwise
 *
 * @example
 * ```typescript
 * const shouldLogin = await showAuthenticationDialog("Datalayer Platform");
 * if (shouldLogin) {
 *   await vscode.commands.executeCommand("datalayer.login");
 * }
 * ```
 */
export async function showAuthenticationDialog(
  source?: string
): Promise<boolean> {
  const message = source
    ? `Connect to Datalayer to use ${source.toLowerCase()}`
    : "Connect to Datalayer to use cloud runtimes";

  const action = await vscode.window.showInformationMessage(
    message,
    "Login",
    "Cancel"
  );

  return action === "Login";
}

/**
 * Shows authentication dialog and executes login command if user accepts.
 * This is a convenience function that combines the dialog with the login action.
 *
 * @param source - Optional source description
 * @returns Promise that resolves to true if login was initiated, false if cancelled
 *
 * @example
 * ```typescript
 * const loginInitiated = await promptAndLogin("Runtime Selection");
 * if (!loginInitiated) {
 *   // User cancelled, handle accordingly
 *   return;
 * }
 * // Continue with authenticated flow
 * ```
 */
export async function promptAndLogin(source?: string): Promise<boolean> {
  const shouldLogin = await showAuthenticationDialog(source);

  if (shouldLogin) {
    // Execute the login command
    await vscode.commands.executeCommand("datalayer.login");
    return true;
  }

  return false;
}

/**
 * Shows a simpler error message for authentication requirements.
 * Use this for contexts where a full modal dialog would be disruptive.
 *
 * @param context - Optional context description
 */
export function showAuthenticationError(context?: string): void {
  const message = context
    ? `Please login to Datalayer first (${context})`
    : "Please login to Datalayer first";

  vscode.window.showErrorMessage(message);
}
