/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * VS Code SDK adapter for Datalayer platform integration.
 * Provides secure storage implementation and SDK factory with VS Code configuration.
 *
 * @module services/sdkAdapter
 */

import * as vscode from "vscode";
import { DatalayerClient } from "../../../core/lib/client";
import type {
  DatalayerClientConfig,
  SDKHandlers,
} from "../../../core/lib/client";
import { promptAndLogin } from "../utils/authDialog";
import { ServiceLoggers } from "./loggers";
import { DatalayerClientOperationTracker } from "./datalayerClientLogger";

/**
 * Platform storage interface compatible with the SDK.
 */
interface PlatformStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
  has(key: string): Promise<boolean>;
}

/**
 * VS Code storage implementation using SecretStorage API.
 * Provides secure credential storage with automatic encryption and platform handling.
 *
 * @example
 * ```typescript
 * const storage = new VSCodeStorage(context);
 * await storage.set('token', 'secret-value');
 * ```
 */
export class VSCodeStorage implements PlatformStorage {
  private get logger() {
    return ServiceLoggers.datalayerClient;
  }

  constructor(private context: vscode.ExtensionContext) {}

  async get(key: string): Promise<string | null> {
    try {
      const value = await this.context.secrets.get(key);
      const hasValue = value && value.length > 0;
      this.logger.debug("Storage get operation", {
        key,
        hasValue,
        valueLength: value ? value.length : 0,
      });
      return value || null;
    } catch (error) {
      this.logger.warn("Storage get failed", {
        key,
        error: (error as Error).message,
      });
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    try {
      await this.context.secrets.store(key, value);
      this.logger.debug("Storage set operation", {
        key,
        valueLength: value.length,
        isToken: key.includes("token") || value.includes("Bearer"),
      });
    } catch (error) {
      this.logger.error("Storage set failed", error as Error, { key });
      throw error;
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await this.context.secrets.delete(key);
      this.logger.debug("Storage remove operation", { key });
    } catch (error) {
      this.logger.warn("Storage remove failed", {
        key,
        error: (error as Error).message,
      });
      // Silently handle secret deletion errors
    }
  }

  async clear(): Promise<void> {
    this.logger.debug(
      "Storage clear operation (no-op - VS Code SecretStorage doesn't support clear all)",
    );
    // VS Code SecretStorage doesn't have a clear-all method
    // We'll need to track keys individually if needed
  }

  async has(key: string): Promise<boolean> {
    const value = await this.get(key);
    const exists = value !== null;
    this.logger.debug("Storage has operation", { key, exists });
    return exists;
  }
}

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
  const logger = ServiceLoggers.datalayerClient;

  // Get configuration from VS Code settings
  const vsCodeConfig = vscode.workspace.getConfiguration("datalayer");

  // Get individual service URLs with fallback to defaults
  const serverUrl = getServerUrl();
  const iamRunUrl = vsCodeConfig.get<string>("iamRunUrl") ?? serverUrl;
  const runtimesRunUrl =
    vsCodeConfig.get<string>("runtimesRunUrl") ?? serverUrl;
  const spacerRunUrl = vsCodeConfig.get<string>("spacerRunUrl") ?? serverUrl;

  logger.info("Initializing DatalayerClient SDK", {
    iamRunUrl,
    runtimesRunUrl,
    spacerRunUrl,
    hasStorage: true,
    contextId: context.extension.id,
  });

  const sdk = new DatalayerClient({
    // Service URLs - now using the configured URLs
    iamRunUrl,
    runtimesRunUrl,
    spacerRunUrl,

    // VS Code-specific storage
    storage: new VSCodeStorage(context),

    // Enhanced handlers with comprehensive logging
    handlers: DatalayerClientOperationTracker.createEnhancedSDKHandlers(),

    // User-provided overrides
    ...sdkConfig,
  } as any);

  logger.info("DatalayerClient SDK initialized successfully");
  return sdk;
}

/**
 * Gets the configured server URL from VS Code settings.
 *
 * @returns Server URL with fallback to production
 */
export function getServerUrl(): string {
  const config = vscode.workspace.getConfiguration("datalayer");
  return config.get<string>("serverUrl") || "https://prod1.datalayer.run";
}

/**
 * Gets the configured WebSocket URL for collaboration.
 *
 * @returns WebSocket URL with fallback to production
 */
export function getWebSocketUrl(): string {
  const config = vscode.workspace.getConfiguration("datalayer");
  return config.get<string>("spacerWsUrl") || "wss://prod1.datalayer.run";
}

/**
 * Gets runtime configuration from VS Code settings.
 *
 * @returns Runtime configuration with environment and default minutes
 */
export function getRuntimeConfig() {
  const config = vscode.workspace.getConfiguration("datalayer.runtime");

  return {
    environment: config.get<string>("environment") || "python-cpu-env",
    defaultMinutes: config.get<number>("defaultMinutes") || 10,
  };
}

/**
 * Gets notebook configuration from VS Code settings.
 *
 * @returns Notebook configuration with UI and behavior options
 */
export function getNotebookConfig() {
  const config = vscode.workspace.getConfiguration("datalayer.notebook");

  return {
    enableKernelPicker: config.get<boolean>("enableKernelPicker") ?? true,
    autoConnectRuntime: config.get<boolean>("autoConnectRuntime") ?? true,
    showRuntimeStatus: config.get<boolean>("showRuntimeStatus") ?? true,
    refreshInterval: config.get<number>("refreshInterval") || 30000,
    showRuntimeDetails: config.get<boolean>("showRuntimeDetails") ?? true,
  };
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
