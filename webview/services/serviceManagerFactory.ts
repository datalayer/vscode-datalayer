/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * @module serviceManagerFactory
 *
 * Centralized factory for creating Jupyter service managers.
 * Supports multiple kernel types with unified interface.
 *
 * ## Supported Service Manager Types
 *
 * - **mock**: No execution, for read-only notebooks
 * - **local**: Direct ZMQ to VS Code Python environments
 * - **remote**: Standard JupyterLab ServiceManager via HTTP/WebSocket
 * - **pyodide**: Browser-based Python (future implementation)
 *
 * ## Benefits
 *
 * 1. **Single Creation Point**: All service managers created through one API
 * 2. **Type Discrimination**: Runtime type checking with discriminated unions
 * 3. **Extensibility**: Easy to add new kernel types (e.g., Pyodide)
 * 4. **Type Safety**: TypeScript ensures correct options for each type
 *
 * @example
 * ```typescript
 * // Create mock service manager
 * const mockManager = ServiceManagerFactory.create({ type: 'mock' });
 *
 * // Create local kernel service manager
 * const localManager = ServiceManagerFactory.create({
 *   type: 'local',
 *   kernelId: 'kernel-123',
 *   kernelName: 'python3',
 *   url: 'http://localhost:8888'
 * });
 *
 * // Create remote service manager
 * const remoteManager = ServiceManagerFactory.create({
 *   type: 'remote',
 *   serverSettings: { baseUrl: 'http://localhost:8888', ... }
 * });
 * ```
 */

import { ServiceManager, ServerConnection } from "@jupyterlab/services";
import { createMockServiceManager } from "./mockServiceManager";
import { createLocalKernelServiceManager } from "./localKernelServiceManager";
import { createPyodideServiceManager } from "./pyodideServiceManager";

/**
 * Service manager type discriminator.
 * Includes 'pyodide' for future implementation.
 */
export type ServiceManagerType = "mock" | "local" | "remote" | "pyodide";

/**
 * Options for creating a mock service manager.
 */
export interface MockServiceManagerOptions {
  /** Service manager type discriminator */
  type: "mock";
}

/**
 * Options for creating a local kernel service manager.
 */
export interface LocalServiceManagerOptions {
  /** Service manager type discriminator */
  type: "local";
  /** Unique identifier for the kernel instance */
  kernelId: string;
  /** Name of the kernel specification (e.g., 'python3') */
  kernelName: string;
  /** Base URL for the kernel connection */
  url: string;
}

/**
 * Options for creating a remote service manager.
 */
export interface RemoteServiceManagerOptions {
  /** Service manager type discriminator */
  type: "remote";
  /** JupyterLab server connection settings */
  serverSettings: ServerConnection.ISettings;
}

/**
 * Options for creating a Pyodide service manager.
 */
export interface PyodideServiceManagerOptions {
  /** Service manager type discriminator */
  type: "pyodide";
  /** Optional Pyodide CDN URL (defaults to official CDN) */
  pyodideUrl?: string;
}

/**
 * Discriminated union of all service manager creation options.
 */
export type ServiceManagerOptions =
  | MockServiceManagerOptions
  | LocalServiceManagerOptions
  | RemoteServiceManagerOptions
  | PyodideServiceManagerOptions;

/**
 * Factory for creating Jupyter service managers.
 * Centralizes service manager creation with type discrimination.
 */
export class ServiceManagerFactory {
  /**
   * Create a service manager based on type and options.
   *
   * @param options - Discriminated union of service manager options
   * @returns Service manager instance
   * @throws {Error} If Pyodide type is used (not yet implemented)
   *
   * @example
   * ```typescript
   * // Mock service manager (no execution)
   * const mock = ServiceManagerFactory.create({ type: 'mock' });
   *
   * // Local kernel service manager (VS Code Python)
   * const local = ServiceManagerFactory.create({
   *   type: 'local',
   *   kernelId: 'abc-123',
   *   kernelName: 'python3',
   *   url: 'http://localhost:8888'
   * });
   *
   * // Remote service manager (Jupyter server)
   * const remote = ServiceManagerFactory.create({
   *   type: 'remote',
   *   serverSettings: mySettings
   * });
   * ```
   */
  static create(options: ServiceManagerOptions): ServiceManager.IManager {
    switch (options.type) {
      case "mock":
        return createMockServiceManager();

      case "local":
        return createLocalKernelServiceManager(
          options.kernelId,
          options.kernelName,
          options.url,
        );

      case "remote":
        return new ServiceManager({ serverSettings: options.serverSettings });

      case "pyodide":
        return createPyodideServiceManager(options.pyodideUrl);

      default:
        // Type guard ensures this is unreachable
        const _exhaustive: never = options;
        throw new Error(
          `Unknown service manager type: ${(_exhaustive as ServiceManagerOptions).type}`,
        );
    }
  }

  /**
   * Type guard to check if a service manager is a mock manager.
   *
   * @param manager - Service manager to check
   * @returns True if manager is a mock service manager
   */
  static isMock(manager: ServiceManager.IManager): boolean {
    return (
      "__isMockServiceManager" in manager &&
      manager.__isMockServiceManager === true
    );
  }

  /**
   * Get the type of a service manager if identifiable.
   * Returns 'unknown' for managers created outside the factory.
   *
   * @param manager - Service manager to identify
   * @returns Service manager type or 'unknown'
   */
  static getType(
    manager: ServiceManager.IManager,
  ): ServiceManagerType | "unknown" {
    if (ServiceManagerFactory.isMock(manager)) {
      return "mock";
    }

    // For local and remote, we'd need additional type markers
    // For now, return 'unknown' for non-mock managers
    // This can be enhanced in future PRs
    return "unknown";
  }
}
