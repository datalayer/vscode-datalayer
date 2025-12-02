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
 * Mutable service manager wrapper that maintains a stable reference
 * while allowing the underlying service manager to be swapped.
 */
export class MutableServiceManager {
  private _serviceManager: ServiceManager.IManager;
  private _listeners: Array<() => void> = [];
  private _subProxies = new Map<string, unknown>();

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
   */
  updateToMock(): void {
    this._disposeCurrentManager();
    this._subProxies.clear();
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
    this._subProxies.clear();
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
    this._subProxies.clear();
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
    this._subProxies.clear();
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
      try {
        setTimeout(() => {
          try {
            oldSm.dispose();
          } catch (error) {
            // Error during delayed disposal
          }
        }, 50);
      } catch (error) {
        // Continue anyway
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
