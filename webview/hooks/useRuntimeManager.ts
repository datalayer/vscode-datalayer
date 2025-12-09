/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * @module hooks/useRuntimeManager
 * Manages runtime selection and service manager lifecycle.
 * Uses MutableServiceManager to prevent Notebook2 re-renders when switching runtimes.
 */

import { useState, useCallback, useRef } from "react";
import type { ServiceManager } from "@jupyterlab/services";
import type { RuntimeJSON } from "@datalayer/core/lib/client";
import { MutableServiceManager } from "../services/mutableServiceManager";
import { isLocalKernelUrl } from "../../src/constants/kernelConstants";

/**
 * Hook to manage runtime selection and service manager lifecycle.
 *
 * Uses MutableServiceManager to maintain a stable serviceManager reference,
 * preventing Notebook2 from re-rendering when runtimes are switched.
 * This is crucial for UX - prevents cell flickering and scroll position loss.
 *
 * @param initialRuntime - Optional initial runtime to use
 * @returns Runtime state and selection function
 *
 * @example
 * ```typescript
 * const { selectedRuntime, serviceManager, selectRuntime } = useRuntimeManager();
 *
 * // Select a runtime
 * selectRuntime(runtime);
 *
 * // Clear runtime (switch to mock)
 * selectRuntime(undefined);
 *
 * // serviceManager reference stays stable - no Notebook2 re-render!
 * ```
 */
export function useRuntimeManager(initialRuntime?: RuntimeJSON) {
  // Create MutableServiceManager once - stable reference throughout component lifecycle
  const mutableManagerRef = useRef<MutableServiceManager | null>(null);

  if (!mutableManagerRef.current) {
    mutableManagerRef.current = new MutableServiceManager();

    // Initialize with runtime if provided
    if (initialRuntime?.ingress) {
      // Detect local kernel runtimes using shared utility
      const isLocalKernel = isLocalKernelUrl(initialRuntime.ingress);

      if (isLocalKernel) {
        const kernelId =
          initialRuntime.ingress.match(/local-kernel-([^.]+)/)?.[1];
        if (kernelId) {
          mutableManagerRef.current.updateToLocal(
            kernelId,
            initialRuntime.environmentName || "python3",
            initialRuntime.ingress,
          );

          // Start the kernel to set _activeKernel (required for tool execution)
          mutableManagerRef.current.current.kernels
            .startNew()
            .catch((error) => {
              console.error(
                `[useRuntimeManager] Failed to start initial kernel:`,
                error,
              );
            });
        }
      } else {
        mutableManagerRef.current.updateToRemote(
          initialRuntime.ingress,
          initialRuntime.token || "",
        );

        // NOTE: For remote Datalayer runtimes, the kernel is already running on the server.
        // We don't call startNew() here - SessionContext will find the existing kernel.
      }
    }
    // Otherwise starts with mock (default in MutableServiceManager constructor)
  }

  const [selectedRuntime, setSelectedRuntime] = useState<
    RuntimeJSON | undefined
  >(initialRuntime);

  /**
   * Select a runtime and update the underlying service manager.
   * The MutableServiceManager reference stays stable - no component re-renders!
   */
  const selectRuntime = useCallback((runtime: RuntimeJSON | undefined) => {
    setSelectedRuntime(runtime);

    if (runtime?.ingress) {
      // Detect Pyodide runtimes (ingress === "http://pyodide-local")
      const isPyodide = runtime.ingress === "http://pyodide-local";

      // Detect local kernel runtimes using shared utility
      const isLocalKernel = isLocalKernelUrl(runtime.ingress);

      if (isPyodide) {
        mutableManagerRef.current?.updateToPyodide();
        // No need to start kernel here - Pyodide starts on first execution
      } else if (isLocalKernel) {
        // Extract kernel ID from URL (format: http://local-kernel-<kernelId>.localhost)
        const kernelId = runtime.ingress.match(/local-kernel-([^.]+)/)?.[1];
        if (!kernelId) {
          console.error(
            `[useRuntimeManager] Could not extract kernel ID from URL: ${runtime.ingress}`,
          );
          mutableManagerRef.current?.updateToMock();
          return;
        }

        // Switch to local kernel service manager
        mutableManagerRef.current?.updateToLocal(
          kernelId,
          runtime.environmentName || "python3",
          runtime.ingress,
        );

        // CRITICAL: Start the kernel to set _activeKernel
        // This is required for tool execution (e.g., executeCode) to work
        // UI execution works without this because it uses SessionContext,
        // but tool execution path checks serviceManager.kernels.running()
        if (mutableManagerRef.current) {
          mutableManagerRef.current.current.kernels
            .startNew()
            .catch((error) => {
              console.error(
                `[useRuntimeManager] Failed to start kernel:`,
                error,
              );
            });
        }
      } else {
        // Regular remote runtime - use standard connection
        mutableManagerRef.current?.updateToRemote(
          runtime.ingress,
          runtime.token || "",
        );

        // NOTE: For remote Datalayer runtimes, the kernel is already running on the server.
        // We DON'T call startNew() here because:
        // 1. The webview cannot make cross-origin HTTP requests (CORS policy blocks it)
        // 2. The kernel is already running - we just need to connect to it
        // 3. SessionContext will find the existing kernel via kernels.running()
        //
        // For local kernels, we DO need startNew() because we're creating a new kernel.
        // But for remote runtimes, the kernel is provisioned and started by the platform.
      }
    } else {
      // Reset to mock service manager (reference stays stable)
      mutableManagerRef.current?.updateToMock();
    }
  }, []);

  // Return the proxy for seamless integration
  // The proxy forwards all property access to the current underlying service manager
  const serviceManagerProxy = useRef<ServiceManager.IManager | null>(null);

  if (!serviceManagerProxy.current) {
    serviceManagerProxy.current =
      mutableManagerRef.current?.createProxy() as ServiceManager.IManager;
  }

  return {
    selectedRuntime,
    serviceManager: serviceManagerProxy.current, // ✅ Stable reference - no Notebook2 re-renders!
    selectRuntime,
    mutableServiceManager: mutableManagerRef.current, // Expose for direct access (e.g., updateToPyodide)
  };
}
