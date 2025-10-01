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
import { extractErrorInfo, type ErrorInfo } from "../../types/errors";

/**
 * Action that can be presented to the user for error resolution.
 */
export interface ErrorAction {
  /** Label shown on the action button */
  label: string;
  /** Action to execute when selected */
  action: () => Promise<void>;
}

/**
 * Options for error handling behavior.
 */
export interface ErrorHandlerOptions {
  /** Show error to user via UI dialog (default: true) */
  showUser?: boolean;
  /** Log error to extension logs (default: true) */
  logError?: boolean;
  /** Actionable options for the user */
  actionable?: ErrorAction[];
}

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
 *         label: 'Retry',
 *         action: async () => await riskyOperation()
 *       }
 *     ]
 *   });
 * }
 * ```
 */
export class ErrorHandler {
  constructor(private logger: ILogger) {}

  /**
   * Handles an error with specified options.
   * Logs, displays to user, and offers actions based on configuration.
   *
   * @param error - The error to handle
   * @param options - Error handling options
   */
  async handle(error: Error, options: ErrorHandlerOptions = {}): Promise<void> {
    const { showUser = true, logError = true, actionable = [] } = options;

    // Extract structured error information
    const errorInfo = extractErrorInfo(error);

    // Log to extension logs
    if (logError) {
      this.logger.error(`${errorInfo.code}: ${errorInfo.message}`, error, {
        context: errorInfo.context,
      });
    }

    // Show to user
    if (showUser) {
      await this.showErrorToUser(errorInfo, actionable);
    }
  }

  /**
   * Shows error to user with actionable options.
   */
  private async showErrorToUser(
    errorInfo: ErrorInfo,
    actionable: ErrorAction[],
  ): Promise<void> {
    const message = this.getUserFriendlyMessage(errorInfo);

    if (actionable.length > 0) {
      const actions = actionable.map((a) => a.label);
      const selected = await vscode.window.showErrorMessage(
        message,
        ...actions,
      );

      if (selected) {
        const action = actionable.find((a) => a.label === selected);
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
      await vscode.window.showErrorMessage(message);
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
}
