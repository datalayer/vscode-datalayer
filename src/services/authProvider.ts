/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * SDK-based authentication provider for VS Code.
 * Provides authentication state management and event notifications using the DatalayerClient.
 *
 * @module services/authProvider
 */

import * as vscode from "vscode";
import type { DatalayerClient } from "../../../core/lib/client";
import type { User } from "../../../core/lib/client/models/User";
import { ServiceLoggers } from "./loggers";

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
  private get logger() {
    return ServiceLoggers.auth;
  }
  private _authState: VSCodeAuthState = {
    isAuthenticated: false,
    user: null,
    error: null,
  };
  private _onAuthStateChanged = new vscode.EventEmitter<VSCodeAuthState>();
  readonly onAuthStateChanged = this._onAuthStateChanged.event;

  private constructor(
    private sdk: DatalayerClient,
    private context: vscode.ExtensionContext
  ) {
    this.logger.debug("SDKAuthProvider instance created", {
      contextId: context.extension.id,
      hasSDK: !!sdk,
    });
  }

  /**
   * Gets or creates the singleton instance.
   *
   * @param sdk - DatalayerClient instance (required for initial creation)
   * @param context - VS Code extension context (required for initial creation)
   * @returns The singleton SDKAuthProvider instance
   */
  static getInstance(
    sdk?: DatalayerClient,
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
    this.logger.info("Initializing authentication state");

    // Check if token exists before attempting verification
    const hasToken = !!(this.sdk as any).getToken();

    if (!hasToken) {
      this.logger.debug("No stored authentication token found");
      this._authState = {
        isAuthenticated: false,
        user: null,
        error: null,
      };
      this._onAuthStateChanged.fire(this._authState);
      return;
    }

    try {
      const user = await this.logger.timeAsync(
        "whoami_verification",
        () => (this.sdk as any).whoami(),
        { operation: "verify_stored_token" }
      );

      this._authState = {
        isAuthenticated: true,
        user: user as User,
        error: null,
      };

      this.logger.info("Authentication verified", {
        userId: (user as any).uid,
        displayName: (user as any).getDisplayName(),
        hasToken: true,
      });

      this._onAuthStateChanged.fire(this._authState);
    } catch (error) {
      this.logger.warn("Authentication verification failed", {
        error: error instanceof Error ? error.message : "Unknown error",
        hasStoredToken: true,
      });

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
    this.logger.info("Starting login process");

    const token = await this.promptForToken();
    if (!token) {
      this.logger.debug("Login cancelled by user");
      return;
    }

    this.logger.debug("Token provided, attempting authentication", {
      tokenLength: token.length,
      tokenType: token.startsWith("eyJ") ? "JWT" : "Bearer",
    });

    try {
      await this.logger.timeAsync(
        "sdk_login",
        () => (this.sdk as any).updateToken(token),
        { operation: "update_token" }
      );

      const user = await this.logger.timeAsync(
        "user_verification",
        () => (this.sdk as any).whoami(),
        { operation: "verify_new_token" }
      );

      this._authState = {
        isAuthenticated: true,
        user: user as User,
        error: null,
      };

      this.logger.info("Login successful", {
        userId: (user as any).uid,
        displayName: (user as any).getDisplayName(),
        userEmail: (user as any).email || "not_available",
      });

      this._onAuthStateChanged.fire(this._authState);

      const displayName = (user as any).getDisplayName();
      await vscode.window.showInformationMessage(
        `Successfully logged in as ${displayName}`
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown login error";

      this.logger.error("Login failed", error as Error, {
        operation: "login_process",
        tokenLength: token.length,
      });

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
    this.logger.info("Starting logout process", {
      wasAuthenticated: this._authState.isAuthenticated,
      userId: this._authState.user ? (this._authState.user as any).uid : null,
    });

    try {
      await this.logger.timeAsync(
        "sdk_logout",
        () => (this.sdk as any).logout(),
        { operation: "clear_server_session" }
      );

      this._authState = {
        isAuthenticated: false,
        user: null,
        error: null,
      };

      this.logger.info("Logout successful - server session cleared");
      this._onAuthStateChanged.fire(this._authState);
      await vscode.window.showInformationMessage("Successfully logged out");
    } catch (error) {
      this.logger.error(
        "Logout error (proceeding with local cleanup)",
        error as Error,
        {
          operation: "logout_process",
        }
      );

      // Even if logout fails, clear local state
      this._authState = {
        isAuthenticated: false,
        user: null,
        error: null,
      };

      this.logger.info(
        "Local authentication state cleared despite server error"
      );
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
