/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Authentication method selection dialog.
 * Provides quick pick interface for choosing between handle/password and OAuth methods.
 *
 * @module ui/dialogs/authMethodSelector
 */

import * as vscode from "vscode";

/**
 * Available authentication methods
 */
export type AuthMethod = "email-password" | "github" | "linkedin";

/**
 * Quick pick item for authentication method selection
 */
interface AuthMethodQuickPickItem extends vscode.QuickPickItem {
  method: AuthMethod;
}

/**
 * Show authentication method selection dialog.
 *
 * Presents user with three authentication options:
 * - Handle/Password credentials
 * - GitHub OAuth
 * - LinkedIn OAuth
 *
 * @returns Selected authentication method, or undefined if cancelled
 *
 * @example
 * ```typescript
 * const method = await showAuthMethodPicker();
 * if (method === 'email-password') {
 *   // Handle credentials login
 * } else if (method) {
 *   // Handle OAuth login
 * }
 * ```
 */
export async function showAuthMethodPicker(): Promise<AuthMethod | undefined> {
  const items: AuthMethodQuickPickItem[] = [
    {
      label: "GitHub",
      description: "OAuth authentication via GitHub",
      detail: "Opens browser for GitHub authorization",
      method: "github",
    },
    {
      label: "LinkedIn",
      description: "OAuth authentication via LinkedIn",
      detail: "Opens browser for LinkedIn authorization",
      method: "linkedin",
    },
    {
      label: "Handle / Password",
      description: "Login with handle and password",
      detail: "Use your Datalayer credentials",
      method: "email-password",
    },
  ];

  const selected = await vscode.window.showQuickPick(items, {
    title: "Datalayer Authentication",
    placeHolder: "Select authentication method",
    ignoreFocusOut: true,
  });

  return selected?.method;
}
