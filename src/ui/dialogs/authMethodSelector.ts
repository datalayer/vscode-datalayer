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
 * Shows the authentication method selection dialog.
 *
 * Presents user with three authentication options:
 * - Handle/Password credentials.
 * - GitHub OAuth.
 * - LinkedIn OAuth.
 *
 * @returns Selected authentication method, or undefined if cancelled.
 *
 */
export async function showAuthMethodPicker(): Promise<AuthMethod | undefined> {
  const items: AuthMethodQuickPickItem[] = [
    {
      label: "GitHub",
      description: vscode.l10n.t("OAuth authentication via GitHub"),
      detail: vscode.l10n.t("Opens browser for GitHub authentication"),
      method: "github",
    },
    // {
    //   label: "LinkedIn",
    //   description: vscode.l10n.t("OAuth authentication via LinkedIn"),
    //   detail: vscode.l10n.t("Opens browser for LinkedIn authentication"),
    //   method: "linkedin",
    // },
    {
      label: vscode.l10n.t("Handle / Password"),
      description: vscode.l10n.t("Login with handle and password"),
      detail: vscode.l10n.t("Use your Datalayer credentials"),
      method: "email-password",
    },
  ];

  const selected = await vscode.window.showQuickPick(items, {
    title: vscode.l10n.t("Datalayer Authentication"),
    placeHolder: vscode.l10n.t("Select authentication method"),
    ignoreFocusOut: true,
  });

  return selected?.method;
}
