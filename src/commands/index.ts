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
import { SDKAuthProvider } from "../services/authProvider";
import { DocumentBridge } from "../services/documentBridge";
import { SpacesTreeProvider } from "../providers/spacesTreeProvider";
import { RuntimeControllerManager } from "../providers/runtimeControllerManager";

/**
 * Services required for command registration.
 * @interface CommandServices
 */
export interface CommandServices {
  authProvider: SDKAuthProvider;
  documentBridge: DocumentBridge;
  spacesTreeProvider: SpacesTreeProvider;
  runtimeControllerManager: RuntimeControllerManager;
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
  updateAuthState: () => void
): void {
  registerAuthCommands(context, services.authProvider, updateAuthState);

  registerDocumentCommands(
    context,
    services.documentBridge,
    services.spacesTreeProvider
  );

  registerRuntimeCommands(context, services.runtimeControllerManager);
}
