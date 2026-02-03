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

import { ServiceManager, ServerConnection } from "@jupyterlab/services";
import {
  ServiceManagerFactory,
  type ServiceManagerType,
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
 * Disable auto-reconnect for all kernel connections in a service manager.
 * This prevents CORS errors when the server-side runtime has been terminated
 * and the kernel URLs are no longer accessible.
 *
 * Sets _reconnectLimit = -1 on all kernel connections to disable reconnection attempts.
 *
 * @param serviceManager - Service manager to disable reconnection for
 * @returns Number of kernels that had reconnection disabled
 */
function disableKernelReconnect(
  serviceManager: ServiceManager.IManager,
): number {
  let count = 0;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const kernelManager = serviceManager.kernels as any;
    if (!kernelManager) {
      return count;
    }

    // Access private _kernelConnections (Set of kernel connections)
    const kernelsMap = kernelManager._kernelConnections;
    if (kernelsMap instanceof Set) {
      for (const kernelConnection of kernelsMap) {
        if (kernelConnection?._reconnectLimit !== undefined) {
          kernelConnection._reconnectLimit = -1;
          count++;
        }
      }
    }
  } catch (error) {
    console.warn(
      "[MutableServiceManager] Error disabling auto-reconnect:",
      error,
    );
  }
  return count;
}

/**
 * Mutable service manager wrapper that maintains a stable reference
 * while allowing the underlying service manager to be swapped.
 */
export class MutableServiceManager {
  private _serviceManager: ServiceManager.IManager;
  private _listeners: Array<() => void> = [];
  private _subProxies = new Map<string, unknown>();
  private _forceClose = false; // Skip dispose() to avoid API calls to dead servers

  constructor(initialServiceManager?: ServiceManager.IManager) {
    this._serviceManager =
      initialServiceManager || ServiceManagerFactory.create({ type: "mock" });
  }

  /**
   * Get the current service manager.
   * This proxies all calls to the underlying service manager.
   */
  get current(): ServiceManager.IManager {
    return this._serviceManager;
  }

  /**
   * Update to a mock service manager (no execution).
   * Convenience method using ServiceManagerFactory.
   *
   * @param forceClose - If true, skip dispose() to avoid API calls (for terminated remote runtimes)
   */
  updateToMock(forceClose = false): void {
    this._forceClose = forceClose;
    this._disposeCurrentManager();
    this._forceClose = false; // Reset flag
    // DO NOT clear _subProxies! Keeps existing proxy references working
    // this._subProxies.clear(); // ❌ REMOVED
    this._serviceManager = ServiceManagerFactory.create({ type: "mock" });
    this._notifyListeners();
  }

  /**
   * Update to a local kernel service manager.
   * Connects directly to VS Code Python environments via ZMQ.
   *
   * @param kernelId - Unique kernel identifier
   * @param kernelName - Kernel spec name (e.g., 'python3')
   * @param url - Base URL for kernel connection
   */
  updateToLocal(kernelId: string, kernelName: string, url: string): void {
    this._disposeCurrentManager();
    // DO NOT clear _subProxies! Notebook2/SessionContext holds references to these proxies
    // The proxies dynamically forward to this._serviceManager, so they'll work with the new manager
    // this._subProxies.clear(); // ❌ REMOVED - breaks existing proxy references
    this._serviceManager = ServiceManagerFactory.create({
      type: "local",
      kernelId,
      kernelName,
      url,
    });
    this._notifyListeners();
  }

  /**
   * Update to a remote service manager.
   * Connects to standard Jupyter server via HTTP/WebSocket.
   *
   * @param url - Base URL for the Jupyter server
   * @param token - Authentication token
   */
  updateToRemote(url: string, token: string): void {
    this._disposeCurrentManager();
    // DO NOT clear _subProxies! Keeps existing proxy references working
    // this._subProxies.clear(); // ❌ REMOVED
    const serverSettings = ServerConnection.makeSettings({
      baseUrl: url,
      token,
      appendToken: true,
      wsUrl: url.replace(/^http/, "ws"),
    });
    this._serviceManager = ServiceManagerFactory.create({
      type: "remote",
      serverSettings,
    });
    this._notifyListeners();
  }

  /**
   * Update to Pyodide service manager (browser-based Python).
   *
   * @param pyodideUrl - Optional CDN URL for Pyodide
   */
  updateToPyodide(pyodideUrl?: string): void {
    this._disposeCurrentManager();
    // DO NOT clear _subProxies! Keeps existing proxy references working
    // this._subProxies.clear(); // ❌ REMOVED
    this._serviceManager = ServiceManagerFactory.create({
      type: "pyodide",
      pyodideUrl,
    });
    this._notifyListeners();
  }

  /**
   * Get the current service manager type.
   *
   * @returns Service manager type or 'unknown' if not created by factory
   */
  getType(): ServiceManagerType | "unknown" {
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
   * Dispose the current service manager (internal helper).
   */
  private _disposeCurrentManager(): void {
    if (this._serviceManager && hasDispose(this._serviceManager)) {
      const oldSm = this._serviceManager;
      const oldType = ServiceManagerFactory.getType(oldSm);

      try {
        // SPECIAL CASE: Pyodide inline kernels need explicit session shutdown
        // Pyodide kernels run in-browser, not as separate processes, so they need
        // explicit cleanup. For other types (local, remote), just disposing works fine.
        if (oldType === "pyodide") {
          const sessionManager = oldSm.sessions;
          if (
            sessionManager &&
            typeof sessionManager.shutdownAll === "function"
          ) {
            try {
              sessionManager.shutdownAll();
            } catch (error) {
              console.warn(
                `[MutableServiceManager] ⚠️ Error shutting down Pyodide sessions:`,
                error,
              );
            }
          }
        }

        // CRITICAL: For remote/Datalayer runtimes that were terminated on the server,
        // we need to force-close without making API calls. The URLs are already dead.
        if (this._forceClose) {
          console.log(
            `[MutableServiceManager] Force-closing service manager (type: ${oldType}) without dispose() to avoid CORS errors`,
          );

          try {
            // Disable kernel reconnection to prevent auto-reconnect attempts
            const disabledCount = disableKernelReconnect(oldSm);
            console.log(
              `[MutableServiceManager] Disabled ${disabledCount} kernel reconnections`,
            );

            // Forcefully stop all polling and subscriptions
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const sm = oldSm as any;

            // Stop kernel manager polling
            if (sm.kernels?._pollModels) {
              sm.kernels._pollModels.stop();
            }

            // Stop session manager polling
            if (sm.sessions?._pollModels) {
              sm.sessions._pollModels.stop();
            }

            // Dispose events service (stops WebSocket subscriptions)
            if (sm.events?.dispose) {
              sm.events.dispose();
            }

            console.log(
              "[MutableServiceManager] Stopped all polling and subscriptions",
            );
          } catch (error) {
            console.warn(
              "[MutableServiceManager] Error during force-close cleanup:",
              error,
            );
          }

          // Skip dispose() - it would try to refresh kernel lists from dead server
          // Polling is stopped, so no more API calls will be made
        } else {
          // Normal disposal with API calls (for Pyodide, local kernels, etc.)
          const disabledCount = disableKernelReconnect(oldSm);
          console.log(
            `[MutableServiceManager] Disposing service manager (type: ${oldType}), disabled ${disabledCount} kernel reconnections`,
          );
          oldSm.dispose();
        }
      } catch (error) {
        console.error(
          `[MutableServiceManager] ❌ Error in _disposeCurrentManager for ${oldType}:`,
          error,
        );
      }
    }
  }

  /**
   * Notify all listeners of service manager change (internal helper).
   */
  private _notifyListeners(): void {
    this._listeners.forEach((listener) => listener());
  }

  /**
   * Create a proxy that forwards all property access to the current service manager.
   * This allows the MutableServiceManager to be used as a drop-in replacement.
   *
   * IMPORTANT: For properties that are objects (like `kernels`, `sessions`, etc.),
   * we need to return proxies as well, because SessionContext extracts these properties
   * and holds onto them. Without proxies, SessionContext would keep references to the
   * old mock service manager's kernels/sessions even after we swap to a real one.
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
          ].includes(prop)
        ) {
          // Return cached proxy if exists to maintain object identity
          if (this._subProxies.has(prop)) {
            return this._subProxies.get(prop);
          }

          // Create new proxy for this property
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
              const value = currentProp?.[subProp];

              // CRITICAL: Bind methods to maintain correct `this` context
              // Without this, extracted methods lose their `this` binding and fail
              // This fixes the bug where SessionContext calls kernels.running() but
              // gets undefined because the method isn't bound to the kernels manager
              if (typeof value === "function") {
                return value.bind(currentProp);
              }

              return value;
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

          this._subProxies.set(prop, subProxy);
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
