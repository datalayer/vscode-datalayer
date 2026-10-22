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

import { getServiceContainer } from "../extension";
import { OutlineTreeProvider } from "../providers/outlineTreeProvider";
import type { ProjectsTreeProvider } from "../providers/projectsTreeProvider";
import { RuntimesTreeProvider } from "../providers/runtimesTreeProvider";
import type { SessionsTreeProvider } from "../providers/sessionsTreeProvider";
import { SettingsTreeProvider } from "../providers/settingsTreeProvider";
import { SmartDynamicControllerManager } from "../providers/smartDynamicControllerManager";
import { SpacesTreeProvider } from "../providers/spacesTreeProvider";
import { DocumentBridge } from "../services/bridges/documentBridge";
import { DatalayerAuthProvider } from "../services/core/authProvider";
import type { LocalRuntimeService } from "../services/localRuntime/localRuntimeService";
import { registerAgentChatCommands } from "./agentChat";
import { registerAppsCommands } from "./apps";
import { registerAuthCommands } from "./auth";
import { registerCreateCommands } from "./create";
import { registerDatasourcesCommands } from "./datasources";
import { registerDocumentCommands } from "./documents";
import { registerHomeCommands } from "./home";
import { getConnectedRuntime, registerInternalCommands } from "./internal";
import { registerLocalRuntimeCommands } from "./localRuntime";
import { registerOutlineCommands } from "./outline";
import { registerProjectsCommands } from "./projects";
import { registerPyodideCommands } from "./pyodide";
import { registerRuntimeCommands } from "./runtimes";
import { registerSecretsCommands } from "./secrets";
import { registerSessionsCommands } from "./sessions";
import { registerSnapshotCommands } from "./snapshots";
import { registerStartHereCommands } from "./startHere";
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
  /** The Sessions view (VS-04). */
  sessionsTreeProvider: SessionsTreeProvider;
  /** The local runtimes (VS-02). */
  localRuntimes: LocalRuntimeService;
  projectsTreeProvider?: ProjectsTreeProvider;
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
    services.spacesTreeProvider,
  );

  // Register smart create commands (context-aware notebook/lexical creation)
  registerCreateCommands(context);

  // Register theme commands (Primer showcase)
  registerThemeCommands(context);

  // *Datalayer: Home*: the sidebar's blocks as one page, read from the same tree providers,
  // in the sidebar's order: Sessions, Agents, Spaces, Outline, Settings
  registerHomeCommands(context, {
    authProvider: services.authProvider,
    sections: [
      {
        id: "datalayerSessions",
        title: "Sessions",
        icon: "comment-discussion",
        provider: services.sessionsTreeProvider,
        refresh: () => services.sessionsTreeProvider.refresh(),
      },
      {
        id: "datalayerRuntimes",
        title: "Agents",
        icon: "vm",
        provider: services.runtimesTreeProvider,
        refresh: () => services.runtimesTreeProvider.refresh(),
      },
      {
        id: "datalayerSpaces",
        title: "Spaces",
        icon: "cloud",
        provider: services.spacesTreeProvider,
        refresh: () => services.spacesTreeProvider.refresh(),
      },
      {
        id: "datalayerOutline",
        title: "Outline",
        icon: "list-tree",
        provider: services.outlineTreeProvider,
        refresh: () => services.outlineTreeProvider.refresh(),
      },
      {
        id: "datalayerSettings",
        title: "Settings",
        icon: "settings-gear",
        provider: services.settingsTreeProvider,
        refresh: () => services.settingsTreeProvider.refresh(),
      },
    ],
  });

  // Register outline commands
  registerOutlineCommands(context, services.outlineTreeProvider);


  // Register Pyodide commands (browser-based Python)
  registerPyodideCommands(context);

  // Register Agent Chat commands (focus webview)
  registerAgentChatCommands(context);

  // The local runtime (VS-02) and the Sessions view's verbs (VS-04, VS-05, VS-03)
  registerLocalRuntimeCommands(context, services.localRuntimes);
  registerSessionsCommands(context, {
    authProvider: services.authProvider,
    datalayer: getServiceContainer().datalayer,
    sessionsTreeProvider: services.sessionsTreeProvider,
    localRuntimes: services.localRuntimes,
  });

  // A coding agent in the open folder (VS-06), and the Studio's journey from the editor (VS-11).
  registerStartHereCommands(context, services.localRuntimes);
  registerAppsCommands(context, services.localRuntimes);
}
