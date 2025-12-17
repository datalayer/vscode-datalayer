/*
 * Copyright (c) 2021-2023 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Runtime selector showing QuickPick with creation commands and controllers.
 * Displays when "Datalayer" is selected from kernel picker.
 *
 * @module ui/selectors/runtimeSelector
 */

import * as vscode from "vscode";
import type { DatalayerClient } from "@datalayer/core/lib/client";
import type { RuntimeDTO } from "@datalayer/core/lib/models/RuntimeDTO";
import type { SDKAuthProvider } from "../../services/core/authProvider";
import type { SmartDynamicControllerManager } from "../../providers/smartDynamicControllerManager";

/**
 * QuickPick item for runtime selection
 */
interface RuntimeQuickPickItem extends vscode.QuickPickItem {
  /** Item type: controller, command, or separator */
  type: "controller" | "command" | "separator";
  /** Controller ID for controller items */
  controllerId?: string;
  /** Command function for command items */
  commandFn?: () => Promise<void>;
}

/**
 * Selector for Datalayer runtimes and Pyodide.
 * Shows a QuickPick with create commands + controllers.
 *
 * Architecture Pattern:
 * - Modeled after vscode-jupyter's LocalPythonKernelSelector
 * - Shows single QuickPick dialog (not nested menus)
 * - Mixes command items (Create GPU/CPU) with controller items (Runtimes, Pyodide)
 * - Command items execute creation flows
 * - Controller items activate existing controllers
 */
export class DatalayerRuntimeSelector {
  private readonly sdk: DatalayerClient;
  private readonly authProvider: SDKAuthProvider;
  private readonly controllerManager: SmartDynamicControllerManager;

  constructor(
    sdk: DatalayerClient,
    authProvider: SDKAuthProvider,
    controllerManager: SmartDynamicControllerManager,
  ) {
    this.sdk = sdk;
    this.authProvider = authProvider;
    this.controllerManager = controllerManager;
  }

  /**
   * Show runtime selector QuickPick.
   * Entry point called from 'datalayer.selectRuntime' command.
   *
   * @param notebook - The notebook document to select runtime for
   */
  public async selectRuntime(notebook: vscode.NotebookDocument): Promise<void> {
    // Check authentication first
    if (!this.authProvider.isAuthenticated()) {
      const { promptAndLogin } = await import("../dialogs/authDialog");
      await promptAndLogin("Datalayer Runtime Selection");
      if (!this.authProvider.isAuthenticated()) {
        // User cancelled login
        return;
      }
    }

    // Build QuickPick items
    const items = await this.buildQuickPickItems();

    // Create QuickPick
    const quickPick = vscode.window.createQuickPick<RuntimeQuickPickItem>();
    quickPick.title = "Select Datalayer Runtime";
    quickPick.placeholder = "Choose a runtime or create a new one";
    quickPick.items = items;
    quickPick.ignoreFocusOut = true;

    // Handle selection
    quickPick.onDidAccept(async () => {
      const selected = quickPick.selectedItems[0];
      if (!selected) {
        quickPick.hide();
        return;
      }

      if (selected.type === "command") {
        // Execute command (Create GPU/CPU)
        quickPick.busy = true;
        try {
          await selected.commandFn!();
          quickPick.hide();
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to create runtime: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
          quickPick.busy = false;
        }
      } else if (selected.type === "controller") {
        // Select controller
        const controller = this.controllerManager.getController(
          selected.controllerId!,
        );
        if (controller) {
          await controller.updateNotebookAffinity(
            notebook,
            vscode.NotebookControllerAffinity.Preferred,
          );
          vscode.window.showInformationMessage(
            `Switched to: ${controller.label.replace("Datalayer: ", "")}`,
          );
        }
        quickPick.hide();
      }
    });

    quickPick.show();
  }

  /**
   * Build QuickPick items: commands + controllers.
   *
   * Order:
   * 1. Create GPU Runtime (command)
   * 2. Create CPU Runtime (command)
   * 3. Separator
   * 4. Active runtime controllers (dynamic)
   * 5. Pyodide controller (static)
   *
   * @returns Array of QuickPick items
   */
  private async buildQuickPickItems(): Promise<RuntimeQuickPickItem[]> {
    const items: RuntimeQuickPickItem[] = [];

    // Add creation commands at top
    items.push({
      label: "$(add) Create GPU Runtime",
      description: "Launch AI environment on Datalayer platform",
      type: "command",
      commandFn: () => this.createGpuRuntime(),
    });

    items.push({
      label: "$(add) Create CPU Runtime",
      description: "Launch Python CPU environment",
      type: "command",
      commandFn: () => this.createCpuRuntime(),
    });

    // Add separator
    items.push({
      label: "",
      kind: vscode.QuickPickItemKind.Separator,
      type: "separator",
    });

    // Add runtime controllers
    const runtimes = await this.getRuntimes();
    for (const runtime of runtimes) {
      const controllerId = `datalayer-runtime-${runtime.uid}`;
      const controller = this.controllerManager.getController(controllerId);

      if (controller) {
        items.push({
          label: controller.label,
          description: controller.description || "",
          detail: controller.detail || "",
          type: "controller",
          controllerId: controllerId,
        });
      }
    }

    // Add Pyodide controller
    const pyodideController =
      this.controllerManager.getController("datalayer-pyodide");
    if (pyodideController) {
      items.push({
        label: pyodideController.label,
        description: pyodideController.description || "",
        detail: pyodideController.detail || "",
        type: "controller",
        controllerId: "datalayer-pyodide",
      });
    }

    return items;
  }

  /**
   * Get active runtimes from platform.
   *
   * @returns Array of runtime DTOs
   */
  private async getRuntimes(): Promise<RuntimeDTO[]> {
    try {
      return await this.sdk.listRuntimes();
    } catch (error) {
      console.error(
        "[DatalayerRuntimeSelector] Failed to list runtimes:",
        error,
      );
      return [];
    }
  }

  /**
   * Create GPU runtime.
   * Shows creation flow (snapshot, name, duration) and auto-connects.
   */
  private async createGpuRuntime(): Promise<void> {
    const { EnvironmentCache } = await import(
      "../../services/cache/environmentCache"
    );
    const { createRuntime } = await import("../dialogs/runtimeSelector");

    // Get GPU environment
    const environments = await EnvironmentCache.getInstance().getEnvironments(
      this.sdk,
      this.authProvider,
    );
    const gpuEnv = environments.find((e) => e.name === "ai-env");

    if (!gpuEnv) {
      vscode.window.showErrorMessage("GPU environment not found on platform");
      return;
    }

    // Show creation flow (snapshot, name, duration)
    const runtime = await createRuntime(this.sdk, gpuEnv);
    if (!runtime) {
      return; // User cancelled
    }

    // Create controller and auto-select
    await this.controllerManager.ensureRuntimeController(runtime);

    vscode.window.showInformationMessage(
      `Runtime "${runtime.givenName || runtime.podName}" created successfully!`,
    );
  }

  /**
   * Create CPU runtime.
   * Shows creation flow (snapshot, name, duration) and auto-connects.
   */
  private async createCpuRuntime(): Promise<void> {
    const { EnvironmentCache } = await import(
      "../../services/cache/environmentCache"
    );
    const { createRuntime } = await import("../dialogs/runtimeSelector");

    // Get CPU environment
    const environments = await EnvironmentCache.getInstance().getEnvironments(
      this.sdk,
      this.authProvider,
    );
    const cpuEnv = environments.find((e) => e.name === "python-cpu-env");

    if (!cpuEnv) {
      vscode.window.showErrorMessage("CPU environment not found on platform");
      return;
    }

    // Show creation flow
    const runtime = await createRuntime(this.sdk, cpuEnv);
    if (!runtime) {
      return;
    }

    // Create controller and auto-select
    await this.controllerManager.ensureRuntimeController(runtime);

    vscode.window.showInformationMessage(
      `Runtime "${runtime.givenName || runtime.podName}" created successfully!`,
    );
  }
}
