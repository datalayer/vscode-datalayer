/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Status bar management for the Datalayer VS Code extension.
 * Shows connection status and provides quick access to login/logout.
 *
 * @module services/statusBar
 *
 * @see {@link https://code.visualstudio.com/api/ux-guidelines/status-bar | VS Code Status Bar UX Guidelines}.
 * @see {@link https://code.visualstudio.com/api/references/vscode-api#StatusBarItem | VS Code StatusBarItem API}.
 */

import * as vscode from "vscode";

import type { DatalayerAuthProvider } from "../core/authProvider";

/** What the status bar item shows, and what a click on it runs. */
export interface StatusBarLook {
  text: string;
  tooltip: string;
  command: string;
}

/**
 * What the status bar item shows: signed in, *Datalayer* with the account
 * in its tooltip, opening the account's menu; signed out, *Sign In with
 * Datalayer*, running the sign-in. Neutral colours either way (VS Code only
 * offers warning and error backgrounds).
 *
 * @param state - The sign-in's state.
 * @param state.isAuthenticated - Whether someone is signed in.
 * @param state.user - The signed-in user, or null.
 *
 * @returns The item's text, tooltip and command.
 */
export function statusBarLookOf(state: {
  isAuthenticated: boolean;
  user: { displayName?: string; email?: string } | null;
}): StatusBarLook {
  if (state.isAuthenticated && state.user) {
    return {
      text: "$(datalayer-logo) Datalayer",
      tooltip: `Connected as ${state.user.displayName || state.user.email}`,
      command: "datalayer.showAuthStatus",
    };
  }
  return {
    text: "$(sign-in) Sign In with Datalayer",
    tooltip: "Sign in to Datalayer",
    command: "datalayer.login",
  };
}

/**
 * Manages the Datalayer status bar item.
 *
 * This class provides a singleton status bar item that displays the current
 * Authentication state and allows quick access to login/logout functionality.
 * The status bar automatically updates when the authentication state changes.
 *
 * @see {@link DatalayerAuthProvider} - for authentication management.
 */
export class DatalayerStatusBar implements vscode.Disposable {
  /**
   * Singleton instance of the status bar manager.
   * @internal
   */
  private static instance: DatalayerStatusBar;

  /**
   * VS Code status bar item that displays authentication state.
   *
   * @see {@link https://code.visualstudio.com/api/references/vscode-api#StatusBarItem | StatusBarItem API Reference}.
   *
   * @internal
   */
  private statusBarItem: vscode.StatusBarItem;

  /**
   * Authentication provider for managing login state.
   * @internal
   */
  private authProvider: DatalayerAuthProvider;

  /**
   * Private constructor for singleton pattern.
   *
   * Creates a new status bar item and sets up event listeners for
   * Authentication state changes. The status bar item is positioned
   * On the right side of the status bar with priority 100.
   *
   * @param authProvider - The authentication provider to monitor.
   *
   * @internal
   */
  private constructor(authProvider: DatalayerAuthProvider) {
    this.authProvider = authProvider;

    // Create status bar item with right alignment and high priority
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100,
    );

    this.updateStatus();
    this.statusBarItem.show();

    // Listen for auth state changes and update accordingly
    this.authProvider.onAuthStateChanged(() => {
      this.updateStatus();
    });
  }

  /**
   * Get or create the singleton instance of the status bar.
   *
   * This method implements the singleton pattern to ensure only one
   * Status bar item is created for the extension. The authProvider
   * Parameter is required only on first call.
   *
   * @param authProvider - The authentication provider (required on first call).
   *
   * @returns The singleton instance of DatalayerStatusBar.
   *
   * @throws Error if authProvider is not provided on first call.
   *
   */
  static getInstance(authProvider?: DatalayerAuthProvider): DatalayerStatusBar {
    if (!DatalayerStatusBar.instance) {
      if (!authProvider) {
        throw new Error(
          "AuthProvider is required when creating DatalayerStatusBar for the first time",
        );
      }
      DatalayerStatusBar.instance = new DatalayerStatusBar(authProvider);
    }
    return DatalayerStatusBar.instance;
  }

  /**
   * Update the status bar item based on authentication state.
   *
   * This method reads the current authentication state and updates
   * The status bar appearance accordingly:
   * - When authenticated: Shows "Datalayer" with user info in tooltip
   * - When not authenticated: Shows "Sign In with Datalayer", running the sign-in
   *
   * The status bar item's command and visual style are also updated
   * To reflect the current state.
   *
   * @internal
   */
  private updateStatus(): void {
    const look = statusBarLookOf(this.authProvider.getAuthState());
    this.statusBarItem.text = look.text;
    this.statusBarItem.tooltip = look.tooltip;
    this.statusBarItem.command = look.command;
    // Neutral colours, signed in or not.
    this.statusBarItem.color = undefined;
    this.statusBarItem.backgroundColor = undefined;
  }

  /**
   * Dispose of the status bar item.
   *
   * Cleans up the VS Code status bar item resource. This method should
   * Be called when the extension is deactivated to properly release
   * The status bar resources.
   *
   */
  dispose(): void {
    this.statusBarItem.dispose();
  }
}
