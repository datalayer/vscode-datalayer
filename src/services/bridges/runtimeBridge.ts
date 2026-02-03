/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Service for handling runtime and kernel lifecycle operations.
 * Manages runtime selection, termination, and expiration across document providers.
 *
 * @module services/bridges/runtimeBridge
 */

import * as vscode from "vscode";
import type { ExtensionMessage } from "../../types/vscode/messages";
import type { DocumentContext } from "../messaging/types";
import { BaseService } from "../core/baseService";
import { ServiceLoggers } from "../logging/loggers";
import { getServiceContainer } from "../../extension";
import { SDKAuthProvider } from "../core/authProvider";
import { showKernelSelector } from "../../ui/dialogs/kernelSelector";
import { getConnectedRuntime } from "../../commands";
import {
  showTwoStepConfirmation,
  CommonConfirmations,
} from "../../ui/dialogs/confirmationDialog";

/**
 * Callback for handling kernel selection fallback.
 * Invoked when kernel selector fails.
 */
export type KernelSelectionFallback = (documentUri: vscode.Uri) => void;

/**
 * Bridges runtime lifecycle operations between webviews and the extension.
 * Encapsulates runtime selection, termination, and expiration logic shared by providers.
 */
export class RuntimeBridgeService extends BaseService {
  private _kernelSelectionFallback?: KernelSelectionFallback;

  /**
   * Creates a new RuntimeBridgeService instance.
   */
  constructor() {
    super(
      "RuntimeBridgeService",
      ServiceLoggers.getLogger("RuntimeBridgeService"),
    );
  }

  /**
   * Initializes the runtime bridge service.
   * No-op for now as the service is stateless.
   */
  protected async onInitialize(): Promise<void> {
    // No initialization needed
  }

  /**
   * Cleans up runtime bridge resources.
   */
  protected async onDispose(): Promise<void> {
    // No cleanup needed
  }

  /**
   * Sets the fallback handler for kernel selection failures.
   * Only used by notebookProvider for Datalayer runtime selector.
   *
   * @param fallback - Callback to invoke when kernel selector fails
   */
  public setKernelSelectionFallback(fallback: KernelSelectionFallback): void {
    this._kernelSelectionFallback = fallback;
  }

  /**
   * Registers runtime-related message handlers with the DocumentMessageRouter.
   *
   * @param router - The message router to register handlers with
   */
  public registerRuntimeHandlers(router: {
    registerHandler: (
      type: string,
      handler: (
        message: ExtensionMessage,
        context: DocumentContext,
      ) => Promise<void>,
    ) => void;
  }): void {
    // Handler for runtime selection (select-runtime)
    router.registerHandler("select-runtime", async (_message, context) => {
      await this.handleRuntimeSelection(context);
    });

    // Handler for kernel selection (select-kernel) - same as select-runtime
    router.registerHandler("select-kernel", async (_message, context) => {
      await this.handleRuntimeSelection(context);
    });

    // Handler for runtime termination
    router.registerHandler("terminate-runtime", async (message, context) => {
      await this.handleRuntimeTermination(message, context);
    });

    // Handler for runtime expiration
    router.registerHandler("runtime-expired", async (message, context) => {
      await this.handleRuntimeExpiration(message, context);
    });

    // Handler for kernel interrupt
    router.registerHandler("interrupt-kernel", async (_message, context) => {
      await this.handleKernelInterrupt(context);
    });

    // Handler for kernel restart
    router.registerHandler("restart-kernel", async (_message, context) => {
      await this.handleKernelRestart(context);
    });
  }

  /**
   * Handles runtime/kernel selection requests.
   *
   * @param context - Document context
   */
  private async handleRuntimeSelection(
    context: DocumentContext,
  ): Promise<void> {
    const sdk = getServiceContainer().sdk;
    const authProvider = getServiceContainer().authProvider as SDKAuthProvider;
    const kernelBridge = getServiceContainer().kernelBridge;

    // Get current runtime for this document
    const documentUri = vscode.Uri.parse(context.documentUri);
    const currentRuntime = getConnectedRuntime(documentUri);

    try {
      await showKernelSelector(
        sdk,
        authProvider,
        kernelBridge,
        documentUri,
        currentRuntime,
      );
    } catch (error) {
      // Invoke fallback if available (only for notebooks)
      if (this._kernelSelectionFallback) {
        this._kernelSelectionFallback(documentUri);
      } else {
        console.error("Failed to select kernel:", error);
      }
    }
  }

  /**
   * Handles runtime termination requests.
   *
   * @param message - Extension message containing runtime info
   * @param context - Document context
   */
  private async handleRuntimeTermination(
    message: ExtensionMessage,
    context: DocumentContext,
  ): Promise<void> {
    const messageBody = message.body as { runtime?: unknown };
    const runtimeObj = messageBody?.runtime as {
      givenName?: string;
      environmentTitle?: string;
      environmentName?: string;
      uid?: string;
      podName?: string;
    };

    if (!runtimeObj) {
      return;
    }

    // Determine runtime name for display
    const runtimeName =
      runtimeObj.givenName ||
      runtimeObj.environmentTitle ||
      runtimeObj.environmentName ||
      runtimeObj.uid ||
      "Unknown";

    // Show confirmation dialog
    const confirmed = await showTwoStepConfirmation(
      CommonConfirmations.terminateRuntime(runtimeName),
    );

    if (!confirmed) {
      return;
    }

    try {
      const sdk = getServiceContainer().sdk;

      // Delete the runtime via SDK - MUST use pod_name, not uid!
      // If podName is missing, construct it from uid (format: runtime-{uid})
      const podName = runtimeObj.podName ?? `runtime-${runtimeObj.uid}`;
      await sdk.deleteRuntime(podName);

      // Notify user of success
      vscode.window.showInformationMessage(
        `Runtime "${runtimeName}" terminated successfully.`,
      );

      // Clear the kernel selection in the webview
      await context.webview.postMessage({
        type: "kernel-terminated",
      });

      // Clear the runtime from extension's tracking map
      const { clearConnectedRuntime } = await import("../../commands/internal");
      clearConnectedRuntime(vscode.Uri.parse(context.documentUri));
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(
        `Failed to terminate runtime: ${errorMessage}`,
      );
    }
  }

  /**
   * Handles runtime expiration notifications.
   *
   * @param message - Extension message containing runtime info
   * @param context - Document context
   */
  private async handleRuntimeExpiration(
    message: ExtensionMessage,
    context: DocumentContext,
  ): Promise<void> {
    const messageBody = message.body as { runtime?: unknown };
    const runtimeObj = messageBody?.runtime as {
      name?: string;
      givenName?: string;
      uid?: string;
    };

    if (!runtimeObj) {
      return;
    }

    const runtimeName =
      runtimeObj.name || runtimeObj.givenName || runtimeObj.uid || "Unknown";

    // Show notification that runtime expired
    const notificationPromise = vscode.window.showWarningMessage(
      `Runtime "${runtimeName}" has expired.`,
    );

    // Clear the kernel selection in the webview
    const postMessagePromise = context.webview.postMessage({
      type: "kernel-terminated",
    });

    // Clear the runtime from extension's tracking map
    const { clearConnectedRuntime } = await import("../../commands/internal");
    clearConnectedRuntime(vscode.Uri.parse(context.documentUri));

    // Wait for both operations
    await Promise.all([notificationPromise, postMessagePromise]);
  }

  /**
   * Handles kernel interrupt requests.
   * Sends SIGINT to the local kernel process.
   *
   * @param context - Document context
   */
  private async handleKernelInterrupt(context: DocumentContext): Promise<void> {
    const kernelBridge = getServiceContainer().kernelBridge;
    const documentUri = vscode.Uri.parse(context.documentUri);

    try {
      // Get the kernel client for this document
      const kernelClient = kernelBridge.getKernelForDocument(documentUri);

      if (!kernelClient) {
        this.logger.warn("No kernel client found for interrupt request");
        return;
      }

      this.logger.info("Interrupting kernel for document", {
        documentUri: documentUri.toString(),
      });

      // Call the kernel client's interrupt method (sends SIGINT to process)
      await kernelClient.interrupt();

      this.logger.info("Kernel interrupt request sent successfully");
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        "Failed to interrupt kernel",
        error instanceof Error ? error : new Error(errorMessage),
      );
      vscode.window.showErrorMessage(
        `Failed to interrupt kernel: ${errorMessage}`,
      );
    }
  }

  /**
   * Handles kernel restart requests.
   * Currently not implemented for local kernels and runtimes.
   *
   * @param _context - Document context (unused)
   */
  private async handleKernelRestart(_context: DocumentContext): Promise<void> {
    this.logger.warn(
      "Kernel restart not implemented for local kernels and runtimes",
    );

    vscode.window.showWarningMessage(
      "Kernel restart is not yet implemented. Please terminate and manually select a kernel to restart.",
    );
  }
}
