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
    if (
      this._serviceManager &&
      typeof (this._serviceManager as any).dispose === "function"
    ) {
      // Disposing old service manager
      try {
        // Add a small delay to allow any pending operations to complete
        setTimeout(() => {
          try {
            (this._serviceManager as any).dispose();
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
    const currentIsMock = (this._serviceManager as any).__isMockServiceManager;
    if (currentIsMock) {
      // Already using mock service manager
      return;
    }

    // Dispose the old service manager if it has a dispose method and it's not mock
    if (
      this._serviceManager &&
      typeof (this._serviceManager as any).dispose === "function"
    ) {
      // Disposing old service manager
      try {
        // Add a small delay to allow any pending operations to complete
        setTimeout(() => {
          try {
            (this._serviceManager as any).dispose();
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
   */
  createProxy(): ServiceManager.IManager {
    return new Proxy({} as ServiceManager.IManager, {
      get: (target, prop) => {
        const current = this._serviceManager;
        return (current as any)[prop];
      },
      set: (target, prop, value) => {
        const current = this._serviceManager;
        (current as any)[prop] = value;
        return true;
      },
      has: (target, prop) => {
        const current = this._serviceManager;
        return prop in current;
      },
      ownKeys: (target) => {
        const current = this._serviceManager;
        return Object.keys(current);
      },
      getOwnPropertyDescriptor: (target, prop) => {
        const current = this._serviceManager;
        return Object.getOwnPropertyDescriptor(current, prop);
      },
    });
  }
}
