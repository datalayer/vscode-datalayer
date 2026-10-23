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

import {
  SESSION_SURFACES_COMMAND,
  SessionSurfacesHandler,
} from "../../bridges/agentChatBridge";
import { OPEN_AGENT_COMMAND, openAgentRequestOf } from "../../chat/openSession";
import {
  OPEN_SESSION_COMMAND,
  type OpenSessionRequest,
} from "../../chat/sessionVerbs";
import { AgentChatViewProvider } from "../../providers/agentChatViewProvider";
import { LexicalProvider } from "../../providers/lexicalProvider";
import { NotebookProvider } from "../../providers/notebookProvider";
import { OutlineTreeProvider } from "../../providers/outlineTreeProvider";
import type { ProjectsTreeProvider } from "../../providers/projectsTreeProvider";
import { RuntimesTreeProvider } from "../../providers/runtimesTreeProvider";
import {
  sessionSourcesOf,
  SessionsTreeProvider,
} from "../../providers/sessionsTreeProvider";
import { SettingsTreeProvider } from "../../providers/settingsTreeProvider";
import { SmartDynamicControllerManager } from "../../providers/smartDynamicControllerManager";
import { SpacesTreeProvider } from "../../providers/spacesTreeProvider";
import { EnvironmentCache } from "../cache/environmentCache";
import { DatalayerAuthProvider } from "../core/authProvider";
import type { ExtendedDatalayerClient } from "../core/datalayerAdapter";
import { LocalApprovalSource } from "../localRuntime/localApprovalSource";
import type { LocalRuntimeService } from "../localRuntime/localRuntimeService";
import { ServiceLoggers } from "../logging/loggers";
import { ApprovalNotifications } from "./approvalNotifications";
import { DiffDocuments } from "./diffDocuments";
import { SessionStatusBar } from "./sessionStatusBar";
import { SessionTerminals } from "./sessionTerminal";
import { DatalayerStatusBar } from "./statusBar";

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
  /** Tree view provider for the Sessions view (VS-04) */
  sessionsTreeProvider: SessionsTreeProvider;
  /** Tree view provider for runtimes */
  runtimesTreeProvider: RuntimesTreeProvider;
  /** Optional legacy tree view provider for projects */
  projectsTreeProvider?: ProjectsTreeProvider;
  /** Tree view provider for settings (secrets + datasources) */
  settingsTreeProvider: SettingsTreeProvider;
  /** Smart dynamic controller manager for runtime selection and switching */
  controllerManager: SmartDynamicControllerManager;
}

/**
 * Initializes all UI components for the extension.
 * Registers providers, creates tree views, and sets up the status bar.
 *
 * @param context - VS Code extension context.
 * @param authProvider - Authentication provider instance.
 * @param datalayer - Datalayer instance.
 * @param localRuntimes - The local runtimes (VS-02), listed as a place in the Sessions view and the chat.
 *
 * @returns Container with all initialized UI components.
 *
 */
export async function initializeUI(
  context: vscode.ExtensionContext,
  authProvider: DatalayerAuthProvider,
  datalayer: ExtendedDatalayerClient,
  localRuntimes: LocalRuntimeService,
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
        datalayer,
        authProvider,
      ));
    }
  } catch (_error) {
    // Silently handle environment caching errors
  }

  // Create the smart dynamic controller manager
  const controllerManager = new SmartDynamicControllerManager(
    context,
    datalayer,
    authProvider,
  );
  context.subscriptions.push(controllerManager);

  // Create all tree providers in display order (outline, spaces, agents, settings)

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
        ServiceLoggers.main.debug(
          "[UISetup] Active text editor changed, clearing outline",
        );
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

      // The Datalayer home page shows the outline of the document last
      // active: switching to it keeps the outline.
      if (
        activeTab.input instanceof vscode.TabInputWebview &&
        activeTab.input.viewType.endsWith("datalayer.home")
      ) {
        return;
      }

      // If NOT a custom editor (notebook/lexical), clear outline
      if (
        !(activeTab.input instanceof vscode.TabInputCustom) &&
        !(activeTab.input instanceof vscode.TabInputNotebook)
      ) {
        ServiceLoggers.main.debug(
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

  // 2b. Sessions tree provider (between Spaces and Agents): the person's
  //     sessions on Datalayer and on this machine, and their team runs.
  const sessionsTreeProvider = new SessionsTreeProvider(
    sessionSourcesOf(authProvider, localRuntimes),
    authProvider.onAuthStateChanged,
  );
  sessionsTreeProvider.attach(
    vscode.window.createTreeView("datalayerSessions", {
      treeDataProvider: sessionsTreeProvider,
      showCollapseAll: true,
    }),
  );
  context.subscriptions.push(sessionsTreeProvider);

  // 3. Runtimes tree provider (THIRD) - shown as "Agents" and includes sections
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

  // 6. Agent Chat webview view (separate `datalayerChat` view container with
  //    its own activity-bar icon). Hosts a React webview that talks to the
  //    extension host via the AgentChatBridgeHandler, which answers
  //    IAgentRuntimesClient calls using the shared DatalayerClient +
  //    AgentsMixin so the webview never sees the auth token.
  //    The editor's surfaces of a session — approvals as notifications,
  //    diffs in the diff view, commands in a read-only terminal, the
  //    sessions in the status bar — are drawn by the extension host from
  //    what the chat posts (`SessionSurfacesHandler`).
  const diffs = new DiffDocuments();
  const terminals = new SessionTerminals();
  const sessionStatusBar = new SessionStatusBar();
  context.subscriptions.push(diffs, terminals, sessionStatusBar);
  const approvalNotifications = new ApprovalNotifications();
  // The local runtimes' approvals (VS-07): decided over each runtime's
  // websocket, said as notifications and handed to the chat's banner.
  const localApprovals = new LocalApprovalSource(
    localRuntimes,
    approvalNotifications,
  );
  context.subscriptions.push(localApprovals);
  const surfaces = new SessionSurfacesHandler({
    diffs,
    terminals,
    approvals: approvalNotifications,
    statusBar: sessionStatusBar,
    localApprovals,
  });
  const agentChatViewProvider = new AgentChatViewProvider(
    context,
    authProvider,
    datalayer,
    localRuntimes,
    surfaces,
    localApprovals,
  );
  // The surfaces' services, for the extension-host suite (the diff
  // documents' scheme is registered once, by this instance).
  context.subscriptions.push(
    vscode.commands.registerCommand(SESSION_SURFACES_COMMAND, () => ({
      diffs,
      terminals,
      approvals: approvalNotifications,
      statusBar: sessionStatusBar,
      localApprovals,
    })),
  );
  // A local runtime started or stopped is a place the picker lists.
  context.subscriptions.push(
    localRuntimes.onDidChange(() => agentChatViewProvider.refresh()),
  );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      AgentChatViewProvider.viewType,
      agentChatViewProvider,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
  );

  // Internal command so any code path (agent creation, termination,
  // timeouts) can request a sidebar refresh without holding a direct
  // reference to the provider. The webview's dropdown stays in sync with
  // platform state regardless of who triggered the change.
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.internal.agentChat.refresh",
      () => agentChatViewProvider.refresh(),
    ),
  );

  // The Sessions view opens a session in the chat through this command, and
  // reads again when the chat says a session changed.
  context.subscriptions.push(
    vscode.commands.registerCommand(
      OPEN_SESSION_COMMAND,
      (request: unknown) => {
        if (
          request &&
          typeof request === "object" &&
          typeof (request as { uid?: unknown }).uid === "string"
        ) {
          agentChatViewProvider.openSession(request as OpenSessionRequest);
        }
      },
    ),
    agentChatViewProvider.onSessionChanged(() => {
      sessionsTreeProvider.refresh();
    }),
  );

  // A click on an agent of the Agents view (or its row on the Home page)
  // opens the chat with that agent picked.
  context.subscriptions.push(
    vscode.commands.registerCommand(OPEN_AGENT_COMMAND, (request: unknown) => {
      const agent = openAgentRequestOf(request);
      if (agent) {
        return agentChatViewProvider.openAgent(agent);
      }
      return undefined;
    }),
  );

  return {
    statusBar,
    outlineTreeProvider,
    spacesTreeProvider,
    sessionsTreeProvider,
    runtimesTreeProvider,
    projectsTreeProvider: undefined,
    settingsTreeProvider,
    controllerManager,
  };
}
