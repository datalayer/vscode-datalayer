/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Service container for dependency injection.
 * Manages all services with proper initialization order and lifecycle.
 *
 * @module services/core/serviceContainer
 */

import * as vscode from "vscode";
import type { DatalayerClient } from "../../../../core/lib/client";
import type { IAuthProvider } from "../interfaces/IAuthProvider";
import type { IDocumentBridge } from "../interfaces/IDocumentBridge";
import type { IKernelBridge } from "../interfaces/IKernelBridge";
import type { ILogger } from "../interfaces/ILogger";
import type { ILoggerManager } from "../interfaces/ILoggerManager";
import type { IErrorHandler } from "../interfaces/IErrorHandler";
import { LoggerManager, Logger } from "../logging/loggerManager";
import { ServiceLoggers } from "../logging/loggers";
import { createVSCodeSDK } from "./sdkAdapter";
import { SDKAuthProvider } from "./authProvider";
import { DocumentBridge } from "../notebook/documentBridge";
import { KernelBridge } from "../notebook/kernelBridge";
import { NotebookNetworkService } from "../notebook/notebookNetwork";
import { NotebookRuntimeService } from "../notebook/notebookRuntime";
import { ErrorHandler } from "./errorHandler";
import { ILifecycle } from "./baseService";

/**
 * Service container interface defining all available services.
 */
export interface IServiceContainer extends ILifecycle {
  // Core services
  readonly context: vscode.ExtensionContext;
  readonly sdk: DatalayerClient;
  readonly authProvider: IAuthProvider;
  readonly errorHandler: IErrorHandler;

  // Logging services
  readonly loggerManager: ILoggerManager;
  readonly logger: ILogger;

  // Notebook services
  readonly documentBridge: IDocumentBridge;
  readonly kernelBridge: IKernelBridge;
  readonly notebookNetwork: NotebookNetworkService;
  readonly notebookRuntime: NotebookRuntimeService;
}

/**
 * Default implementation of the service container.
 * Provides lazy initialization of services with proper dependency injection.
 *
 * @example
 * ```typescript
 * const container = new ServiceContainer(context);
 * await container.initialize();
 *
 * // Use services
 * await container.authProvider.login();
 * const doc = await container.documentBridge.openDocument(document);
 * ```
 */
export class ServiceContainer implements IServiceContainer {
  // Lazy-initialized services
  private _sdk?: DatalayerClient;
  private _authProvider?: SDKAuthProvider;
  private _documentBridge?: DocumentBridge;
  private _kernelBridge?: KernelBridge;
  private _notebookNetwork?: NotebookNetworkService;
  private _notebookRuntime?: NotebookRuntimeService;
  private _loggerManager?: ILoggerManager;
  private _logger?: ILogger;
  private _errorHandler?: IErrorHandler;

  constructor(public readonly context: vscode.ExtensionContext) {}

  // Core services with lazy initialization

  get sdk(): DatalayerClient {
    if (!this._sdk) {
      this._sdk = createVSCodeSDK({ context: this.context });
    }
    return this._sdk;
  }

  get authProvider(): IAuthProvider {
    if (!this._authProvider) {
      this._authProvider = new SDKAuthProvider(
        this.sdk,
        this.context,
        this.loggerManager.createLogger("Auth"),
      );
    }
    return this._authProvider;
  }

  get errorHandler(): IErrorHandler {
    if (!this._errorHandler) {
      this._errorHandler = new ErrorHandler(this.logger);
    }
    return this._errorHandler;
  }

  // Logging services

  get loggerManager(): ILoggerManager {
    if (!this._loggerManager) {
      this._loggerManager = LoggerManager.getInstance(this.context);
    }
    return this._loggerManager;
  }

  get logger(): ILogger {
    if (!this._logger) {
      this._logger = this.loggerManager.createLogger("ServiceContainer");
    }
    return this._logger;
  }

  // Notebook services

  get documentBridge(): IDocumentBridge {
    if (!this._documentBridge) {
      this.logger.debug("Lazily initializing DocumentBridge service");
      this._documentBridge = DocumentBridge.getInstance(this.context, this.sdk);
    }
    return this._documentBridge;
  }

  get kernelBridge(): IKernelBridge {
    if (!this._kernelBridge) {
      this.logger.debug("Lazily initializing KernelBridge service");
      this._kernelBridge = new KernelBridge(
        this.sdk,
        this.authProvider as SDKAuthProvider,
      );
    }
    return this._kernelBridge;
  }

  get notebookNetwork(): NotebookNetworkService {
    if (!this._notebookNetwork) {
      this.logger.debug("Lazily initializing NotebookNetwork service");
      this._notebookNetwork = new NotebookNetworkService();
    }
    return this._notebookNetwork;
  }

  get notebookRuntime(): NotebookRuntimeService {
    if (!this._notebookRuntime) {
      this.logger.debug("Lazily initializing NotebookRuntime service");
      this._notebookRuntime = NotebookRuntimeService.getInstance();
    }
    return this._notebookRuntime;
  }

  /**
   * Initializes core services needed during extension activation.
   * Only initializes SDK, auth, and logging - other services are lazy.
   *
   * Performance: This method is optimized to initialize only what's needed
   * during extension activation. Document/kernel services are deferred until
   * first use (typically when a command is invoked).
   */
  async initialize(): Promise<void> {
    try {
      // Initialize logging infrastructure FIRST (before any logging or service access)
      ServiceLoggers.initialize(this.loggerManager);

      this.logger.info("Initializing service container...");

      // Eagerly initialize SDK (needed for UI initialization)
      const sdk = this.sdk; // Triggers SDK creation with logging available

      // Initialize authentication (needed for UI state)
      await this.authProvider.initialize();

      // ✨ PERFORMANCE: Document, kernel, and notebook services are NOT initialized here
      // They will be lazily created when first accessed (typically via commands)
      // This reduces extension activation time significantly

      this.logger.info("Service container initialized successfully", {
        initializedServices: ["LoggerManager", "Logger", "SDK", "AuthProvider"],
        deferredServices: [
          "DocumentBridge",
          "KernelBridge",
          "NotebookNetwork",
          "NotebookRuntime",
          "ErrorHandler",
        ],
      });
    } catch (error) {
      // Logger might not be available if initialization failed very early
      if (this._logger) {
        this.logger.error(
          "Failed to initialize service container",
          error as Error,
        );
      }
      throw error;
    }
  }

  /**
   * Disposes all services in reverse initialization order.
   * Cleans up resources and prepares for extension deactivation.
   */
  async dispose(): Promise<void> {
    this.logger.info("Disposing service container...");

    try {
      // Dispose services in reverse order
      if (this._documentBridge) {
        this._documentBridge.dispose();
      }

      // Note: Once services are migrated to BaseService,
      // we'll call dispose() on each one properly

      this.logger.info("Service container disposed successfully");
    } catch (error) {
      this.logger.error("Error disposing service container", error as Error);
    }
  }
}
