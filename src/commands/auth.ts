/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Authentication commands for the Datalayer VS Code extension.
 * Handles login, logout, and authentication status display.
 *
 * @see https://code.visualstudio.com/api/extension-guides/command
 * @module commands/auth
 *
 * @remarks
 * This module registers the following commands:
 * - `datalayer.login` - Authenticates user with Datalayer platform
 * - `datalayer.logout` - Clears authentication and signs out
 * - `datalayer.showAuthStatus` - Displays current authentication status
 */

import * as vscode from "vscode";
import { SDKAuthProvider } from "../services/core/authProvider";

/**
 * Registers all authentication-related commands.
 *
 * @param context - The extension context for managing command subscriptions
 * @param authProvider - The authentication provider instance for handling auth operations
 * @param updateAuthState - Callback to update authentication state in UI components (status bar, tree view)
 *
 */
export function registerAuthCommands(
  context: vscode.ExtensionContext,
  authProvider: SDKAuthProvider,
  updateAuthState: () => void,
): void {
  /**
   * Command: datalayer.login
   * Prompts user for credentials and authenticates with Datalayer platform.
   * Updates all UI components on successful login.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand("datalayer.login", async () => {
      try {
        await authProvider.login();
        updateAuthState();
      } catch (error) {}
    }),
  );

  /**
   * Command: datalayer.logout
   * Clears stored authentication tokens and signs out user.
   * Resets all UI components to unauthenticated state.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand("datalayer.logout", async () => {
      try {
        await authProvider.logout();
        updateAuthState();
      } catch (error) {}
    }),
  );

  /**
   * Command: datalayer.showAuthStatus
   * Displays current authentication status in an information message.
   * Shows user email and environment details when authenticated.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand("datalayer.showAuthStatus", async () => {
      await authProvider.showAuthStatus();
    }),
  );

  /**
   * Command: datalayer.help
   * Shows help and feedback menu with links to documentation, issues, and discussions.
   * Provides quick access to platform resources regardless of authentication state.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand("datalayer.help", async () => {
      await authProvider.showAuthStatus();
    }),
  );
}
