/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Enhanced DatalayerClient operation tracking and logging.
 * Provides comprehensive SDK operation monitoring with correlation IDs and smart error handling.
 *
 * @module services/datalayerClientLogger
 */

import * as vscode from "vscode";
import type { SDKHandlers } from "@datalayer/core/lib/client";
import { ServiceLoggers } from "./loggers";
import { promptAndLogin } from "../../ui/dialogs/authDialog";

/**
 * Context information for a single SDK operation.
 */
export interface OperationContext {
  /** Unique identifier for this operation */
  operationId: string;
  /** Name of the SDK method being called */
  method: string;
  /** ISO 8601 timestamp when the operation started */
  timestamp: string;
  /** Sanitized arguments passed to the SDK method */
  args: unknown[];
}

/**
 * Tracking data for an in-flight SDK operation.
 */
export interface OperationData {
  /** High-resolution timestamp when operation started (performance.now()) */
  startTime: number;
  /** Context information for this operation */
  context: OperationContext;
}

/**
 * Enhanced tracking and logging for DatalayerClient SDK operations.
 * Provides operation correlation, timing, error categorization, and user-friendly handling.
 */
export class DatalayerClientOperationTracker {
  /** Map of operation IDs to their tracking data */
  private static operations = new Map<string, OperationData>();

  /**
   * Create enhanced SDK handlers with comprehensive logging and error handling.
   *
   * @returns SDKHandlers with beforeCall, afterCall, and onError implementations
   */
  static createEnhancedSDKHandlers(): SDKHandlers {
    return {
      /**
       * Hook called before SDK method execution.
       * @param methodName - Name of the SDK method being called
       * @param args - Arguments passed to the method
       */
      beforeCall: (methodName: string, args: unknown[]) => {
        const operationId = `${methodName}_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 9)}`;
        const context: OperationContext = {
          operationId,
          method: methodName,
          timestamp: new Date().toISOString(),
          args: DatalayerClientOperationTracker.sanitizeArgs(args),
        };

        // Store operation for correlation
        DatalayerClientOperationTracker.operations.set(operationId, {
          startTime: performance.now(),
          context,
        });

        // Log to appropriate channel based on method
        const logger =
          DatalayerClientOperationTracker.getLoggerForMethod(methodName);
        logger.debug(
          `DatalayerClient Call Started: ${methodName}`,
          context as unknown as Record<string, unknown>,
        );
      },

      /**
       * Hook called after successful SDK method execution.
       * @param methodName - Name of the SDK method that completed
       * @param result - Result returned by the method
       */
      afterCall: (methodName: string, result: unknown) => {
        // Find the most recent operation for this method
        const operation =
          DatalayerClientOperationTracker.findOperation(methodName);
        if (!operation) {
          return;
        }

        const duration = performance.now() - operation.startTime;
        const logger =
          DatalayerClientOperationTracker.getLoggerForMethod(methodName);

        logger.info(`DatalayerClient Call Success: ${methodName}`, {
          ...operation.context,
          duration: `${duration.toFixed(2)}ms`,
          success: true,
          resultSummary:
            DatalayerClientOperationTracker.summarizeResult(result),
        });

        // Clean up
        DatalayerClientOperationTracker.operations.delete(
          operation.context.operationId,
        );
      },

      /**
       * Hook called when SDK method throws an error.
       * @param methodName - Name of the SDK method that failed
       * @param error - Error thrown by the method
       */
      onError: async (methodName: string, error: unknown) => {
        const operation =
          DatalayerClientOperationTracker.findOperation(methodName);
        const duration = operation
          ? performance.now() - operation.startTime
          : 0;
        const logger =
          DatalayerClientOperationTracker.getLoggerForMethod(methodName);

        const errorObj = error as {
          name?: string;
          message?: string;
          status?: number;
          code?: string;
        };
        logger.error(
          `DatalayerClient Call Failed: ${methodName}`,
          error as Error,
          {
            ...(operation?.context || {}),
            duration: `${duration.toFixed(2)}ms`,
            success: false,
            errorDetails: {
              name: errorObj?.name,
              message: errorObj?.message,
              status: errorObj?.status || errorObj?.code,
              isNetworkError:
                DatalayerClientOperationTracker.isNetworkError(error),
            },
          },
        );

        // Clean up
        if (operation) {
          DatalayerClientOperationTracker.operations.delete(
            operation.context.operationId,
          );
        }

        // Handle specific error types with user-friendly actions
        await DatalayerClientOperationTracker.handleSDKError(
          methodName,
          error,
          logger,
        );
      },
    };
  }

  /**
   * Route SDK method to appropriate logger based on method name.
   * Returns a no-op logger if ServiceLoggers is not yet initialized.
   * @param methodName - Name of the SDK method
   * @returns Logger instance for the method category
   */
  private static getLoggerForMethod(methodName: string) {
    // If ServiceLoggers not initialized, return no-op logger
    if (!ServiceLoggers.isInitialized()) {
      return {
        trace: () => {},
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
        timeAsync: async <T>(_op: string, fn: () => Promise<T>) => fn(),
      };
    }

    // Authentication methods
    if (
      methodName.includes("whoami") ||
      methodName.includes("login") ||
      methodName.includes("logout") ||
      methodName.includes("getCredits")
    ) {
      return ServiceLoggers.datalayerClientAuth;
    }

    // Runtime management methods
    if (
      methodName.includes("Runtime") ||
      methodName.includes("Environment") ||
      methodName.includes("Snapshot") ||
      methodName.includes("ensureRuntime") ||
      methodName.includes("createRuntime")
    ) {
      return ServiceLoggers.datalayerClientRuntime;
    }

    // Spacer/document methods
    if (
      methodName.includes("Space") ||
      methodName.includes("Notebook") ||
      methodName.includes("Lexical") ||
      methodName.includes("Item") ||
      methodName.includes("getSpaces") ||
      methodName.includes("createNotebook")
    ) {
      return ServiceLoggers.datalayerClientSpacer;
    }

    // Network/health methods
    if (
      methodName.includes("Health") ||
      methodName.includes("fetch") ||
      methodName.includes("request") ||
      methodName.includes("check")
    ) {
      return ServiceLoggers.datalayerClientNetwork;
    }

    // Default to main DatalayerClient logger
    return ServiceLoggers.datalayerClient;
  }

  /**
   * Find the most recent operation for a given method name.
   * @param methodName - Name of the SDK method to find
   * @returns Operation data if found, undefined otherwise
   */
  private static findOperation(methodName: string): OperationData | undefined {
    const operations = Array.from(
      DatalayerClientOperationTracker.operations.values(),
    );
    return operations.reverse().find((op) => op.context.method === methodName);
  }

  /**
   * Sanitize arguments to remove sensitive data before logging.
   * @param args - Raw arguments passed to SDK method
   * @returns Sanitized arguments safe for logging
   */
  private static sanitizeArgs(args: unknown[]): unknown[] {
    return args.map((arg) => {
      if (typeof arg === "string") {
        // Redact potential tokens
        if (
          arg.startsWith("eyJ") ||
          arg.includes("Bearer") ||
          arg.length > 50
        ) {
          return "[TOKEN_REDACTED]";
        }
      }
      if (typeof arg === "object" && arg) {
        const sanitized: Record<string, unknown> = { ...arg };
        // Redact common sensitive fields
        ["token", "password", "secret", "key", "authorization"].forEach(
          (field) => {
            if (field in sanitized) {
              sanitized[field] = "[REDACTED]";
            }
          },
        );
        return sanitized;
      }
      return arg;
    });
  }

  /**
   * Create a summary of the result for logging without exposing sensitive data.
   * @param result - Result returned from SDK method
   * @returns Human-readable summary of the result
   */
  private static summarizeResult(result: unknown): string {
    if (!result) {
      return "null/undefined";
    }
    if (Array.isArray(result)) {
      return `array[${result.length}]`;
    }
    if (typeof result === "object") {
      const keys = Object.keys(result);
      return `object{${keys.slice(0, 3).join(", ")}${
        keys.length > 3 ? "..." : ""
      }}`;
    }
    return typeof result;
  }

  /**
   * Check if an error is network-related.
   * @param error - Error object to check
   * @returns True if error is network-related, false otherwise
   */
  private static isNetworkError(error: unknown): boolean {
    if (!error) {
      return false;
    }
    const errorObj = error as { message?: string; code?: string };
    const message = errorObj.message?.toLowerCase() || "";
    return (
      message.includes("fetch") ||
      message.includes("network") ||
      message.includes("timeout") ||
      message.includes("connection") ||
      message.includes("enotfound") ||
      message.includes("econnrefused") ||
      errorObj.code === "NETWORK_ERROR"
    );
  }

  /**
   * Handle SDK errors with smart categorization and user-friendly responses.
   * @param methodName - Name of the SDK method that failed
   * @param error - Error object thrown by the method
   * @param logger - Logger instance for error reporting
   */
  private static async handleSDKError(
    methodName: string,
    error: unknown,
    logger: {
      info: (msg: string) => void;
      warn: (msg: string, context?: Record<string, unknown>) => void;
      error: (msg: string) => void;
      debug: (msg: string, context?: Record<string, unknown>) => void;
    },
  ): Promise<void> {
    const errorObj = error as { message?: string; status?: number };
    const errorMessage = errorObj?.message || "Unknown error";

    // Authentication errors - don't show error immediately, let auth system handle
    if (
      errorMessage.includes("Not authenticated") ||
      errorMessage.includes("401") ||
      errorMessage.includes("Unauthorized") ||
      errorMessage.includes("Invalid token")
    ) {
      logger.info("Authentication required, will be handled by auth system");
      await promptAndLogin("DatalayerClient Operation");
      return;
    }

    // Network errors - show user-friendly message with retry option
    if (DatalayerClientOperationTracker.isNetworkError(error)) {
      logger.warn("Network connectivity issue detected");
      vscode.window
        .showErrorMessage(
          "Network error. Please check your connection and try again.",
          "Retry",
        )
        .then((selection) => {
          if (selection === "Retry") {
            logger.info("User requested retry after network error");
            // Could trigger retry logic here if implemented
          }
        });
      return;
    }

    // Rate limiting
    if (
      errorObj?.status === 429 ||
      errorMessage.includes("rate limit") ||
      errorMessage.includes("Too Many Requests")
    ) {
      logger.warn("Rate limit encountered");
      vscode.window.showWarningMessage(
        "Too many requests. Please wait a moment before trying again.",
      );
      return;
    }

    // Service unavailable - show informative message
    if (
      (errorObj?.status !== undefined && errorObj.status >= 500) ||
      errorMessage.includes("Service Unavailable") ||
      errorMessage.includes("Internal Server Error")
    ) {
      logger.error("Service appears to be down");
      vscode.window.showErrorMessage(
        "Datalayer service is temporarily unavailable. Please try again later.",
      );
      return;
    }

    // Client errors (4xx) - usually configuration or request issues
    if (
      errorObj?.status !== undefined &&
      errorObj.status >= 400 &&
      errorObj.status < 500
    ) {
      logger.warn(`Client error encountered: ${errorObj.status}`);
      // Don't show to user unless it's a user-initiated action
      return;
    }

    // Generic error - only log, don't show to user unless it's critical
    logger.debug("Generic SDK error handled", {
      method: methodName,
      error: errorMessage,
    });
  }

  /**
   * Get current operation statistics for debugging.
   */
  static getOperationStats(): {
    activeOperations: number;
    operationsByMethod: Record<string, number>;
  } {
    const operations = Array.from(
      DatalayerClientOperationTracker.operations.values(),
    );
    const operationsByMethod: Record<string, number> = {};

    operations.forEach((op) => {
      operationsByMethod[op.context.method] =
        (operationsByMethod[op.context.method] || 0) + 1;
    });

    return {
      activeOperations: operations.length,
      operationsByMethod,
    };
  }

  /**
   * Clear all tracked operations (useful for cleanup).
   */
  static clearOperations(): void {
    DatalayerClientOperationTracker.operations.clear();
  }
}
