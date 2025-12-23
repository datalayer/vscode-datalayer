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
import { SpacesTreeProvider } from "../../providers/spacesTreeProvider";
import { RuntimesTreeProvider } from "../../providers/runtimesTreeProvider";
import { SmartDynamicControllerManager } from "../../providers/smartDynamicControllerManager";
import { EnvironmentCache } from "../cache/environmentCache";
import { getServiceContainer } from "../../extension";

/**
 * Sets up authentication state synchronization with UI components.
 * Configures event handlers and initial context variables.
 *
 * @param authProvider - Authentication provider instance
 * @param spacesTreeProvider - Spaces tree view provider
 * @param controllerManager - Dynamic controller manager
 * @param runtimesTreeProvider - Runtimes tree view provider
 * @returns Function to manually update authentication state
 *
 * @example
 * ```typescript
 * const updateAuth = setupAuthStateManagement(authProvider, spacesTree, platformController, runtimesTree);
 * // Authentication state changes are handled automatically
 * ```
 */
export function setupAuthStateManagement(
  authProvider: SDKAuthProvider,
  spacesTreeProvider: SpacesTreeProvider,
  controllerManager: SmartDynamicControllerManager,
  runtimesTreeProvider?: RuntimesTreeProvider,
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
      authState.isAuthenticated,
    );
    spacesTreeProvider.refresh();

    // Refresh runtimes tree on auth change
    runtimesTreeProvider?.refresh();

    // Refresh controllers on auth change
    void controllerManager.refreshControllers();
  };

  authProvider.onAuthStateChanged((authState) => {
    updateAuthState();

    // Handle EnvironmentCache based on authentication state
    const envCache = EnvironmentCache.getInstance();
    if (authState.isAuthenticated) {
      // User logged in - refresh environment cache
      const sdk = getServiceContainer().sdk;
      envCache.onUserLogin(sdk).catch(() => {
        // Silently handle cache refresh errors
      });
    } else {
      // User logged out - clear environment cache
      envCache.onUserLogout();
    }

    // Refresh Lexical collaboration configs to update usernames
    // Import dynamically to avoid circular dependency
    import("../../providers/lexicalProvider")
      .then(({ LexicalProvider }) => {
        const lexicalProvider = LexicalProvider.getInstance();
        if (lexicalProvider) {
          lexicalProvider.refreshCollaborationConfigs().catch((error) => {
            console.error(
              "[AuthManager] Failed to refresh Lexical collaboration configs:",
              error,
            );
          });
        }
      })
      .catch((error) => {
        console.error("[AuthManager] Failed to import LexicalProvider:", error);
      });
  });

  const initialAuthState = authProvider.getAuthState();
  vscode.commands.executeCommand(
    "setContext",
    "datalayer.authenticated",
    initialAuthState.isAuthenticated,
  );

  return updateAuthState;
}
