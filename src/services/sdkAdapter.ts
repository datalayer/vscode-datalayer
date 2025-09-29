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
  constructor(private context: vscode.ExtensionContext) {}

  async get(key: string): Promise<string | null> {
    try {
      const value = await this.context.secrets.get(key);
      return value || null;
    } catch (error) {
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    try {
      await this.context.secrets.store(key, value);
    } catch (error) {
      throw error;
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await this.context.secrets.delete(key);
    } catch (error) {
      // Silently handle secret deletion errors
    }
  }

  async clear(): Promise<void> {
    // VS Code SecretStorage doesn't have a clear-all method
    // We'll need to track keys individually if needed
  }

  async has(key: string): Promise<boolean> {
    const value = await this.get(key);
    return value !== null;
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

  // Get configuration from VS Code settings
  const vsCodeConfig = vscode.workspace.getConfiguration("datalayer");

  // Get individual service URLs with fallback to defaults
  const serverUrl = getServerUrl();
  const iamRunUrl = vsCodeConfig.get<string>("iamRunUrl") ?? serverUrl;
  const runtimesRunUrl =
    vsCodeConfig.get<string>("runtimesRunUrl") ?? serverUrl;
  const spacerRunUrl = vsCodeConfig.get<string>("spacerRunUrl") ?? serverUrl;

  // Define VS Code-specific handlers for logging and error handling
  const handlers: SDKHandlers = {
    beforeCall: (methodName: string, args: any[]) => {
      // Silently handle before call
    },
    afterCall: (methodName: string, result: any) => {
      // Silently handle after call
    },
    onError: async (methodName: string, error: any) => {
      // Show user-friendly error messages for common errors
      if (error instanceof Error) {
        if (
          error.message.includes("Not authenticated") ||
          error.message.includes("401")
        ) {
          await promptAndLogin("SDK Operation");
        } else if (
          error.message.includes("Network") ||
          error.message.includes("fetch")
        ) {
          vscode.window.showErrorMessage(
            "Network error. Please check your connection and try again."
          );
        }
      }
    },
  };

  const sdk = new DatalayerClient({
    // Service URLs - now using the configured URLs
    iamRunUrl,
    runtimesRunUrl,
    spacerRunUrl,

    // VS Code-specific storage
    storage: new VSCodeStorage(context),

    // VS Code-specific handlers
    handlers,

    // User-provided overrides
    ...sdkConfig,
  } as any);

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
