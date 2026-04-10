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
export type AuthMethod = "email-password" | "github" | "google" | "linkedin";

/**
 * Quick pick item for authentication method selection
 */
interface AuthMethodQuickPickItem extends vscode.QuickPickItem {
  method: AuthMethod;
}

/**
 * Shows the authentication method selection dialog.
 *
 * Presents user with three authentication options (in display order):
 * - GitHub OAuth.
 * - Google OAuth.
 * - Handle/Password credentials.
 *
 * `AuthMethod` also includes `"linkedin"` for backwards compatibility,
 * but the LinkedIn OAuth option is currently disabled in the picker.
 *
 * @returns Selected authentication method, or undefined if cancelled.
 *
 */
export async function showAuthMethodPicker(): Promise<AuthMethod | undefined> {
  const items: AuthMethodQuickPickItem[] = [
    {
      label: "$(mark-github) Sign in with GitHub",
      description: "OAuth authentication via GitHub",
      detail: "Opens browser for GitHub authentication",
      method: "github",
    },
    {
      label: "$(google-logo) Sign in with Google",
      description: "OAuth authentication via Google",
      detail: "Opens browser for Google authentication",
      method: "google",
    },
    // {
    //   label: "$(link-external) Sign in with LinkedIn",
    //   description: "OAuth authentication via LinkedIn",
    //   detail: "Opens browser for LinkedIn authentication",
    //   method: "linkedin",
    // },
    {
      label: "$(key) Sign in with a password",
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
