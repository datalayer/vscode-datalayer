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
  RuntimeSelectedMessage,
  SetRuntimeMessage,
} from "../types/messages";

/**
 * Callback function type for runtime selection.
 * Both editors should implement this to update their runtime state.
 */
export type RuntimeSelectCallback = (runtime: RuntimeJSON | undefined) => void;

/**
 * Handler for kernel-selected and runtime-selected messages.
 * Extracts runtime from message and calls the selection callback.
 *
 * @param message - The kernel/runtime selected message from extension
 * @param selectRuntime - Callback to update runtime state (from useRuntimeManager)
 * @param updateStore - Optional callback to update editor-specific store
 *
 * @example
 * ```typescript
 * case "kernel-selected":
 * case "runtime-selected":
 *   handleRuntimeSelected(message, selectRuntime, (rt) => store.getState().setRuntime(rt));
 *   break;
 * ```
 */
export function handleRuntimeSelected(
  message: KernelSelectedMessage | RuntimeSelectedMessage,
  selectRuntime: RuntimeSelectCallback,
  updateStore?: RuntimeSelectCallback,
): void {
  const { body } = message;
  console.log(`[RuntimeHandler] Received ${message.type}:`, body?.runtime);

  if (body?.runtime) {
    console.log(
      `[RuntimeHandler] Setting runtime with ingress: ${body.runtime.ingress}`,
    );
    selectRuntime(body.runtime);
    updateStore?.(body.runtime);
  }
}

/**
 * Handler for kernel-terminated and runtime-terminated messages.
 * Clears the current runtime with a small delay to ensure cleanup.
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
  console.log("[RuntimeHandler] Runtime terminated - clearing runtime");

  setTimeout(() => {
    selectRuntime(undefined);
    updateStore?.(undefined);
  }, delay);
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
  console.log("[RuntimeHandler] Runtime expired - resetting to mock");

  setTimeout(() => {
    selectRuntime(undefined);
    updateStore?.(undefined);
  }, delay);
}

/**
 * Extended runtime type with credits information (for local Jupyter servers)
 */
export interface RuntimeWithCredits extends RuntimeJSON {
  creditsUsed?: number;
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
    console.log(
      `[RuntimeHandler] Setting local Jupyter server runtime: ${body.baseUrl}`,
    );

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
 * @param updateStore - Optional store update callback
 * @returns Object with handler methods for each message type
 *
 * @example
 * ```typescript
 * const runtimeHandlers = createRuntimeMessageHandlers(
 *   selectRuntime,
 *   (rt) => store.getState().setRuntime(rt)
 * );
 *
 * // In message handler:
 * switch (message.type) {
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
  updateStore?: RuntimeSelectCallback,
) {
  return {
    onRuntimeSelected: (
      message: KernelSelectedMessage | RuntimeSelectedMessage,
    ) => handleRuntimeSelected(message, selectRuntime, updateStore),

    onRuntimeTerminated: () =>
      handleRuntimeTerminated(selectRuntime, updateStore),

    onRuntimeExpired: () => handleRuntimeExpired(selectRuntime, updateStore),

    onSetRuntime: (message: SetRuntimeMessage) =>
      handleSetRuntime(message, selectRuntime, updateStore),
  };
}
