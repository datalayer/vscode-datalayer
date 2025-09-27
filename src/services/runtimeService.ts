/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * SDK-based runtime management service for VS Code.
 * Provides runtime creation, listing, and lifecycle management through Datalayer SDK.
 *
 * @module services/runtimeService
 */

import * as vscode from "vscode";
import type {
  DatalayerSDK,
  Runtime,
  Environment,
} from "../../../core/lib/index.js";
import { getRuntimeConfig } from "./sdkAdapter";

/**
 * Singleton service for runtime management using Datalayer SDK.
 * Provides simplified interface for runtime operations and environment management.
 *
 * @example
 * ```typescript
 * const service = SDKRuntimeService.getInstance(sdk);
 * const runtime = await service.ensureRuntime();
 * ```
 */
export class SDKRuntimeService {
  private static instance: SDKRuntimeService;

  private constructor(private sdk: DatalayerSDK) {}

  /**
   * Gets or creates the singleton instance.
   *
   * @param sdk - DatalayerSDK instance (required on first call)
   * @param context - Extension context (unused but kept for compatibility)
   * @returns The singleton service instance
   */
  static getInstance(
    sdk?: DatalayerSDK,
    context?: vscode.ExtensionContext
  ): SDKRuntimeService {
    if (!SDKRuntimeService.instance) {
      if (!sdk) {
        throw new Error(
          "SDK is required when creating SDKRuntimeService for the first time"
        );
      }
      SDKRuntimeService.instance = new SDKRuntimeService(sdk);
    }
    return SDKRuntimeService.instance;
  }

  /**
   * Gets or creates a runtime for notebook execution.
   * Uses SDK's ensureRuntime method with configuration from VS Code settings.
   *
   * @returns Runtime instance ready for use
   */
  async ensureRuntime(): Promise<Runtime> {
    try {
      const config = getRuntimeConfig();

      console.log("[SDK Runtime] Ensuring runtime with config:", {
        environment: config.environment,
        creditsLimit: config.creditsLimit,
      });

      // Use SDK's ensureRuntime method
      const runtime = await (this.sdk as any).ensureRuntime({
        environmentName: config.environment,
        waitForReady: true,
        creditsLimit: config.creditsLimit,
      });

      console.log("[SDK Runtime] Runtime ensured:", runtime.uid);
      return runtime;
    } catch (error) {
      console.error("[SDK Runtime] Error ensuring runtime:", error);
      throw error;
    }
  }

  /**
   * Lists all available runtimes.
   *
   * @returns Array of runtime instances
   */
  async listRuntimes(): Promise<Runtime[]> {
    try {
      console.log("[SDK Runtime] Listing runtimes...");

      const runtimes = await (this.sdk as any).listRuntimes();

      console.log("[SDK Runtime] Found runtimes:", runtimes.length);
      return runtimes;
    } catch (error) {
      console.error("[SDK Runtime] Error listing runtimes:", error);
      throw error;
    }
  }

  /**
   * Gets a specific runtime by UID.
   *
   * @param uid - Runtime unique identifier
   * @returns Runtime instance if found
   */
  async getRuntime(uid: string): Promise<Runtime | undefined> {
    try {
      console.log("[SDK Runtime] Getting runtime:", uid);

      const runtimes = await this.listRuntimes();
      const runtime = runtimes.find((r) => r.uid === uid);

      if (runtime) {
        console.log("[SDK Runtime] Found runtime:", runtime.uid);
      } else {
        console.log("[SDK Runtime] Runtime not found:", uid);
      }

      return runtime;
    } catch (error) {
      console.error("[SDK Runtime] Error getting runtime:", error);
      throw error;
    }
  }

  /**
   * Creates a new runtime with specified parameters.
   *
   * @param creditsLimit - Maximum credits to allocate
   * @param type - Runtime type (notebook or cell)
   * @param givenName - Optional display name
   * @param environmentName - Environment to use
   * @returns Newly created runtime instance
   */
  async createRuntime(
    creditsLimit: number = 10,
    type: "notebook" | "cell" = "notebook",
    givenName?: string,
    environmentName?: string
  ): Promise<Runtime> {
    try {
      console.log("[SDK Runtime] Creating runtime with parameters:", {
        creditsLimit,
        type,
        givenName,
        environmentName,
      });

      // Use SDK's createRuntime method
      const runtime = await (this.sdk as any).createRuntime({
        environmentName: environmentName || getRuntimeConfig().environment,
        creditsLimit,
        givenName,
        // Note: 'type' parameter might not be used in SDK, but we keep it for compatibility
      });

      console.log("[SDK Runtime] Runtime created:", runtime.uid);
      return runtime;
    } catch (error) {
      console.error("[SDK Runtime] Error creating runtime:", error);
      throw error;
    }
  }

  /**
   * Gets available environments.
   *
   * @returns Array of environment instances
   */
  async getEnvironments(): Promise<Environment[]> {
    try {
      console.log("[SDK Runtime] Getting environments...");

      const environments = await (this.sdk as any).listEnvironments();

      console.log("[SDK Runtime] Found environments:", environments.length);
      return environments;
    } catch (error) {
      console.error("[SDK Runtime] Error getting environments:", error);
      throw error;
    }
  }

  /**
   * Deletes a runtime by UID.
   *
   * @param uid - Runtime unique identifier to delete
   */
  async deleteRuntime(uid: string): Promise<void> {
    try {
      console.log("[SDK Runtime] Deleting runtime:", uid);

      const runtime = await this.getRuntime(uid);
      if (!runtime) {
        throw new Error(`Runtime not found: ${uid}`);
      }

      await (runtime as any).delete();

      console.log("[SDK Runtime] Runtime deleted:", uid);
    } catch (error) {
      console.error("[SDK Runtime] Error deleting runtime:", error);
      throw error;
    }
  }

  /**
   * Checks if currently authenticated with Datalayer platform.
   *
   * @returns True if authenticated with valid token
   */
  isAuthenticated(): boolean {
    return (this.sdk as any).getToken() !== null;
  }
}
