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
import type { DatalayerClient } from "@datalayer/core/lib/client";
import type { IAuthProvider } from "../interfaces/IAuthProvider";
import type { IDocumentBridge } from "../interfaces/IDocumentBridge";
import type { IKernelBridge } from "../interfaces/IKernelBridge";
import type { ILogger } from "../interfaces/ILogger";
import type { ILoggerManager } from "../interfaces/ILoggerManager";
import type { IErrorHandler } from "../interfaces/IErrorHandler";
import { LoggerManager } from "../logging/loggerManager";
import { ServiceLoggers } from "../logging/loggers";
import { createVSCodeSDK } from "./sdkAdapter";
import { SDKAuthProvider } from "./authProvider";
import { DocumentBridge } from "../bridges/documentBridge";
import { KernelBridge } from "../bridges/kernelBridge";
import { AgentRuntimeBridge } from "../bridges/agentRuntimeBridge";
import { NotebookNetworkService } from "../network/networkProxy";
import { ErrorHandler } from "./errorHandler";
import { ILifecycle } from "./baseService";
import { DocumentRegistry } from "../documents/documentRegistry";

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

  // Document services
  readonly documentRegistry: DocumentRegistry;

  // Notebook services
  readonly documentBridge: IDocumentBridge;
  readonly kernelBridge: IKernelBridge;
  readonly notebookNetwork: NotebookNetworkService;

  // Agent services
  readonly agentRuntimeBridge: AgentRuntimeBridge;
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
  /**
   * Lazily initialized SDK client for Datalayer platform.
   * @private
   */
  private _sdk?: DatalayerClient;

  /**
   * Lazily initialized authentication provider for managing user auth state.
   * @private
   */
  private _authProvider?: SDKAuthProvider;

  /**
   * Lazily initialized bridge service for document operations.
   * @private
   */
  private _documentBridge?: DocumentBridge;

  /**
   * Lazily initialized bridge service for kernel operations.
   * @private
   */
  private _kernelBridge?: KernelBridge;

  /**
   * Lazily initialized network service for notebook communication.
   * @private
   */
  private _notebookNetwork?: NotebookNetworkService;

  /**
   * Lazily initialized logger manager for creating loggers.
   * @private
   */
  private _loggerManager?: ILoggerManager;

  /**
   * Lazily initialized logger instance for this service container.
   * @private
   */
  private _logger?: ILogger;

  /**
   * Lazily initialized error handler for centralized error management.
   * @private
   */
  private _errorHandler?: IErrorHandler;

  /**
   * Lazily initialized document registry for managing document lifecycle.
   * @private
   */
  private _documentRegistry?: DocumentRegistry;

  /**
   * Lazily initialized agent runtime bridge for chat operations.
   * @private
   */
  private _agentRuntimeBridge?: AgentRuntimeBridge;

  /**
   * Creates a new service container instance.
   *
   * @param context The VS Code extension context for accessing extension state
   */
  constructor(public readonly context: vscode.ExtensionContext) {}

  /**
   * Gets or lazily initializes the Datalayer SDK client.
   * Creates a new SDK instance with VS Code context on first access.
   *
   * @returns The initialized DatalayerClient instance
   */
  get sdk(): DatalayerClient {
    if (!this._sdk) {
      this._sdk = createVSCodeSDK({ context: this.context });
    }
    return this._sdk;
  }

  /**
   * Gets or lazily initializes the authentication provider.
   * Creates a new SDKAuthProvider instance on first access.
   *
   * @returns The initialized IAuthProvider instance
   */
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

  /**
   * Gets or lazily initializes the error handler.
   * Creates a new ErrorHandler instance on first access.
   *
   * @returns The initialized IErrorHandler instance
   */
  get errorHandler(): IErrorHandler {
    if (!this._errorHandler) {
      this._errorHandler = new ErrorHandler(this.logger);
    }
    return this._errorHandler;
  }

  /**
   * Gets or lazily initializes the logger manager.
   * Retrieves singleton LoggerManager instance on first access.
   *
   * @returns The initialized ILoggerManager instance
   */
  get loggerManager(): ILoggerManager {
    if (!this._loggerManager) {
      this._loggerManager = LoggerManager.getInstance(this.context);
    }
    return this._loggerManager;
  }

  /**
   * Gets or lazily initializes the logger for the service container.
   * Creates a logger instance from the logger manager on first access.
   *
   * @returns The initialized ILogger instance
   */
  get logger(): ILogger {
    if (!this._logger) {
      this._logger = this.loggerManager.createLogger("Service Container");
    }
    return this._logger;
  }

  /**
   * Gets or lazily initializes the document registry.
   * Creates a new DocumentRegistry instance on first access.
   *
   * @returns The initialized DocumentRegistry instance
   */
  get documentRegistry(): DocumentRegistry {
    if (!this._documentRegistry) {
      this._documentRegistry = new DocumentRegistry();
    }
    return this._documentRegistry;
  }

  /**
   * Gets or lazily initializes the document bridge service.
   * Creates a new DocumentBridge instance on first access.
   * Responsible for downloading and opening documents from the platform.
   *
   * @returns The initialized IDocumentBridge instance
   */
  get documentBridge(): IDocumentBridge {
    if (!this._documentBridge) {
      this.logger.debug("Lazily initializing DocumentBridge service");
      this._documentBridge = DocumentBridge.getInstance(this.context, this.sdk);
    }
    return this._documentBridge;
  }

  /**
   * Gets or lazily initializes the kernel bridge service.
   * Creates a new KernelBridge instance on first access.
   * Routes kernel connections between extension and webview.
   *
   * @returns The initialized IKernelBridge instance
   */
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

  /**
   * Gets or lazily initializes the notebook network service.
   * Creates a new NotebookNetworkService instance on first access.
   * Provides HTTP and WebSocket proxy for notebook communication.
   *
   * @returns The initialized NotebookNetworkService instance
   */
  get notebookNetwork(): NotebookNetworkService {
    if (!this._notebookNetwork) {
      this.logger.debug("Lazily initializing NotebookNetwork service");
      // Pass kernel bridge so network service can access local kernels
      this._notebookNetwork = new NotebookNetworkService(this.kernelBridge);
    }
    return this._notebookNetwork;
  }

  /**
   * Gets or lazily initializes the agent runtime bridge service.
   * Creates a new AgentRuntimeBridge instance on first access.
   * Routes messages between webview and agent-runtimes API.
   *
   * @returns The initialized AgentRuntimeBridge instance
   */
  get agentRuntimeBridge(): AgentRuntimeBridge {
    if (!this._agentRuntimeBridge) {
      this.logger.debug("Lazily initializing AgentRuntimeBridge service");
      this._agentRuntimeBridge = AgentRuntimeBridge.getInstance();
    }
    return this._agentRuntimeBridge;
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
      void this.sdk; // Triggers SDK creation with logging available

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
