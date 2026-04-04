/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Runtime Management Operations - Platform Agnostic
 *
 * @module tools/core/operations/manageRuntime
 */

import type { ToolOperation } from "@datalayer/jupyter-react";
import { validateWithZod } from "@datalayer/jupyter-react";
import {
  startRuntimeParamsSchema,
  connectRuntimeParamsSchema,
  type StartRuntimeParams,
  type ConnectRuntimeParams,
} from "../schemas/manageRuntime";

/**
 * Describes a runtime instance with its current state and configuration.
 */
export interface RuntimeInfo {
  /** Unique identifier for the runtime instance. */
  id: string;
  /** Display name of the runtime. */
  name: string;
  /** Configured environment for the runtime (e.g., 'python-3.11'). */
  environment?: string;
  /** Current status of the runtime. */
  status: "running" | "stopped" | "error";
  /** Duration in minutes for which the runtime is allocated. */
  durationMinutes?: number;
  /** Additional metadata from the runtime provider. */
  metadata?: Record<string, unknown>;
}

/**
 * Result of a runtime creation attempt including success status and optional error.
 */
export interface RuntimeCreationResult {
  /** Whether the runtime creation operation succeeded. */
  success: boolean;
  /** Created runtime information if successful. */
  runtime?: RuntimeInfo;
  /** Error message if operation failed. */
  error?: string;
}

/**
 * Result of connecting to an existing runtime including success status and optional error.
 */
export interface RuntimeConnectionResult {
  /** Whether the runtime connection operation succeeded. */
  success: boolean;
  /** Connected runtime information if successful. */
  runtime?: RuntimeInfo;
  /** Error message if operation failed. */
  error?: string;
}

/**
 * Start Runtime Operation
 *
 * Starts a new Datalayer runtime (compute instance) with specified
 * or default parameters. Requires Datalayer and authentication.
 *
 */
/**
 * Exported constant for starting a runtime operation.
 */
export const startRuntimeOperation: ToolOperation<
  StartRuntimeParams,
  RuntimeCreationResult
> = {
  /** Operation name for tool system registration. */
  name: "startRuntime",

  /**
   * Executes the start runtime operation.
   * @param params - Validated startup parameters including optional environment and duration.
   * @param context - Execution context containing Datalayer and authentication providers.
   *
   * @returns Promise resolving to the runtime creation result with status and error details.
   *
   * @throws Error if Datalayer client is missing or user is not authenticated.
   */
  async execute(params, context): Promise<RuntimeCreationResult> {
    // Validate params with Zod
    const validated = validateWithZod(
      startRuntimeParamsSchema,
      params,
      "startRuntime",
    );

    const { environment, durationMinutes } = validated;
    const { extras } = context;
    const datalayer = (extras as Record<string, unknown>)?.datalayer;
    const auth = (extras as Record<string, unknown>)?.auth;

    // Validate context
    if (!datalayer) {
      throw new Error(
        "Datalayer is required for startRuntime operation. " +
          "Ensure the tool execution context includes a valid DatalayerClient.",
      );
    }

    if (
      !auth ||
      !(auth as { isAuthenticated?: () => boolean }).isAuthenticated?.()
    ) {
      throw new Error(
        "Authentication is required for startRuntime operation. " +
          "Please login to Datalayer first.",
      );
    }

    try {
      // Type assertion to access Datalayer methods
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = datalayer as any;

      // Get environment from parameter or use first available
      let environmentName = environment;
      if (!environmentName) {
        const environments = await client.listEnvironments();
        if (!environments || environments.length === 0) {
          return {
            success: false,
            error: "No environments available",
          };
        }
        environmentName = environments[0].name;
      }

      // Get duration from parameter or use default from extras/config
      const extrasWithDuration = extras as { defaultRuntimeDuration?: number };
      const duration =
        durationMinutes || extrasWithDuration?.defaultRuntimeDuration || 10;

      // Start runtime using Datalayer's ensureRuntime method
      const runtimeData = await client.ensureRuntime(environmentName, duration);

      if (!runtimeData) {
        return {
          success: false,
          error: "Failed to create runtime (Datalayer returned null)",
        };
      }

      // Map Datalayer runtime data to RuntimeInfo type
      const runtime = {
        id: runtimeData.uid || runtimeData.podName,
        name: runtimeData.podName,
        environment: environmentName,
        status: "running" as const,
        durationMinutes: duration,
        metadata: runtimeData,
      };

      return {
        success: true,
        runtime,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Failed to start runtime: ${errorMessage}`,
      };
    }
  },
};

/**
 * Connect Runtime Operation
 *
 * Connects an existing runtime to a notebook to enable code execution.
 *
 */
/**
 * Exported constant for connecting to an existing runtime operation.
 */
export const connectRuntimeOperation: ToolOperation<
  ConnectRuntimeParams,
  RuntimeConnectionResult
> = {
  /** Operation name for tool system registration. */
  name: "connectRuntime",

  /**
   * Executes the connect runtime operation.
   * @param params - Validated connection parameters including runtime name and optional notebook URI.
   * @param context - Execution context containing Datalayer, auth providers, and platform-specific connection callback.
   *
   * @returns Promise resolving to the runtime connection result with status and error details.
   *
   * @throws Error if Datalayer client is missing, user is not authenticated, or connection callback is absent.
   */
  async execute(params, context): Promise<RuntimeConnectionResult> {
    // Validate params with Zod
    const validated = validateWithZod(
      connectRuntimeParamsSchema,
      params,
      "connectRuntime",
    );

    const { runtimeName, notebookUri } = validated;
    const { extras } = context;
    const datalayer = (extras as Record<string, unknown>)?.datalayer;
    const auth = (extras as Record<string, unknown>)?.auth;

    // Validate context
    if (!datalayer) {
      throw new Error(
        "Datalayer is required for connectRuntime operation. " +
          "Ensure the tool execution context includes a valid DatalayerClient.",
      );
    }

    if (
      !auth ||
      !(auth as { isAuthenticated?: () => boolean }).isAuthenticated?.()
    ) {
      throw new Error(
        "Authentication is required for connectRuntime operation. " +
          "Please login to Datalayer first.",
      );
    }

    try {
      // Platform-specific runtime connection logic
      // This varies between VS Code (message-based) and SaaS (direct API)
      const extrasWithCallback = extras as {
        connectRuntimeCallback?: (
          name: string,
          uri?: string,
        ) => Promise<unknown>;
      };
      const connectCallback = extrasWithCallback?.connectRuntimeCallback;

      if (!connectCallback) {
        throw new Error(
          "connectRuntimeCallback is required in extras for runtime connection",
        );
      }

      if (!runtimeName) {
        return {
          success: false,
          error: "Runtime name is required for connection",
        };
      }

      // Call platform-specific connection logic
      const runtimeData = await connectCallback(runtimeName, notebookUri);

      if (!runtimeData) {
        return {
          success: false,
          error: "Failed to connect runtime",
        };
      }

      // Map to RuntimeInfo type
      const runtimeDataTyped = runtimeData as {
        uid?: string;
        podName?: string;
      };
      const runtime = {
        id: runtimeDataTyped.uid || runtimeDataTyped.podName || "unknown",
        name: runtimeDataTyped.podName || runtimeName || "unknown",
        status: "running" as const,
        metadata: runtimeData as Record<string, unknown>,
      };

      return {
        success: true,
        runtime,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Failed to connect runtime: ${errorMessage}`,
      };
    }
  },
};
