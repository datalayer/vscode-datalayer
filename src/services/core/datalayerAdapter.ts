/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * VS Code Datalayer adapter for Datalayer platform integration.
 * Provides Datalayer factory with VS Code configuration.
 *
 * @module services/datalayerAdapter
 */

import type { DatalayerClientConfig } from "@datalayer/core/lib/client";
import { DatalayerClient } from "@datalayer/core/lib/client";
import * as vscode from "vscode";

import { getValidatedSettingsGroup } from "../config/settingsValidator";
import { DatalayerClientOperationTracker } from "../logging/datalayerClientLogger";
import { ServiceLoggers } from "../logging/loggers";

/**
 * Configuration options for the VS Code Datalayer.
 */
export interface VSCodeDatalayerConfig extends Partial<DatalayerClientConfig> {
  /** VS Code extension context */
  context: vscode.ExtensionContext;
}

/**
 * Create a DatalayerClient instance configured for VS Code.
 *
 * @param config - Configuration options including VS Code context.
 *
 * @returns Configured DatalayerClient instance.
 *
 */
export function createVSCodeDatalayer(
  config: VSCodeDatalayerConfig,
): DatalayerClient {
  const { context, ...datalayerConfig } = config;

  // Get validated configuration from VS Code settings
  const servicesConfig = getValidatedSettingsGroup("services");

  const iamRunUrl = servicesConfig.iamUrl;
  const runtimesRunUrl = servicesConfig.runtimesUrl;
  const spacerRunUrl = servicesConfig.spacerUrl;

  // Only log if ServiceLoggers is initialized (avoid initialization order issues)
  if (ServiceLoggers.isInitialized()) {
    const logger = ServiceLoggers.datalayerClient;
    logger.info("Initializing DatalayerClient Datalayer", {
      iamRunUrl,
      runtimesRunUrl,
      spacerRunUrl,
      contextId: context.extension.id,
      storageType: "NodeStorage (keytar)",
    });
  }

  const datalayer = new DatalayerClient({
    // Service URLs - now using the configured URLs
    iamRunUrl,
    runtimesRunUrl,
    spacerRunUrl,

    // Use default NodeStorage (keytar) - automatically rebuilt for Electron via postinstall
    // Shares credentials with CLI - login once, works everywhere
    // No custom storage needed - core package uses keytar by default

    // Enhanced handlers with comprehensive logging
    handlers: DatalayerClientOperationTracker.createEnhancedClientHandlers(),

    // User-provided overrides
    ...datalayerConfig,
  } as DatalayerClientConfig);

  if (ServiceLoggers.isInitialized()) {
    ServiceLoggers.datalayerClient.info(
      "DatalayerClient Datalayer initialized successfully",
    );
  }
  return datalayer;
}

/**
 * Gets the configured WebSocket URL for collaboration.
 *
 * @returns WebSocket URL with fallback to production.
 */
export function getWebSocketUrl(): string {
  return getValidatedSettingsGroup("services").spacerWsUrl;
}

/**
 * Global Datalayer instance for the extension.
 * This is initialized in the extension activation and used throughout.
 */
let globalDatalayerInstance: DatalayerClient | undefined;

/**
 * Sets the global Datalayer instance.
 * Should only be called during extension activation.
 *
 * @param datalayer - The Datalayer instance to set globally.
 */
export function setDatalayerInstance(datalayer: DatalayerClient): void {
  globalDatalayerInstance = datalayer;
}

/**
 * Gets the global Datalayer instance.
 *
 * @returns The global Datalayer instance.
 *
 * @throws Error if Datalayer is not initialized.
 */
export function getDatalayerInstance(): DatalayerClient {
  if (!globalDatalayerInstance) {
    throw new Error(
      "Datalayer not initialized. Call setDatalayerInstance first.",
    );
  }
  return globalDatalayerInstance;
}
