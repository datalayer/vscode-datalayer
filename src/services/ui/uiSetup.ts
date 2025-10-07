/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * UI initialization factory for the Datalayer VS Code extension.
 * Configures and registers all UI components including status bar, tree views, and providers.
 *
 * @module services/uiSetup
 */

import * as vscode from "vscode";
import { DatalayerStatusBar } from "./statusBar";
import { SpacesTreeProvider } from "../../providers/spacesTreeProvider";
import { SmartDynamicControllerManager } from "../../providers/smartDynamicControllerManager";
import { NotebookProvider } from "../../providers/notebookProvider";
import { LexicalProvider } from "../../providers/lexicalProvider";
import { SDKAuthProvider } from "../core/authProvider";
import { EnvironmentCache } from "../cache/environmentCache";
import type { DatalayerClient } from "@datalayer/core/lib/client";

/**
 * Container for all extension UI components.
 * Provides typed access to initialized UI instances.
 */
export interface ExtensionUI {
  /** Status bar item for authentication status */
  statusBar: DatalayerStatusBar;
  /** Tree view provider for spaces */
  spacesTreeProvider: SpacesTreeProvider;
  /** VS Code tree view for spaces */
  treeView: vscode.TreeView<unknown>;
  /** Smart dynamic controller manager for runtime selection and switching */
  controllerManager: SmartDynamicControllerManager;
}

/**
 * Initializes all UI components for the extension.
 * Registers providers, creates tree views, and sets up the status bar.
 *
 * @param context - VS Code extension context
 * @param authProvider - Authentication provider instance
 * @param sdk - SDK instance
 * @returns Container with all initialized UI components
 *
 * @example
 * ```typescript
 * const ui = await initializeUI(context, authProvider, sdk);
 * // UI components are registered and ready
 * ```
 */
export async function initializeUI(
  context: vscode.ExtensionContext,
  authProvider: SDKAuthProvider,
  sdk: DatalayerClient,
): Promise<ExtensionUI> {
  const statusBar = DatalayerStatusBar.getInstance(authProvider);
  context.subscriptions.push(statusBar);

  context.subscriptions.push(NotebookProvider.register(context));
  context.subscriptions.push(LexicalProvider.register(context));

  // Initialize environment cache only if authenticated
  try {
    if (authProvider.isAuthenticated()) {
      void (await EnvironmentCache.getInstance().getEnvironments(
        sdk,
        authProvider,
      ));
    }
  } catch (error) {
    // Silently handle environment caching errors
  }

  // Create the smart dynamic controller manager
  const controllerManager = new SmartDynamicControllerManager(
    context,
    sdk,
    authProvider,
  );
  context.subscriptions.push(controllerManager);

  const spacesTreeProvider = new SpacesTreeProvider(authProvider);
  const treeView = vscode.window.createTreeView("datalayerSpaces", {
    treeDataProvider: spacesTreeProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  return {
    statusBar,
    spacesTreeProvider,
    treeView,
    controllerManager,
  };
}
