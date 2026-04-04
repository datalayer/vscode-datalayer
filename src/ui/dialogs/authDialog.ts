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
 * @param source - Optional source description (e.g., "Datalayer Platform", "Runtime Selection").
 *
 * @returns Promise that resolves to true if user clicked Login, false otherwise.
 *
 */
export async function showAuthenticationDialog(
  source?: string,
): Promise<boolean> {
  const message = source
    ? vscode.l10n.t("Connect to Datalayer to use {0}", source)
    : vscode.l10n.t("Connect to Datalayer to use cloud runtimes");

  const loginLabel = vscode.l10n.t("Login");
  const action = await vscode.window.showInformationMessage(
    message,
    loginLabel,
    vscode.l10n.t("Cancel"),
  );

  return action === loginLabel;
}

/**
 * Shows authentication dialog and executes login command if user accepts.
 * This is a convenience function that combines the dialog with the login action.
 *
 * @param source - Optional source description.
 *
 * @returns Promise that resolves to true if login was initiated, false if cancelled.
 *
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
 * @param context - Optional context description for the error message.
 */
export function showAuthenticationError(context?: string): void {
  const message = context
    ? vscode.l10n.t("Please login to Datalayer first ({0})", context)
    : vscode.l10n.t("Please login to Datalayer first");

  vscode.window.showErrorMessage(message);
}
