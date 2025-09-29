/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * SDK-based authentication provider for VS Code.
 * Provides authentication state management and event notifications using the DatalayerSDK.
 *
 * @module services/authProvider
 */

import * as vscode from "vscode";
import type { DatalayerSDK } from "../../../core/lib/sdk/client";
import type { User } from "../../../core/lib/sdk/client/models/User";

/**
 * Authentication state for VS Code context.
 */
export interface VSCodeAuthState {
  isAuthenticated: boolean;
  user: User | null;
  error: string | null;
}

/**
 * SDK-based authentication provider for VS Code.
 * Manages authentication state and provides event notifications for state changes.
 *
 * @example
 * ```typescript
 * const authProvider = SDKAuthProvider.getInstance(sdk, context);
 * await authProvider.initialize();
 * authProvider.onAuthStateChanged.event((state) => {
 *   // Auth state changed
 * });
 * ```
 */
export class SDKAuthProvider {
  private static instance: SDKAuthProvider;
  private _authState: VSCodeAuthState = {
    isAuthenticated: false,
    user: null,
    error: null,
  };
  private _onAuthStateChanged = new vscode.EventEmitter<VSCodeAuthState>();
  readonly onAuthStateChanged = this._onAuthStateChanged.event;

  private constructor(
    private sdk: DatalayerSDK,
    private context: vscode.ExtensionContext
  ) {}

  /**
   * Gets or creates the singleton instance.
   *
   * @param sdk - DatalayerSDK instance (required for initial creation)
   * @param context - VS Code extension context (required for initial creation)
   * @returns The singleton SDKAuthProvider instance
   */
  static getInstance(
    sdk?: DatalayerSDK,
    context?: vscode.ExtensionContext
  ): SDKAuthProvider {
    if (!SDKAuthProvider.instance) {
      if (!sdk || !context) {
        throw new Error(
          "SDK and context are required to create initial SDKAuthProvider instance"
        );
      }
      SDKAuthProvider.instance = new SDKAuthProvider(sdk, context);
    }
    return SDKAuthProvider.instance;
  }

  /**
   * Gets current authentication state.
   *
   * @returns Copy of the current authentication state
   */
  getAuthState(): VSCodeAuthState {
    return { ...this._authState };
  }

  /**
   * Initializes authentication state from stored token.
   * Attempts to verify existing authentication with the platform.
   */
  async initialize(): Promise<void> {
    try {
      // Try to get the current user to verify authentication
      const user = await (this.sdk as any).whoami();
      this._authState = {
        isAuthenticated: true,
        user,
        error: null,
      };
      this._onAuthStateChanged.fire(this._authState);
    } catch (error) {
      this._authState = {
        isAuthenticated: false,
        user: null,
        error:
          error instanceof Error
            ? error.message
            : "Unknown authentication error",
      };
      this._onAuthStateChanged.fire(this._authState);
    }
  }

  /**
   * Prompts user for token and authenticates with the platform.
   * Updates authentication state based on the result.
   */
  async login(): Promise<void> {
    const token = await this.promptForToken();
    if (!token) {
      return;
    }

    try {
      // Update SDK with new token
      await (this.sdk as any).updateToken(token);

      // Verify the token by getting user info
      const user = await (this.sdk as any).whoami();

      this._authState = {
        isAuthenticated: true,
        user,
        error: null,
      };
      this._onAuthStateChanged.fire(this._authState);

      // Show success message
      const displayName = (user as any).getDisplayName();
      await vscode.window.showInformationMessage(
        `Successfully logged in as ${displayName}`
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown login error";
      this._authState = {
        isAuthenticated: false,
        user: null,
        error: errorMessage,
      };
      this._onAuthStateChanged.fire(this._authState);

      await vscode.window.showErrorMessage(`Login failed: ${errorMessage}`);

      throw error;
    }
  }

  /**
   * Logout and clear authentication state.
   */
  async logout(): Promise<void> {
    try {
      // Use SDK logout (this also clears the token)
      await (this.sdk as any).logout();

      this._authState = {
        isAuthenticated: false,
        user: null,
        error: null,
      };

      // Emit auth state change event to update UI
      this._onAuthStateChanged.fire(this._authState);

      await vscode.window.showInformationMessage("Successfully logged out");
    } catch (error) {
      // Even if logout fails, clear local state
      this._authState = {
        isAuthenticated: false,
        user: null,
        error: null,
      };

      // Emit auth state change event even on error to update UI
      this._onAuthStateChanged.fire(this._authState);
    }
  }

  /**
   * Shows authentication status with interactive options.
   * Displays different options based on current authentication state.
   */
  async showAuthStatus(): Promise<void> {
    const state = this.getAuthState();

    if (state.isAuthenticated && state.user) {
      const user = state.user;
      const items: string[] = ["Logout"];

      const displayName = (user as any).getDisplayName();
      const selected = await vscode.window.showQuickPick(items, {
        title: "Datalayer Authentication Status",
        placeHolder: `Connected as ${displayName}`,
      });

      if (selected === "Logout") {
        await this.logout();
      }
    } else {
      const selected = await vscode.window.showQuickPick(["Login", "Cancel"], {
        title: "Datalayer Authentication Status",
        placeHolder: "Not connected to Datalayer",
      });

      if (selected === "Login") {
        await this.login();
      }
    }
  }

  /**
   * Prompt user for their Datalayer access token.
   */
  private async promptForToken(): Promise<string | undefined> {
    const token = await vscode.window.showInputBox({
      title: "Datalayer Authentication",
      prompt: "Enter your Datalayer access token",
      placeHolder: "Paste your token here",
      password: true,
      ignoreFocusOut: true,
      validateInput: (value: string) => {
        if (!value || value.trim().length === 0) {
          return "Token cannot be empty";
        }
        return null;
      },
    });

    return token?.trim();
  }

  /**
   * Check if currently authenticated.
   */
  isAuthenticated(): boolean {
    return this._authState.isAuthenticated;
  }

  /**
   * Get current user (null if not authenticated).
   */
  getCurrentUser(): User | null {
    return this._authState.user;
  }

  /**
   * Get authentication token from SDK.
   */
  getToken(): string {
    return (this.sdk as any).getToken();
  }
}
