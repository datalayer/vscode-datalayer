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
import {
  DatalayerSDK,
  type DatalayerSDKConfig,
} from "../../../core/lib/index.js";
import { DEFAULT_SERVICE_URLS } from "../../../core/lib/api/constants.js";

// Explicitly import all API modules to ensure they're bundled
import * as spacerAPI from "../../../core/lib/api/spacer/index.js";
import * as iamAPI from "../../../core/lib/api/iam/index.js";
import * as runtimesAPI from "../../../core/lib/api/runtimes/index.js";

// Import individual spacer API modules that Space model depends on
import * as spacerItems from "../../../core/lib/api/spacer/items.js";
import * as spacerUsers from "../../../core/lib/api/spacer/users.js";
import * as spacerNotebooks from "../../../core/lib/api/spacer/notebooks.js";
import * as spacerLexicals from "../../../core/lib/api/spacer/lexicals.js";

// Explicitly import all SDK mixins to ensure they're bundled
import { HealthMixin } from "../../../core/lib/sdk/client/mixins/HealthMixin.js";
import { IAMMixin } from "../../../core/lib/sdk/client/mixins/IAMMixin.js";
import { RuntimesMixin } from "../../../core/lib/sdk/client/mixins/RuntimesMixin.js";
import { SpacerMixin } from "../../../core/lib/sdk/client/mixins/SpacerMixin.js";

// Force webpack to include these modules by referencing them
const ensureModulesIncluded = () => {
  console.log("[SDK Adapter] Ensuring API modules are bundled:", {
    spacer: !!spacerAPI,
    iam: !!iamAPI,
    runtimes: !!runtimesAPI,
  });
  console.log(
    "[SDK Adapter] Ensuring individual spacer API modules are bundled:",
    {
      items: !!spacerItems,
      users: !!spacerUsers,
      notebooks: !!spacerNotebooks,
      lexicals: !!spacerLexicals,
    }
  );
  console.log("[SDK Adapter] Ensuring SDK mixins are bundled:", {
    health: !!HealthMixin,
    iam: !!IAMMixin,
    runtimes: !!RuntimesMixin,
    spacer: !!SpacerMixin,
  });
};

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
      console.warn(`Failed to get secret ${key}:`, error);
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    try {
      await this.context.secrets.store(key, value);
    } catch (error) {
      console.error(`Failed to store secret ${key}:`, error);
      throw error;
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await this.context.secrets.delete(key);
    } catch (error) {
      console.warn(`Failed to delete secret ${key}:`, error);
    }
  }

  async clear(): Promise<void> {
    // VS Code SecretStorage doesn't have a clear-all method
    // We'll need to track keys individually if needed
    console.warn(
      "VSCodeStorage.clear() not fully implemented - VS Code SecretStorage has no clear-all method"
    );
  }

  async has(key: string): Promise<boolean> {
    const value = await this.get(key);
    return value !== null;
  }
}

/**
 * Configuration options for the VS Code SDK.
 */
export interface VSCodeSDKConfig extends Partial<DatalayerSDKConfig> {
  /** VS Code extension context */
  context: vscode.ExtensionContext;
}

/**
 * Create a DatalayerSDK instance configured for VS Code.
 *
 * @param config - Configuration options including VS Code context
 * @returns Configured DatalayerSDK instance
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
export function createVSCodeSDK(config: VSCodeSDKConfig): DatalayerSDK {
  const { context, ...sdkConfig } = config;

  // Ensure all API modules are properly bundled
  ensureModulesIncluded();

  // Get configuration from VS Code settings
  const vsCodeConfig = vscode.workspace.getConfiguration("datalayer");

  // Get individual service URLs with fallback to defaults
  const iamRunUrl =
    vsCodeConfig.get<string>("iamRunUrl") || DEFAULT_SERVICE_URLS.IAM;
  const runtimesRunUrl =
    vsCodeConfig.get<string>("runtimesRunUrl") || DEFAULT_SERVICE_URLS.RUNTIMES;
  const spacerRunUrl =
    vsCodeConfig.get<string>("spacerRunUrl") || DEFAULT_SERVICE_URLS.SPACER;

  console.log("[SDK Adapter] Creating SDK with config:", {
    iamRunUrl,
    runtimesRunUrl,
    spacerRunUrl,
    hasStorage: true,
  });

  const sdk = new DatalayerSDK({
    // Service URLs - now using the configured URLs
    iamRunUrl,
    runtimesRunUrl,
    spacerRunUrl,

    // VS Code-specific storage
    storage: new VSCodeStorage(context),

    // User-provided overrides
    ...sdkConfig,
  } as any);

  // Debug: Check what methods are available on the created SDK
  console.log("[SDK Adapter] Created SDK instance");
  console.log("[SDK Adapter] SDK properties:", Object.getOwnPropertyNames(sdk));
  console.log("[SDK Adapter] SDK has getToken:", typeof (sdk as any).getToken);
  console.log(
    "[SDK Adapter] SDK has getIamRunUrl:",
    typeof (sdk as any).getIamRunUrl
  );
  console.log("[SDK Adapter] SDK has whoami:", typeof (sdk as any).whoami);
  console.log(
    "[SDK Adapter] SDK prototype:",
    Object.getOwnPropertyNames(Object.getPrototypeOf(sdk))
  );
  console.log("[SDK Adapter] Has whoami:", typeof (sdk as any).whoami);
  console.log("[SDK Adapter] Has login:", typeof (sdk as any).login);
  console.log("[SDK Adapter] Has logout:", typeof (sdk as any).logout);
  console.log(
    "[SDK Adapter] Has createRuntime:",
    typeof (sdk as any).createRuntime
  );
  console.log("[SDK Adapter] whoami in SDK:", "whoami" in sdk);
  console.log("[SDK Adapter] SDK constructor name:", sdk.constructor.name);

  // Log the constructor chain
  let proto = Object.getPrototypeOf(sdk);
  let level = 0;
  while (proto && level < 10) {
    console.log(
      `[SDK Adapter] Prototype level ${level}:`,
      proto.constructor.name,
      Object.getOwnPropertyNames(proto).slice(0, 10)
    );
    proto = Object.getPrototypeOf(proto);
    level++;
  }

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
 * @returns Runtime configuration with environment and credits
 */
export function getRuntimeConfig() {
  const config = vscode.workspace.getConfiguration("datalayer.runtime");

  return {
    environment: config.get<string>("environment") || "python-cpu-env",
    creditsLimit: config.get<number>("creditsLimit") || 10,
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
let globalSDKInstance: DatalayerSDK | undefined;

/**
 * Sets the global SDK instance.
 * Should only be called during extension activation.
 *
 * @param sdk - The SDK instance to set globally
 */
export function setSDKInstance(sdk: DatalayerSDK): void {
  globalSDKInstance = sdk;
  console.log("[SDK Adapter] Global SDK instance set");
}

/**
 * Gets the global SDK instance.
 *
 * @returns The global SDK instance
 * @throws Error if SDK is not initialized
 */
export function getSDKInstance(): DatalayerSDK {
  if (!globalSDKInstance) {
    throw new Error("SDK not initialized. Call setSDKInstance first.");
  }
  return globalSDKInstance;
}
