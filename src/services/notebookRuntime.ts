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
import type { Runtime } from "../../../core/lib/index.js";
import { ExtensionMessage } from "../utils/messages";
import { SDKAuthProvider } from "./authProvider";
import { getSDKInstance } from "./sdkAdapter";
import { setRuntime } from "../utils/runtimeSelector";

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
   * @param message - Extension message triggering the selection
   */
  async handleRuntimeSelection(
    webview: vscode.WebviewPanel,
    message: ExtensionMessage
  ): Promise<void> {
    try {
      const authService = SDKAuthProvider.getInstance();
      const sdk = getSDKInstance();

      // Check if authenticated
      const authState = authService.getAuthState();
      if (!authState.isAuthenticated) {
        vscode.window.showErrorMessage("Please login to Datalayer first");
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
            return await (sdk as any).listRuntimes();
          }
        );
      } catch (error) {
        console.error("[NotebookRuntime] Error loading runtimes:", error);

        // Check if it's a token expiration error
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        if (errorMessage.includes("expired") || errorMessage.includes("401")) {
          vscode.window
            .showErrorMessage(
              "Authentication expired. Please logout and login again.",
              "Logout"
            )
            .then((selection) => {
              if (selection === "Logout") {
                vscode.commands.executeCommand("datalayer.logout");
              }
            });
        } else {
          vscode.window.showErrorMessage(
            `Failed to load runtimes: ${errorMessage}`
          );
        }
        return;
      }

      // Create quick pick items
      const items: vscode.QuickPickItem[] = [];

      // Add existing runtimes
      if (runtimes && runtimes.length > 0) {
        runtimes.forEach((runtime) => {
          const statusIcon =
            runtime.status === "running" || runtime.status === "ready"
              ? "$(vm-active)"
              : "$(vm-outline)";
          const creditsUsed = (runtime as any).credits_used || 0;
          const creditsLimit =
            (runtime as any).credits_limit || runtime.credits || 10;

          const item: any = {
            label: `${statusIcon} ${
              runtime.given_name || runtime.podName || "Runtime"
            }`,
            description: `${runtime.status} • ${creditsUsed}/${creditsLimit} credits`,
            detail: `Environment: ${
              runtime.environment_name || "python-cpu-env"
            }`,
          };
          item.runtime = runtime;
          items.push(item);
        });

        // Add separator
        items.push({
          label: "",
          kind: vscode.QuickPickItemKind.Separator,
        } as vscode.QuickPickItem);
      }

      // Add create options
      const cpuItem: any = {
        label: "$(add) Create CPU Runtime",
        description: "Python CPU Environment",
        detail: "Create a new runtime with CPU resources",
      };
      cpuItem.action = "create-cpu";
      items.push(cpuItem);

      const aiItem: any = {
        label: "$(add) Create AI Runtime",
        description: "Python AI Environment",
        detail: "Create a new runtime with GPU resources for AI/ML workloads",
      };
      aiItem.action = "create-ai";
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
      const selectedAny = selected as any;
      if (selectedAny.runtime) {
        // Use existing runtime
        const runtime = selectedAny.runtime as Runtime;
        this.sendRuntimeToWebview(webview, runtime);
      } else if (selectedAny.action) {
        // Create new runtime
        const environment =
          selectedAny.action === "create-ai" ? "ai-env" : "python-cpu-env";

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Creating runtime...",
            cancellable: false,
          },
          async () => {
            const config =
              vscode.workspace.getConfiguration("datalayer.runtime");
            const creditsLimit = config.get<number>("creditsLimit", 10);

            const newRuntime = await (sdk as any).createRuntime(
              creditsLimit,
              "notebook",
              `VSCode ${
                selectedAny.action === "create-ai" ? "AI" : "CPU"
              } Runtime`,
              environment
            );

            if (newRuntime) {
              // Wait for runtime to be ready
              let retries = 0;
              const maxRetries = 10;
              while (retries < maxRetries && newRuntime.podName) {
                await new Promise((resolve) => setTimeout(resolve, 3000));
                const updatedRuntime = await (sdk as any).getRuntime(
                  newRuntime.podName
                );
                if (updatedRuntime?.ingress && updatedRuntime?.token) {
                  this.sendRuntimeToWebview(webview, updatedRuntime);
                  vscode.window.showInformationMessage(
                    "Runtime created successfully"
                  );
                  return;
                }
                retries++;
              }

              // Use whatever we have if not fully ready
              this.sendRuntimeToWebview(webview, newRuntime);
              vscode.window.showWarningMessage(
                "Runtime created but may not be fully ready"
              );
            }
          }
        );
      }
    } catch (error) {
      console.error("[NotebookRuntime] Error in runtime selection:", error);
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
    message: ExtensionMessage
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
              message.id
            );
          }
        })
        .catch((reason: any) => {
          console.error("Failed to get a server URL:", reason);
        });
    }
  }

  /**
   * Sends runtime information to the webview.
   * Formats runtime data for webview consumption.
   *
   * @param webview - Target webview panel
   * @param runtime - Runtime instance to send
   */
  private sendRuntimeToWebview(
    webview: vscode.WebviewPanel,
    runtime: Runtime
  ): void {
    this.postMessage(webview, "runtime-selected", {
      runtime: {
        uid: runtime.uid,
        name: runtime.given_name || runtime.podName,
        status: runtime.status,
        url: runtime.ingress,
        token: runtime.token,
        environment: runtime.environment_name,
        creditsUsed: (runtime as any).credits_used || 0,
        creditsLimit: (runtime as any).credits_limit || runtime.credits || 10,
      },
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
    body: any,
    id?: string
  ): void {
    panel.webview.postMessage({ type, body, id });
  }
}
