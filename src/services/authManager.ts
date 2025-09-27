/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Authentication state synchronization for VS Code UI components.
 * Coordinates authentication events with spaces tree and runtime controllers.
 *
 * @module services/authManager
 */

import * as vscode from "vscode";
import { SDKAuthProvider } from "./authProvider";
import { SpacesTreeProvider } from "../providers/spacesTreeProvider";
import { RuntimeControllerManager } from "../providers/runtimeControllerManager";

/**
 * Sets up authentication state synchronization with UI components.
 * Configures event handlers and initial context variables.
 *
 * @param authProvider - Authentication provider instance
 * @param spacesTreeProvider - Spaces tree view provider
 * @param runtimeControllerManager - Runtime controller manager
 * @returns Function to manually update authentication state
 *
 * @example
 * ```typescript
 * const updateAuth = setupAuthStateManagement(authProvider, spacesTree, runtimeManager);
 * // Authentication state changes are handled automatically
 * ```
 */
export function setupAuthStateManagement(
  authProvider: SDKAuthProvider,
  spacesTreeProvider: SpacesTreeProvider,
  runtimeControllerManager: RuntimeControllerManager
): () => void {
  /**
   * Updates VS Code context variables and refreshes UI components.
   * Synchronizes authentication status across the extension.
   */
  const updateAuthState = (): void => {
    const authState = authProvider.getAuthState();
    vscode.commands.executeCommand(
      "setContext",
      "datalayer.authenticated",
      authState.isAuthenticated
    );
    spacesTreeProvider.refresh();

    runtimeControllerManager.forceRefresh().catch((error) => {
      console.error(
        "[Extension] Failed to refresh runtime controllers on auth state change:",
        error
      );
    });
  };

  authProvider.onAuthStateChanged(() => {
    console.log("[Extension] Auth state changed, updating UI...");
    updateAuthState();
  });

  const initialAuthState = authProvider.getAuthState();
  vscode.commands.executeCommand(
    "setContext",
    "datalayer.authenticated",
    initialAuthState.isAuthenticated
  );

  return updateAuthState;
}
