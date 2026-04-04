/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Datalayer Jupyter Server Provider using official Jupyter Extension API.
 * Based on Colab's approach to show servers + commands in kernel picker.
 *
 * @module jupyter/serverProvider
 */

import type { DatalayerClient } from "@datalayer/core/lib/client";
import type { RuntimeDTO } from "@datalayer/core/lib/models/RuntimeDTO";
import type {
  Jupyter,
  JupyterServer,
  JupyterServerCollection,
  JupyterServerCommand,
  JupyterServerCommandProvider,
  JupyterServerProvider,
} from "@vscode/jupyter-extension";
import * as vscode from "vscode";

import type { SmartDynamicControllerManager } from "../providers/smartDynamicControllerManager";
import type { DatalayerAuthProvider } from "../services/core/authProvider";
import { ServiceLoggers } from "../services/logging/loggers";

/**
 * Commands that appear in the Datalayer kernel picker
 */
const CREATE_GPU_RUNTIME: JupyterServerCommand = {
  label: `$(add) ${vscode.l10n.t("Create GPU Runtime")}`,
  description: vscode.l10n.t("Launch AI environment on Datalayer platform"),
};

const CREATE_CPU_RUNTIME: JupyterServerCommand = {
  label: `$(add) ${vscode.l10n.t("Create CPU Runtime")}`,
  description: vscode.l10n.t("Launch Python CPU environment"),
};

/**
 * Datalayer Jupyter Server Provider.
 * Provides runtime servers + creation commands in the kernel picker.
 *
 * Architecture (based on Colab):
 * - Implements JupyterServerProvider to provide list of active runtimes
 * - Implements JupyterServerCommandProvider to provide "Create GPU/CPU" commands
 * - Creates a JupyterServerCollection that appears as "Datalayer" in kernel picker
 */
export class DatalayerJupyterServerProvider
  implements
    JupyterServerProvider,
    JupyterServerCommandProvider,
    vscode.Disposable
{
  private readonly serverCollection: JupyterServerCollection;
  private readonly serverChangeEmitter: vscode.EventEmitter<void>;
  private isAuthenticated = false;
  private authStateListener: vscode.Disposable;

  constructor(
    private readonly datalayer: DatalayerClient,
    private readonly authProvider: DatalayerAuthProvider,
    private readonly controllerManager: SmartDynamicControllerManager,
  ) {
    this.serverChangeEmitter = new vscode.EventEmitter<void>();

    // Listen for auth state changes
    this.isAuthenticated = authProvider.isAuthenticated();
    this.authStateListener = authProvider.onAuthStateChanged(() => {
      const newAuthState = authProvider.isAuthenticated();
      if (this.isAuthenticated !== newAuthState) {
        this.isAuthenticated = newAuthState;
        this.serverChangeEmitter.fire(); // Refresh server list
      }
    });

    // Get Jupyter extension API and create server collection
    const jupyterExt =
      vscode.extensions.getExtension<Jupyter>("ms-toolsai.jupyter");
    if (!jupyterExt) {
      throw new Error("Jupyter extension not found");
    }

    // Get Jupyter extension API (must be active at this point)
    if (!jupyterExt.isActive) {
      throw new Error(
        "Jupyter extension is not active. Please ensure ms-toolsai.jupyter is installed and activated.",
      );
    }
    const jupyter = jupyterExt.exports;

    this.serverCollection = jupyter.createJupyterServerCollection(
      "datalayer",
      "Datalayer",
      this, // JupyterServerProvider
    );

    this.serverCollection.commandProvider = this; // JupyterServerCommandProvider
  }

  /**
   * Provides the list of Datalayer runtime servers for the Jupyter extension kernel picker.
   * @param _token - Cancellation token for the operation.
   *
   * @returns Array of available Datalayer runtime servers.
   */
  async provideJupyterServers(
    _token: vscode.CancellationToken,
  ): Promise<JupyterServer[]> {
    const servers: JupyterServer[] = [];

    // Add runtime servers only if authenticated
    if (this.isAuthenticated) {
      try {
        const runtimes = await this.datalayer.listRuntimes();
        servers.push(
          ...runtimes.map((runtime) => this.runtimeToJupyterServer(runtime)),
        );
      } catch (error) {
        console.error(
          "[DatalayerJupyterServerProvider] Failed to list runtimes:",
          error,
        );
      }
    }

    return servers;
  }

  /**
   * Resolves connection information for a Datalayer runtime server when selected by the user.
   * @param server - Server to resolve connection information for.
   * @param _token - Cancellation token for the operation.
   *
   * @returns Resolved server with connection details.
   */
  async resolveJupyterServer(
    server: JupyterServer,
    _token: vscode.CancellationToken,
  ): Promise<JupyterServer> {
    // For runtime servers, return as-is
    // (Jupyter extension will use existing controllers)
    return server;
  }

  /**
   * Provides commands that appear below servers in the kernel picker for creating new runtimes.
   * @param _value - Filter string from the kernel picker search.
   * @param _token - Cancellation token for the operation.
   *
   * @returns Array of available runtime creation commands.
   */
  async provideCommands(
    _value: string | undefined,
    _token: vscode.CancellationToken,
  ): Promise<JupyterServerCommand[]> {
    const commands: JupyterServerCommand[] = [];

    // Always show creation commands (even when not authenticated)
    commands.push(CREATE_GPU_RUNTIME, CREATE_CPU_RUNTIME);

    return commands;
  }

  /**
   * Handles command execution when user clicks a runtime creation command in the kernel picker.
   * @param command - The command selected by the user.
   * @param _token - Cancellation token for the operation.
   *
   * @returns Newly created runtime server or undefined if cancelled.
   */
  async handleCommand(
    command: JupyterServerCommand,
    _token: vscode.CancellationToken,
  ): Promise<JupyterServer | undefined> {
    ServiceLoggers.runtime.debug(
      "[DatalayerJupyterServerProvider] handleCommand called with:",
      { detail: command.label },
    );

    // Check authentication first
    if (!this.isAuthenticated) {
      ServiceLoggers.runtime.debug(
        "[DatalayerJupyterServerProvider] Not authenticated, triggering login...",
      );
      try {
        // Call login directly (like status bar does) - shows OAuth flow immediately
        await this.authProvider.login();

        if (!this.authProvider.isAuthenticated()) {
          ServiceLoggers.runtime.debug(
            "[DatalayerJupyterServerProvider] User cancelled login",
          );
          return undefined; // User cancelled login
        }

        ServiceLoggers.runtime.debug(
          "[DatalayerJupyterServerProvider] Authentication successful",
        );
        // Update auth state
        this.isAuthenticated = true;
      } catch (error) {
        console.error("[DatalayerJupyterServerProvider] Login error:", error);
        const errorMsg =
          error instanceof Error
            ? error.message
            : vscode.l10n.t("Unknown error");
        vscode.window.showErrorMessage(
          vscode.l10n.t("Authentication failed: {0}", errorMsg),
        );
        return undefined;
      }
    }

    try {
      ServiceLoggers.runtime.debug(
        "[DatalayerJupyterServerProvider] Executing command:",
        { detail: command.label },
      );
      switch (command.label) {
        case CREATE_GPU_RUNTIME.label:
          return await this.createGpuRuntime();
        case CREATE_CPU_RUNTIME.label:
          return await this.createCpuRuntime();
        default:
          throw new Error(`Unknown command: ${command.label}`);
      }
    } catch (error) {
      console.error(
        "[DatalayerJupyterServerProvider] Command execution error:",
        error,
      );
      const errorMsg =
        error instanceof Error ? error.message : vscode.l10n.t("Unknown error");
      vscode.window.showErrorMessage(
        vscode.l10n.t("Failed to create runtime: {0}", errorMsg),
      );
      return undefined;
    }
  }

  /**
   * Creates a GPU runtime through the environment selection and creation flow.
   * @returns The created GPU Jupyter server or undefined if creation fails.
   */
  private async createGpuRuntime(): Promise<JupyterServer | undefined> {
    ServiceLoggers.runtime.debug(
      "[DatalayerJupyterServerProvider] createGpuRuntime started",
    );

    try {
      const { EnvironmentCache } =
        await import("../services/cache/environmentCache");
      const { createRuntime } = await import("../ui/dialogs/runtimeSelector");

      // Get GPU environment
      ServiceLoggers.runtime.debug(
        "[DatalayerJupyterServerProvider] Fetching GPU environment...",
      );
      const environments = await EnvironmentCache.getInstance().getEnvironments(
        this.datalayer,
        this.authProvider,
      );
      ServiceLoggers.runtime.debug(
        "[DatalayerJupyterServerProvider] Available environments:",
        { items: environments.map((e) => e.name) },
      );

      const gpuEnv = environments.find((e) => e.name === "ai-env");

      if (!gpuEnv) {
        console.error(
          "[DatalayerJupyterServerProvider] GPU environment 'ai-env' not found",
        );
        vscode.window.showErrorMessage(
          vscode.l10n.t("GPU environment not found on platform"),
        );
        return undefined;
      }

      // Show creation flow (snapshot, name, duration)
      ServiceLoggers.runtime.debug(
        "[DatalayerJupyterServerProvider] Showing creation flow...",
      );
      const runtime = await createRuntime(this.datalayer, gpuEnv);
      if (!runtime) {
        ServiceLoggers.runtime.debug(
          "[DatalayerJupyterServerProvider] User cancelled runtime creation",
        );
        return undefined; // User cancelled
      }

      ServiceLoggers.runtime.debug(
        "[DatalayerJupyterServerProvider] Runtime created:",
        { detail: runtime.uid },
      );

      // Create controller for new runtime
      await this.controllerManager.ensureRuntimeController(runtime);

      // Refresh server list to show new runtime
      this.serverChangeEmitter.fire();

      vscode.window.showInformationMessage(
        vscode.l10n.t(
          'Runtime "{0}" created successfully!',
          runtime.givenName || runtime.podName || "",
        ),
      );

      return this.runtimeToJupyterServer(runtime);
    } catch (error) {
      console.error(
        "[DatalayerJupyterServerProvider] createGpuRuntime error:",
        error,
      );
      throw error; // Re-throw to be caught by handleCommand
    }
  }

  /**
   * Creates a CPU runtime through the environment selection and creation flow.
   * @returns The created CPU Jupyter server or undefined if creation fails.
   */
  private async createCpuRuntime(): Promise<JupyterServer | undefined> {
    ServiceLoggers.runtime.debug(
      "[DatalayerJupyterServerProvider] createCpuRuntime started",
    );

    try {
      const { EnvironmentCache } =
        await import("../services/cache/environmentCache");
      const { createRuntime } = await import("../ui/dialogs/runtimeSelector");

      // Get CPU environment
      ServiceLoggers.runtime.debug(
        "[DatalayerJupyterServerProvider] Fetching CPU environment...",
      );
      const environments = await EnvironmentCache.getInstance().getEnvironments(
        this.datalayer,
        this.authProvider,
      );
      ServiceLoggers.runtime.debug(
        "[DatalayerJupyterServerProvider] Available environments:",
        { items: environments.map((e) => e.name) },
      );

      const cpuEnv = environments.find((e) => e.name === "python-cpu-env");

      if (!cpuEnv) {
        console.error(
          "[DatalayerJupyterServerProvider] CPU environment 'python-cpu-env' not found",
        );
        vscode.window.showErrorMessage(
          vscode.l10n.t("CPU environment not found on platform"),
        );
        return undefined;
      }

      // Show creation flow
      ServiceLoggers.runtime.debug(
        "[DatalayerJupyterServerProvider] Showing creation flow...",
      );
      const runtime = await createRuntime(this.datalayer, cpuEnv);
      if (!runtime) {
        ServiceLoggers.runtime.debug(
          "[DatalayerJupyterServerProvider] User cancelled runtime creation",
        );
        return undefined;
      }

      ServiceLoggers.runtime.debug(
        "[DatalayerJupyterServerProvider] Runtime created:",
        { detail: runtime.uid },
      );

      // Create controller for new runtime
      await this.controllerManager.ensureRuntimeController(runtime);

      // Refresh server list
      this.serverChangeEmitter.fire();

      vscode.window.showInformationMessage(
        vscode.l10n.t(
          'Runtime "{0}" created successfully!',
          runtime.givenName || runtime.podName || "",
        ),
      );

      return this.runtimeToJupyterServer(runtime);
    } catch (error) {
      console.error(
        "[DatalayerJupyterServerProvider] createCpuRuntime error:",
        error,
      );
      throw error; // Re-throw to be caught by handleCommand
    }
  }

  /**
   * Converts a Datalayer RuntimeDTO to a JupyterServer with connection information for the Jupyter extension.
   * @param runtime - Datalayer runtime to convert.
   *
   * @returns JupyterServer with connection info and display label.
   */
  private runtimeToJupyterServer(runtime: RuntimeDTO): JupyterServer {
    // Convert runtime to JSON to access connection properties
    const runtimeData =
      runtime &&
      typeof runtime === "object" &&
      "toJSON" in runtime &&
      typeof runtime.toJSON === "function"
        ? runtime.toJSON()
        : runtime;

    // Build connection information for Jupyter extension
    const connectionInformation: { baseUrl: vscode.Uri; token?: string } = {
      baseUrl: vscode.Uri.parse(runtimeData.ingress),
      token: runtimeData.token,
    };

    // IMPORTANT: ID must match the controller ID created by SmartDynamicControllerManager
    // so the Jupyter extension uses our existing controller instead of creating its own
    const controllerId = `datalayer-runtime-${runtime.uid}`;
    const displayName =
      runtime.givenName ||
      runtime.podName ||
      `Runtime ${runtime.uid.substring(0, 8)}`;

    return {
      id: controllerId,
      label: `Datalayer: ${displayName}`,
      connectionInformation,
    };
  }

  /**
   * Disposes all resources including auth listener, server collection, and event emitter.
   */
  dispose(): void {
    this.authStateListener.dispose();
    this.serverCollection.dispose();
    this.serverChangeEmitter.dispose();
  }

  /**
   * Event that fires when the server list changes due to runtime creation or authentication state changes.
   */
  get onDidChangeServers(): vscode.Event<void> {
    return this.serverChangeEmitter.event;
  }
}
