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

import * as vscode from "vscode";
import type {
  Jupyter,
  JupyterServer,
  JupyterServerCommand,
  JupyterServerCommandProvider,
  JupyterServerProvider,
  JupyterServerCollection,
} from "@vscode/jupyter-extension";
import type { DatalayerClient } from "@datalayer/core/lib/client";
import type { RuntimeDTO } from "@datalayer/core/lib/models/RuntimeDTO";
import type { SDKAuthProvider } from "../services/core/authProvider";
import type { SmartDynamicControllerManager } from "../providers/smartDynamicControllerManager";

/**
 * Commands that appear in the Datalayer kernel picker
 */
const CREATE_GPU_RUNTIME: JupyterServerCommand = {
  label: "$(add) Create GPU Runtime",
  description: "Launch AI environment on Datalayer platform",
};

const CREATE_CPU_RUNTIME: JupyterServerCommand = {
  label: "$(add) Create CPU Runtime",
  description: "Launch Python CPU environment",
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
    private readonly sdk: DatalayerClient,
    private readonly authProvider: SDKAuthProvider,
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
   * Provides the list of Datalayer runtime servers.
   * Called by Jupyter extension to populate kernel picker.
   */
  async provideJupyterServers(
    _token: vscode.CancellationToken,
  ): Promise<JupyterServer[]> {
    const servers: JupyterServer[] = [];

    // Add runtime servers only if authenticated
    if (this.isAuthenticated) {
      try {
        const runtimes = await this.sdk.listRuntimes();
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
   * Resolves connection information for a Datalayer runtime server.
   * Called when user selects a runtime from the picker.
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
   * Provides commands that appear below servers in kernel picker.
   * This is where "Create GPU Runtime" and "Create CPU Runtime" appear!
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
   * Handles command execution when user clicks a command.
   * Returns the newly created runtime server or undefined.
   */
  async handleCommand(
    command: JupyterServerCommand,
    _token: vscode.CancellationToken,
  ): Promise<JupyterServer | undefined> {
    console.log(
      "[DatalayerJupyterServerProvider] handleCommand called with:",
      command.label,
    );

    // Check authentication first
    if (!this.isAuthenticated) {
      console.log(
        "[DatalayerJupyterServerProvider] Not authenticated, triggering login...",
      );
      try {
        // Call login directly (like status bar does) - shows OAuth flow immediately
        await this.authProvider.login();

        if (!this.authProvider.isAuthenticated()) {
          console.log("[DatalayerJupyterServerProvider] User cancelled login");
          return undefined; // User cancelled login
        }

        console.log(
          "[DatalayerJupyterServerProvider] Authentication successful",
        );
        // Update auth state
        this.isAuthenticated = true;
      } catch (error) {
        console.error("[DatalayerJupyterServerProvider] Login error:", error);
        vscode.window.showErrorMessage(
          `Authentication failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
        return undefined;
      }
    }

    try {
      console.log(
        "[DatalayerJupyterServerProvider] Executing command:",
        command.label,
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
      vscode.window.showErrorMessage(
        `Failed to create runtime: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      return undefined;
    }
  }

  /**
   * Create GPU runtime flow
   */
  private async createGpuRuntime(): Promise<JupyterServer | undefined> {
    console.log("[DatalayerJupyterServerProvider] createGpuRuntime started");

    try {
      const { EnvironmentCache } =
        await import("../services/cache/environmentCache");
      const { createRuntime } = await import("../ui/dialogs/runtimeSelector");

      // Get GPU environment
      console.log(
        "[DatalayerJupyterServerProvider] Fetching GPU environment...",
      );
      const environments = await EnvironmentCache.getInstance().getEnvironments(
        this.sdk,
        this.authProvider,
      );
      console.log(
        "[DatalayerJupyterServerProvider] Available environments:",
        environments.map((e) => e.name),
      );

      const gpuEnv = environments.find((e) => e.name === "ai-env");

      if (!gpuEnv) {
        console.error(
          "[DatalayerJupyterServerProvider] GPU environment 'ai-env' not found",
        );
        vscode.window.showErrorMessage("GPU environment not found on platform");
        return undefined;
      }

      // Show creation flow (snapshot, name, duration)
      console.log("[DatalayerJupyterServerProvider] Showing creation flow...");
      const runtime = await createRuntime(this.sdk, gpuEnv);
      if (!runtime) {
        console.log(
          "[DatalayerJupyterServerProvider] User cancelled runtime creation",
        );
        return undefined; // User cancelled
      }

      console.log(
        "[DatalayerJupyterServerProvider] Runtime created:",
        runtime.uid,
      );

      // Create controller for new runtime
      await this.controllerManager.ensureRuntimeController(runtime);

      // Refresh server list to show new runtime
      this.serverChangeEmitter.fire();

      vscode.window.showInformationMessage(
        `Runtime "${runtime.givenName || runtime.podName}" created successfully!`,
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
   * Create CPU runtime flow
   */
  private async createCpuRuntime(): Promise<JupyterServer | undefined> {
    console.log("[DatalayerJupyterServerProvider] createCpuRuntime started");

    try {
      const { EnvironmentCache } =
        await import("../services/cache/environmentCache");
      const { createRuntime } = await import("../ui/dialogs/runtimeSelector");

      // Get CPU environment
      console.log(
        "[DatalayerJupyterServerProvider] Fetching CPU environment...",
      );
      const environments = await EnvironmentCache.getInstance().getEnvironments(
        this.sdk,
        this.authProvider,
      );
      console.log(
        "[DatalayerJupyterServerProvider] Available environments:",
        environments.map((e) => e.name),
      );

      const cpuEnv = environments.find((e) => e.name === "python-cpu-env");

      if (!cpuEnv) {
        console.error(
          "[DatalayerJupyterServerProvider] CPU environment 'python-cpu-env' not found",
        );
        vscode.window.showErrorMessage("CPU environment not found on platform");
        return undefined;
      }

      // Show creation flow
      console.log("[DatalayerJupyterServerProvider] Showing creation flow...");
      const runtime = await createRuntime(this.sdk, cpuEnv);
      if (!runtime) {
        console.log(
          "[DatalayerJupyterServerProvider] User cancelled runtime creation",
        );
        return undefined;
      }

      console.log(
        "[DatalayerJupyterServerProvider] Runtime created:",
        runtime.uid,
      );

      // Create controller for new runtime
      await this.controllerManager.ensureRuntimeController(runtime);

      // Refresh server list
      this.serverChangeEmitter.fire();

      vscode.window.showInformationMessage(
        `Runtime "${runtime.givenName || runtime.podName}" created successfully!`,
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
   * Convert Datalayer RuntimeDTO to JupyterServer with connection information
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
   * Cleanup
   */
  dispose(): void {
    this.authStateListener.dispose();
    this.serverCollection.dispose();
    this.serverChangeEmitter.dispose();
  }

  /**
   * Event that fires when server list changes
   */
  get onDidChangeServers(): vscode.Event<void> {
    return this.serverChangeEmitter.event;
  }
}
