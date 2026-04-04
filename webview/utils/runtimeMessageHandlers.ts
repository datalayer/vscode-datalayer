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
 * Handles kernel-starting messages by setting the initialization flag to true before the kernel is created.
 * @param _message - The kernel-starting message from the extension.
 * @param setKernelInitializing - Callback to update the initialization state.
 *
 */
export function handleKernelStarting(
  _message: KernelStartingMessage,
  setKernelInitializing: KernelInitializingCallback,
): void {
  setKernelInitializing(true);
}

/**
 * Handles kernel-selected and runtime-selected messages by extracting the runtime, updating state, and managing spinner visibility per runtime type.
 * @param message - The kernel or runtime selected message from the extension.
 * @param selectRuntime - Callback to update runtime state from useRuntimeManager.
 * @param updateStore - Optional callback to update editor-specific store.
 * @param setKernelInitializing - Optional callback to clear the initialization state.
 *
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
 * Handles kernel-terminated and runtime-terminated messages by clearing the runtime immediately to stop further operations.
 * @param selectRuntime - Callback to update runtime state from useRuntimeManager.
 * @param updateStore - Optional callback to update editor-specific store.
 *
 */
export function handleRuntimeTerminated(
  selectRuntime: RuntimeSelectCallback,
  updateStore?: RuntimeSelectCallback,
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
 * Handles runtime-expired messages by resetting to mock service manager after a small delay.
 * @param selectRuntime - Callback to update runtime state from useRuntimeManager.
 * @param updateStore - Optional callback to update editor-specific store.
 * @param delay - Delay in milliseconds before clearing the runtime.
 *
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
 * Extended runtime type with credits information for local Jupyter servers.
 */
export interface RuntimeWithCredits extends RuntimeJSON {
  /** Number of credits consumed by the runtime. */
  creditsUsed?: number;
  /** Maximum number of credits available for the runtime. */
  creditsLimit?: number;
}

/**
 * Handles set-runtime messages from a local Jupyter server by creating a RuntimeJSON object.
 * @param message - The set-runtime message containing server base URL and token.
 * @param selectRuntime - Callback to update runtime state from useRuntimeManager.
 * @param updateStore - Optional callback to update editor-specific store.
 *
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
 * Creates a unified message handler object for all runtime-related messages, suitable for use in a switch statement.
 * @param selectRuntime - Callback from useRuntimeManager to update the active runtime.
 * @param setKernelInitializing - Callback to update the kernel initialization state.
 * @param updateStore - Optional callback to update editor-specific store.
 *
 * @returns Object with handler methods for each runtime message type.
 *
 */
/** Handler methods returned by createRuntimeMessageHandlers. */
export interface RuntimeMessageHandlers {
  /** Handles kernel-starting messages by setting the initialization flag. */
  onKernelStarting: (message: KernelStartingMessage) => void;
  /** Handles kernel-selected and runtime-selected messages to connect a runtime. */
  onRuntimeSelected: (
    message: KernelSelectedMessage | RuntimeSelectedMessage,
  ) => void;
  /** Clears the active runtime when it is terminated. */
  onRuntimeTerminated: () => void;
  /** Clears the active runtime when it expires. */
  onRuntimeExpired: () => void;
  /** Sets the active runtime from an explicit set-runtime message. */
  onSetRuntime: (message: SetRuntimeMessage) => void;
}

/**
 * Creates a set of message handlers for runtime lifecycle events shared by notebook and lexical editors.
 * @param selectRuntime - Callback to update the selected runtime in the component.
 * @param setKernelInitializing - Callback to toggle the kernel initialization spinner.
 * @param updateStore - Optional callback to update the Zustand store with runtime changes.
 *
 * @returns Handler methods for each runtime message type.
 */
export function createRuntimeMessageHandlers(
  selectRuntime: RuntimeSelectCallback,
  setKernelInitializing: KernelInitializingCallback,
  updateStore?: RuntimeSelectCallback,
): RuntimeMessageHandlers {
  return {
    /**
     * Delegates kernel-starting messages to set the initialization flag.
     * @param message - The kernel-starting message from the extension.
     *
     * @returns Nothing.
     */
    onKernelStarting: (message: KernelStartingMessage) =>
      handleKernelStarting(message, setKernelInitializing),

    /**
     * Delegates kernel-selected and runtime-selected messages to update the active runtime.
     * @param message - The kernel or runtime selected message.
     *
     * @returns Nothing.
     */
    onRuntimeSelected: (
      message: KernelSelectedMessage | RuntimeSelectedMessage,
    ) =>
      handleRuntimeSelected(
        message,
        selectRuntime,
        updateStore,
        setKernelInitializing,
      ),

    /** Delegates kernel-terminated and runtime-terminated messages to clear runtime state.
     * @returns Nothing.
     */
    onRuntimeTerminated: () =>
      handleRuntimeTerminated(selectRuntime, updateStore),

    /** Delegates runtime-expired messages to reset to mock service manager.
     * @returns Nothing.
     */
    onRuntimeExpired: () => handleRuntimeExpired(selectRuntime, updateStore),

    /**
     * Delegates set-runtime messages to configure a local Jupyter server connection.
     * @param message - The set-runtime message with server URL and token.
     *
     * @returns Nothing.
     */
    onSetRuntime: (message: SetRuntimeMessage) =>
      handleSetRuntime(message, selectRuntime, updateStore),
  };
}
