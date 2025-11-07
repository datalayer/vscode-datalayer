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
import type { DatalayerClient } from "@datalayer/core/lib/client";
import type { UserDTO } from "@datalayer/core/lib/models/UserDTO";
import type { ILogger } from "../interfaces/ILogger";
import type {
  IAuthProvider,
  VSCodeAuthState,
} from "../interfaces/IAuthProvider";
import { BaseService } from "./baseService";
import {
  VSCodeAuthStorage,
  KeyringAuthStorage,
  MultiAuthStorage,
} from "./authStorage";

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

  private static readonly TOKEN_SECRET_KEY = "datalayer.token";
  private multiStorage: MultiAuthStorage;

  constructor(
    private sdk: DatalayerClient,
    private context: vscode.ExtensionContext,
    logger: ILogger,
  ) {
    super("SDKAuthProvider", logger);

    // Create multi-storage with VS Code SecretStorage as primary and keyring as fallback
    const vscodeStorage = new VSCodeAuthStorage(context.secrets);
    const keyringStorage = new KeyringAuthStorage();
    this.multiStorage = new MultiAuthStorage(vscodeStorage, keyringStorage);

    this.logger.debug("SDKAuthProvider instance created", {
      contextId: context.extension.id,
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
   * Uses multi-storage to discover tokens from VS Code SecretStorage or system keyring.
   */
  protected async onInitialize(): Promise<void> {
    // Load token from multi-storage (VS Code SecretStorage -> keyring -> env vars)
    const storedToken = await this.multiStorage.getToken(
      this.sdk.getIamRunUrl(),
    );

    if (!storedToken) {
      this.logger.debug(
        "No stored authentication token found in any storage location",
      );
      this._authState = {
        isAuthenticated: false,
        user: null,
        error: null,
      };
      this._onAuthStateChanged.fire(this._authState);
      return;
    }

    // Set token in SDK from multi-storage
    this.logger.debug("Loading token from multi-storage");
    await this.sdk.setToken(storedToken);

    try {
      const user = await this.logger.timeAsync(
        "whoami_verification",
        () => this.sdk.whoami(),
        { operation: "verify_stored_token" },
      );

      this._authState = {
        isAuthenticated: true,
        user: user as UserDTO,
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
   * Prompts user to select a login method and authenticates with the platform.
   * Displays a quick pick menu to choose between browser OAuth or API token.
   */
  async login(): Promise<void> {
    const method = await vscode.window.showQuickPick(
      [
        {
          label: "$(globe) Login with Browser",
          description: "OAuth via GitHub (recommended)",
          value: "browser" as const,
        },
        {
          label: "$(key) Login with API Token",
          description: "Manual token entry",
          value: "token" as const,
        },
      ],
      {
        placeHolder: "Select a login method",
        title: "Datalayer Authentication",
      },
    );

    if (!method) {
      this.logger.debug("Login cancelled - no method selected");
      return;
    }

    switch (method.value) {
      case "browser":
        await this.loginBrowser();
        break;
      case "token":
        await this.loginToken();
        break;
    }
  }

  /**
   * Login with browser OAuth flow using SDK's localhost server.
   * Uses the cross-platform browser OAuth implementation from the SDK.
   */
  async loginBrowser(): Promise<void> {
    this.logger.info("Starting browser OAuth login");

    try {
      // Use SDK's browser OAuth
      const user = await this.logger.timeAsync(
        "sdk_login_browser",
        () => this.sdk.loginBrowser(),
        { operation: "browser_login" },
      );

      // Get the token from SDK (it was set by loginBrowser)
      const token = this.sdk.getToken();

      if (!token) {
        throw new Error("SDK login successful but token not set");
      }

      // Store token in multi-storage
      await this.multiStorage.setToken(this.sdk.getIamRunUrl(), token);
      this.logger.debug("Token stored in multi-storage");

      this._authState = {
        isAuthenticated: true,
        user: user as UserDTO,
        error: null,
      };

      this.logger.info("Browser OAuth login successful", {
        userId: user.uid,
        displayName: user.displayName,
      });

      this._onAuthStateChanged.fire(this._authState);

      await vscode.window.showInformationMessage(
        `Successfully logged in as ${user.displayName}`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown login error";

      this.logger.error("Browser OAuth login failed", error as Error, {
        operation: "browser_login",
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
   * Login with API token.
   * Prompts for token and validates with the platform.
   */
  async loginToken(): Promise<void> {
    this.logger.info("Starting token login");

    const token = await this.promptForToken();
    if (!token) {
      this.logger.debug("Token login cancelled by user");
      return;
    }

    this.logger.debug("Token provided, attempting authentication", {
      tokenLength: token.length,
      tokenType: token.startsWith("eyJ") ? "JWT" : "Bearer",
    });

    try {
      // Use SDK loginToken method
      const user = await this.logger.timeAsync(
        "sdk_login_token",
        () => this.sdk.loginToken(token),
        { operation: "token_login" },
      );

      // Persist token to multi-storage AFTER successful verification
      await this.multiStorage.setToken(this.sdk.getIamRunUrl(), token);
      this.logger.debug("Token stored in multi-storage");

      this._authState = {
        isAuthenticated: true,
        user: user as UserDTO,
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
      // Call server logout
      await this.logger.timeAsync("sdk_logout", () => this.sdk.logout(), {
        operation: "clear_server_session",
      });

      // Delete token from multi-storage
      await this.multiStorage.deleteToken(this.sdk.getIamRunUrl());
      this.logger.debug("Token deleted from multi-storage");

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

      // Even if logout fails, clear local state and secret storage
      await this.context.secrets.delete(SDKAuthProvider.TOKEN_SECRET_KEY);
      this.logger.debug(
        "Token deleted from secret storage despite server error",
      );

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
   * Includes help and feedback links for users.
   */
  async showAuthStatus(): Promise<void> {
    const state = this.getAuthState();

    if (state.isAuthenticated && state.user) {
      const user = state.user;
      const items: vscode.QuickPickItem[] = [
        { label: "$(sign-out) Logout" },
        { label: "", kind: vscode.QuickPickItemKind.Separator },
        { label: "$(home) Visit Datalayer Platform" },
        { label: "$(book) View Documentation" },
        { label: "$(github) Report Issue" },
      ];

      const displayName = user.displayName;
      const selected = await vscode.window.showQuickPick(items, {
        title: "Datalayer - Help & Feedback",
        placeHolder: `Connected as ${displayName}`,
      });

      if (!selected) {
        return;
      }

      if (selected.label === "$(sign-out) Logout") {
        await this.logout();
      } else if (selected.label === "$(home) Visit Datalayer Platform") {
        await vscode.env.openExternal(vscode.Uri.parse("https://datalayer.io"));
      } else if (selected.label === "$(book) View Documentation") {
        await vscode.env.openExternal(
          vscode.Uri.parse("https://docs.datalayer.io"),
        );
      } else if (selected.label === "$(github) Report Issue") {
        await vscode.env.openExternal(
          vscode.Uri.parse(
            "https://github.com/datalayer/vscode-datalayer/issues/new",
          ),
        );
      }
    } else {
      const items: vscode.QuickPickItem[] = [
        { label: "$(sign-in) Login" },
        { label: "", kind: vscode.QuickPickItemKind.Separator },
        { label: "$(home) Visit Datalayer Platform" },
        { label: "$(book) View Documentation" },
        { label: "$(github) Report Issue" },
      ];

      const selected = await vscode.window.showQuickPick(items, {
        title: "Datalayer - Help & Feedback",
        placeHolder: "Not connected to Datalayer",
      });

      if (!selected) {
        return;
      }

      if (selected.label === "$(sign-in) Login") {
        await this.login();
      } else if (selected.label === "$(home) Visit Datalayer Platform") {
        await vscode.env.openExternal(vscode.Uri.parse("https://datalayer.io"));
      } else if (selected.label === "$(book) View Documentation") {
        await vscode.env.openExternal(
          vscode.Uri.parse("https://docs.datalayer.io"),
        );
      } else if (selected.label === "$(github) Report Issue") {
        await vscode.env.openExternal(
          vscode.Uri.parse(
            "https://github.com/datalayer/vscode-datalayer/issues/new",
          ),
        );
      }
    }
  }

  /**
   * Prompt user for their Datalayer API Key.
   */
  private async promptForToken(): Promise<string | undefined> {
    const token = await vscode.window.showInputBox({
      title: "Datalayer Authentication",
      prompt: "Enter your Datalayer API Key",
      placeHolder: "Paste your API Key here",
      password: true,
      ignoreFocusOut: true,
      validateInput: (value: string) => {
        if (!value || value.trim().length === 0) {
          return "API Key cannot be empty";
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
  getCurrentUser(): UserDTO | null {
    return this._authState.user;
  }

  /**
   * Get authentication token from SDK.
   */
  getToken(): string {
    return this.sdk.getToken() || "";
  }
}
