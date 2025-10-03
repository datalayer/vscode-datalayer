/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * VS Code SDK adapter for Datalayer platform integration.
 * Provides SDK factory with VS Code configuration.
 *
 * @module services/sdkAdapter
 */

import * as vscode from "vscode";
import { DatalayerClient } from "../../../../core/lib/client";
import type { DatalayerClientConfig } from "../../../../core/lib/client";
import { ServiceLoggers } from "../logging/loggers";
import { DatalayerClientOperationTracker } from "../logging/datalayerClientLogger";

/**
 * Configuration options for the VS Code SDK.
 */
export interface VSCodeSDKConfig extends Partial<DatalayerClientConfig> {
  /** VS Code extension context */
  context: vscode.ExtensionContext;
}

/**
 * Create a DatalayerClient instance configured for VS Code.
 *
 * @param config - Configuration options including VS Code context
 * @returns Configured DatalayerClient instance
 *
 * @example
 * ```typescript
 * export function activate(context: vscode.ExtensionContext) {
 *   const sdk = createVSCodeSDK({ context });
 *
 *   // Use SDK for authentication
 *   const user = await sdk.whoami();
 *
 *   // Use SDK for runtime management
 *   const runtime = await sdk.ensureRuntime({
 *     environmentName: 'python-cpu-env',
 *     waitForReady: true
 *   });
 * }
 * ```
 */
export function createVSCodeSDK(config: VSCodeSDKConfig): DatalayerClient {
  const { context, ...sdkConfig } = config;

  // Get configuration from VS Code settings
  const vsCodeConfig = vscode.workspace.getConfiguration("datalayer.services");

  // Get individual service URLs with fallback to production default
  const defaultUrl = "https://prod1.datalayer.run";
  const iamRunUrl = vsCodeConfig.get<string>("iamUrl") ?? defaultUrl;
  const runtimesRunUrl = vsCodeConfig.get<string>("runtimesUrl") ?? defaultUrl;
  const spacerRunUrl = vsCodeConfig.get<string>("spacerUrl") ?? defaultUrl;

  // Only log if ServiceLoggers is initialized (avoid initialization order issues)
  if (ServiceLoggers.isInitialized()) {
    const logger = ServiceLoggers.datalayerClient;
    logger.info("Initializing DatalayerClient SDK", {
      iamRunUrl,
      runtimesRunUrl,
      spacerRunUrl,
      contextId: context.extension.id,
    });
  }

  const sdk = new DatalayerClient({
    // Service URLs - now using the configured URLs
    iamRunUrl,
    runtimesRunUrl,
    spacerRunUrl,

    // Enhanced handlers with comprehensive logging
    handlers: DatalayerClientOperationTracker.createEnhancedSDKHandlers(),

    // User-provided overrides
    ...sdkConfig,
  } as DatalayerClientConfig);

  if (ServiceLoggers.isInitialized()) {
    ServiceLoggers.datalayerClient.info(
      "DatalayerClient SDK initialized successfully",
    );
  }
  return sdk;
}

/**
 * Gets the configured WebSocket URL for collaboration.
 *
 * @returns WebSocket URL with fallback to production
 */
export function getWebSocketUrl(): string {
  const config = vscode.workspace.getConfiguration("datalayer.services");
  return config.get<string>("spacerWsUrl") || "wss://prod1.datalayer.run";
}

/**
 * Global SDK instance for the extension.
 * This is initialized in the extension activation and used throughout.
 */
let globalSDKInstance: DatalayerClient | undefined;

/**
 * Sets the global SDK instance.
 * Should only be called during extension activation.
 *
 * @param sdk - The SDK instance to set globally
 */
export function setSDKInstance(sdk: DatalayerClient): void {
  globalSDKInstance = sdk;
}

/**
 * Gets the global SDK instance.
 *
 * @returns The global SDK instance
 * @throws Error if SDK is not initialized
 */
export function getSDKInstance(): DatalayerClient {
  if (!globalSDKInstance) {
    throw new Error("SDK not initialized. Call setSDKInstance first.");
  }
  return globalSDKInstance;
}
