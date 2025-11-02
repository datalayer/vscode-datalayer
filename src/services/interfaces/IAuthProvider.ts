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

/**
 * Authentication state for VS Code context.
 */
export interface VSCodeAuthState {
  isAuthenticated: boolean;
  user: UserDTO | null;
  error: string | null;
}

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
   */
  login(): Promise<void>;

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
