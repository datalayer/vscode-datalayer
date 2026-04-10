/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Central command registration module for the Datalayer VS Code extension.
 * Aggregates and exports all command registration functions.
 *
 * @module commands
 *
 * @see https://code.visualstudio.com/api/extension-guides/command
 */

import * as vscode from "vscode";

import { OutlineTreeProvider } from "../providers/outlineTreeProvider";
import { ProjectsTreeProvider } from "../providers/projectsTreeProvider";
import { RuntimesTreeProvider } from "../providers/runtimesTreeProvider";
import { SettingsTreeProvider } from "../providers/settingsTreeProvider";
import { SmartDynamicControllerManager } from "../providers/smartDynamicControllerManager";
import { SpacesTreeProvider } from "../providers/spacesTreeProvider";
import { DocumentBridge } from "../services/bridges/documentBridge";
import { DatalayerAuthProvider } from "../services/core/authProvider";
import { registerAgentChatCommands } from "./agentChat";
import { registerAgUICommands } from "./agui";
import { registerAuthCommands } from "./auth";
import { registerCreateCommands } from "./create";
import { registerDatasourcesCommands } from "./datasources";
import { registerDocumentCommands } from "./documents";
import { getConnectedRuntime, registerInternalCommands } from "./internal";
import { registerOutlineCommands } from "./outline";
import { registerProjectsCommands } from "./projects";
import { registerPyodideCommands } from "./pyodide";
import { registerRuntimeCommands } from "./runtimes";
import { registerSecretsCommands } from "./secrets";
import { registerSnapshotCommands } from "./snapshots";
import { registerThemeCommands } from "./theme";

// Re-export internal command helpers for use by providers
export { getConnectedRuntime };

/**
 * Services required for command registration.
 * @interface CommandServices
 */
export interface CommandServices {
  authProvider: DatalayerAuthProvider;
  documentBridge: DocumentBridge;
  spacesTreeProvider: SpacesTreeProvider;
  /** Controller manager for native notebook controller integration */
  controllerManager: SmartDynamicControllerManager;
  runtimesTreeProvider: RuntimesTreeProvider;
  projectsTreeProvider: ProjectsTreeProvider;
  settingsTreeProvider: SettingsTreeProvider;
  outlineTreeProvider: OutlineTreeProvider;
}

/**
 * Registers all extension commands by delegating to domain-specific registration functions.
 *
 * @param context - The extension context for managing command subscriptions.
 * @param services - All services required by commands.
 * @param updateAuthState - Callback to update authentication state across UI components.
 *
 * @returns Void.
 *
 */
export function registerAllCommands(
  context: vscode.ExtensionContext,
  services: CommandServices,
  updateAuthState: () => void,
): void {
  // Register internal commands first (used for cross-component communication)
  registerInternalCommands(context);

  registerAuthCommands(context, services.authProvider, updateAuthState);

  registerDocumentCommands(
    context,
    services.documentBridge,
    services.spacesTreeProvider,
  );

  registerRuntimeCommands(
    context,
    services.controllerManager,
    services.runtimesTreeProvider,
  );

  // Register snapshot management commands
  // Snapshots are now part of runtimesTreeProvider (merged tree)
  registerSnapshotCommands(context, services.runtimesTreeProvider);

  // Register secrets management commands
  registerSecretsCommands(context, services.settingsTreeProvider);

  // Register datasources management commands (placeholder)
  registerDatasourcesCommands(context, services.settingsTreeProvider);

  // Register projects management commands
  registerProjectsCommands(
    context,
    services.projectsTreeProvider,
    services.runtimesTreeProvider,
    services.settingsTreeProvider,
  );

  // Register smart create commands (context-aware notebook/lexical creation)
  registerCreateCommands(context);

  // Register theme commands (Primer showcase)
  registerThemeCommands(context);

  // Register outline commands
  registerOutlineCommands(context, services.outlineTreeProvider);

  // Register ag-ui example commands
  registerAgUICommands(context);

  // Register Pyodide commands (browser-based Python)
  registerPyodideCommands(context);

  // Register Agent Chat commands (focus webview)
  registerAgentChatCommands(context);
}
