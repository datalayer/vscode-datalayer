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
import type { RuntimeJSON } from "@datalayer/core/lib/client/models/Runtime";
import { MutableServiceManager } from "../services/mutableServiceManager";

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
      mutableManagerRef.current.updateConnection(
        initialRuntime.ingress,
        initialRuntime.token || "",
      );
    }
    // Otherwise starts with mock (default in MutableServiceManager constructor)
  }

  const [selectedRuntime, setSelectedRuntime] = useState<
    RuntimeJSON | undefined
  >(initialRuntime);

  const [kernelName, setKernelName] = useState<string | undefined>(undefined);

  /**
   * Select a runtime and update the underlying service manager.
   * The MutableServiceManager reference stays stable - no component re-renders!
   */
  const selectRuntime = useCallback((runtime: RuntimeJSON | undefined) => {
    setSelectedRuntime(runtime);
    setKernelName(undefined); // Clear kernel name when using runtime

    if (runtime?.ingress) {
      // Update underlying service manager (reference stays stable)
      mutableManagerRef.current?.updateConnection(
        runtime.ingress,
        runtime.token || "",
      );
    } else {
      // Reset to mock service manager (reference stays stable)
      mutableManagerRef.current?.resetToMock();
    }
  }, []);

  /**
   * Switch to Pyodide kernel for offline execution.
   * The MutableServiceManager reference stays stable - no component re-renders!
   */
  const selectPyodideRuntime = useCallback(async () => {
    console.log("[useRuntimeManager] Switching to Pyodide...");
    setSelectedRuntime(undefined); // Clear runtime info since Pyodide is local

    // Update service manager FIRST
    await mutableManagerRef.current?.updateToPyodide();

    console.log(
      "[useRuntimeManager] Pyodide service manager ready, setting kernel name",
    );

    // CRITICAL: Set kernel name AFTER service manager is ready
    // This triggers React re-render with new key, forcing Notebook2 to remount
    // with the Pyodide service manager already in place
    setKernelName("Pyodide");
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
    kernelName,
    serviceManager: serviceManagerProxy.current, // ✅ Stable reference - no Notebook2 re-renders!
    selectRuntime,
    selectPyodideRuntime,
  };
}
