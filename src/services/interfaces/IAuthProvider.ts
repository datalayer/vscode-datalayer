/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Authentication provider interface for Datalayer platform integration.
 * Defines the contract for authentication state management and operations.
 *
 * @module services/interfaces/IAuthProvider
 */

import * as vscode from "vscode";
import type { UserDTO } from "@datalayer/core/lib/models/UserDTO";
import type { AuthMethod } from "../../ui/dialogs/authMethodSelector";
import type { CredentialsInput } from "../../ui/dialogs/credentialsInput";

/**
 * Authentication state for VS Code context.
 */
export interface VSCodeAuthState {
  isAuthenticated: boolean;
  user: UserDTO | null;
  error: string | null;
}

/**
 * Re-export authentication types for convenience
 */
export type { AuthMethod, CredentialsInput };

/**
 * Authentication provider interface.
 * Implementations should handle platform-specific authentication flows.
 */
export interface IAuthProvider {
  /**
   * Event fired when authentication state changes.
   */
  readonly onAuthStateChanged: vscode.Event<VSCodeAuthState>;

  /**
   * Initializes authentication state from stored credentials.
   * Should verify existing authentication with the platform.
   */
  initialize(): Promise<void>;

  /**
   * Performs user login flow.
   * Should prompt for credentials and authenticate with platform.
   * @deprecated Use showLoginMethodPicker() followed by specific login methods
   */
  login(): Promise<void>;

  /**
   * Show login method selection dialog.
   * Presents user with choice of handle/password or OAuth providers.
   * @returns Selected authentication method, or undefined if cancelled
   */
  showLoginMethodPicker(): Promise<AuthMethod | undefined>;

  /**
   * Login using handle/password credentials.
   * Prompts for credentials and authenticates with platform.
   */
  loginWithCredentials(): Promise<void>;

  /**
   * Login using OAuth provider.
   * Opens browser for OAuth flow and handles callback.
   * @param provider - OAuth provider (github or linkedin)
   */
  loginWithOAuth(provider: "github" | "linkedin"): Promise<void>;

  /**
   * Logs out the current user and clears authentication state.
   */
  logout(): Promise<void>;

  /**
   * Shows authentication status with interactive options.
   */
  showAuthStatus(): Promise<void>;

  /**
   * Gets current authentication state.
   */
  getAuthState(): VSCodeAuthState;

  /**
   * Checks if currently authenticated.
   */
  isAuthenticated(): boolean;

  /**
   * Gets current user information.
   * @returns User object if authenticated, null otherwise
   */
  getCurrentUser(): UserDTO | null;

  /**
   * Gets authentication token.
   * @returns Token string if authenticated, empty string otherwise
   */
  getToken(): string;
}
