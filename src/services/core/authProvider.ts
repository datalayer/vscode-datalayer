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
  AuthMethod,
} from "../interfaces/IAuthProvider";
import { BaseService } from "./baseService";
import { OAuthFlowManager } from "./oauthFlowManager";
import { showAuthMethodPicker } from "../../ui/dialogs/authMethodSelector";
import { promptForCredentials } from "../../ui/dialogs/credentialsInput";

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

  private oauthFlowManager: OAuthFlowManager;

  constructor(
    private sdk: DatalayerClient,
    private context: vscode.ExtensionContext,
    logger: ILogger,
  ) {
    super("SDKAuthProvider", logger);
    this.oauthFlowManager = new OAuthFlowManager(context, logger);
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
   * Tries to restore session from SDK storage (OS keyring).
   * Falls back to migrating from old VS Code secrets if found.
   */
  protected async onInitialize(): Promise<void> {
    // Initialize OAuth flow manager
    await this.oauthFlowManager.initialize();

    // Try SDK session restoration first
    try {
      this.logger.debug("Attempting SDK session restoration from keyring");
      const result = await this.logger.timeAsync(
        "sdk_session_restore",
        () => this.sdk.auth.login({}), // Empty options = use StorageAuthStrategy
        { operation: "restore_session" },
      );

      if (result && result.user) {
        // CRITICAL: Also set token in base SDK class for API calls
        // sdk.auth.login() stores in auth.currentToken but not in this.token
        await this.sdk.setToken(result.token);

        this._authState = {
          isAuthenticated: true,
          user: result.user,
          error: null,
        };

        this.logger.info("Session restored from SDK storage", {
          userId: result.user.uid,
          displayName: result.user.displayName,
        });

        this._onAuthStateChanged.fire(this._authState);
        return;
      }
    } catch (error) {
      this.logger.debug("No valid session in SDK storage", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }

    // No SDK session - check for old VS Code secret (migration)
    const oldToken = await this.context.secrets.get("datalayer.token");
    if (oldToken) {
      this.logger.info("Found old VS Code secret - migrating to SDK storage");
      try {
        const result = await this.logger.timeAsync(
          "sdk_token_migration",
          () => this.sdk.auth.login({ token: oldToken }),
          { operation: "migrate_token" },
        );

        // CRITICAL: Also set token in base SDK class for API calls
        await this.sdk.setToken(result.token);

        // Migration successful - delete old secret
        await this.context.secrets.delete("datalayer.token");
        this.logger.info("Token migrated successfully, old secret deleted");

        this._authState = {
          isAuthenticated: true,
          user: result.user,
          error: null,
        };

        this._onAuthStateChanged.fire(this._authState);
        return;
      } catch (error) {
        this.logger.warn("Token migration failed - invalid token", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
        // Delete invalid old secret
        await this.context.secrets.delete("datalayer.token");
      }
    }

    // No valid session or migration
    this.logger.debug("No authentication session found");
    this._authState = {
      isAuthenticated: false,
      user: null,
      error: null,
    };
    this._onAuthStateChanged.fire(this._authState);
  }

  /**
   * Implementation of BaseService lifecycle disposal.
   * Cleans up event emitters, OAuth manager, and auth state.
   */
  protected async onDispose(): Promise<void> {
    await this.oauthFlowManager.dispose();
    this._onAuthStateChanged.dispose();
    this._authState = {
      isAuthenticated: false,
      user: null,
      error: null,
    };
  }

  /**
   * Prompts user for authentication method and performs login.
   * @deprecated Use showLoginMethodPicker() followed by specific login methods
   */
  async login(): Promise<void> {
    this.logger.info("Starting login process with method picker");

    const method = await this.showLoginMethodPicker();
    if (!method) {
      this.logger.debug("Login cancelled by user");
      return;
    }

    try {
      switch (method) {
        case "email-password":
          await this.loginWithCredentials();
          break;
        case "github":
        case "linkedin":
          await this.loginWithOAuth(method);
          break;
      }
    } catch (error) {
      // Error already logged and shown in specific methods
      throw error;
    }
  }

  /**
   * Show login method selection dialog.
   * Presents user with choice of email/password or OAuth providers.
   */
  async showLoginMethodPicker(): Promise<AuthMethod | undefined> {
    this.logger.debug("Showing login method picker");
    return await showAuthMethodPicker();
  }

  /**
   * Login using email/password credentials.
   * Prompts for credentials and authenticates with platform.
   */
  async loginWithCredentials(): Promise<void> {
    this.logger.info("Starting email/password login");

    const creds = await promptForCredentials();
    if (!creds) {
      this.logger.debug("Credentials input cancelled by user");
      return;
    }

    this.logger.debug("Credentials provided, attempting authentication", {
      handle: creds.handle,
    });

    try {
      // SDK handles storage automatically
      const result = await this.logger.timeAsync(
        "sdk_credentials_login",
        () =>
          this.sdk.auth.login({
            handle: creds.handle,
            password: creds.password,
          }),
        { operation: "credentials_login" },
      );

      // CRITICAL: Also set token in base SDK class for API calls
      // sdk.auth.login() stores in auth.currentToken but not in this.token
      await this.sdk.setToken(result.token);

      this._authState = {
        isAuthenticated: true,
        user: result.user,
        error: null,
      };

      this.logger.info("Credentials login successful", {
        userId: result.user.uid,
        displayName: result.user.displayName,
      });

      this._onAuthStateChanged.fire(this._authState);

      await vscode.window.showInformationMessage(
        `Successfully logged in as ${result.user.displayName}`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown login error";

      this.logger.error("Credentials login failed", error as Error, {
        operation: "credentials_login",
        handle: creds.handle,
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
   * Login using OAuth provider.
   * Opens browser for OAuth flow and handles callback.
   */
  async loginWithOAuth(provider: "github" | "linkedin"): Promise<void> {
    this.logger.info("Starting OAuth login", {
      provider,
      extensionId: this.context.extension.id,
    });

    try {
      this.logger.debug("Calling oauthFlowManager.startOAuthFlow", {
        provider,
      });

      // Get token via OAuth flow
      const oauthResult = await this.oauthFlowManager.startOAuthFlow(provider);

      this.logger.info("OAuth flow completed successfully", {
        provider,
        tokenLength: oauthResult.token.length,
      });

      this.logger.debug("OAuth flow completed, authenticating with SDK", {
        provider,
        tokenLength: oauthResult.token.length,
      });

      // SDK handles token storage automatically via keytar (OS keyring)
      // TokenAuthStrategy validates token AND persists it to storage
      this.logger.debug("Authenticating with OAuth token", {
        tokenLength: oauthResult.token.length,
      });

      const result = await this.logger.timeAsync(
        "sdk_oauth_login",
        () => this.sdk.auth.login({ token: oauthResult.token }),
        { operation: "oauth_login", provider },
      );

      // CRITICAL: Also set token in base SDK class for API calls
      // sdk.auth.login() stores in auth.currentToken but not in this.token
      await this.sdk.setToken(result.token);

      this._authState = {
        isAuthenticated: true,
        user: result.user,
        error: null,
      };

      this.logger.info("OAuth login successful", {
        provider,
        userId: result.user.uid,
        displayName: result.user.displayName,
      });

      // Verify token is stored and retrievable
      const storedToken = this.sdk.getToken();
      const isAuthenticated = this.sdk.auth.isAuthenticated();
      this.logger.info("Verifying authentication state after login", {
        hasStoredToken: !!storedToken,
        storedTokenLength: storedToken ? storedToken.length : 0,
        isAuthenticated,
        sdkAuthState: this.sdk.auth.isAuthenticated(),
      });

      this._onAuthStateChanged.fire(this._authState);
      this.logger.info("Auth state change event fired", {
        isAuthenticated: this._authState.isAuthenticated,
        userId: this._authState.user?.uid,
      });

      await vscode.window.showInformationMessage(
        `Successfully logged in with ${provider} as ${result.user.displayName}`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown OAuth error";

      this.logger.error("OAuth login failed", error as Error, {
        operation: "oauth_login",
        provider,
      });

      this._authState = {
        isAuthenticated: false,
        user: null,
        error: errorMessage,
      };

      this._onAuthStateChanged.fire(this._authState);
      await vscode.window.showErrorMessage(
        `${provider} login failed: ${errorMessage}`,
      );
      throw error;
    }
  }

  /**
   * Logout and clear authentication state.
   * SDK clears keyring storage automatically.
   */
  async logout(): Promise<void> {
    this.logger.info("Starting logout process", {
      wasAuthenticated: this._authState.isAuthenticated,
      userId: this._authState.user ? this._authState.user.uid : null,
    });

    try {
      // First call SDK IAM logout (requires base token to be set)
      await this.logger.timeAsync("sdk_logout", () => this.sdk.logout(), {
        operation: "clear_server_session",
      });

      // Then explicitly clear auth manager and keyring
      await this.logger.timeAsync(
        "sdk_auth_logout",
        () => this.sdk.auth.logout(),
        {
          operation: "clear_keyring",
        },
      );

      // Finally clear base SDK token
      await this.sdk.setToken("");

      this._authState = {
        isAuthenticated: false,
        user: null,
        error: null,
      };

      this.logger.info("Logout successful - SDK cleared keyring");
      this._onAuthStateChanged.fire(this._authState);
      await vscode.window.showInformationMessage("Successfully logged out");
    } catch (error) {
      // Even if API fails, SDK clears local storage
      this.logger.error("Logout error (local state cleared)", error as Error);

      // Force clear auth manager and keyring
      try {
        await this.sdk.auth.logout();
        await this.sdk.setToken("");
      } catch (clearError) {
        this.logger.error("Error clearing local storage", clearError as Error);
      }

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
   * Check if currently authenticated.
   * Delegates to SDK's authentication manager.
   */
  isAuthenticated(): boolean {
    return this.sdk.auth.isAuthenticated();
  }

  /**
   * Get current user (null if not authenticated).
   * Delegates to SDK's authentication manager.
   */
  getCurrentUser(): UserDTO | null {
    return this.sdk.auth.getCurrentUser() || null;
  }

  /**
   * Get authentication token from SDK.
   */
  getToken(): string {
    return this.sdk.getToken() || "";
  }
}
