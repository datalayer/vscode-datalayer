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
            .then(() => {
              console.log(
                `[useRuntimeManager] ✓ Initial kernel started for ${kernelId}`,
              );
            })
            .catch((error) => {
              console.error(
                `[useRuntimeManager] ❌ Failed to start initial kernel:`,
                error,
              );
            });
        }
      } else {
        mutableManagerRef.current.updateToRemote(
          initialRuntime.ingress,
          initialRuntime.token || "",
        );

        // Start the kernel for remote runtime (avoid race condition with tool execution)
        mutableManagerRef.current.current.kernels
          .startNew({ name: initialRuntime.environmentName || "python3" })
          .then((kernel) => {
            console.log(
              `[useRuntimeManager] ✓ Initial remote kernel started:`,
              kernel.id,
            );
          })
          .catch((error) => {
            console.error(
              `[useRuntimeManager] ❌ Failed to start initial remote kernel:`,
              error,
            );
          });
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
          mutableManagerRef.current?.updateToMock();
          return;
        }

        console.log(
          `[useRuntimeManager] Switching to local kernel service manager for kernel ${kernelId}`,
        );

        // Switch to local kernel service manager
        mutableManagerRef.current?.updateToLocal(
          kernelId,
          runtime.environmentName || "python3",
          runtime.ingress,
        );

        console.log(
          `[useRuntimeManager] Successfully switched to LocalKernelServiceManager`,
        );

        // CRITICAL: Start the kernel to set _activeKernel
        // This is required for tool execution (e.g., executeCode) to work
        // UI execution works without this because it uses SessionContext,
        // but tool execution path checks serviceManager.kernels.running()
        if (mutableManagerRef.current) {
          mutableManagerRef.current.current.kernels
            .startNew()
            .then(() => {
              console.log(
                `[useRuntimeManager] ✓ Kernel started, _activeKernel is now set`,
              );
            })
            .catch((error) => {
              console.error(
                `[useRuntimeManager] ❌ Failed to start kernel:`,
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

        console.log(
          `[useRuntimeManager] Successfully switched to remote ServiceManager`,
        );

        // CRITICAL: Start the kernel for remote runtimes too
        // Same race condition as local kernels - tool execution could happen
        // before Jupyter component mounts and starts the kernel
        if (mutableManagerRef.current) {
          mutableManagerRef.current.current.kernels
            .startNew({ name: runtime.environmentName || "python3" })
            .then((kernel) => {
              console.log(
                `[useRuntimeManager] ✓ Remote kernel started:`,
                kernel.id,
              );
            })
            .catch((error) => {
              console.error(
                `[useRuntimeManager] ❌ Failed to start remote kernel:`,
                error,
              );
            });
        }
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
  };
}
