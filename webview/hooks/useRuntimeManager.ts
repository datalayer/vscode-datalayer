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
import { ServiceManagerConfig } from "../services/serviceManagerFactory";
import { isLocalKernelUrl } from "../../src/constants/kernelConstants";

/**
 * Convert RuntimeJSON to ServiceManagerConfig.
 *
 * Centralizes the logic for detecting runtime type and extracting configuration.
 *
 * @param runtime - RuntimeJSON from @datalayer/core
 * @returns ServiceManagerConfig or null if conversion fails
 */
function convertRuntimeToConfig(
  runtime: RuntimeJSON,
): ServiceManagerConfig | null {
  if (!runtime.ingress) {
    return null;
  }

  // Detect local kernel by URL pattern
  if (isLocalKernelUrl(runtime.ingress)) {
    console.log(
      `[useRuntimeManager] Detected local kernel: ${runtime.ingress}`,
    );

    // Extract kernel ID from URL
    const kernelId = runtime.ingress.match(/local-kernel-([^./]+)/)?.[1];
    if (!kernelId) {
      console.error(
        `[useRuntimeManager] Could not extract kernel ID from: ${runtime.ingress}`,
      );
      return null;
    }

    return {
      type: "local",
      kernelId,
      kernelName: runtime.environmentName || "python3",
      url: runtime.ingress,
    };
  }

  // Default to remote runtime
  return {
    type: "remote",
    url: runtime.ingress,
    token: runtime.token,
  };
}

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

  // Track service manager changes to force kernel restart when needed
  // Increment whenever we need to restart the kernel connection:
  // - Different manager type (pyodide → local → remote)
  // - Different kernel within same type (python3.11 → python3.12)
  // - Different runtime URL (serverA → serverB)
  const [serviceManagerVersion, setServiceManagerVersion] = useState(0);
  const lastConfigRef = useRef<string>("");

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
      // Convert RuntimeJSON to ServiceManagerConfig
      const config = convertRuntimeToConfig(runtime);

      if (config) {
        console.log(`[useRuntimeManager] Switching to ${config.type} runtime`);

        // Create a stable config key to detect changes
        const configKey = JSON.stringify(config);
        if (configKey !== lastConfigRef.current) {
          console.log(
            `[useRuntimeManager] Config changed, incrementing version`,
          );
          setServiceManagerVersion((v) => v + 1);
          lastConfigRef.current = configKey;
        }

        // Unified update - no custom logic!
        mutableManagerRef.current?.updateFromConfig(config).catch((error) => {
          console.error(
            "[useRuntimeManager] Error updating service manager:",
            error,
          );
          // Fallback to mock on error
          mutableManagerRef.current?.updateFromConfig({ type: "mock" });
        });
      } else {
        console.error(
          `[useRuntimeManager] Could not convert runtime to config:`,
          runtime,
        );
        mutableManagerRef.current?.updateFromConfig({ type: "mock" });
      }
    } else {
      // No runtime - reset to mock
      const mockConfigKey = JSON.stringify({ type: "mock" });
      if (mockConfigKey !== lastConfigRef.current) {
        setServiceManagerVersion((v) => v + 1);
        lastConfigRef.current = mockConfigKey;
      }
      mutableManagerRef.current?.updateFromConfig({ type: "mock" });
    }
  }, []);

  /**
   * Switch to Pyodide kernel for offline execution.
   * The MutableServiceManager reference stays stable - no component re-renders!
   */
  const selectPyodideRuntime = useCallback(async () => {
    console.log("[useRuntimeManager] Switching to Pyodide...");
    setSelectedRuntime(undefined); // Clear runtime info since Pyodide is local

    // Create config key to detect changes
    const pyodideConfigKey = JSON.stringify({ type: "pyodide" });
    if (pyodideConfigKey !== lastConfigRef.current) {
      console.log(
        `[useRuntimeManager] Config changed to Pyodide, incrementing version`,
      );
      setServiceManagerVersion((v) => v + 1);
      lastConfigRef.current = pyodideConfigKey;
    }

    // Update service manager using unified approach
    await mutableManagerRef.current?.updateFromConfig({ type: "pyodide" });

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
    serviceManagerVersion, // Increment when manager TYPE changes to force kernel restart
    selectRuntime,
    selectPyodideRuntime,
  };
}
