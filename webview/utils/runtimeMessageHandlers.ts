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
import { disableKernelReconnect } from "@datalayer/jupyter-react";
import {
  type MutableServiceManager,
  markRuntimeUrlExpired,
} from "../services/mutableServiceManager";

/**
 * Callback function type for runtime selection.
 * Both editors should implement this to update their runtime state.
 * MUST be awaited to ensure clean service manager disposal.
 */
export type RuntimeSelectCallback = (
  runtime: RuntimeJSON | undefined,
) => Promise<void>;

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
 *   await handleRuntimeSelected(message, selectRuntime, (rt) => store.getState().setRuntime(rt), setKernelInitializing);
 *   break;
 * ```
 */
export async function handleRuntimeSelected(
  message: KernelSelectedMessage | RuntimeSelectedMessage,
  selectRuntime: RuntimeSelectCallback,
  updateStore?: RuntimeSelectCallback,
  setKernelInitializing?: KernelInitializingCallback,
): Promise<void> {
  const { body } = message;

  if (body?.runtime) {
    // CRITICAL: Check if runtime URL has been marked as expired/terminated
    // This prevents creating new ServiceManager with dead server URLs
    if (body.runtime.ingress) {
      const { isRuntimeUrlExpired } = await import(
        "../services/mutableServiceManager"
      );
      const isExpired = isRuntimeUrlExpired(body.runtime.ingress);

      if (isExpired) {
        console.warn(
          `[RuntimeMessageHandlers] Blocked runtime-selected for expired URL: ${body.runtime.ingress}`,
        );
        return; // Don't select expired runtimes
      }
    }

    await selectRuntime(body.runtime);
    await updateStore?.(body.runtime);

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
  }
}

/**
 * Handler for kernel-terminated and runtime-terminated messages.
 * Clears the current runtime with a small delay to ensure cleanup.
 *
 * @param selectRuntime - Callback to update runtime state (from useRuntimeManager)
 * @param updateStore - Optional callback to update editor-specific store
 * @param setKernelInitializing - Optional callback to clear kernel initialization state
 * @param delay - Delay in ms before clearing runtime (default: 100ms)
 *
 * @example
 * ```typescript
 * case "kernel-terminated":
 * case "runtime-terminated":
 *   handleRuntimeTerminated(selectRuntime, (rt) => store.getState().setRuntime(rt), setKernelInitializing);
 *   break;
 * ```
 */
export function handleRuntimeTerminated(
  selectRuntime: RuntimeSelectCallback,
  updateStore?: RuntimeSelectCallback,
  setKernelInitializing?: KernelInitializingCallback,
  delay: number = 100,
): void {
  setTimeout(async () => {
    // Clear kernel initializing state to revert UI to "Select Runtime" mode
    if (setKernelInitializing) {
      setKernelInitializing(false);
    }

    await selectRuntime(undefined);
    await updateStore?.(undefined);
  }, delay);
}

/**
 * Handler for runtime-pre-termination messages.
 * Called BEFORE runtime terminates (e.g., 5 seconds early) to gracefully shutdown
 * connections while the server is still alive. This prevents CORS/502 errors.
 *
 * @param selectRuntime - Callback to update runtime state (from useRuntimeManager)
 * @param updateStore - Optional callback to update editor-specific store
 * @param mutableServiceManager - Optional service manager for kernel cleanup
 * @param currentRuntime - Current runtime to mark as expired
 * @param setKernelInitializing - Optional callback to clear kernel initialization state
 *
 * @example
 * ```typescript
 * case "runtime-pre-termination":
 *   await handleRuntimePreTermination(selectRuntime, (rt) => store.getState().setRuntime(rt), mutableServiceManager, currentRuntime, setKernelInitializing);
 *   break;
 * ```
 */
export async function handleRuntimePreTermination(
  selectRuntime: RuntimeSelectCallback,
  updateStore?: RuntimeSelectCallback,
  mutableServiceManager?: MutableServiceManager,
  currentRuntime?: RuntimeJSON,
  setKernelInitializing?: KernelInitializingCallback,
): Promise<void> {
  // Mark the current runtime URL as expired
  // This prevents reconnection attempts if the runtime is re-selected after termination
  if (currentRuntime?.ingress) {
    markRuntimeUrlExpired(currentRuntime.ingress);
  }

  // Skip shutdown() methods to avoid CORS errors
  // shutdown() internally calls refreshRunning() which hits the terminating server
  // Instead: just disable reconnect and let disposal close WebSockets
  if (mutableServiceManager) {
    const currentServiceManager = mutableServiceManager.current;
    if (currentServiceManager) {
      // Disable reconnect on ALL kernels (sessions + orphaned)
      disableKernelReconnect(currentServiceManager);
    }
  }

  // Clear kernel initializing state to revert UI to "Select Runtime" mode
  // Without this, the cell remains in a hanging/loading state after termination
  if (setKernelInitializing) {
    setKernelInitializing(false);
  }

  // Skip disposal and clear runtime
  // The server is already dead, so disposal would just cause CORS errors
  if (mutableServiceManager) {
    await mutableServiceManager.updateToMock(true); // Skip disposal - call on instance, not proxy
  }

  // Clear runtime state - this will update React but won't touch service manager
  await selectRuntime(undefined);
  await updateStore?.(undefined);
}

/**
 * Handler for runtime-expired messages.
 * Resets to mock service manager with a small delay.
 *
 * @param selectRuntime - Callback to update runtime state (from useRuntimeManager)
 * @param updateStore - Optional callback to update editor-specific store
 * @param setKernelInitializing - Optional callback to clear kernel initialization state
 * @param delay - Delay in ms before clearing runtime (default: 100ms)
 *
 * @example
 * ```typescript
 * case "runtime-expired":
 *   handleRuntimeExpired(selectRuntime, (rt) => store.getState().setRuntime(rt), setKernelInitializing);
 *   break;
 * ```
 */
export function handleRuntimeExpired(
  selectRuntime: RuntimeSelectCallback,
  updateStore?: RuntimeSelectCallback,
  setKernelInitializing?: KernelInitializingCallback,
  delay: number = 100,
): void {
  setTimeout(async () => {
    // Clear kernel initializing state to revert UI to "Select Runtime" mode
    if (setKernelInitializing) {
      setKernelInitializing(false);
    }

    await selectRuntime(undefined);
    await updateStore?.(undefined);
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
 *   await handleSetRuntime(message, selectRuntime, (rt) => store.getState().setRuntime(rt));
 *   break;
 * ```
 */
export async function handleSetRuntime(
  message: SetRuntimeMessage,
  selectRuntime: RuntimeSelectCallback,
  updateStore?: RuntimeSelectCallback,
): Promise<void> {
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

    await selectRuntime(runtimeInfo);
    await updateStore?.(runtimeInfo);
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
  mutableServiceManager?: MutableServiceManager,
  getCurrentRuntime?: () => RuntimeJSON | undefined,
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
      handleRuntimeTerminated(
        selectRuntime,
        updateStore,
        setKernelInitializing,
      ),

    /** Handler for runtime-pre-termination messages (5s before termination) */
    onRuntimePreTermination: () =>
      handleRuntimePreTermination(
        selectRuntime,
        updateStore,
        mutableServiceManager,
        getCurrentRuntime?.(),
        setKernelInitializing,
      ),

    /** Handler for runtime-expired messages */
    onRuntimeExpired: () =>
      handleRuntimeExpired(selectRuntime, updateStore, setKernelInitializing),

    /** Handler for set-runtime messages from local Jupyter server */
    onSetRuntime: (message: SetRuntimeMessage) =>
      handleSetRuntime(message, selectRuntime, updateStore),
  };
}
