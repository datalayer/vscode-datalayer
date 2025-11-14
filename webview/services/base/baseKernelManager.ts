/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * @module baseKernelManager
 *
 * Base class for all kernel manager implementations.
 *
 * This module provides the foundational architecture for managing Jupyter kernels
 * across different execution environments:
 * - Mock kernels (no execution, for testing/placeholder UIs)
 * - Pyodide kernels (browser-based Python via WebAssembly)
 * - Local kernels (VS Code Python environments)
 * - Remote kernels (Jupyter servers)
 *
 * ## Benefits of Base Class Pattern
 *
 * 1. **Code Reuse**: Eliminates ~200+ lines of duplicate code across manager implementations
 * 2. **Interface Compliance**: Ensures all managers correctly implement Kernel.IManager
 * 3. **Consistent Behavior**: Standardizes logging, validation, disposal, and lifecycle management
 * 4. **Type Safety**: Type discriminators enable runtime identification and debugging
 * 5. **Extensibility**: Adding new kernel types is trivial - extend base, implement startNew()
 *
 * ## Architecture
 *
 * The base class implements the "Template Method" pattern:
 * - Common operations (shutdown, dispose, logging) are fully implemented
 * - Kernel creation (startNew) is abstract and must be provided by subclasses
 * - Single active kernel model simplifies state management for custom managers
 *
 * @example
 * ```typescript
 * // Creating a new kernel manager type
 * class CustomKernelManager extends BaseKernelManager {
 *   readonly managerType = 'custom' as const;
 *
 *   async startNew(options?: Partial<Pick<Kernel.IModel, "name">>): Promise<Kernel.IKernelConnection> {
 *     // Custom kernel creation logic
 *     const kernel = await createMyCustomKernel(options);
 *     this._activeKernel = kernel;
 *     this._runningChanged.emit([kernel.model]);
 *     return kernel;
 *   }
 * }
 * ```
 */

import { Kernel, ServerConnection } from "@jupyterlab/services";
import { Signal, ISignal } from "@lumino/signaling";

/**
 * Type discriminator for kernel manager implementations.
 * Enables runtime type identification and manager-specific behavior.
 */
export type KernelManagerType = "mock" | "pyodide" | "local" | "remote";

/**
 * Extended interface for type-aware kernel managers.
 * All custom kernel managers should implement this interface.
 */
export interface ITypedKernelManager extends Kernel.IManager {
  /**
   * Identifies the type of kernel manager.
   * Used for debugging, logging, and manager-specific optimizations.
   */
  readonly managerType: KernelManagerType;
}

/**
 * Abstract base class for kernel manager implementations.
 *
 * Implements common Kernel.IManager interface methods that are identical
 * across all manager types, reducing code duplication and ensuring consistency.
 *
 * This class implements both the standard JupyterLab Kernel.IManager interface
 * and the custom ITypedKernelManager interface for type discrimination.
 *
 * @abstract
 *
 * @example
 * ```typescript
 * class MyKernelManager extends BaseKernelManager {
 *   readonly managerType = 'custom' as const;
 *
 *   async startNew(options?: any): Promise<Kernel.IKernelConnection> {
 *     // Custom kernel creation logic
 *   }
 * }
 * ```
 */
export abstract class BaseKernelManager implements ITypedKernelManager {
  /**
   * Type identifier for this kernel manager.
   * Must be implemented by subclasses.
   */
  abstract readonly managerType: KernelManagerType;

  /**
   * Currently active kernel connection.
   * Most custom managers (mock, Pyodide, local) support only one kernel at a time.
   */
  protected _activeKernel: Kernel.IKernelConnection | null = null;

  /**
   * Ready state flag.
   * True for synchronous managers (mock, Pyodide, local).
   */
  protected _isReady = true;

  /**
   * Ready promise that resolves immediately.
   * All custom managers are ready synchronously.
   */
  protected _ready = Promise.resolve();

  /**
   * Signal emitted when running kernels change.
   * Emitted after kernel startup, shutdown, or disposal.
   */
  protected _runningChanged = new Signal<this, Kernel.IModel[]>(this);

  /**
   * Signal emitted when connection to kernel fails.
   * Used for error propagation to UI components.
   */
  protected _connectionFailure = new Signal<this, Error>(this);

  /**
   * Signal emitted when manager is disposed.
   * Used for cleanup and resource management.
   */
  protected _disposed = new Signal<this, void>(this);

  /**
   * Disposal state flag.
   */
  protected _isDisposed = false;

  /**
   * Creates a new kernel manager instance.
   *
   * @param serverSettings - Jupyter server connection settings
   */
  constructor(public serverSettings: ServerConnection.ISettings) {}

  /**
   * Whether the manager is ready to create kernels.
   * Always true for custom managers (mock, Pyodide, local).
   */
  get isReady(): boolean {
    return this._isReady;
  }

  /**
   * Promise that resolves when manager is ready.
   * Resolves immediately for custom managers.
   */
  get ready(): Promise<void> {
    return this._ready;
  }

  /**
   * Signal emitted when running kernels change.
   *
   * @example
   * ```typescript
   * manager.runningChanged.connect((sender, models) => {
   *   console.log(`Running kernels: ${models.length}`);
   * });
   * ```
   */
  get runningChanged(): ISignal<this, Kernel.IModel[]> {
    return this._runningChanged;
  }

  /**
   * Signal emitted when kernel connection fails.
   *
   * @example
   * ```typescript
   * manager.connectionFailure.connect((sender, error) => {
   *   console.error('Kernel connection failed:', error);
   * });
   * ```
   */
  get connectionFailure(): ISignal<this, Error> {
    return this._connectionFailure;
  }

  /**
   * Whether the manager has been disposed.
   */
  get isDisposed(): boolean {
    return this._isDisposed;
  }

  /**
   * Signal emitted when manager is disposed.
   * Used for cleanup in consuming components.
   */
  get disposed(): ISignal<this, void> {
    return this._disposed;
  }

  /**
   * Number of currently running kernels.
   * For single-kernel managers (mock, Pyodide, local), returns 0 or 1.
   */
  get runningCount(): number {
    return this._activeKernel ? 1 : 0;
  }

  /**
   * Whether the manager is active and functional.
   * Returns false after disposal.
   */
  get isActive(): boolean {
    return !this._isDisposed;
  }

  /**
   * Iterate over running kernel models.
   *
   * Standard implementation for single-kernel managers.
   * Yields the active kernel model if one exists.
   *
   * @yields {Kernel.IModel} Running kernel models
   *
   * @example
   * ```typescript
   * for (const model of manager.running()) {
   *   console.log(`Kernel: ${model.id} (${model.name})`);
   * }
   * ```
   */
  *running(): IterableIterator<Kernel.IModel> {
    if (this._activeKernel) {
      yield this._activeKernel.model;
    }
  }

  /**
   * Request the list of running kernels from the server.
   *
   * For custom managers (mock, local, Pyodide), returns the current active kernel.
   * Remote managers should override this to query the actual Jupyter server.
   *
   * @returns Promise resolving to array of running kernel models
   */
  async requestRunning(): Promise<Kernel.IModel[]> {
    this.log("requestRunning called");
    return this._activeKernel ? [this._activeKernel.model] : [];
  }

  /**
   * Refresh the list of running kernels.
   *
   * No-op for custom managers that don't poll a server.
   * Override in remote managers that need to sync with server state.
   */
  async refreshRunning(): Promise<void> {
    this.log("refreshRunning called (no-op for custom kernels)");
  }

  /**
   * Find a kernel by ID.
   *
   * Standard implementation checks if the active kernel matches.
   *
   * @param id - Kernel identifier
   * @returns Kernel model if found, undefined otherwise
   */
  async findById(id: string): Promise<Kernel.IModel | undefined> {
    return this._activeKernel?.id === id ? this._activeKernel.model : undefined;
  }

  /**
   * Shut down a specific kernel by ID.
   *
   * Standard implementation for single-kernel managers.
   * Shuts down the active kernel if IDs match, emits runningChanged signal.
   *
   * @param id - Kernel identifier to shut down
   *
   * @example
   * ```typescript
   * await manager.shutdown('kernel-123');
   * ```
   */
  async shutdown(id: string): Promise<void> {
    this.log(`shutdown called for kernel: ${id}`);

    if (this._activeKernel?.id === id) {
      await this._activeKernel.shutdown();
      this._activeKernel = null;
      this._runningChanged.emit([]);
    } else {
      this.log(`Kernel ${id} not found or already shut down`);
    }
  }

  /**
   * Shut down all running kernels.
   *
   * Standard implementation for single-kernel managers.
   * Shuts down the active kernel if one exists.
   *
   * @example
   * ```typescript
   * await manager.shutdownAll();
   * ```
   */
  async shutdownAll(): Promise<void> {
    this.log("shutdownAll called");

    if (this._activeKernel) {
      await this._activeKernel.shutdown();
      this._activeKernel = null;
      this._runningChanged.emit([]);
    }
  }

  /**
   * Dispose of the kernel manager and all resources.
   *
   * Shuts down active kernels, disconnects signals, marks as disposed.
   * Subclasses should call super.dispose() after their cleanup.
   */
  dispose(): void {
    if (this._isDisposed) {
      return;
    }

    this.log("dispose called");

    // Shut down active kernel synchronously (fire and forget)
    if (this._activeKernel) {
      this._activeKernel.shutdown().catch((err) => {
        this.log("Error shutting down kernel during disposal:", err);
      });
      this._activeKernel = null;
    }

    this._isDisposed = true;
    this._disposed.emit();

    // Clear signals
    Signal.clearData(this);
  }

  /**
   * Unified logging helper with manager type prefix.
   *
   * @param message - Log message
   * @param args - Additional arguments to log
   *
   * @example
   * ```typescript
   * this.log("Starting kernel", { name: "python3" });
   * // Output: [PyodideKernelManager] Starting kernel { name: "python3" }
   * ```
   */
  protected log(message: string, ...args: unknown[]): void {
    const prefix = `[${this.managerType}KernelManager]`;
    if (args.length > 0) {
      console.log(prefix, message, ...args);
    } else {
      console.log(prefix, message);
    }
  }

  /**
   * Validate that a kernel with the given ID exists.
   *
   * @param id - Kernel ID to validate
   * @throws {Error} If no active kernel or ID doesn't match
   */
  protected validateKernelId(id: string): void {
    if (!this._activeKernel) {
      throw new Error(`No active kernel found`);
    }
    if (this._activeKernel.id !== id) {
      throw new Error(
        `Kernel ${id} not found (active kernel is ${this._activeKernel.id})`,
      );
    }
  }

  /**
   * Start a new kernel.
   *
   * Must be implemented by subclasses to provide manager-specific
   * kernel creation logic.
   *
   * @param options - Kernel creation options (name, etc.)
   * @param connectOptions - Connection options (clientId, username, etc.)
   * @returns Promise resolving to the new kernel connection
   */
  abstract startNew(
    options?: Partial<Pick<Kernel.IModel, "name">>,
    connectOptions?: Omit<
      Kernel.IKernelConnection.IOptions,
      "model" | "serverSettings"
    >,
  ): Promise<Kernel.IKernelConnection>;

  /**
   * Connect to an existing kernel.
   *
   * For single-kernel managers, typically returns the active kernel
   * or throws an error. Override for custom behavior.
   *
   * @param _options - Connection options (unused in base implementation)
   * @returns Kernel connection
   */
  connectTo(
    _options: Kernel.IKernelConnection.IOptions,
  ): Kernel.IKernelConnection {
    this.log("connectTo called (delegating to active kernel)");

    if (this._activeKernel) {
      return this._activeKernel;
    }

    throw new Error(
      `connectTo called without active kernel - use startNew instead for ${this.managerType} kernels`,
    );
  }
}
