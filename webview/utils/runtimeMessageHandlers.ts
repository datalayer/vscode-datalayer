/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Shared utility functions for handling runtime-related messages from VS Code extension.
 * Both NotebookEditor and LexicalEditor can use these functions independently.
 *
 * @module utils/runtimeMessageHandlers
 */

import type { RuntimeJSON } from "@datalayer/core/lib/client";
import type {
  KernelSelectedMessage,
  KernelStartingMessage,
  RuntimeSelectedMessage,
  SetRuntimeMessage,
} from "../types/messages";

/**
 * Callback function type for runtime selection.
 * Both editors should implement this to update their runtime state.
 */
export type RuntimeSelectCallback = (runtime: RuntimeJSON | undefined) => void;

/**
 * Callback function type for kernel initialization state.
 * Called when kernel starts initializing or finishes initialization.
 */
export type KernelInitializingCallback = (isInitializing: boolean) => void;

/**
 * Handler for kernel-starting messages.
 * Signals that kernel initialization has started (before kernel is created).
 *
 * @param _message - The kernel-starting message from extension
 * @param setKernelInitializing - Callback to update initialization state
 *
 * @example
 * ```typescript
 * case "kernel-starting":
 *   handleKernelStarting(message, setKernelInitializing);
 *   break;
 * ```
 */
export function handleKernelStarting(
  _message: KernelStartingMessage,
  setKernelInitializing: KernelInitializingCallback,
): void {
  setKernelInitializing(true);
}

/**
 * Handler for kernel-selected and runtime-selected messages.
 * Extracts runtime from message and calls the selection callback.
 *
 * For Pyodide and Datalayer cloud runtimes, the spinner is kept visible
 * until the kernel monitoring code detects the kernel is ready (status='idle').
 * For local/remote kernels, the spinner is cleared immediately since they're
 * ready as soon as they're selected.
 *
 * @param message - The kernel/runtime selected message from extension
 * @param selectRuntime - Callback to update runtime state (from useRuntimeManager)
 * @param updateStore - Optional callback to update editor-specific store
 * @param setKernelInitializing - Optional callback to clear initialization state
 *
 * @example
 * ```typescript
 * case "kernel-selected":
 * case "runtime-selected":
 *   handleRuntimeSelected(message, selectRuntime, (rt) => store.getState().setRuntime(rt), setKernelInitializing);
 *   break;
 * ```
 */
export function handleRuntimeSelected(
  message: KernelSelectedMessage | RuntimeSelectedMessage,
  selectRuntime: RuntimeSelectCallback,
  updateStore?: RuntimeSelectCallback,
  setKernelInitializing?: KernelInitializingCallback,
): void {
  const { body } = message;

  if (body?.runtime) {
    selectRuntime(body.runtime);
    updateStore?.(body.runtime);

    // Detect runtime types that require async initialization
    const isPyodide = body.runtime.ingress === "http://pyodide-local";
    const isDatalayerCloud =
      body.runtime.ingress?.includes("datalayer.run") ||
      body.runtime.ingress?.includes("datalayer.cloud");

    // For Pyodide and Datalayer cloud kernels, keep the spinner visible
    // until the webview monitoring code detects the kernel is ready (status='idle')
    // For local/remote kernels, clear the spinner immediately since they're ready
    if (!isPyodide && !isDatalayerCloud) {
      setKernelInitializing?.(false);
    }
    // Spinner will be cleared by kernel monitoring code for Pyodide/Datalayer
  }
}

/**
 * Handler for kernel-terminated and runtime-terminated messages.
 * Clears the current runtime with a small delay to ensure cleanup.
 *
 * IMPORTANT: For Datalayer runtimes, this terminates the runtime on the server,
 * which causes the kernel URLs to become inaccessible. The jupyter-react Output
 * components will show CORS errors as they try to disconnect - this is expected
 * and unavoidable. The errors are harmless and will stop once cleanup completes.
 *
 * @param selectRuntime - Callback to update runtime state (from useRuntimeManager)
 * @param updateStore - Optional callback to update editor-specific store
 * @param delay - Delay in ms before clearing runtime (default: 100ms)
 *
 * @example
 * ```typescript
 * case "kernel-terminated":
 * case "runtime-terminated":
 *   handleRuntimeTerminated(selectRuntime, (rt) => store.getState().setRuntime(rt));
 *   break;
 * ```
 */
export function handleRuntimeTerminated(
  selectRuntime: RuntimeSelectCallback,
  updateStore?: RuntimeSelectCallback,
  delay: number = 100,
): void {
  // Immediately clear runtime to trigger cleanup in Output components
  // This stops cells from showing execution state
  selectRuntime(undefined);
  updateStore?.(undefined);

  // Note: We don't use setTimeout here anymore because:
  // 1. Setting runtime to undefined immediately stops new operations
  // 2. The jupyter-react Output components handle disposal asynchronously
  // 3. Any CORS errors during cleanup are expected and harmless
}

/**
 * Handler for runtime-expired messages.
 * Resets to mock service manager with a small delay.
 *
 * @param selectRuntime - Callback to update runtime state (from useRuntimeManager)
 * @param updateStore - Optional callback to update editor-specific store
 * @param delay - Delay in ms before clearing runtime (default: 100ms)
 *
 * @example
 * ```typescript
 * case "runtime-expired":
 *   handleRuntimeExpired(selectRuntime, (rt) => store.getState().setRuntime(rt));
 *   break;
 * ```
 */
export function handleRuntimeExpired(
  selectRuntime: RuntimeSelectCallback,
  updateStore?: RuntimeSelectCallback,
  delay: number = 100,
): void {
  setTimeout(() => {
    selectRuntime(undefined);
    updateStore?.(undefined);
  }, delay);
}

/**
 * Extended runtime type with credits information (for local Jupyter servers)
 */
export interface RuntimeWithCredits extends RuntimeJSON {
  /** Number of credits used */
  creditsUsed?: number;
  /** Credit limit */
  creditsLimit?: number;
}

/**
 * Handler for set-runtime messages (from local Jupyter server).
 * Creates a RuntimeJSON object from base URL and token.
 *
 * @param message - The set-runtime message from extension
 * @param selectRuntime - Callback to update runtime state (from useRuntimeManager)
 * @param updateStore - Optional callback to update editor-specific store
 *
 * @example
 * ```typescript
 * case "set-runtime":
 *   handleSetRuntime(message, selectRuntime, (rt) => store.getState().setRuntime(rt));
 *   break;
 * ```
 */
export function handleSetRuntime(
  message: SetRuntimeMessage,
  selectRuntime: RuntimeSelectCallback,
  updateStore?: RuntimeSelectCallback,
): void {
  const { body } = message;

  if (body.baseUrl) {
    const runtimeInfo: RuntimeWithCredits = {
      uid: "local-runtime",
      givenName: "Jupyter Server",
      ingress: body.baseUrl,
      token: body.token || "",
      podName: "local",
      environmentName: "jupyter",
      environmentTitle: "Jupyter",
      type: "notebook",
      burningRate: 0,
      startedAt: new Date().toISOString(),
      expiredAt: "",
    };

    selectRuntime(runtimeInfo);
    updateStore?.(runtimeInfo);
  }
}

/**
 * Create a unified message handler for all runtime-related messages.
 * Returns a function that can be used in a switch statement.
 *
 * @param selectRuntime - Callback from useRuntimeManager
 * @param setKernelInitializing - Callback to update kernel initialization state
 * @param updateStore - Optional store update callback
 * @returns Object with handler methods for each message type
 *
 * @example
 * ```typescript
 * const runtimeHandlers = createRuntimeMessageHandlers(
 *   selectRuntime,
 *   setKernelInitializing,
 *   (rt) => store.getState().setRuntime(rt)
 * );
 *
 * // In message handler:
 * switch (message.type) {
 *   case "kernel-starting":
 *     runtimeHandlers.onKernelStarting(message);
 *     break;
 *   case "kernel-selected":
 *   case "runtime-selected":
 *     runtimeHandlers.onRuntimeSelected(message);
 *     break;
 *   case "kernel-terminated":
 *   case "runtime-terminated":
 *     runtimeHandlers.onRuntimeTerminated();
 *     break;
 *   // ... etc
 * }
 * ```
 */
export function createRuntimeMessageHandlers(
  selectRuntime: RuntimeSelectCallback,
  setKernelInitializing: KernelInitializingCallback,
  updateStore?: RuntimeSelectCallback,
) {
  return {
    /** Handler for kernel-starting messages */
    onKernelStarting: (message: KernelStartingMessage) =>
      handleKernelStarting(message, setKernelInitializing),

    /** Handler for kernel-selected and runtime-selected messages */
    onRuntimeSelected: (
      message: KernelSelectedMessage | RuntimeSelectedMessage,
    ) =>
      handleRuntimeSelected(
        message,
        selectRuntime,
        updateStore,
        setKernelInitializing,
      ),

    /** Handler for kernel-terminated and runtime-terminated messages */
    onRuntimeTerminated: () =>
      handleRuntimeTerminated(selectRuntime, updateStore),

    /** Handler for runtime-expired messages */
    onRuntimeExpired: () => handleRuntimeExpired(selectRuntime, updateStore),

    /** Handler for set-runtime messages from local Jupyter server */
    onSetRuntime: (message: SetRuntimeMessage) =>
      handleSetRuntime(message, selectRuntime, updateStore),
  };
}
