/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * @module baseSessionManager
 *
 * Base class for all session manager implementations.
 *
 * This module provides the foundational architecture for managing Jupyter sessions
 * across different kernel environments:
 * - Mock sessions (no execution, for testing/placeholder UIs)
 * - Pyodide sessions (browser-based, connects notebooks to Pyodide kernels)
 * - Local sessions (VS Code Python environments)
 * - Remote sessions (Jupyter servers)
 *
 * ## What is a Session?
 *
 * A session connects a notebook document to a kernel for code execution.
 * Sessions manage:
 * - Notebook-to-kernel binding (path, name, type)
 * - Kernel lifecycle (start, change, shutdown)
 * - State synchronization between notebook and kernel
 *
 * ## Benefits of Base Class Pattern
 *
 * 1. **Code Reuse**: Eliminates duplicate session management code across implementations
 * 2. **Interface Compliance**: Ensures all managers correctly implement Session.IManager
 * 3. **Consistent Behavior**: Standardizes logging, validation, disposal, and lifecycle
 * 4. **Type Safety**: Type discriminators enable runtime identification
 * 5. **Simplified Implementation**: Single active session model for custom managers
 *
 * ## Architecture
 *
 * The base class implements common Session.IManager methods:
 * - running(), shutdown(), shutdownAll(), dispose() - fully implemented
 * - startNew() - abstract, must be implemented by subclasses
 * - Single _activeSession field simplifies state management
 *
 * @example
 * ```typescript
 * // Creating a new session manager type
 * class CustomSessionManager extends BaseSessionManager {
 *   readonly managerType = 'custom' as const;
 *
 *   async startNew(options: Session.ISessionOptions): Promise<Session.ISessionConnection> {
 *     // Create kernel first
 *     const kernel = await this._kernelManager.startNew(options.kernel);
 *
 *     // Wrap in session connection
 *     const session = createSessionConnection(kernel, options);
 *     this._activeSession = session;
 *     this._runningChanged.emit([session.model]);
 *     return session;
 *   }
 * }
 * ```
 */

import { Session, ServerConnection } from "@jupyterlab/services";
import { Signal, ISignal } from "@lumino/signaling";

/**
 * Type discriminator for session manager implementations.
 */
export type SessionManagerType = "mock" | "pyodide" | "local" | "remote";

/**
 * Abstract base class for session manager implementations.
 *
 * Implements common Session.IManager interface methods that are identical
 * across all manager types.
 *
 * @abstract
 * @implements {Session.IManager}
 *
 * @example
 * ```typescript
 * class MySessionManager extends BaseSessionManager {
 *   readonly managerType = 'custom' as const;
 *
 *   async startNew(options: Session.ISessionOptions): Promise<Session.ISessionConnection> {
 *     // Custom session creation logic
 *   }
 * }
 * ```
 */
export abstract class BaseSessionManager implements Session.IManager {
  /**
   * Type identifier for this session manager.
   */
  abstract readonly managerType: SessionManagerType;

  /**
   * Currently active session connection.
   * Most custom managers support only one session at a time.
   */
  protected _activeSession: Session.ISessionConnection | null = null;

  /**
   * Ready state flag.
   */
  protected _isReady = true;

  /**
   * Ready promise that resolves immediately.
   */
  protected _ready = Promise.resolve();

  /**
   * Signal emitted when running sessions change.
   */
  protected _runningChanged = new Signal<this, Session.IModel[]>(this);

  /**
   * Signal emitted when connection to session fails.
   */
  protected _connectionFailure = new Signal<
    this,
    ServerConnection.NetworkError
  >(this);

  /**
   * Signal emitted when manager is disposed.
   */
  protected _disposed = new Signal<this, void>(this);

  /**
   * Disposal state flag.
   */
  protected _isDisposed = false;

  /**
   * Creates a new session manager instance.
   *
   * @param serverSettings - Jupyter server connection settings
   */
  constructor(public serverSettings: ServerConnection.ISettings) {}

  /**
   * Whether the manager is ready.
   */
  get isReady(): boolean {
    return this._isReady;
  }

  /**
   * Promise that resolves when manager is ready.
   */
  get ready(): Promise<void> {
    return this._ready;
  }

  /**
   * Signal emitted when running sessions change.
   */
  get runningChanged(): ISignal<this, Session.IModel[]> {
    return this._runningChanged;
  }

  /**
   * Signal emitted when session connection fails.
   */
  get connectionFailure(): ISignal<this, ServerConnection.NetworkError> {
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
   */
  get disposed(): ISignal<this, void> {
    return this._disposed;
  }

  /**
   * Whether the manager is active and functional.
   */
  get isActive(): boolean {
    return !this._isDisposed;
  }

  /**
   * Iterate over running session models.
   *
   * @yields {Session.IModel} Running session models
   */
  *running(): IterableIterator<Session.IModel> {
    if (this._activeSession) {
      yield this._activeSession.model;
    }
  }

  /**
   * Refresh the list of running sessions.
   * No-op for custom managers.
   */
  async refreshRunning(): Promise<void> {
    this.log("refreshRunning called (no-op)");
  }

  /**
   * Find a session by ID.
   *
   * @param id - Session identifier
   * @returns Session model if found
   */
  async findById(id: string): Promise<Session.IModel | undefined> {
    return this._activeSession?.id === id
      ? this._activeSession.model
      : undefined;
  }

  /**
   * Find a session by path.
   *
   * @param path - Notebook path
   * @returns Session model if found
   */
  async findByPath(path: string): Promise<Session.IModel | undefined> {
    return this._activeSession?.path === path
      ? this._activeSession.model
      : undefined;
  }

  /**
   * Get session model by ID.
   *
   * @param id - Session identifier
   * @returns Session model or undefined
   */
  getModel(id: string): Session.IModel | undefined {
    return this._activeSession?.id === id
      ? this._activeSession.model
      : undefined;
  }

  /**
   * Shut down a specific session by ID.
   *
   * @param id - Session identifier
   */
  async shutdown(id: string): Promise<void> {
    this.log(`shutdown called for session: ${id}`);

    if (this._activeSession?.id === id) {
      await this._activeSession.shutdown();
      this._activeSession = null;
      this._runningChanged.emit([]);
    } else {
      this.log(`Session ${id} not found or already shut down`);
    }
  }

  /**
   * Shut down all running sessions.
   */
  async shutdownAll(): Promise<void> {
    this.log("shutdownAll called");

    if (this._activeSession) {
      await this._activeSession.shutdown();
      this._activeSession = null;
      this._runningChanged.emit([]);
    }
  }

  /**
   * Stop session if needed (for compatibility).
   *
   * @param path - Notebook path
   */
  async stopIfNeeded(path: string): Promise<void> {
    if (this._activeSession?.path === path) {
      await this._activeSession.shutdown();
      this._activeSession = null;
      this._runningChanged.emit([]);
    }
  }

  /**
   * Dispose of the session manager and all resources.
   */
  dispose(): void {
    if (this._isDisposed) {
      return;
    }

    this.log("dispose called");

    // Shut down active session synchronously
    if (this._activeSession) {
      this._activeSession.shutdown().catch((err) => {
        this.log("Error shutting down session during disposal:", err);
      });
      this._activeSession = null;
    }

    this._isDisposed = true;
    this._disposed.emit();

    // Clear signals
    Signal.clearData(this);
  }

  /**
   * Unified logging helper.
   *
   * @param message - Log message
   * @param args - Additional arguments
   */
  protected log(message: string, ...args: unknown[]): void {
    const prefix = `[${this.managerType}SessionManager]`;
    if (args.length > 0) {
      console.log(prefix, message, ...args);
    } else {
      console.log(prefix, message);
    }
  }

  /**
   * Validate that a session with the given ID exists.
   *
   * @param id - Session ID to validate
   * @throws {Error} If no active session or ID doesn't match
   */
  protected validateSessionId(id: string): void {
    if (!this._activeSession) {
      throw new Error(`No active session found`);
    }
    if (this._activeSession.id !== id) {
      throw new Error(
        `Session ${id} not found (active session is ${this._activeSession.id})`,
      );
    }
  }

  /**
   * Start a new session.
   * Must be implemented by subclasses.
   *
   * @param options - Session creation options
   * @returns Promise resolving to the new session connection
   */
  abstract startNew(
    options: Session.ISessionOptions,
    connectOptions?: Omit<
      Session.ISessionConnection.IOptions,
      "model" | "serverSettings"
    >,
  ): Promise<Session.ISessionConnection>;

  /**
   * Connect to an existing session.
   *
   * @param _options - Connection options (unused in base implementation)
   * @returns Session connection
   */
  connectTo(
    _options: Session.ISessionConnection.IOptions,
  ): Session.ISessionConnection {
    this.log("connectTo called (delegating to active session)");

    if (this._activeSession) {
      return this._activeSession;
    }

    throw new Error(
      `connectTo called without active session - use startNew instead for ${this.managerType} sessions`,
    );
  }
}
