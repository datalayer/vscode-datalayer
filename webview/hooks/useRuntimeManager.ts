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
import { createLocalKernelServiceManager } from "../services/localKernelServiceManager";
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

  /**
   * Select a runtime and update the underlying service manager.
   * The MutableServiceManager reference stays stable - no component re-renders!
   */
  const selectRuntime = useCallback((runtime: RuntimeJSON | undefined) => {
    setSelectedRuntime(runtime);

    if (runtime?.ingress) {
      // Detect local kernel runtimes using shared utility
      const isLocalKernel = isLocalKernelUrl(runtime.ingress);

      if (isLocalKernel) {
        console.log(
          `[useRuntimeManager] Detected local kernel runtime: ${runtime.ingress}`,
        );

        // Extract kernel ID from URL (format: http://local-kernel-<kernelId>.localhost)
        const kernelId = runtime.ingress.match(/local-kernel-([^.]+)/)?.[1];
        if (!kernelId) {
          console.error(
            `[useRuntimeManager] Could not extract kernel ID from URL: ${runtime.ingress}`,
          );
          mutableManagerRef.current?.resetToMock();
          return;
        }

        console.log(
          `[useRuntimeManager] Creating LocalKernelServiceManager for kernel ${kernelId}`,
        );

        // Create LocalKernelServiceManager
        const localServiceManager = createLocalKernelServiceManager(
          kernelId,
          runtime.environmentName || "python3", // Use environment name as kernel name
          runtime.ingress,
        );

        console.log(
          `[useRuntimeManager] LocalKernelServiceManager created successfully`,
        );

        // Update the MutableServiceManager with the local service manager using public method
        if (mutableManagerRef.current) {
          mutableManagerRef.current.updateServiceManager(localServiceManager);
          console.log(
            `[useRuntimeManager] MutableServiceManager updated with LocalKernelServiceManager`,
          );
        } else {
          console.error(
            `[useRuntimeManager] mutableManagerRef.current is null!`,
          );
        }
      } else {
        // Regular remote runtime - use standard connection
        mutableManagerRef.current?.updateConnection(
          runtime.ingress,
          runtime.token || "",
        );
      }
    } else {
      // Reset to mock service manager (reference stays stable)
      mutableManagerRef.current?.resetToMock();
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
  };
}
