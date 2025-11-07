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
 * Mutable service manager wrapper that maintains a stable reference
 * while allowing the underlying service manager to be swapped.
 */
export class MutableServiceManager {
  private _serviceManager: ServiceManager.IManager;
  private _listeners: Array<() => void> = [];

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

    // Notify listeners
    this._listeners.forEach((listener) => listener());
  }

  /**
   * Update the underlying service manager directly.
   * This is useful when you need to replace the service manager with a custom one
   * (e.g., LocalKernelServiceManager for local kernel connections).
   *
   * @param serviceManager - The new service manager to use
   */
  updateServiceManager(serviceManager: ServiceManager.IManager): void {
    // Dispose the old service manager if it has a dispose method
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
        // Continue with update anyway
      }
    }

    this._serviceManager = serviceManager;

    // Notify listeners
    this._listeners.forEach((listener) => listener());
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
   * Create a proxy that forwards all property access to the current service manager.
   * This allows the MutableServiceManager to be used as a drop-in replacement.
   *
   * IMPORTANT: For properties that are objects (like `kernels`, `sessions`, etc.),
   * we need to return proxies as well, because SessionContext extracts these properties
   * and holds onto them. Without proxies, SessionContext would keep references to the
   * old mock service manager's kernels/sessions even after we swap to a real one.
   */
  createProxy(): ServiceManager.IManager {
    // Cache for sub-proxies (kernels, sessions, etc.) to maintain object identity
    const subProxies = new Map<string, unknown>();

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
          if (subProxies.has(prop)) {
            return subProxies.get(prop);
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

          subProxies.set(prop, subProxy);
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
