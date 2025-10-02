/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Logger interface for structured logging throughout the extension.
 *
 * @module services/interfaces/ILogger
 */

/**
 * Logger interface for logging operations with context.
 * Provides structured logging with different severity levels.
 */
export interface ILogger {
  /**
   * Logs a trace level message with optional context.
   * Use for very detailed debugging information.
   */
  trace(message: string, context?: Record<string, unknown>): void;

  /**
   * Logs a debug level message with optional context.
   * Use for debugging information.
   */
  debug(message: string, context?: Record<string, unknown>): void;

  /**
   * Logs an info level message with optional context.
   * Use for general informational messages.
   */
  info(message: string, context?: Record<string, unknown>): void;

  /**
   * Logs a warning level message with optional context.
   * Use for potentially harmful situations.
   */
  warn(message: string, context?: Record<string, unknown>): void;

  /**
   * Logs an error level message with error object and optional context.
   * Use for error events that might still allow the application to continue.
   */
  error(
    message: string,
    error?: Error,
    context?: Record<string, unknown>,
  ): void;

  /**
   * Times an async operation and logs start, completion, and errors.
   * Automatically calculates duration and logs at appropriate levels.
   *
   * @param operation - Name of the operation being timed
   * @param fn - Async function to execute and time
   * @param context - Optional context information
   * @returns Promise that resolves with the function result
   */
  timeAsync<T>(
    operation: string,
    fn: () => Promise<T>,
    context?: Record<string, unknown>,
  ): Promise<T>;
}
