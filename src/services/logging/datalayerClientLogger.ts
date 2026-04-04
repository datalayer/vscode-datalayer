/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Enhanced DatalayerClient operation tracking and logging.
 * Provides comprehensive Datalayer operation monitoring with correlation IDs and smart error handling.
 *
 * @module services/datalayerClientLogger
 */

import type { ClientHandlers } from "@datalayer/core/lib/client";
import * as vscode from "vscode";

import { promptAndLogin } from "../../ui/dialogs/authDialog";
import type { ILogger } from "../interfaces/ILogger";
import { ServiceLoggers } from "./loggers";

/**
 * Context information for a single Datalayer operation.
 */
export interface OperationContext {
  /** Unique identifier for this operation */
  operationId: string;
  /** Name of the Datalayer method being called */
  method: string;
  /** ISO 8601 timestamp when the operation started */
  timestamp: string;
  /** Sanitized arguments passed to the Datalayer method */
  args: unknown[];
}

/**
 * Tracking data for an in-flight Datalayer operation.
 */
export interface OperationData {
  /** High-resolution timestamp when operation started (performance.now()) */
  startTime: number;
  /** Context information for this operation */
  context: OperationContext;
}

/**
 * Enhanced tracking and logging for DatalayerClient Datalayer operations.
 * Provides operation correlation, timing, error categorization, and user-friendly handling. */
export class DatalayerClientOperationTracker {
  /** Map of operation IDs to their tracking data */
  private static operations = new Map<string, OperationData>();

  /**
   * Create enhanced Datalayer handlers with comprehensive logging and error handling.
   *
   * @returns ClientHandlers with beforeCall, afterCall, and onError implementations.
   */
  static createEnhancedClientHandlers(): ClientHandlers {
    return {
      /**
       * Hook called before Datalayer method execution.
       * @param methodName - Name of the Datalayer method being called.
       * @param args - Arguments passed to the method.
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
       * Hook called after successful Datalayer method execution.
       * @param methodName - Name of the Datalayer method that completed.
       * @param result - Result returned by the method.
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
       * Hook called when Datalayer method throws an error.
       * @param methodName - Name of the Datalayer method that failed.
       * @param error - Error thrown by the method.
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
        await DatalayerClientOperationTracker.handleDatalayerError(
          methodName,
          error,
          logger,
        );
      },
    };
  }

  /**
   * Route Datalayer method to appropriate logger based on method name.
   * Returns a no-op logger if ServiceLoggers is not yet initialized.
   * @param methodName - Datalayer API function identifier used for category routing.
   *
   * @returns Appropriate category-specific logging handler.
   */
  /**
   * Keyword-to-logger-category mapping for routing Datalayer methods.
   * Each entry maps a keyword (checked via String.includes) to the logger category name.
   */
  private static readonly METHOD_CATEGORY_RULES: Array<{
    keywords: string[];
    category: "auth" | "runtime" | "spacer" | "network";
  }> = [
    {
      keywords: ["whoami", "login", "logout", "getCredits"],
      category: "auth",
    },
    {
      keywords: [
        "Runtime",
        "Environment",
        "Snapshot",
        "ensureRuntime",
        "createRuntime",
      ],
      category: "runtime",
    },
    {
      keywords: [
        "Space",
        "Notebook",
        "Lexical",
        "Item",
        "getSpaces",
        "createNotebook",
      ],
      category: "spacer",
    },
    {
      keywords: ["Health", "fetch", "request", "check"],
      category: "network",
    },
  ];

  /**
   * Selects the appropriate category-specific logger based on the Datalayer method name.
   * @param methodName - Name of the Datalayer client method to find a logger for.
   *
   * @returns The logger instance matching the method's category, or the default Datalayer logger.
   */
  private static getLoggerForMethod(methodName: string): ILogger {
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

    for (const rule of DatalayerClientOperationTracker.METHOD_CATEGORY_RULES) {
      if (rule.keywords.some((kw) => methodName.includes(kw))) {
        const loggerMap = {
          auth: ServiceLoggers.datalayerClientAuth,
          runtime: ServiceLoggers.datalayerClientRuntime,
          spacer: ServiceLoggers.datalayerClientSpacer,
          network: ServiceLoggers.datalayerClientNetwork,
        };
        return loggerMap[rule.category];
      }
    }

    // Default to main DatalayerClient logger
    return ServiceLoggers.datalayerClient;
  }

  /**
   * Find the most recent operation for a given method name.
   * @param methodName - Name of the Datalayer method to find.
   *
   * @returns Operation data if found, undefined otherwise.
   */
  private static findOperation(methodName: string): OperationData | undefined {
    const operations = Array.from(
      DatalayerClientOperationTracker.operations.values(),
    );
    return operations.reverse().find((op) => op.context.method === methodName);
  }

  /**
   * Sanitize arguments to remove sensitive data before logging.
   * @param args - Raw arguments passed to Datalayer method.
   *
   * @returns Sanitized arguments safe for logging.
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
   * @param result - Result returned from Datalayer method.
   *
   * @returns Human-readable summary of the result.
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
   * @param error - Error object to check.
   *
   * @returns True if error is network-related, false otherwise.
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
   * Checks whether the error message indicates an authentication failure.
   * @param errorMessage - Lowercased error message string to inspect.
   *
   * @returns True if the message matches known authentication error patterns.
   */
  private static isAuthError(errorMessage: string): boolean {
    return (
      errorMessage.includes("not authenticated") ||
      errorMessage.includes("401") ||
      errorMessage.includes("unauthorized") ||
      errorMessage.includes("invalid token")
    );
  }

  /**
   * Checks whether the error indicates rate limiting.
   * @param errorObj - The structured error object from the failed request.
   * @param errorObj.message - Error description from the server response.
   * @param errorObj.status - HTTP status code from the server response.
   * @param errorMessage - Lowercased error message string to inspect.
   *
   * @returns True if the error matches rate-limit patterns such as HTTP 429.
   */
  private static isRateLimitError(
    errorObj: { message?: string; status?: number },
    errorMessage: string,
  ): boolean {
    return (
      errorObj?.status === 429 ||
      errorMessage.includes("rate limit") ||
      errorMessage.includes("too many requests")
    );
  }

  /**
   * Checks whether the error indicates a server-side failure (5xx).
   * @param errorObj - The structured error object from the failed request.
   * @param errorObj.message - Error description from the server response.
   * @param errorObj.status - HTTP status code from the server response.
   * @param errorMessage - Lowercased error message string to inspect.
   *
   * @returns True if the error matches server-side failure patterns such as 5xx status codes.
   */
  private static isServerError(
    errorObj: { message?: string; status?: number },
    errorMessage: string,
  ): boolean {
    return (
      (errorObj?.status !== undefined && errorObj.status >= 500) ||
      errorMessage.includes("service unavailable") ||
      errorMessage.includes("internal server error")
    );
  }

  /**
   * Handles Datalayer errors with smart categorization and user-friendly responses.
   * @param methodName - Name of the Datalayer client method that failed.
   * @param error - The error thrown during method execution.
   * @param logger - Logger with level-specific methods for reporting the categorized error.
   * @param logger.info - Logs informational messages.
   * @param logger.warn - Logs warning-level messages with optional context.
   * @param logger.error - Logs error-level messages.
   * @param logger.debug - Logs debug-level messages with optional context.
   */
  private static async handleDatalayerError(
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
    const errorMessage = (errorObj?.message || "Unknown error").toLowerCase();

    if (DatalayerClientOperationTracker.isAuthError(errorMessage)) {
      logger.info("Authentication required, will be handled by auth system");
      await promptAndLogin("DatalayerClient Operation");
      return;
    }

    if (DatalayerClientOperationTracker.isNetworkError(error)) {
      logger.warn("Network connectivity issue detected");
      const retryLabel = vscode.l10n.t("Retry");
      vscode.window
        .showErrorMessage(
          vscode.l10n.t(
            "Network error. Please check your connection and try again.",
          ),
          retryLabel,
        )
        .then((selection) => {
          if (selection === retryLabel) {
            logger.info("User requested retry after network error");
          }
        });
      return;
    }

    if (
      DatalayerClientOperationTracker.isRateLimitError(errorObj, errorMessage)
    ) {
      logger.warn("Rate limit encountered");
      vscode.window.showWarningMessage(
        vscode.l10n.t(
          "Too many requests. Please wait a moment before trying again.",
        ),
      );
      return;
    }

    if (DatalayerClientOperationTracker.isServerError(errorObj, errorMessage)) {
      logger.error("Service appears to be down");
      vscode.window.showErrorMessage(
        vscode.l10n.t(
          "Datalayer service is temporarily unavailable. Please try again later.",
        ),
      );
      return;
    }

    if (
      errorObj?.status !== undefined &&
      errorObj.status >= 400 &&
      errorObj.status < 500
    ) {
      logger.warn(`Client error encountered: ${errorObj.status}`);
      return;
    }

    logger.debug("Generic Datalayer error handled", {
      method: methodName,
      error: errorMessage,
    });
  }

  /**
   * Get current operation statistics for debugging.
   * @returns Active operation count and breakdown by method name.
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
