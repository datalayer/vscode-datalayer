/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Service-specific loggers providing organized access to different logging channels.
 * Creates a hierarchical structure for easy debugging and monitoring.
 *
 * @module services/loggers
 */

import type { ILoggerManager } from "../interfaces/ILoggerManager";

/**
 * Service-specific loggers for the Datalayer VS Code extension.
 * Provides organized access to different logging channels with clear separation.
 */
export class ServiceLoggers {
  private static loggerManager: ILoggerManager;

  /**
   * Initialize the service loggers with a LoggerManager instance.
   * Must be called during extension activation before using any loggers.
   *
   * @param loggerManager - The LoggerManager instance to use
   */
  static initialize(loggerManager: ILoggerManager): void {
    ServiceLoggers.loggerManager = loggerManager;
  }

  /**
   * Check if ServiceLoggers has been initialized.
   */
  static isInitialized(): boolean {
    return !!ServiceLoggers.loggerManager;
  }

  /**
   * Ensure loggerManager is initialized, throw error if not.
   */
  private static ensureInitialized(): void {
    if (!ServiceLoggers.loggerManager) {
      throw new Error(
        "ServiceLoggers not initialized. Call ServiceLoggers.initialize(loggerManager) first during extension activation.",
      );
    }
  }

  // ========================================================================
  // DatalayerClient SDK Loggers
  // ========================================================================

  /**
   * Main DatalayerClient SDK operations logger.
   * Use for general SDK lifecycle and configuration.
   */
  static get datalayerClient() {
    ServiceLoggers.ensureInitialized();
    return ServiceLoggers.loggerManager.createLogger("Client");
  }

  /**
   * DatalayerClient authentication operations logger.
   * Use for login, logout, whoami, and token management via SDK.
   */
  static get datalayerClientAuth() {
    ServiceLoggers.ensureInitialized();
    return ServiceLoggers.loggerManager.createLogger("Authentication");
  }

  /**
   * DatalayerClient runtime management operations logger.
   * Use for runtime creation, management, environments, and snapshots via SDK.
   */
  static get datalayerClientRuntime() {
    ServiceLoggers.ensureInitialized();
    return ServiceLoggers.loggerManager.createLogger("Runtimes");
  }

  /**
   * DatalayerClient spacer/document operations logger.
   * Use for spaces, notebooks, lexical documents, and items via SDK.
   */
  static get datalayerClientSpacer() {
    ServiceLoggers.ensureInitialized();
    return ServiceLoggers.loggerManager.createLogger("Spaces");
  }

  /**
   * DatalayerClient network operations logger.
   * Use for API calls, network requests, and connectivity via SDK.
   */
  static get datalayerClientNetwork() {
    ServiceLoggers.ensureInitialized();
    return ServiceLoggers.loggerManager.createLogger("Network");
  }

  // ========================================================================
  // Direct Service Loggers
  // ========================================================================

  /**
   * Direct authentication operations logger.
   * Use for VS Code-specific auth UI, dialogs, and state management.
   */
  static get auth() {
    ServiceLoggers.ensureInitialized();
    return ServiceLoggers.loggerManager.createLogger("VS Code Auth");
  }

  /**
   * Direct runtime operations logger.
   * Use for VS Code-specific runtime UI, kernel management, and notebooks.
   */
  static get runtime() {
    ServiceLoggers.ensureInitialized();
    return ServiceLoggers.loggerManager.createLogger("VS Code Runtimes");
  }

  /**
   * Notebook operations logger.
   * Use for notebook editing, cell execution, and document management.
   */
  static get notebook() {
    ServiceLoggers.ensureInitialized();
    return ServiceLoggers.loggerManager.createLogger("Notebooks");
  }

  /**
   * Real-time collaboration logger.
   * Use for collaborative editing, WebSocket connections, and synchronization.
   */
  static get collaboration() {
    ServiceLoggers.ensureInitialized();
    return ServiceLoggers.loggerManager.createLogger("Collaboration");
  }

  /**
   * Main extension operations logger.
   * Use for extension lifecycle, activation, commands, and general coordination.
   */
  static get main() {
    ServiceLoggers.ensureInitialized();
    return ServiceLoggers.loggerManager.createLogger("Extension");
  }

  // ========================================================================
  // Utility Methods
  // ========================================================================

  /**
   * Get all available logger channel names.
   * Useful for debugging and configuration.
   *
   * @returns Array of channel names
   */
  static getChannelNames(): string[] {
    return [
      "Client",
      "Authentication",
      "Runtimes",
      "Spaces",
      "Network",
      "VS Code Auth",
      "VS Code Runtimes",
      "Notebooks",
      "Collaboration",
      "Extension",
    ];
  }
}
