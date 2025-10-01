/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Base service class with lifecycle management.
 * Provides common functionality for all services including state tracking and logging.
 *
 * @module services/core/baseService
 */

import type { ILogger } from "../interfaces/ILogger";

/**
 * Service lifecycle states.
 */
export enum ServiceState {
  Uninitialized = "uninitialized",
  Initializing = "initializing",
  Ready = "ready",
  Disposing = "disposing",
  Disposed = "disposed",
  Error = "error",
}

/**
 * Lifecycle interface for services.
 */
export interface ILifecycle {
  /**
   * Initializes the service.
   * Should be called before any other service methods.
   */
  initialize(): Promise<void>;

  /**
   * Disposes the service and cleans up resources.
   * Should be called during extension deactivation.
   */
  dispose(): Promise<void>;
}

/**
 * Base class for all services with lifecycle management.
 * Handles initialization, disposal, and state tracking.
 *
 * @example
 * ```typescript
 * export class MyService extends BaseService {
 *   constructor(logger: ILogger) {
 *     super('MyService', logger);
 *   }
 *
 *   protected async onInitialize(): Promise<void> {
 *     // Service initialization logic
 *   }
 *
 *   protected async onDispose(): Promise<void> {
 *     // Cleanup logic
 *   }
 *
 *   public async doWork(): Promise<void> {
 *     this.assertReady(); // Ensures service is initialized
 *     // Work logic
 *   }
 * }
 * ```
 */
export abstract class BaseService implements ILifecycle {
  private _state: ServiceState = ServiceState.Uninitialized;

  /**
   * Creates a new service instance.
   *
   * @param name - Service name for logging
   * @param logger - Logger instance for this service
   */
  constructor(
    protected readonly name: string,
    protected readonly logger: ILogger,
  ) {}

  /**
   * Gets the current service state.
   */
  get state(): ServiceState {
    return this._state;
  }

  /**
   * Initializes the service.
   * Ensures initialization only happens once and tracks state.
   */
  async initialize(): Promise<void> {
    if (this._state !== ServiceState.Uninitialized) {
      this.logger.warn(
        `${this.name} already initialized (state: ${this._state})`,
      );
      return;
    }

    try {
      this._state = ServiceState.Initializing;
      this.logger.info(`Initializing ${this.name}...`);

      await this.onInitialize();

      this._state = ServiceState.Ready;
      this.logger.info(`${this.name} ready`);
    } catch (error) {
      this._state = ServiceState.Error;
      this.logger.error(`Failed to initialize ${this.name}`, error as Error);
      throw error;
    }
  }

  /**
   * Disposes the service and cleans up resources.
   * Ensures disposal only happens once.
   */
  async dispose(): Promise<void> {
    if (this._state === ServiceState.Disposed) {
      return;
    }

    try {
      this._state = ServiceState.Disposing;
      this.logger.info(`Disposing ${this.name}...`);

      await this.onDispose();

      this._state = ServiceState.Disposed;
      this.logger.info(`${this.name} disposed`);
    } catch (error) {
      this.logger.error(`Error disposing ${this.name}`, error as Error);
      throw error;
    }
  }

  /**
   * Asserts that the service is ready for use.
   * Throws an error if the service is not in the Ready state.
   *
   * @throws Error if service is not ready
   */
  protected assertReady(): void {
    if (this._state !== ServiceState.Ready) {
      throw new Error(
        `${this.name} is not ready (state: ${this._state}). Call initialize() first.`,
      );
    }
  }

  /**
   * Implementation-specific initialization logic.
   * Called once during initialize().
   */
  protected abstract onInitialize(): Promise<void>;

  /**
   * Implementation-specific disposal logic.
   * Called once during dispose().
   */
  protected abstract onDispose(): Promise<void>;
}
