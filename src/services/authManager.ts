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
import { SmartDynamicControllerManager } from "../providers/smartDynamicControllerManager";

/**
 * Sets up authentication state synchronization with UI components.
 * Configures event handlers and initial context variables.
 *
 * @param authProvider - Authentication provider instance
 * @param spacesTreeProvider - Spaces tree view provider
 * @param controllerManager - Dynamic controller manager
 * @returns Function to manually update authentication state
 *
 * @example
 * ```typescript
 * const updateAuth = setupAuthStateManagement(authProvider, spacesTree, platformController);
 * // Authentication state changes are handled automatically
 * ```
 */
export function setupAuthStateManagement(
  authProvider: SDKAuthProvider,
  spacesTreeProvider: SpacesTreeProvider,
  controllerManager: SmartDynamicControllerManager
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

    // Refresh controllers on auth change
    controllerManager.refreshControllers();
    console.log("[Extension] Refreshed controllers due to auth state change");
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
