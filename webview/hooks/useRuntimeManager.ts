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

import type { RuntimeJSON } from "@datalayer/core/lib/client";
import type { ServiceManager } from "@jupyterlab/services";
import { useCallback, useRef, useState } from "react";

import { isLocalKernelUrl } from "../../src/constants/kernelConstants";
import { MutableServiceManager } from "../services/mutableServiceManager";

/**
 * Manages runtime selection and service manager lifecycle using MutableServiceManager for stable references that prevent Notebook2 re-renders.
 * @param initialRuntime - Optional initial runtime to connect on mount.
 *
 * @returns Runtime state and selection function.
 *
 */
/** Return value from the useRuntimeManager hook. */
export interface UseRuntimeManagerResult {
  /** The currently selected Datalayer runtime, or undefined if none. */
  selectedRuntime: RuntimeJSON | undefined;
  /** Stable JupyterLab ServiceManager proxy that survives runtime swaps. */
  serviceManager: ServiceManager.IManager;
  /** Switches the active runtime, updating the underlying service manager without re-renders. */
  selectRuntime: (runtime: RuntimeJSON | undefined) => void;
  /** Direct access to the MutableServiceManager for advanced operations. */
  mutableServiceManager: MutableServiceManager;
}

/**
 * Manages runtime selection and ServiceManager lifecycle with stable proxy references.
 * @param initialRuntime - Optional runtime to connect on mount.
 *
 * @returns Runtime state and selection controls.
 */
export function useRuntimeManager(
  initialRuntime?: RuntimeJSON,
): UseRuntimeManagerResult {
  // Create MutableServiceManager once - stable reference throughout component lifecycle
  const mutableManagerRef = useRef<MutableServiceManager | null>(null);

  // Track if current runtime is remote (for force-close on termination)
  const isRemoteRuntimeRef = useRef(false);

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
        isRemoteRuntimeRef.current = false;
        mutableManagerRef.current?.updateToPyodide();
        // No need to start kernel here - Pyodide starts on first execution
      } else if (isLocalKernel) {
        isRemoteRuntimeRef.current = false;
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
        isRemoteRuntimeRef.current = true; // Track that this is a remote runtime
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
      // For remote/Datalayer runtimes that were terminated on the server,
      // use force-close to avoid CORS errors from API calls to dead servers
      const shouldForceClose = isRemoteRuntimeRef.current;
      isRemoteRuntimeRef.current = false; // Reset tracking
      mutableManagerRef.current?.updateToMock(shouldForceClose);
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
