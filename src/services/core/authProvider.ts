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
import type { DatalayerClient } from "../../../../core/lib/client";
import type { User } from "../../../../core/lib/client/models/User";
import type { ILogger } from "../interfaces/ILogger";
import type {
  IAuthProvider,
  VSCodeAuthState,
} from "../interfaces/IAuthProvider";
import { BaseService } from "./baseService";

/**
 * SDK-based authentication provider for VS Code.
 * Manages authentication state and provides event notifications for state changes.
 *
 * @example
 * ```typescript
 * const authProvider = new SDKAuthProvider(sdk, context, logger);
 * await authProvider.initialize();
 * authProvider.onAuthStateChanged((state) => {
 *   // Auth state changed
 * });
 * ```
 */
export class SDKAuthProvider extends BaseService implements IAuthProvider {
  private _authState: VSCodeAuthState = {
    isAuthenticated: false,
    user: null,
    error: null,
  };
  private _onAuthStateChanged = new vscode.EventEmitter<VSCodeAuthState>();
  readonly onAuthStateChanged = this._onAuthStateChanged.event;

  constructor(
    private sdk: DatalayerClient,
    // @ts-expect-error - Reserved for future authentication features
    private _context: vscode.ExtensionContext,
    logger: ILogger,
  ) {
    super("SDKAuthProvider", logger);
    this.logger.debug("SDKAuthProvider instance created", {
      contextId: _context.extension.id,
      hasSDK: !!sdk,
    });
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
   * Implementation of BaseService lifecycle initialization.
   * Verifies existing authentication with the platform.
   */
  protected async onInitialize(): Promise<void> {
    // Check if token exists before attempting verification
    const hasToken = !!this.sdk.getToken();

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
        () => this.sdk.whoami(),
        { operation: "verify_stored_token" },
      );

      this._authState = {
        isAuthenticated: true,
        user: user as User,
        error: null,
      };

      this.logger.info("Authentication verified", {
        userId: user.uid,
        displayName: user.displayName,
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
   * Implementation of BaseService lifecycle disposal.
   * Cleans up event emitters and auth state.
   */
  protected async onDispose(): Promise<void> {
    this._onAuthStateChanged.dispose();
    this._authState = {
      isAuthenticated: false,
      user: null,
      error: null,
    };
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
      await this.logger.timeAsync("sdk_login", () => this.sdk.setToken(token), {
        operation: "set_token",
      });

      const user = await this.logger.timeAsync(
        "user_verification",
        () => this.sdk.whoami(),
        { operation: "verify_new_token" },
      );

      this._authState = {
        isAuthenticated: true,
        user: user as User,
        error: null,
      };

      this.logger.info("Login successful", {
        userId: user.uid,
        displayName: user.displayName,
        userEmail: user.email || "not_available",
      });

      this._onAuthStateChanged.fire(this._authState);

      const displayName = user.displayName;
      await vscode.window.showInformationMessage(
        `Successfully logged in as ${displayName}`,
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
      userId: this._authState.user ? this._authState.user.uid : null,
    });

    try {
      await this.logger.timeAsync("sdk_logout", () => this.sdk.logout(), {
        operation: "clear_server_session",
      });

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
        },
      );

      // Even if logout fails, clear local state
      this._authState = {
        isAuthenticated: false,
        user: null,
        error: null,
      };

      this.logger.info(
        "Local authentication state cleared despite server error",
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

      const displayName = user.displayName;
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
    return this.sdk.getToken() || "";
  }
}
