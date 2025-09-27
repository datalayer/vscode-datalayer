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
 * @see {@link https://code.visualstudio.com/api/ux-guidelines/status-bar | VS Code Status Bar UX Guidelines}
 * @see {@link https://code.visualstudio.com/api/references/vscode-api#StatusBarItem | VS Code StatusBarItem API}
 */

import * as vscode from "vscode";
import { SDKAuthProvider } from "../services/authProvider";

/**
 * Manages the Datalayer status bar item.
 *
 * This class provides a singleton status bar item that displays the current
 * authentication state and allows quick access to login/logout functionality.
 * The status bar automatically updates when the authentication state changes.
 *
 * @example
 * ```typescript
 * // In extension activation
 * const authProvider = SDKAuthProvider.getInstance(sdk, context);
 * const statusBar = DatalayerStatusBar.getInstance(authProvider);
 *
 * // Status bar automatically updates when auth state changes
 * // No manual updates needed - handled via event listeners
 * ```
 *
 * @see {@link SDKAuthProvider} - for authentication management
 */
export class DatalayerStatusBar {
  /**
   * Singleton instance of the status bar manager.
   * @internal
   */
  private static instance: DatalayerStatusBar;

  /**
   * VS Code status bar item that displays authentication state.
   *
   * @internal
   * @see {@link https://code.visualstudio.com/api/references/vscode-api#StatusBarItem | StatusBarItem API Reference}
   */
  private statusBarItem: vscode.StatusBarItem;

  /**
   * Authentication provider for managing login state.
   * @internal
   */
  private authProvider: SDKAuthProvider;

  /**
   * Private constructor for singleton pattern.
   *
   * Creates a new status bar item and sets up event listeners for
   * authentication state changes. The status bar item is positioned
   * on the right side of the status bar with priority 100.
   *
   * @param authProvider - The authentication provider to monitor
   * @internal
   */
  private constructor(authProvider: SDKAuthProvider) {
    this.authProvider = authProvider;

    // Create status bar item with right alignment and high priority
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
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
   * status bar item is created for the extension. The authProvider
   * parameter is required only on first call.
   *
   * @param authProvider - The authentication provider (required on first call)
   * @returns The singleton instance of DatalayerStatusBar
   * @throws Error if authProvider is not provided on first call
   *
   * @example
   * ```typescript
   * // First call - authProvider required
   * const statusBar = DatalayerStatusBar.getInstance(authProvider);
   *
   * // Subsequent calls - authProvider optional
   * const sameStatusBar = DatalayerStatusBar.getInstance();
   * ```
   */
  static getInstance(authProvider?: SDKAuthProvider): DatalayerStatusBar {
    if (!DatalayerStatusBar.instance) {
      if (!authProvider) {
        throw new Error(
          "AuthProvider is required when creating DatalayerStatusBar for the first time"
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
   * the status bar appearance accordingly:
   * - When authenticated: Shows "Datalayer" with user info in tooltip
   * - When not authenticated: Shows "Datalayer: Not Connected" with warning colors
   *
   * The status bar item's command and visual style are also updated
   * to reflect the current state.
   *
   * @internal
   */
  private updateStatus(): void {
    const authState = this.authProvider.getAuthState();

    if (authState.isAuthenticated && authState.user) {
      const user = authState.user as any;
      const displayName = user.githubLogin
        ? `@${user.githubLogin}`
        : user.email;
      this.statusBarItem.text = `$(menu) Datalayer`;
      this.statusBarItem.tooltip = `Connected as ${displayName}`;
      this.statusBarItem.command = "datalayer.showAuthStatus";
      this.statusBarItem.color = undefined;
      this.statusBarItem.backgroundColor = undefined;
    } else {
      this.statusBarItem.text = "$(menu) Datalayer: Not Connected";
      this.statusBarItem.tooltip = "Click to login";
      this.statusBarItem.command = "datalayer.login";
      this.statusBarItem.color = new vscode.ThemeColor(
        "statusBarItem.warningForeground"
      );
      this.statusBarItem.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.warningBackground"
      );
    }
  }

  /**
   * Dispose of the status bar item.
   *
   * Cleans up the VS Code status bar item resource. This method should
   * be called when the extension is deactivated to properly release
   * the status bar resources.
   *
   * @example
   * ```typescript
   * // In extension deactivate function
   * export function deactivate() {
   *   const statusBar = DatalayerStatusBar.getInstance();
   *   statusBar.dispose();
   * }
   * ```
   */
  dispose(): void {
    this.statusBarItem.dispose();
  }
}
