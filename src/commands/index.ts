/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Central command registration module for the Datalayer VS Code extension.
 * Aggregates and exports all command registration functions.
 *
 * @see https://code.visualstudio.com/api/extension-guides/command
 * @module commands
 */

import * as vscode from "vscode";
import { registerAuthCommands } from "./auth";
import { registerDocumentCommands } from "./documents";
import { registerRuntimeCommands } from "./runtimes";
import { registerSnapshotCommands } from "./snapshots";
import { registerInternalCommands, getConnectedRuntime } from "./internal";
import { registerCreateCommands } from "./create";
import { SDKAuthProvider } from "../services/core/authProvider";
import { DocumentBridge } from "../services/bridges/documentBridge";
import { SpacesTreeProvider } from "../providers/spacesTreeProvider";
import { RuntimesTreeProvider } from "../providers/runtimesTreeProvider";
import { SmartDynamicControllerManager } from "../providers/smartDynamicControllerManager";

// Re-export internal command helpers for use by providers
export { getConnectedRuntime };

/**
 * Services required for command registration.
 * @interface CommandServices
 */
export interface CommandServices {
  authProvider: SDKAuthProvider;
  documentBridge: DocumentBridge;
  spacesTreeProvider: SpacesTreeProvider;
  /** Controller manager for native notebook controller integration */
  controllerManager: SmartDynamicControllerManager;
  runtimesTreeProvider: RuntimesTreeProvider;
}

/**
 * Registers all extension commands.
 *
 * @param context - The extension context for managing command subscriptions
 * @param services - All services required by commands
 * @param updateAuthState - Callback to update authentication state across UI components
 * @returns void
 *
 * @example
 * ```typescript
 * registerAllCommands(context, services, updateAuthState);
 * ```
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
  registerSnapshotCommands(context, services.runtimesTreeProvider);

  // Register smart create commands (context-aware notebook/lexical creation)
  registerCreateCommands(context);
}
