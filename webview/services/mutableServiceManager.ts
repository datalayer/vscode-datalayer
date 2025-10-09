/*
 * Copyright (c) 2021-2023 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * @module mutableServiceManager
 * A wrapper around ServiceManager that allows changing the underlying service manager
 * without causing React re-renders. This is achieved by keeping the wrapper object
 * stable while swapping the internal service manager.
 */

import { ServiceManager } from "@jupyterlab/services";
import { createMockServiceManager } from "./mockServiceManager";
import {
  ServiceManagerFactory,
  ServiceManagerConfig,
} from "./serviceManagerFactory";

/**
 * Type guard to check if service manager has a dispose method
 */
function hasDispose(
  sm: ServiceManager.IManager,
): sm is ServiceManager.IManager & { dispose: () => void } {
  return typeof (sm as { dispose?: () => void }).dispose === "function";
}

/**
 * Mutable service manager wrapper that maintains a stable reference
 * while allowing the underlying service manager to be swapped.
 */
export class MutableServiceManager {
  private _serviceManager: ServiceManager.IManager;
  private _listeners: Array<() => void> = [];
  private _disposalTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private _subProxyClearFunctions: Array<() => void> = [];
  private _subProxyCache = new Map<string, unknown>();

  constructor(initialServiceManager?: ServiceManager.IManager) {
    this._serviceManager = initialServiceManager || createMockServiceManager();
  }

  /**
   * Get the current service manager.
   * This proxies all calls to the underlying service manager.
   */
  get current(): ServiceManager.IManager {
    return this._serviceManager;
  }

  /**
   * Update the service manager using a configuration object.
   *
   * This is the unified method for switching between any service manager types.
   * No custom logic needed - the factory handles everything!
   *
   * @param config - Service manager configuration (discriminated union)
   *
   * @example
   * ```typescript
   * // Switch to Pyodide
   * await manager.updateFromConfig({ type: 'pyodide' });
   *
   * // Switch to local kernel
   * await manager.updateFromConfig({
   *   type: 'local',
   *   kernelId: 'abc-123',
   *   kernelName: 'Python 3.11',
   *   url: 'local-kernel://python311'
   * });
   *
   * // Switch to remote server
   * await manager.updateFromConfig({
   *   type: 'remote',
   *   url: 'http://localhost:8888',
   *   token: 'secret'
   * });
   *
   * // Switch to mock
   * await manager.updateFromConfig({ type: 'mock' });
   * ```
   */
  async updateFromConfig(config: ServiceManagerConfig): Promise<void> {
    console.log(
      `[MutableServiceManager] Updating to ${config.type} service manager`,
    );

    // CRITICAL: Dispose old service manager IMMEDIATELY before creating new one
    // This ensures old kernels (especially Pyodide) are shut down before SessionContext
    // tries to use the new service manager
    await this._disposeOldManagerImmediate();

    // Create new service manager from config
    try {
      this._serviceManager = await ServiceManagerFactory.fromConfig(config);

      // Wait for service manager to be ready
      await this._serviceManager.ready;
      console.log(
        `[MutableServiceManager] ${config.type} service manager is ready!`,
      );
    } catch (error) {
      console.error(
        `[MutableServiceManager] Failed to create ${config.type} service manager:`,
        error,
      );
      // Fallback to mock on error
      this._serviceManager = createMockServiceManager();
      console.warn(
        "[MutableServiceManager] Falling back to mock service manager",
      );
    }

    // Clear sub-proxy caches
    this._clearSubProxyCaches();

    // Notify listeners
    this._listeners.forEach((listener) => listener());
  }

  /**
   * Helper to dispose old service manager IMMEDIATELY.
   * Used when switching service managers to ensure old kernels are shut down
   * before SessionContext tries to use the new one.
   */
  private async _disposeOldManagerImmediate(): Promise<void> {
    // Cancel any pending disposal timeout
    if (this._disposalTimeoutId !== null) {
      clearTimeout(this._disposalTimeoutId);
      this._disposalTimeoutId = null;
    }

    // Dispose old service manager immediately
    if (
      this._serviceManager &&
      hasDispose(this._serviceManager) &&
      !ServiceManagerFactory.isType(this._serviceManager, "mock")
    ) {
      try {
        console.log(
          `[MutableServiceManager] Disposing old ${this.getType()} service manager immediately`,
        );
        this._serviceManager.dispose();
      } catch (error) {
        console.error(
          "[MutableServiceManager] Error during immediate disposal:",
          error,
        );
      }
    }
  }

  /**
   * Update the service manager with new connection settings.
   * This swaps the internal service manager without changing the wrapper reference.
   *
   * @param url - The base URL for the Jupyter server
   * @param token - The authentication token
   *
   * @deprecated Use updateFromConfig instead
   */
  updateConnection(url: string, token: string): void {
    console.log("[MutableServiceManager] updateConnection (legacy method)");
    // Use the unified method
    this.updateFromConfig({ type: "remote", url, token }).catch((error) => {
      console.error(
        "[MutableServiceManager] Error in updateConnection:",
        error,
      );
    });
  }

  /**
   * Reset to mock service manager.
   *
   * @deprecated Use updateFromConfig instead
   */
  resetToMock(): void {
    console.log("[MutableServiceManager] resetToMock (legacy method)");
    // Use the unified method
    this.updateFromConfig({ type: "mock" }).catch((error) => {
      console.error("[MutableServiceManager] Error in resetToMock:", error);
    });
  }

  /**
   * Update the underlying service manager directly.
   * This is useful when you need to replace the service manager with a custom one
   * (e.g., LocalKernelServiceManager for local kernel connections).
   *
   * @param serviceManager - The new service manager to use
   *
   * @deprecated Use updateFromConfig instead
   */
  updateServiceManager(serviceManager: ServiceManager.IManager): void {
    console.log("[MutableServiceManager] updateServiceManager (legacy method)");

    // Dispose the old service manager if it has a dispose method
    if (this._serviceManager && hasDispose(this._serviceManager)) {
      const oldSm = this._serviceManager;
      try {
        // Add a small delay to allow any pending operations to complete
        setTimeout(() => {
          try {
            oldSm.dispose();
          } catch (error) {
            // Error during delayed disposal
          }
        }, 50);
      } catch (error) {
        // Continue with update anyway
      }
    }

    this._serviceManager = serviceManager;

    // Notify listeners
    this._listeners.forEach((listener) => listener());
  }

  /**
   * Switch to Pyodide service manager for offline execution.
   * Uses JupyterLite with Pyodide kernel from @datalayer/jupyter-react package.
   * Falls back to mock service manager if Pyodide initialization fails.
   *
   * @remarks
   * Cancels any pending disposal to prevent race conditions from rapid kernel switching.
   *
   * @deprecated Use updateFromConfig instead
   */
  async updateToPyodide(): Promise<void> {
    console.log(
      "[MutableServiceManager] updateToPyodide (legacy method - use updateFromConfig)",
    );
    await this.updateFromConfig({ type: "pyodide" });
  }

  /**
   * Check if currently using Pyodide service manager.
   *
   * @returns True if using JupyterLite with Pyodide kernel
   */
  isPyodide(): boolean {
    return ServiceManagerFactory.isType(this._serviceManager, "pyodide");
  }

  /**
   * Get the current service manager type for debugging.
   *
   * @returns "mock", "pyodide", "local", or "remote"
   */
  getType(): string {
    return ServiceManagerFactory.getType(this._serviceManager);
  }

  /**
   * Add a listener for service manager changes.
   *
   * @param listener - Callback to invoke when service manager changes
   * @returns Disposable to remove the listener
   */
  onChange(listener: () => void): { dispose: () => void } {
    this._listeners.push(listener);
    return {
      dispose: () => {
        const index = this._listeners.indexOf(listener);
        if (index >= 0) {
          this._listeners.splice(index, 1);
        }
      },
    };
  }

  /**
   * Clear all sub-proxy caches to force re-creation with new service manager.
   * This is CRITICAL when swapping service managers to prevent stale references.
   */
  private _clearSubProxyCaches(): void {
    console.log("[MutableServiceManager] Clearing sub-proxy caches");
    this._subProxyClearFunctions.forEach((clearFn) => clearFn());
    this._subProxyCache.clear(); // Also clear our new cache
  }

  /**
   * Create a proxy that forwards all property access to the current service manager.
   * This allows the MutableServiceManager to be used as a drop-in replacement.
   *
   * IMPORTANT: For properties that are objects (like `kernels`, `sessions`, etc.),
   * we need to return proxies as well, because SessionContext extracts these properties
   * and holds onto them. Without proxies, SessionContext would keep references to the
   * old mock service manager's kernels/sessions even after we swap to a real one.
   *
   * CRITICAL FIX: Do NOT cache sub-proxies! Even though we clear the cache when service
   * manager changes, React components may already have references to the old cached sub-proxies.
   * Always creating fresh proxies ensures every property access reads from the CURRENT service manager.
   */
  createProxy(): ServiceManager.IManager {
    return new Proxy({} as ServiceManager.IManager, {
      get: (_target, prop) => {
        const current = this._serviceManager as unknown as Record<
          PropertyKey,
          unknown
        >;
        const value = current[prop];

        // For object properties (kernels, sessions, contents, etc.), create a proxy
        // that always forwards to the CURRENT service manager's property
        // This ensures SessionContext always uses the current kernels manager
        if (
          typeof value === "object" &&
          value !== null &&
          typeof prop === "string" &&
          [
            "kernels",
            "sessions",
            "contents",
            "terminals",
            "events",
            "settings",
            "nbconvert",
            "user",
          ].includes(prop)
        ) {
          // Cache sub-proxies to maintain stable references for React hooks
          // The proxy itself forwards to the CURRENT service manager, so caching is safe
          if (!this._subProxyCache.has(prop)) {
            const subProxy = new Proxy({} as Record<string, unknown>, {
              get: (_subTarget, subProp) => {
                const currentSm = this._serviceManager as unknown as Record<
                  PropertyKey,
                  unknown
                >;
                const currentProp = currentSm[prop] as Record<
                  PropertyKey,
                  unknown
                >;
                return currentProp?.[subProp];
              },
              set: (_subTarget, subProp, subValue) => {
                const currentSm = this._serviceManager as unknown as Record<
                  PropertyKey,
                  unknown
                >;
                const currentProp = currentSm[prop] as Record<
                  PropertyKey,
                  unknown
                >;
                if (currentProp) {
                  currentProp[subProp] = subValue;
                }
                return true;
              },
              has: (_subTarget, subProp) => {
                const currentSm = this._serviceManager as unknown as Record<
                  PropertyKey,
                  unknown
                >;
                const currentProp = currentSm[prop] as Record<
                  PropertyKey,
                  unknown
                >;
                return currentProp ? subProp in currentProp : false;
              },
            });

            this._subProxyCache.set(prop, subProxy);
          }

          return this._subProxyCache.get(prop);
        }

        // For non-object properties, just return the value directly
        return value;
      },
      set: (_target, prop, value) => {
        const current = this._serviceManager as unknown as Record<
          PropertyKey,
          unknown
        >;
        current[prop] = value;
        return true;
      },
      has: (_target, prop) => {
        const current = this._serviceManager;
        return prop in current;
      },
      ownKeys: (_target) => {
        const current = this._serviceManager;
        return Object.keys(current);
      },
      getOwnPropertyDescriptor: (_target, prop) => {
        const current = this._serviceManager;
        return Object.getOwnPropertyDescriptor(current, prop);
      },
    });
  }
}
