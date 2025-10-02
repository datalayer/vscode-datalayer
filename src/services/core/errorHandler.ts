/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Centralized error handler service for the extension.
 * Provides consistent error handling, logging, and user notification.
 *
 * @module services/core/errorHandler
 */

import * as vscode from "vscode";
import type { ILogger } from "../interfaces/ILogger";
import type {
  IErrorHandler,
  ErrorHandlerOptions,
} from "../interfaces/IErrorHandler";
import { extractErrorInfo, type ErrorInfo } from "../../types/errors";

/**
 * Centralized error handler service.
 * Provides consistent error handling across the extension.
 *
 * @example
 * ```typescript
 * try {
 *   await riskyOperation();
 * } catch (error) {
 *   await errorHandler.handle(error, {
 *     showUser: true,
 *     actionable: [
 *       {
 *         title: 'Retry',
 *         action: async () => await riskyOperation()
 *       }
 *     ]
 *   });
 * }
 * ```
 */
export class ErrorHandler implements IErrorHandler {
  constructor(private logger: ILogger) {}

  /**
   * Handles an error with specified options.
   * Logs, displays to user, and offers actions based on configuration.
   *
   * @param error - The error to handle
   * @param options - Error handling options
   */
  async handle(error: Error, options: ErrorHandlerOptions = {}): Promise<void> {
    const {
      showUser = true,
      logError = true,
      severity = "error",
      actionable = [],
      context,
    } = options;

    // Extract structured error information
    const errorInfo = extractErrorInfo(error);

    // Log to extension logs
    if (logError) {
      this.logger.error(`${errorInfo.code}: ${errorInfo.message}`, error, {
        context: { ...errorInfo.context, ...context },
      });
    }

    // Show to user
    if (showUser) {
      await this.showErrorToUser(errorInfo, severity, actionable);
    }
  }

  /**
   * Shows error to user with actionable options.
   */
  private async showErrorToUser(
    errorInfo: ErrorInfo,
    severity: "error" | "warning" | "info",
    actionable: Array<{ title: string; action: () => void | Promise<void> }>,
  ): Promise<void> {
    const message = this.getUserFriendlyMessage(errorInfo);

    if (actionable.length > 0) {
      const actions = actionable.map((a) => a.title);
      let selected: string | undefined;

      switch (severity) {
        case "error":
          selected = await vscode.window.showErrorMessage(message, ...actions);
          break;
        case "warning":
          selected = await vscode.window.showWarningMessage(
            message,
            ...actions,
          );
          break;
        case "info":
          selected = await vscode.window.showInformationMessage(
            message,
            ...actions,
          );
          break;
      }

      if (selected) {
        const action = actionable.find((a) => a.title === selected);
        if (action) {
          try {
            await action.action();
          } catch (actionError) {
            // If action fails, show simple error without recursion
            this.logger.error("Action failed", actionError as Error);
            await vscode.window.showErrorMessage(
              `Action failed: ${(actionError as Error).message}`,
            );
          }
        }
      }
    } else {
      switch (severity) {
        case "error":
          await vscode.window.showErrorMessage(message);
          break;
        case "warning":
          await vscode.window.showWarningMessage(message);
          break;
        case "info":
          await vscode.window.showInformationMessage(message);
          break;
      }
    }
  }

  /**
   * Converts technical error info to user-friendly message.
   */
  private getUserFriendlyMessage(errorInfo: ErrorInfo): string {
    switch (errorInfo.code) {
      case "AUTH_ERROR":
        return "You need to log in to Datalayer to perform this action.";

      case "NETWORK_ERROR":
        return "Unable to connect to Datalayer. Please check your internet connection.";

      case "NOTEBOOK_ERROR":
        return `Notebook operation failed: ${errorInfo.message}`;

      case "RUNTIME_ERROR":
        return `Runtime operation failed: ${errorInfo.message}`;

      case "DOCUMENT_ERROR":
        return `Document operation failed: ${errorInfo.message}`;

      case "NOT_FOUND":
        return "The requested resource was not found.";

      case "TIMEOUT_ERROR":
        return "The operation timed out. Please try again.";

      default:
        return `An error occurred: ${errorInfo.message}`;
    }
  }

  /**
   * Wraps an async operation with automatic error handling.
   * Catches errors and handles them according to options.
   *
   * @param operation - Async operation to wrap
   * @param options - Error handling options
   * @returns Operation result or undefined on error
   */
  async wrap<T>(
    operation: () => Promise<T>,
    options: ErrorHandlerOptions = {},
  ): Promise<T | undefined> {
    try {
      return await operation();
    } catch (error) {
      await this.handle(error as Error, options);
      return undefined;
    }
  }

  /**
   * Shows a user-friendly error notification.
   *
   * @param message - User-friendly error message
   * @param severity - Severity level (default: "error")
   * @param actions - Optional actions for the user
   */
  async showError(
    message: string,
    severity: "error" | "warning" | "info" = "error",
    actions: Array<{ title: string; action: () => void | Promise<void> }> = [],
  ): Promise<void> {
    const actionLabels = actions.map((a) => a.title);

    let selected: string | undefined;
    switch (severity) {
      case "error":
        selected = await vscode.window.showErrorMessage(
          message,
          ...actionLabels,
        );
        break;
      case "warning":
        selected = await vscode.window.showWarningMessage(
          message,
          ...actionLabels,
        );
        break;
      case "info":
        selected = await vscode.window.showInformationMessage(
          message,
          ...actionLabels,
        );
        break;
    }

    // Execute selected action
    if (selected) {
      const action = actions.find((a) => a.title === selected);
      if (action) {
        await action.action();
      }
    }
  }
}
