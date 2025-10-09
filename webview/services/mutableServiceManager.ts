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
import { createServiceManager } from "./serviceManager";
import { createMockServiceManager } from "./mockServiceManager";
import { createPyodideMinimalServiceManager } from "./pyodideMinimalServiceManager";

/**
 * Type guard to check if service manager has a dispose method
 */
function hasDispose(
  sm: ServiceManager.IManager,
): sm is ServiceManager.IManager & { dispose: () => void } {
  return typeof (sm as { dispose?: () => void }).dispose === "function";
}

/**
 * Type guard to check if service manager is a mock
 */
function isMockServiceManager(
  sm: ServiceManager.IManager,
): sm is ServiceManager.IManager & { __isMockServiceManager: boolean } {
  return (
    (sm as { __isMockServiceManager?: boolean }).__isMockServiceManager === true
  );
}

/**
 * Type guard to check if service manager is Pyodide/JupyterLite.
 *
 * @param sm - Service manager to check
 * @returns True if service manager is JupyterLite with Pyodide kernel or DirectPyodideServiceManager
 */
function isLiteServiceManager(
  sm: ServiceManager.IManager,
): sm is ServiceManager.IManager & { __NAME__: string } {
  const name = (sm as { __NAME__?: string }).__NAME__;
  return (
    name === "LiteServiceManager" || name === "DirectPyodideServiceManager"
  );
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
   * Update the service manager with new connection settings.
   * This swaps the internal service manager without changing the wrapper reference.
   *
   * @param url - The base URL for the Jupyter server
   * @param token - The authentication token
   */
  updateConnection(url: string, token: string): void {
    // Updating connection

    // Dispose the old service manager if it has a dispose method
    if (this._serviceManager && hasDispose(this._serviceManager)) {
      // Disposing old service manager
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
        // Continue with connection update anyway
      }
    }

    // Create new service manager with new settings
    this._serviceManager = createServiceManager(url, token);

    // CRITICAL: Clear sub-proxy caches so they point to new service manager
    this._clearSubProxyCaches();

    // Notify listeners that the service manager has changed
    this._listeners.forEach((listener) => listener());
  }

  /**
   * Reset to mock service manager.
   */
  resetToMock(): void {
    // Resetting to mock service manager

    // Check if we're already using mock - if so, no need to change
    if (isMockServiceManager(this._serviceManager)) {
      // Already using mock service manager
      return;
    }

    // Dispose the old service manager if it has a dispose method and it's not mock
    if (this._serviceManager && hasDispose(this._serviceManager)) {
      // Disposing old service manager
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
        // Continue with reset anyway
      }
    }

    this._serviceManager = createMockServiceManager();

    // CRITICAL: Clear sub-proxy caches so they point to new service manager
    this._clearSubProxyCaches();

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
   */
  async updateToPyodide(): Promise<void> {
    console.log("[MutableServiceManager] Switching to Pyodide service manager");

    // Cancel any pending disposal timeout to prevent race conditions
    if (this._disposalTimeoutId !== null) {
      clearTimeout(this._disposalTimeoutId);
      this._disposalTimeoutId = null;
    }

    // Dispose old service manager if it has a dispose method
    // Skip disposal for mock service manager since it doesn't need cleanup
    if (
      this._serviceManager &&
      hasDispose(this._serviceManager) &&
      !isMockServiceManager(this._serviceManager)
    ) {
      const oldSm = this._serviceManager;
      // Schedule delayed disposal to allow pending operations to complete
      this._disposalTimeoutId = setTimeout(() => {
        try {
          oldSm.dispose();
          this._disposalTimeoutId = null;
        } catch (error) {
          console.error(
            "[MutableServiceManager] Error during delayed disposal:",
            error,
          );
        }
      }, 50);
    }

    // Create minimal Pyodide service manager (with mock execution for now)
    // NOTE: This has mock Python execution. Real Pyodide requires solving CDN/CSP issues.
    try {
      console.log(
        "[MutableServiceManager] Creating minimal Pyodide service manager...",
      );

      this._serviceManager = await createPyodideMinimalServiceManager();

      console.log(
        "[MutableServiceManager] Pyodide service manager created, waiting for ready...",
      );

      // CRITICAL: Wait for service manager to be ready before notifying listeners
      await this._serviceManager.ready;
      console.log(
        "[MutableServiceManager] Pyodide service manager is ready! isReady:",
        this._serviceManager.isReady,
      );
    } catch (error) {
      console.error(
        "[MutableServiceManager] Failed to create Pyodide service manager:",
        error,
      );
      // Fallback to mock on error (don't throw - allow graceful degradation)
      this._serviceManager = createMockServiceManager();
      console.warn(
        "[MutableServiceManager] Falling back to mock service manager",
      );
    }

    // CRITICAL: Clear sub-proxy caches so they point to new Pyodide service manager
    this._clearSubProxyCaches();

    // Notify listeners that the service manager has changed
    // This triggers Notebook2 to reinitialize with the new service manager
    this._listeners.forEach((listener) => listener());
  }

  /**
   * Check if currently using Pyodide service manager.
   *
   * @returns True if using JupyterLite with Pyodide kernel
   */
  isPyodide(): boolean {
    return isLiteServiceManager(this._serviceManager);
  }

  /**
   * Get the current service manager type for debugging.
   *
   * @returns "mock", "pyodide", or "remote"
   */
  getType(): string {
    if (isMockServiceManager(this._serviceManager)) {
      return "mock";
    }
    if (this.isPyodide()) {
      return "pyodide";
    }
    return "remote";
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
          // ALWAYS create a new proxy - DO NOT cache!
          // This ensures every access reads from the CURRENT service manager
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

          return subProxy;
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
