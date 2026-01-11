/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * OAuth flow manager adapted for VS Code environment.
 * Handles OAuth authentication flows by opening system browser and handling callbacks via URI handler.
 *
 * @module services/oauthFlowManager
 */

import * as vscode from "vscode";
import * as crypto from "crypto";
import type { ILogger } from "../interfaces/ILogger";
import { BaseService } from "./baseService";

/**
 * OAuth provider type supported by the platform
 */
export type OAuthProvider = "github" | "linkedin";

/**
 * Result of a successful OAuth flow
 */
export interface OAuthResult {
  /** JWT token received from OAuth callback */
  token: string;
  /** OAuth provider that authenticated the user */
  provider: OAuthProvider;
}

/**
 * Internal representation of a pending OAuth flow
 */
interface OAuthPendingFlow {
  /** OAuth provider for this flow */
  provider: OAuthProvider;
  /** Promise resolver for successful authentication */
  resolve: (result: OAuthResult) => void;
  /** Promise rejector for failed authentication */
  reject: (error: Error) => void;
  /** Timestamp when flow was initiated (for timeout) */
  timestamp: number;
}

/**
 * OAuth authorization response with possible field name variations
 * (handles server API inconsistencies)
 */
interface OAuthAuthzResponse {
  loginURL?: string;
  autorization_url?: string; // Server typo
  authorization_url?: string; // Correct spelling
  [key: string]: unknown;
}

/**
 * Manages OAuth authentication flows adapted for VS Code.
 *
 * Unlike browser-based OAuth flows, VS Code requires:
 * - Opening system browser instead of popup window
 * - Custom URI handler for OAuth callbacks
 * - State-based CSRF protection
 * - Timeout handling for abandoned flows
 *
 * @example
 * ```typescript
 * const oauthManager = new OAuthFlowManager(context, logger);
 * await oauthManager.initialize();
 *
 * try {
 *   const result = await oauthManager.startOAuthFlow('github');
 *   console.log('Authenticated with token:', result.token);
 * } catch (error) {
 *   console.error('OAuth flow failed:', error);
 * }
 * ```
 */
export class OAuthFlowManager extends BaseService {
  /**
   * Map of pending OAuth flows indexed by state parameter.
   * State provides CSRF protection and flow tracking.
   */
  private pendingFlows = new Map<string, OAuthPendingFlow>();

  /**
   * Timeout duration for OAuth flows (5 minutes)
   */
  private static readonly FLOW_TIMEOUT_MS = 5 * 60 * 1000;

  /**
   * Extension identifier used for URI handler registration
   */
  private readonly extensionId: string;

  /**
   * Disposable for URI handler
   */
  private uriHandlerDisposable?: vscode.Disposable;

  constructor(context: vscode.ExtensionContext, logger: ILogger) {
    super("OAuthFlowManager", logger);
    this.extensionId = context.extension.id;
    this.logger.debug("OAuthFlowManager instance created", {
      extensionId: this.extensionId,
    });
  }

  /**
   * Initialize OAuth flow manager and register URI handler.
   */
  protected async onInitialize(): Promise<void> {
    this.logger.info("Initializing OAuth flow manager", {
      extensionId: this.extensionId,
      expectedCallbackUri: `vscode://${this.extensionId}/auth`,
    });

    // Register URI handler for OAuth callbacks
    this.uriHandlerDisposable = vscode.window.registerUriHandler({
      handleUri: async (uri: vscode.Uri) => {
        this.logger.info("URI handler invoked", {
          scheme: uri.scheme,
          authority: uri.authority,
          path: uri.path,
          query: uri.query,
          fullUri: uri.toString(),
        });

        // Check if this is an OAuth callback
        if (uri.path === "/auth" || uri.path === "/oauth/callback") {
          this.logger.info("OAuth callback detected, processing", {
            path: uri.path,
          });
          await this.handleOAuthCallback(uri);
        } else {
          this.logger.warn("Unknown URI path received", {
            path: uri.path,
            expectedPaths: ["/auth", "/oauth/callback"],
          });
        }
      },
    });

    this.logger.info("OAuth URI handler registered successfully", {
      callbackUri: `vscode://${this.extensionId}/auth`,
      extensionId: this.extensionId,
    });
  }

  /**
   * Clean up OAuth flow manager.
   */
  protected async onDispose(): Promise<void> {
    // Reject all pending flows
    for (const [state, flow] of this.pendingFlows.entries()) {
      flow.reject(new Error("OAuth flow manager disposed"));
      this.pendingFlows.delete(state);
    }

    // Dispose URI handler
    if (this.uriHandlerDisposable) {
      this.uriHandlerDisposable.dispose();
      this.uriHandlerDisposable = undefined;
    }

    this.logger.info("OAuth flow manager disposed");
  }

  /**
   * Start an OAuth authentication flow.
   *
   * This method:
   * 1. Generates a secure random state parameter (CSRF protection)
   * 2. Gets OAuth authorization URL from the platform API
   * 3. Opens system browser to the authorization URL
   * 4. Waits for OAuth callback via URI handler
   * 5. Returns the authentication token
   *
   * @param provider - OAuth provider (github or linkedin)
   * @returns Promise that resolves with authentication token
   * @throws Error if flow times out, is cancelled, or fails
   *
   * @example
   * ```typescript
   * try {
   *   const result = await oauthManager.startOAuthFlow('github');
   *   console.log('Token:', result.token);
   * } catch (error) {
   *   if (error.message.includes('timeout')) {
   *     console.log('User did not complete authentication in time');
   *   }
   * }
   * ```
   */
  async startOAuthFlow(provider: OAuthProvider): Promise<OAuthResult> {
    this.logger.info("Starting OAuth flow", { provider });

    // Generate secure state parameter (64 hex chars = 32 bytes)
    // Note: This is sent as "nonce" to the server, which generates its own state
    const state = crypto.randomBytes(32).toString("hex");
    this.logger.debug("Generated client nonce", {
      nonceLength: state.length,
    });

    // Build callback URI
    const callbackUri = `vscode://${this.extensionId}/auth`;
    this.logger.debug("OAuth callback URI", { callbackUri });

    // Server's state (extracted from OAuth URL)
    let serverState: string | undefined;

    try {
      // Get OAuth authorization URL from platform API
      // Use dynamic import to support both ESM and CommonJS environments
      const authzResponse = await this.logger.timeAsync(
        "get_oauth_authz_url",
        async () => {
          const { getOAuth2AuthzUrl } =
            await import("@datalayer/core/lib/api/iam/oauth2");
          return getOAuth2AuthzUrl(provider, callbackUri, state);
        },
        {
          provider,
          operation: "get_authorization_url",
        },
      );

      this.logger.debug("Received OAuth authorization URL", {
        provider,
        hasLoginURL: !!authzResponse.loginURL,
        loginURL: authzResponse.loginURL, // Log actual URL
        fullResponse: JSON.stringify(authzResponse), // Log entire response
      });

      // Extract login URL - handle both field names for compatibility
      // Server currently returns "autorization_url" (typo) but interface expects "loginURL"
      const response = authzResponse as unknown as OAuthAuthzResponse;
      const loginUrl =
        response.loginURL ||
        response.autorization_url ||
        response.authorization_url;
      if (!loginUrl || typeof loginUrl !== "string") {
        const error = new Error(
          `Invalid OAuth authorization URL received: ${JSON.stringify(loginUrl)}`,
        );
        this.logger.error("Invalid OAuth URL", error, {
          provider,
          authzResponse: JSON.stringify(authzResponse),
        });
        throw error;
      }

      this.logger.info("OAuth URL validation passed", {
        provider,
        urlLength: loginUrl.length,
        urlStart: loginUrl.substring(0, 50) + "...",
      });

      // Extract server's state from the GitHub OAuth URL
      // The server generates its own state and appends the callback URI to it
      // Format: serverState:callbackUri
      // We need to extract and store the serverState (before the colon)
      try {
        const parsedLoginUrl = new URL(loginUrl);
        const fullState = parsedLoginUrl.searchParams.get("state");
        if (!fullState) {
          throw new Error("No state parameter in OAuth URL");
        }
        // Split on ':' and take first part (server's state without callback URI)
        const extractedState = fullState.split(":")[0];
        if (!extractedState) {
          throw new Error("Empty state after splitting");
        }
        serverState = extractedState;
        this.logger.debug("Extracted server state from OAuth URL", {
          fullState,
          serverState,
          serverStateLength: serverState.length,
        });
      } catch (error) {
        const err = new Error(
          `Failed to extract state from OAuth URL: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
        this.logger.error("State extraction failed", err, {
          provider,
          loginUrl,
        });
        throw err;
      }

      // Ensure serverState is defined before proceeding
      if (!serverState) {
        throw new Error("Server state was not extracted from OAuth URL");
      }

      // Capture serverState with definite type for closures
      const capturedServerState: string = serverState;

      // Create promise for this flow
      const flowPromise = new Promise<OAuthResult>((resolve, reject) => {
        // Store pending flow using SERVER's state (not our client-generated state)
        this.pendingFlows.set(capturedServerState, {
          provider,
          resolve,
          reject,
          timestamp: Date.now(),
        });

        this.logger.debug("OAuth flow registered", {
          serverState: capturedServerState.substring(0, 8) + "...",
          pendingFlowsCount: this.pendingFlows.size,
        });

        // Set timeout
        setTimeout(() => {
          if (this.pendingFlows.has(capturedServerState)) {
            this.logger.warn("OAuth flow timed out", {
              provider,
              serverState: capturedServerState.substring(0, 8) + "...",
              timeout: OAuthFlowManager.FLOW_TIMEOUT_MS,
            });

            this.pendingFlows.delete(capturedServerState);
            reject(
              new Error(
                `OAuth flow timed out after ${OAuthFlowManager.FLOW_TIMEOUT_MS / 1000} seconds`,
              ),
            );
          }
        }, OAuthFlowManager.FLOW_TIMEOUT_MS);
      });

      // Parse URI and open browser
      this.logger.info("Attempting to parse and open OAuth URL", {
        provider,
        url: loginUrl,
      });

      let parsedUri: vscode.Uri;
      try {
        parsedUri = vscode.Uri.parse(loginUrl);
        this.logger.debug("URI parsed successfully", {
          scheme: parsedUri.scheme,
          authority: parsedUri.authority,
          path: parsedUri.path,
          query: parsedUri.query ? "present" : "none",
        });
      } catch (parseError) {
        const error = new Error(
          `Failed to parse OAuth URL: ${parseError instanceof Error ? parseError.message : "Unknown error"}`,
        );
        this.logger.error("URI parsing failed", error, {
          provider,
          loginUrl,
          parseError:
            parseError instanceof Error
              ? parseError.message
              : String(parseError),
        });
        throw error;
      }

      this.logger.info("Opening external browser", {
        provider,
        uri: parsedUri.toString(),
        uriScheme: parsedUri.scheme,
        uriAuthority: parsedUri.authority,
        uriPath: parsedUri.path,
        uriQuery: parsedUri.query,
      });

      this.logger.info("Calling vscode.env.openExternal...");
      const opened = await vscode.env.openExternal(parsedUri);
      this.logger.info("openExternal call completed", {
        provider,
        opened,
        openedType: typeof opened,
        openedValue: opened,
      });

      if (opened) {
        this.logger.info("Browser successfully opened/triggered");
      } else {
        this.logger.warn("Browser open returned false - may not have opened");
      }

      if (!opened) {
        const error = new Error(
          `Failed to open browser for ${provider} OAuth authentication`,
        );
        this.logger.error("Failed to open browser", error, {
          provider,
          parsedUri: parsedUri.toString(),
        });
        throw error;
      }

      // Show progress notification
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Authenticating with ${provider}`,
          cancellable: true,
        },
        async (progress, token) => {
          progress.report({
            message: "Waiting for browser authentication...",
          });

          // Handle cancellation
          token.onCancellationRequested(() => {
            this.logger.debug("OAuth flow cancelled by user", { provider });
            const flow = this.pendingFlows.get(capturedServerState);
            if (flow) {
              this.pendingFlows.delete(capturedServerState);
              flow.reject(new Error("OAuth flow cancelled by user"));
            }
          });

          // Wait for flow to complete
          try {
            const result = await flowPromise;
            progress.report({ message: "Authentication successful!" });
            return result;
          } catch (error) {
            throw error;
          }
        },
      );

      // Return result from promise
      return await flowPromise;
    } catch (error) {
      this.logger.error("OAuth flow failed", error as Error);

      // Clean up pending flow (use serverState if we extracted it)
      if (serverState) {
        this.pendingFlows.delete(serverState);
      }

      throw error;
    }
  }

  /**
   * Handle OAuth callback from URI handler.
   *
   * This method:
   * 1. Extracts state and token from callback URI
   * 2. Validates state parameter (CSRF protection)
   * 3. Resolves the pending OAuth flow promise
   *
   * @param uri - Callback URI from OAuth provider
   */
  private async handleOAuthCallback(uri: vscode.Uri): Promise<void> {
    this.logger.debug("Processing OAuth callback", {
      path: uri.path,
      hasQuery: !!uri.query,
    });

    try {
      // Parse query parameters
      const params = new URLSearchParams(uri.query);
      // Server may send either "state" (standard OAuth) or "_xsrf" (Jupyter/Tornado convention)
      const state = params.get("state") || params.get("_xsrf");
      const token = params.get("token");
      const error = params.get("error");
      const errorDescription = params.get("error_description");

      this.logger.debug("OAuth callback parameters", {
        hasState: !!state,
        stateParam: params.has("state")
          ? "state"
          : params.has("_xsrf")
            ? "_xsrf"
            : "none",
        hasToken: !!token,
        hasError: !!error,
        tokenLength: token ? token.length : 0,
      });

      // Check for OAuth error
      if (error) {
        const errorMsg = errorDescription || error;
        this.logger.error(
          "OAuth provider returned error",
          new Error(errorMsg),
          {
            error,
            errorDescription,
          },
        );

        // Find and reject matching flow
        if (state) {
          const flow = this.validateAndConsume(state);
          if (flow) {
            flow.reject(new Error(`OAuth error: ${errorMsg}`));
          }
        }

        await vscode.window.showErrorMessage(
          `OAuth authentication failed: ${errorMsg}`,
        );
        return;
      }

      // Validate required parameters
      if (!state) {
        this.logger.error("OAuth callback missing state parameter", undefined, {
          queryString: uri.query,
          availableParams: Array.from(params.keys()),
        });
        await vscode.window.showErrorMessage(
          "Invalid OAuth callback: missing state parameter",
        );
        return;
      }

      if (!token) {
        this.logger.error("OAuth callback missing token parameter", undefined, {
          queryString: uri.query,
          availableParams: Array.from(params.keys()),
        });
        await vscode.window.showErrorMessage(
          "Invalid OAuth callback: missing token",
        );
        return;
      }

      // Validate and consume state (CSRF protection)
      const flow = this.validateAndConsume(state);
      if (!flow) {
        this.logger.error(
          `Invalid or expired OAuth state: ${state.substring(0, 8)}... (pending flows: ${this.pendingFlows.size})`,
          new Error("Invalid OAuth state"),
        );
        await vscode.window.showErrorMessage(
          "Invalid OAuth state - potential CSRF attack or expired flow",
        );
        return;
      }

      // Success - resolve the pending flow
      this.logger.info("OAuth callback successful", {
        provider: flow.provider,
        tokenLength: token.length,
      });

      flow.resolve({
        token,
        provider: flow.provider,
      });
    } catch (error) {
      this.logger.error("Error processing OAuth callback", error as Error);
      await vscode.window.showErrorMessage(
        `Failed to process OAuth callback: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Validate OAuth state parameter and consume the pending flow.
   *
   * This method provides CSRF protection by:
   * - Checking if state exists in pending flows
   * - Verifying the flow hasn't expired (TTL check)
   * - Removing state after validation (one-time use)
   *
   * @param state - State parameter from OAuth callback
   * @returns Pending flow if valid, null otherwise
   */
  private validateAndConsume(state: string): OAuthPendingFlow | null {
    // Check if state exists
    const flow = this.pendingFlows.get(state);
    if (!flow) {
      this.logger.warn("OAuth state not found in pending flows", {
        state: state.substring(0, 8) + "...",
      });
      return null;
    }

    // Check TTL
    const age = Date.now() - flow.timestamp;
    if (age > OAuthFlowManager.FLOW_TIMEOUT_MS) {
      this.logger.warn("OAuth flow expired", {
        state: state.substring(0, 8) + "...",
        age,
        timeout: OAuthFlowManager.FLOW_TIMEOUT_MS,
      });
      this.pendingFlows.delete(state);
      return null;
    }

    // One-time consumption - remove from pending flows
    this.pendingFlows.delete(state);
    this.logger.debug("OAuth state validated and consumed", {
      state: state.substring(0, 8) + "...",
      provider: flow.provider,
    });

    return flow;
  }

  /**
   * Get count of pending OAuth flows (for testing/debugging).
   */
  getPendingFlowCount(): number {
    return this.pendingFlows.size;
  }
}
