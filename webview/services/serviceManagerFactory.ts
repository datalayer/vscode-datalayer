/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * @module serviceManagerFactory
 *
 * Factory for creating service managers of different types.
 *
 * Centralizes service manager creation logic to provide:
 * - Single source of truth for manager instantiation
 * - Consistent initialization patterns across all types
 * - Easy addition of new manager types
 * - Better testability through factory abstraction
 *
 * ## Supported Manager Types
 *
 * - **mock**: No execution capabilities, for read-only/demo modes
 * - **pyodide**: Browser-based Python via WebAssembly (no server required)
 * - **local**: VS Code Python environments (direct integration)
 * - **remote**: Standard Jupyter server (HTTP/WebSocket)
 *
 * @example
 * ```typescript
 * // Create Pyodide manager
 * const pyodideManager = await ServiceManagerFactory.create('pyodide');
 *
 * // Create remote manager with authentication
 * const remoteManager = await ServiceManagerFactory.create('remote', {
 *   url: 'http://localhost:8888',
 *   token: 'secret-token'
 * });
 *
 * // Create local kernel manager
 * const localManager = await ServiceManagerFactory.create('local', {
 *   kernelId: 'kernel-123',
 *   kernelName: 'Python 3.11',
 *   url: 'local-kernel://python311'
 * });
 * ```
 */

import { ServiceManager } from "@jupyterlab/services";
import { createMockServiceManager } from "./mockServiceManager";
import { createPyodideServiceManager } from "./pyodideServiceManager";
import { createLocalKernelServiceManager } from "./localKernelServiceManager";
import { createServiceManager } from "./serviceManager";

/**
 * Options for creating a local kernel service manager.
 */
export interface LocalManagerOptions {
  /**
   * Unique identifier for the local kernel.
   */
  kernelId: string;

  /**
   * Display name of the Python environment.
   */
  kernelName: string;

  /**
   * URL for the local kernel connection.
   * Typically in format: local-kernel://environment-name
   */
  url: string;
}

/**
 * Options for creating a remote service manager.
 */
export interface RemoteManagerOptions {
  /**
   * Jupyter server URL.
   * Example: http://localhost:8888
   */
  url: string;

  /**
   * Optional authentication token.
   */
  token?: string;
}

/**
 * Union type for all service manager creation options.
 */
export type ServiceManagerOptions =
  | { type: "mock" }
  | { type: "pyodide" }
  | { type: "local"; options: LocalManagerOptions }
  | { type: "remote"; options: RemoteManagerOptions };

/**
 * Discriminated union for service manager configuration.
 * Each config type contains all necessary information to create that manager type.
 */
export type ServiceManagerConfig =
  | { type: "mock" }
  | { type: "pyodide" }
  | { type: "local"; kernelId: string; kernelName: string; url: string }
  | { type: "remote"; url: string; token?: string };

/**
 * Factory for creating service managers.
 *
 * Provides a centralized, type-safe way to create service managers
 * of different types with appropriate configuration.
 */
export class ServiceManagerFactory {
  /**
   * Create a service manager of the specified type.
   *
   * @param type - Type of service manager to create
   * @param options - Type-specific options (required for local/remote)
   * @returns Promise resolving to configured service manager
   *
   * @example
   * ```typescript
   * // Mock manager (no options needed)
   * const mock = await ServiceManagerFactory.create('mock');
   *
   * // Pyodide manager (no options needed)
   * const pyodide = await ServiceManagerFactory.create('pyodide');
   *
   * // Local manager (requires kernel info)
   * const local = await ServiceManagerFactory.create('local', {
   *   kernelId: 'abc-123',
   *   kernelName: 'Python 3.11',
   *   url: 'local-kernel://python311'
   * });
   *
   * // Remote manager (requires server URL)
   * const remote = await ServiceManagerFactory.create('remote', {
   *   url: 'http://localhost:8888',
   *   token: 'my-token'
   * });
   * ```
   */
  static async create(type: "mock"): Promise<ServiceManager.IManager>;

  static async create(type: "pyodide"): Promise<ServiceManager.IManager>;

  static async create(
    type: "local",
    options: LocalManagerOptions,
  ): Promise<ServiceManager.IManager>;

  static async create(
    type: "remote",
    options: RemoteManagerOptions,
  ): Promise<ServiceManager.IManager>;

  static async create(
    type: "mock" | "pyodide" | "local" | "remote",
    options?: LocalManagerOptions | RemoteManagerOptions,
  ): Promise<ServiceManager.IManager> {
    console.log(`[ServiceManagerFactory] Creating ${type} service manager`);

    switch (type) {
      case "mock":
        return createMockServiceManager();

      case "pyodide":
        return await createPyodideServiceManager();

      case "local": {
        if (!options || !("kernelId" in options)) {
          throw new Error(
            "Local manager requires kernelId, kernelName, and url options",
          );
        }
        const localOpts = options as LocalManagerOptions;
        return createLocalKernelServiceManager(
          localOpts.kernelId,
          localOpts.kernelName,
          localOpts.url,
        );
      }

      case "remote": {
        if (!options || !("url" in options)) {
          throw new Error("Remote manager requires url option");
        }
        const remoteOpts = options as RemoteManagerOptions;
        return createServiceManager(remoteOpts.url, remoteOpts.token);
      }

      default: {
        const exhaustiveCheck: never = type;
        throw new Error(`Unknown service manager type: ${exhaustiveCheck}`);
      }
    }
  }

  /**
   * Create a service manager from a configuration object.
   *
   * This is the preferred method for creating service managers as it provides
   * a single, unified interface regardless of manager type.
   *
   * @param config - Discriminated union configuration
   * @returns Promise resolving to configured service manager
   *
   * @example
   * ```typescript
   * // Mock
   * const mock = await ServiceManagerFactory.fromConfig({ type: 'mock' });
   *
   * // Pyodide
   * const pyodide = await ServiceManagerFactory.fromConfig({ type: 'pyodide' });
   *
   * // Local kernel
   * const local = await ServiceManagerFactory.fromConfig({
   *   type: 'local',
   *   kernelId: 'abc-123',
   *   kernelName: 'Python 3.11',
   *   url: 'local-kernel://python311'
   * });
   *
   * // Remote server
   * const remote = await ServiceManagerFactory.fromConfig({
   *   type: 'remote',
   *   url: 'http://localhost:8888',
   *   token: 'my-token'
   * });
   * ```
   */
  static async fromConfig(
    config: ServiceManagerConfig,
  ): Promise<ServiceManager.IManager> {
    console.log(
      `[ServiceManagerFactory] Creating service manager from config:`,
      config.type,
    );

    switch (config.type) {
      case "mock":
        return createMockServiceManager();

      case "pyodide":
        return await createPyodideServiceManager();

      case "local":
        return createLocalKernelServiceManager(
          config.kernelId,
          config.kernelName,
          config.url,
        );

      case "remote":
        return createServiceManager(config.url, config.token);

      default: {
        const exhaustiveCheck: never = config;
        throw new Error(
          `Unknown service manager config type: ${(exhaustiveCheck as ServiceManagerConfig).type}`,
        );
      }
    }
  }

  /**
   * Check if a service manager is of a specific type.
   *
   * Uses the managerType property from base classes to determine type.
   *
   * @param manager - Service manager to check
   * @param type - Expected type
   * @returns True if manager matches the specified type
   *
   * @example
   * ```typescript
   * if (ServiceManagerFactory.isType(manager, 'pyodide')) {
   *   console.log('Running in browser with Pyodide');
   * }
   * ```
   */
  static isType(
    manager: ServiceManager.IManager,
    type: "mock" | "pyodide" | "local" | "remote",
  ): boolean {
    // Check managerType from the service manager itself (if available)
    const managerType = (manager as { managerType?: string }).managerType;
    if (managerType) {
      return managerType === type;
    }

    // Fallback: Check through kernels manager (all kernel managers have managerType)
    const kernelManagerType = (
      manager.kernels as unknown as { managerType?: string }
    ).managerType;
    return kernelManagerType === type;
  }

  /**
   * Get the type of a service manager.
   *
   * Uses the managerType property from base classes to determine type.
   *
   * @param manager - Service manager to identify
   * @returns Type of the service manager
   *
   * @example
   * ```typescript
   * const type = ServiceManagerFactory.getType(manager);
   * console.log(`Current manager type: ${type}`);
   * ```
   */
  static getType(
    manager: ServiceManager.IManager,
  ): "mock" | "pyodide" | "local" | "remote" {
    // Try service manager's managerType first
    const managerType = (manager as { managerType?: string }).managerType;
    if (managerType) {
      return managerType as "mock" | "pyodide" | "local" | "remote";
    }

    // Fallback: Get from kernels manager
    const kernelManagerType = (
      manager.kernels as unknown as { managerType?: string }
    ).managerType;
    return (kernelManagerType || "remote") as
      | "mock"
      | "pyodide"
      | "local"
      | "remote";
  }
}
