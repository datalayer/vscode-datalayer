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
import { OutlineTreeProvider } from "../../providers/outlineTreeProvider";
import { RuntimesTreeProvider } from "../../providers/runtimesTreeProvider";
import { SettingsTreeProvider } from "../../providers/settingsTreeProvider";
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
  /** Tree view provider for outline */
  outlineTreeProvider: OutlineTreeProvider;
  /** Tree view provider for spaces */
  spacesTreeProvider: SpacesTreeProvider;
  /** Tree view provider for runtimes */
  runtimesTreeProvider: RuntimesTreeProvider;
  /** Tree view provider for settings (secrets + datasources) */
  settingsTreeProvider: SettingsTreeProvider;
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

  // Initialize auth listener by passing authProvider directly (no circular dependency)
  const lexicalProvider = LexicalProvider.getInstance();
  if (lexicalProvider) {
    lexicalProvider.initializeAuthListener(authProvider);
  }

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

  // Create all tree providers in display order (outline, spaces, runtimes, snapshots)

  // 1. Outline tree provider (FIRST)
  const outlineTreeProvider = new OutlineTreeProvider();
  context.subscriptions.push(
    vscode.window.createTreeView("datalayerOutline", {
      treeDataProvider: outlineTreeProvider,
      showCollapseAll: true,
    }),
  );

  // Listen to tab changes to update outline when switching between editors
  // This handles switching between notebooks, lexicals, and regular files

  // Track when active text editor changes (for regular files)
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      // When a text editor becomes active (not our custom webview editors),
      // clear the outline since regular files don't have outline support
      if (editor) {
        console.log("[UISetup] Active text editor changed, clearing outline");
        outlineTreeProvider.setActiveDocument(undefined);
      }
    }),
  );

  // Also listen to tab changes as a backup
  context.subscriptions.push(
    vscode.window.tabGroups.onDidChangeTabs(() => {
      const activeTab = vscode.window.tabGroups.all
        .flatMap((group) => group.tabs)
        .find((tab) => tab.isActive);

      if (!activeTab) {
        outlineTreeProvider.setActiveDocument(undefined);
        return;
      }

      // If NOT a custom editor (notebook/lexical), clear outline
      if (
        !(activeTab.input instanceof vscode.TabInputCustom) &&
        !(activeTab.input instanceof vscode.TabInputNotebook)
      ) {
        console.log(
          "[UISetup] Active tab is not custom editor, clearing outline",
        );
        outlineTreeProvider.setActiveDocument(undefined);
      }
    }),
  );

  // 2. Spaces tree provider (SECOND)
  const spacesTreeProvider = new SpacesTreeProvider(authProvider);
  context.subscriptions.push(
    vscode.window.createTreeView("datalayerSpaces", {
      treeDataProvider: spacesTreeProvider,
      showCollapseAll: true,
    }),
  );

  // 3. Runtimes tree provider (THIRD) - includes Runtimes + Snapshots sections
  const runtimesTreeProvider = new RuntimesTreeProvider(authProvider);
  context.subscriptions.push(
    vscode.window.createTreeView("datalayerRuntimes", {
      treeDataProvider: runtimesTreeProvider,
      showCollapseAll: true,
    }),
  );

  // 4. Settings tree provider (FOURTH) - includes Secrets + Datasources sections
  const settingsTreeProvider = new SettingsTreeProvider(authProvider);
  context.subscriptions.push(
    vscode.window.createTreeView("datalayerSettings", {
      treeDataProvider: settingsTreeProvider,
      showCollapseAll: true,
    }),
  );

  return {
    statusBar,
    outlineTreeProvider,
    spacesTreeProvider,
    runtimesTreeProvider,
    settingsTreeProvider,
    controllerManager,
  };
}
