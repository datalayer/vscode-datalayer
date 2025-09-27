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
import type { DatalayerSDK, User } from "../../../core/lib/index.js";

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
 *   console.log('Auth state changed:', state.isAuthenticated);
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
      console.log("[SDK Auth] Successfully initialized with existing token");
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
      console.log("[SDK Auth] No valid authentication found");
    }
  }

  /**
   * Prompts user for token and authenticates with the platform.
   * Updates authentication state based on the result.
   */
  async login(): Promise<void> {
    console.log("[SDK Auth] Login command triggered");

    const token = await this.promptForToken();
    if (!token) {
      console.log("[SDK Auth] No token provided, cancelling login");
      return;
    }

    try {
      // Debug: Check what methods are available on the SDK
      console.log(
        "[SDK Auth] Available SDK methods:",
        Object.getOwnPropertyNames(this.sdk)
      );
      console.log(
        "[SDK Auth] SDK prototype methods:",
        Object.getOwnPropertyNames(Object.getPrototypeOf(this.sdk))
      );
      console.log(
        "[SDK Auth] Has whoami method:",
        typeof (this.sdk as any).whoami
      );
      console.log(
        "[SDK Auth] Has updateToken method:",
        typeof (this.sdk as any).updateToken
      );

      // Try to see if methods are on the instance directly
      console.log("[SDK Auth] SDK instance type:", this.sdk.constructor.name);
      console.log(
        "[SDK Auth] SDK has property 'whoami':",
        "whoami" in this.sdk
      );

      // Update SDK with new token
      console.log("[SDK Auth] Updating SDK token");
      await (this.sdk as any).updateToken(token);

      // Verify the token by getting user info
      console.log("[SDK Auth] Calling whoami to verify token");
      const user = await (this.sdk as any).whoami();
      console.log("[SDK Auth] User received:", user);

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

      console.log("[SDK Auth] Login completed successfully");
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

      console.error("[SDK Auth] Login failed:", error);
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
      console.log("[SDK Auth] Logout completed successfully");
    } catch (error) {
      console.error("[SDK Auth] Logout failed:", error);
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
