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
import { SpacesTreeProvider } from "../providers/spacesTreeProvider";
import { SmartDynamicControllerManager } from "../providers/smartDynamicControllerManager";
import { JupyterNotebookProvider } from "../providers/jupyterNotebookProvider";
import { LexicalDocumentProvider } from "../providers/lexicalDocumentProvider";
import { SDKAuthProvider } from "./authProvider";
import { EnvironmentCache } from "./environmentCache";
import type { DatalayerSDK } from "../../../core/lib/index.js";

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
  treeView: vscode.TreeView<any>;
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
  sdk: DatalayerSDK
): Promise<ExtensionUI> {
  const statusBar = DatalayerStatusBar.getInstance(authProvider);
  context.subscriptions.push(statusBar);

  context.subscriptions.push(JupyterNotebookProvider.register(context));
  context.subscriptions.push(LexicalDocumentProvider.register(context));

  // Initialize environment cache on startup
  try {
    const environments = await EnvironmentCache.getInstance().getEnvironments(
      sdk
    );
    console.log(
      "[Extension] Cached",
      environments.length,
      "environments on startup"
    );
  } catch (error) {
    console.error("[Extension] Failed to cache environments:", error);
  }

  // Create the smart dynamic controller manager
  const controllerManager = new SmartDynamicControllerManager(
    context,
    sdk,
    authProvider
  );
  console.log("[Extension] Smart dynamic controller manager created");

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
