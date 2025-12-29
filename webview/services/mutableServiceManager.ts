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
import { disposeServiceManager } from "@datalayer/jupyter-react";
import {
  ServiceManagerFactory,
  type ServiceManagerType,
} from "./serviceManagerFactory";

/**
 * Global registry of expired/terminated runtime URLs.
 * Prevents reconnection attempts to servers that have been terminated.
 * CRITICAL: Must be cleared only when explicitly safe to do so.
 */
const expiredRuntimeUrls = new Set<string>();

/**
 * Mark a runtime URL as expired/terminated.
 * Prevents future reconnection attempts to this URL.
 *
 * @param url - The runtime URL to mark as expired
 */
export function markRuntimeUrlExpired(url: string): void {
  expiredRuntimeUrls.add(url);
}

/**
 * Check if a runtime URL has been marked as expired.
 *
 * @param url - The runtime URL to check
 * @returns true if URL is expired, false otherwise
 */
export function isRuntimeUrlExpired(url: string): boolean {
  return expiredRuntimeUrls.has(url);
}

/**
 * Clear a URL from the expired registry (for testing or explicit re-enablement).
 *
 * @param url - The runtime URL to clear
 */
export function clearExpiredUrl(url: string): void {
  expiredRuntimeUrls.delete(url);
}

/**
 * Type guard to check if service manager has a dispose method
 */
function hasDispose(
  sm: ServiceManager.IManager,
): sm is ServiceManager.IManager & { dispose: () => void } {
  return typeof (sm as { dispose?: () => void }).dispose === "function";
}

/**
 * Safely dispose a service manager WITHOUT causing CORS errors.
 * Overrides ALL network methods and stops polling loops PERMANENTLY.
 *
 * CRITICAL: Never restore original methods - setTimeout callbacks from polling
 * loops survive disposal and will fire after we return!
 *
 * @param sm - Service manager to dispose
 */
function safeDispose(sm: ServiceManager.IManager): void {
  try {
    // Stop ALL polling loops before overriding methods
    // Find and stop Poll instances to cancel setTimeout callbacks
    const managers = [
      { name: "kernels", manager: sm.kernels },
      { name: "sessions", manager: sm.sessions },
      { name: "terminals", manager: sm.terminals },
      { name: "contents", manager: sm.contents },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { name: "kernelspecs", manager: (sm as any).kernelspecs },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { name: "user", manager: (sm as any).user },
    ];

    for (const { manager } of managers) {
      if (!manager) {
        continue;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = manager as any;

      // Try multiple property names for polls
      const pollProperties = ["_poll", "_pollModels", "_pollSpecs", "poll"];
      for (const prop of pollProperties) {
        if (m[prop] && typeof m[prop].stop === "function") {
          try {
            m[prop].stop();
          } catch (e) {
            // Silently ignore poll stop failures
          }
        }
      }
    }

    // Override ALL network methods PERMANENTLY (NEVER restore!)
    // This blocks any setTimeout callbacks that survive disposal
    for (const { manager } of managers) {
      if (!manager) {
        continue;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = manager as any;

      // Override all methods that make network requests
      const networkMethods = [
        "refreshRunning",
        "requestRunning",
        "requestSpecs",
        "requestUser",
        "get",
      ];
      for (const method of networkMethods) {
        if (typeof m[method] === "function") {
          m[method] = () => Promise.resolve();
        }
      }
    }

    // Now dispose - our overrides block all network requests
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof (sm as any).dispose === "function") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sm as any).dispose();
    }
  } catch (error) {
    console.error("[MutableServiceManager] Error in safe disposal:", error);
  }
}

/**
 * Mutable service manager wrapper that maintains a stable reference
 * while allowing the underlying service manager to be swapped.
 */
export class MutableServiceManager {
  private _serviceManager: ServiceManager.IManager;
  private _listeners: Array<() => void> = [];
  private _subProxies = new Map<string, unknown>();
  private _isDisposing: boolean = false; // Track if disposal is in progress

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
   * @param skipDisposal - If true, skip disposing current manager (used when server is already dead)
   */
  async updateToMock(skipDisposal: boolean = false): Promise<void> {
    // CRITICAL: Prevent concurrent disposal attempts
    // If disposal is already in progress OR we're already on mock, do nothing
    const currentType = ServiceManagerFactory.getType(this._serviceManager);
    if (this._isDisposing || currentType === "mock") {
      return;
    }

    try {
      this._isDisposing = true;

      if (skipDisposal) {
        // CRITICAL: Dispose with refreshRunning override to prevent CORS errors
        // This cancels async init tasks AND stops polling without hitting dead server
        safeDispose(this._serviceManager);
      } else {
        await this._disposeCurrentManager();
      }

      // DO NOT clear _subProxies! Keeps existing proxy references working
      // this._subProxies.clear(); // ❌ REMOVED
      this._serviceManager = ServiceManagerFactory.create({ type: "mock" });
      this._notifyListeners();
    } finally {
      this._isDisposing = false;
    }
  }

  /**
   * Update to a local kernel service manager.
   * Connects directly to VS Code Python environments via ZMQ.
   *
   * @param kernelId - Unique kernel identifier
   * @param kernelName - Kernel spec name (e.g., 'python3')
   * @param url - Base URL for kernel connection
   */
  async updateToLocal(
    kernelId: string,
    kernelName: string,
    url: string,
  ): Promise<void> {
    await this._disposeCurrentManager();
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
  async updateToRemote(url: string, token: string): Promise<void> {
    // Block expired/terminated runtime URLs
    // Prevents CORS errors from reconnecting to dead servers
    const isExpired = isRuntimeUrlExpired(url);

    if (isExpired) {
      // Instead of creating a ServiceManager with expired URL, use mock
      await this.updateToMock();
      return;
    }

    await this._disposeCurrentManager();
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
  async updateToPyodide(pyodideUrl?: string): Promise<void> {
    await this._disposeCurrentManager();
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
   * MUST be awaited to ensure sessions are fully shutdown before disposal.
   */
  private async _disposeCurrentManager(): Promise<void> {
    if (this._serviceManager && hasDispose(this._serviceManager)) {
      const oldSm = this._serviceManager;
      const oldType = ServiceManagerFactory.getType(oldSm);

      try {
        // Use utility function from @datalayer/jupyter-react
        // This disables auto-reconnect for all kernels BEFORE disposing
        // to prevent CORS/502 errors when reconnecting to terminated servers
        disposeServiceManager(oldSm);
      } catch (error) {
        console.error(
          `[MutableServiceManager] Error in _disposeCurrentManager for ${oldType}:`,
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
