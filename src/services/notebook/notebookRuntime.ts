/*
 * Copyright (c) 2021-2023 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Notebook runtime selection and management service.
 * Provides UI for selecting existing runtimes or creating new ones with authentication.
 *
 * @module services/notebookRuntime
 */

import * as vscode from "vscode";
import type {
  Runtime,
  RuntimeJSON,
} from "../../../../core/lib/client/models/Runtime";
import { ExtensionMessage } from "../../types/vscode/messages";
import { getServiceContainer } from "../../extension";
import { setRuntime } from "../../ui/dialogs/runtimeSelector";
import { showAuthenticationError } from "../../ui/dialogs/authDialog";

/**
 * Singleton service for notebook runtime selection and management.
 * Handles UI interactions for runtime selection, creation, and configuration.
 *
 * @example
 * ```typescript
 * const service = NotebookRuntimeService.getInstance();
 * await service.handleRuntimeSelection(webview, message);
 * ```
 */
export class NotebookRuntimeService {
  private static instance: NotebookRuntimeService;

  static getInstance(): NotebookRuntimeService {
    if (!NotebookRuntimeService.instance) {
      NotebookRuntimeService.instance = new NotebookRuntimeService();
    }
    return NotebookRuntimeService.instance;
  }

  private constructor() {}

  /**
   * Handles runtime selection for Datalayer notebooks.
   * Shows QuickPick UI with existing runtimes and options to create new ones.
   *
   * @param webview - Target webview panel for runtime communication
   * @param _message - Extension message triggering the selection
   */
  async handleRuntimeSelection(
    webview: vscode.WebviewPanel,
    _message: ExtensionMessage,
  ): Promise<void> {
    try {
      const authService = getServiceContainer().authProvider;
      const sdk = getServiceContainer().sdk;

      // Check if authenticated
      const authState = authService.getAuthState();
      if (!authState.isAuthenticated) {
        showAuthenticationError("Notebook Runtime");
        return;
      }

      // Fetch existing runtimes
      let runtimes: Runtime[] = [];
      try {
        runtimes = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Loading runtimes...",
            cancellable: false,
          },
          async () => {
            return await sdk.listRuntimes();
          },
        );
      } catch (error) {
        // Check if it's a token expiration error
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        if (errorMessage.includes("expired") || errorMessage.includes("401")) {
          vscode.window
            .showErrorMessage(
              "Authentication expired. Please logout and login again.",
              "Logout",
            )
            .then((selection) => {
              if (selection === "Logout") {
                vscode.commands.executeCommand("datalayer.logout");
              }
            });
        } else {
          vscode.window.showErrorMessage(
            `Failed to load runtimes: ${errorMessage}`,
          );
        }
        return;
      }

      // Create quick pick items
      const items: vscode.QuickPickItem[] = [];

      // Add existing runtimes
      if (runtimes && runtimes.length > 0) {
        runtimes.forEach((runtime) => {
          const statusIcon = "$(vm-active)";
          const runtimeJSON = runtime.toJSON();
          // credits_used is not a formal API field, handle defensively
          const runtimeWithCredits = runtimeJSON as RuntimeJSON & {
            credits_used?: number;
            creditsLimit?: number;
          };
          const creditsUsed = runtimeWithCredits.credits_used ?? 0;
          const creditsLimit = runtimeWithCredits.creditsLimit ?? 10;
          const creditsInfo =
            creditsLimit > 0 ? ` • ${creditsUsed}/${creditsLimit} credits` : "";

          const item: vscode.QuickPickItem & { runtime: Runtime } = {
            label: `${statusIcon} ${
              runtime.givenName ?? runtime.podName ?? "Runtime"
            }`,
            description: `running${creditsInfo}`,
            detail: `Environment: ${
              runtime.environmentName ?? "python-cpu-env"
            }`,
            runtime: runtime,
          };
          items.push(item);
        });

        // Add separator
        items.push({
          label: "",
          kind: vscode.QuickPickItemKind.Separator,
        } as vscode.QuickPickItem);
      }

      // Add create options
      const cpuItem: vscode.QuickPickItem & { action: string } = {
        label: "$(add) Create CPU Runtime",
        description: "Python CPU Environment",
        detail: "Create a new runtime with CPU resources",
        action: "create-cpu",
      };
      items.push(cpuItem);

      const aiItem: vscode.QuickPickItem & { action: string } = {
        label: "$(add) Create AI Runtime",
        description: "Python AI Environment",
        detail: "Create a new runtime with GPU resources for AI/ML workloads",
        action: "create-ai",
      };
      items.push(aiItem);

      // Show quick pick
      const selected = await vscode.window.showQuickPick(items, {
        placeHolder:
          runtimes.length === 0
            ? "No runtimes found. Create a new one?"
            : "Select a runtime or create a new one",
        title: "Select Datalayer Runtime",
      });

      if (!selected) {
        return;
      }

      // Handle selection
      const selectedWithData = selected as vscode.QuickPickItem & {
        runtime?: Runtime;
        action?: string;
      };
      if (selectedWithData.runtime) {
        // Use existing runtime
        const runtime = selectedWithData.runtime;
        this.sendRuntimeToWebview(webview, runtime);
      } else if (selectedWithData.action) {
        // Create new runtime
        const environment =
          selectedWithData.action === "create-ai" ? "ai-env" : "python-cpu-env";

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Creating runtime...",
            cancellable: false,
          },
          async () => {
            const config =
              vscode.workspace.getConfiguration("datalayer.runtime");
            const defaultMinutes = config.get<number>("defaultMinutes", 10);

            // Fetch environments to get the actual burning rate
            const { EnvironmentCache } = await import(
              "../cache/environmentCache"
            );
            const envCache = EnvironmentCache.getInstance();
            const environments = await envCache.getEnvironments(
              sdk,
              authService,
            );

            // Find the selected environment
            const selectedEnv = environments.find((env: unknown) => {
              const envObj = env as { name?: string };
              return envObj.name === environment;
            });

            if (!selectedEnv) {
              if (environments.length === 0 && !authService.isAuthenticated()) {
                throw new Error(
                  `Please login to access environments. Environment ${environment} not found.`,
                );
              }
              throw new Error(`Environment ${environment} not found`);
            }

            // Calculate credits from minutes using SDK utility
            const creditsLimit = sdk.calculateCreditsRequired(
              defaultMinutes,
              selectedEnv.burningRate,
            );

            const newRuntime = await sdk.createRuntime(
              environment,
              "notebook",
              `VSCode ${
                selectedWithData.action === "create-ai" ? "AI" : "CPU"
              } Runtime`,
              creditsLimit,
            );

            if (newRuntime) {
              // Wait for runtime to be ready
              let retries = 0;
              const maxRetries = 10;
              while (retries < maxRetries && newRuntime.podName) {
                await new Promise((resolve) => setTimeout(resolve, 3000));
                const updatedRuntime = await sdk.getRuntime(newRuntime.podName);
                if (updatedRuntime?.ingress && updatedRuntime?.token) {
                  this.sendRuntimeToWebview(webview, updatedRuntime);
                  vscode.window.showInformationMessage(
                    "Runtime created successfully",
                  );
                  return;
                }
                retries++;
              }

              // Use whatever we have if not fully ready
              this.sendRuntimeToWebview(webview, newRuntime);
              vscode.window.showWarningMessage(
                "Runtime created but may not be fully ready",
              );
            }
          },
        );
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to select runtime: ${error}`);
    }
  }

  /**
   * Handles runtime selection for local notebooks.
   * Provides choice between Datalayer cloud runtimes and custom Jupyter server.
   *
   * @param webview - Target webview panel for runtime communication
   * @param message - Extension message triggering the selection
   */
  async handleLocalNotebookRuntimeSelection(
    webview: vscode.WebviewPanel,
    message: ExtensionMessage,
  ): Promise<void> {
    // Show quick pick with options
    const items: vscode.QuickPickItem[] = [
      {
        label: "$(cloud) Datalayer Runtimes",
        description: "Use a Datalayer cloud runtime",
        detail: "Select from existing runtimes or create a new one",
      },
      {
        label: "$(server) Jupyter Server URL",
        description: "Connect to a Jupyter server",
        detail: "Enter the URL of a running Jupyter server",
      },
    ];

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: "Select kernel source",
      title: "Select Kernel",
    });

    if (!selected) {
      return;
    }

    if (selected.label.includes("Datalayer Runtimes")) {
      // Use the existing Datalayer runtime selection
      this.handleRuntimeSelection(webview, message);
    } else if (selected.label.includes("Jupyter Server URL")) {
      // Show input box for Jupyter server URL
      setRuntime()
        .then((baseURL: string | undefined) => {
          if (baseURL) {
            const parsedURL = new URL(baseURL);
            const token = parsedURL.searchParams.get("token") ?? "";
            parsedURL.search = "";
            const baseUrl = parsedURL.toString();

            this.postMessage(
              webview,
              "set-runtime",
              {
                baseUrl,
                token,
              },
              message.id,
            );
          }
        })
        .catch((_reason: unknown) => {
          // Silently handle server URL errors
        });
    }
  }

  /**
   * Sends runtime information to the webview.
   * Uses the Runtime model's stable toJSON() interface.
   *
   * @param webview - Target webview panel
   * @param runtime - Runtime instance to send
   */
  private sendRuntimeToWebview(
    webview: vscode.WebviewPanel,
    runtime: Runtime,
  ): void {
    const runtimeData = runtime.toJSON();
    this.postMessage(webview, "runtime-selected", {
      runtime: runtimeData,
    });
  }

  /**
   * Posts a message to the webview.
   *
   * @param panel - Target webview panel
   * @param type - Message type identifier
   * @param body - Message payload
   * @param id - Optional message ID for correlation
   */
  private postMessage(
    panel: vscode.WebviewPanel,
    type: string,
    body: unknown,
    id?: string,
  ): void {
    panel.webview.postMessage({ type, body, id });
  }
}
