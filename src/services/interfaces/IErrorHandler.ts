/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Error handler interface for centralized error management.
 * Provides consistent error handling with user notifications and logging.
 *
 * @module services/interfaces/IErrorHandler
 */

import type { ILogger } from "./ILogger";

/**
 * Options for error handling behavior.
 */
export interface ErrorHandlerOptions {
  /** Whether to log the error */
  logError?: boolean;
  /** Whether to show error to user */
  showUser?: boolean;
  /** Severity level for user notifications */
  severity?: "error" | "warning" | "info";
  /** Actionable items to present to user */
  actionable?: Array<{ title: string; action: () => void | Promise<void> }>;
  /** Additional context for debugging */
  context?: Record<string, any>;
}

/**
 * Error handler interface for centralized error management.
 * Implementations should provide consistent error handling across the extension.
 */
export interface IErrorHandler {
  /**
   * Handles an error with specified options.
   * Logs error and optionally shows user-friendly notification.
   *
   * @param error - The error to handle
   * @param options - Error handling options
   * @returns Promise resolving when handling is complete
   */
  handle(error: Error, options?: ErrorHandlerOptions): Promise<void>;

  /**
   * Wraps an async operation with error handling.
   * Automatically catches and handles errors from the operation.
   *
   * @param operation - Async operation to wrap
   * @param options - Error handling options
   * @returns Promise resolving to operation result or undefined on error
   */
  wrap<T>(
    operation: () => Promise<T>,
    options?: ErrorHandlerOptions,
  ): Promise<T | undefined>;

  /**
   * Shows a user-friendly error notification.
   *
   * @param message - User-friendly error message
   * @param severity - Severity level
   * @param actions - Optional actions for the user
   * @returns Promise resolving to selected action or undefined
   */
  showError(
    message: string,
    severity?: "error" | "warning" | "info",
    actions?: Array<{ title: string; action: () => void | Promise<void> }>,
  ): Promise<void>;
}
