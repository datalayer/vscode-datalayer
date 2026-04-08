/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Central logging manager for the Datalayer VS Code extension.
 * Provides hierarchical logging with VS Code native LogOutputChannel integration.
 *
 * @module services/loggerManager
 */

import * as vscode from "vscode";

import { getValidatedSettingsGroup } from "../config/settingsValidator";
import type {
  ILoggerManager,
  LoggerConfig,
} from "../interfaces/ILoggerManager";
import { LogLevel } from "../interfaces/ILoggerManager";

// Re-export LogLevel from interface for backward compatibility
export { LogLevel } from "../interfaces/ILoggerManager";

/**
 * Central logging manager for the Datalayer VS Code extension.
 * Manages multiple log channels with different purposes. */
export class LoggerManager implements ILoggerManager {
  private static instance: LoggerManager;
  private channel: vscode.LogOutputChannel;
  private config: LoggerConfig;

  private constructor(context: vscode.ExtensionContext) {
    // Get validated logging configuration from VS Code settings
    const loggingConfig = getValidatedSettingsGroup("logging");
    this.config = {
      level: this.parseLogLevel(loggingConfig.level),
      enableTimestamps: loggingConfig.includeTimestamps,
      enableContext: loggingConfig.includeContext,
    };

    // Single output channel for all loggers
    this.channel = vscode.window.createOutputChannel("Datalayer", {
      log: true,
    });
    context.subscriptions.push(this.channel);

    // Listen for configuration changes
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("datalayer.logging")) {
          this.updateConfig();
        }
      }),
    );
  }

  /**
   * Gets or creates the singleton instance.
   *
   * @param context - VS Code extension context (required for initial creation).
   *
   * @returns The singleton LoggerManager instance.
   *
   * @throws Error if context is not provided on first initialization.
   */
  static getInstance(context?: vscode.ExtensionContext): LoggerManager {
    if (!LoggerManager.instance) {
      if (!context) {
        throw new Error("Context required for LoggerManager initialization");
      }
      LoggerManager.instance = new LoggerManager(context);
    }
    return LoggerManager.instance;
  }

  /**
   * Create or get a logger for a specific channel.
   *
   * @param channelName - Name of the logging channel.
   *
   * @returns Logger instance for the specified channel.
   */
  createLogger(channelName: string): Logger {
    return new Logger(this.channel, channelName, this.config);
  }

  /**
   * Get configuration for external integrations (Datalayer handlers, etc.).
   *
   * @returns Copy of the current logger configuration.
   */
  getConfig(): LoggerConfig {
    return { ...this.config };
  }

  /**
   * Updates logging configuration.
   * Affects all existing and future loggers.
   *
   * @param config - Partial configuration to update.
   */
  setConfig(config: Partial<LoggerConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };
  }

  /**
   * Shows the log output channel in VS Code.
   */
  showChannel(): void {
    this.channel.show();
  }

  /**
   * Clears the log output channel.
   */
  clearAll(): void {
    this.channel.clear();
  }

  /**
   * Disposes the logger and cleans up resources.
   */
  dispose(): void {
    this.channel.dispose();
  }

  /**
   * Parse log level string to enum value.
   * @param level - Log level string (trace, debug, info, warn, error).
   *
   * @returns Corresponding LogLevel enum value.
   */
  private parseLogLevel(level: string): LogLevel {
    switch (level.toLowerCase()) {
      case "trace":
        return LogLevel.TRACE;
      case "debug":
        return LogLevel.DEBUG;
      case "info":
        return LogLevel.INFO;
      case "warn":
        return LogLevel.WARN;
      case "error":
        return LogLevel.ERROR;
      default:
        return LogLevel.INFO;
    }
  }

  /**
   * Update configuration from VS Code settings.
   */
  private updateConfig(): void {
    const loggingConfig = getValidatedSettingsGroup("logging");
    this.config = {
      level: this.parseLogLevel(loggingConfig.level),
      enableTimestamps: loggingConfig.includeTimestamps,
      enableContext: loggingConfig.includeContext,
    };
  }
}

/**
 * Individual logger instance for a specific channel. */
export class Logger {
  constructor(
    private channel: vscode.LogOutputChannel,
    private channelName: string,
    private config: LoggerConfig,
  ) {}

  /**
   * Log trace level message with optional context.
   * @param message - Message to log at trace level.
   * @param context - Optional key-value metadata for the log entry.
   */
  trace(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.TRACE, message, context);
  }

  /**
   * Log debug level message with optional context.
   * @param message - Message to log at debug level.
   * @param context - Optional key-value metadata for the log entry.
   */
  debug(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  /**
   * Log info level message with optional context.
   * @param message - Message to log at info level.
   * @param context - Optional key-value metadata for the log entry.
   */
  info(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, context);
  }

  /**
   * Log warning level message with optional context.
   * @param message - Message to log at warn level.
   * @param context - Optional key-value metadata for the log entry.
   */
  warn(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, context);
  }

  /**
   * Log error level message with error object and optional context.
   * @param message - Message to log at error level.
   * @param error - Optional Error object with stack trace.
   * @param context - Optional key-value metadata for the log entry.
   */
  error(
    message: string,
    error?: Error,
    context?: Record<string, unknown>,
  ): void {
    const fullContext = {
      ...context,
      ...(error && {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
      }),
    };
    this.log(LogLevel.ERROR, message, fullContext);
  }

  /**
   * Log method calls with timing information.
   * Automatically logs start, completion, and error states with duration.
   *
   * @param operation - Name of the operation being timed.
   * @param fn - Async function to execute and time.
   * @param context - Optional context information.
   *
   * @returns Promise that resolves with the function result.
   */
  async timeAsync<T>(
    operation: string,
    fn: () => Promise<T>,
    context?: Record<string, unknown>,
  ): Promise<T> {
    const startTime = Date.now();
    this.debug(`Starting: ${operation}`, context);

    try {
      const result = await fn();
      const duration = Date.now() - startTime;
      this.debug(`Completed: ${operation} (${duration}ms)`, context);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.error(
        `Failed: ${operation} (${duration}ms)`,
        error as Error,
        context,
      );
      throw error;
    }
  }

  /**
   * Internal logging method that handles level filtering and formatting.
   * @param level - Log severity level for filtering.
   * @param message - Message string to log.
   * @param context - Optional key-value metadata to append.
   */
  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
  ): void {
    if (level < this.config.level) {
      return;
    }

    let formattedMessage = `[${this.channelName}] ${message}`;

    // Add context if enabled and provided
    if (
      this.config.enableContext &&
      context &&
      Object.keys(context).length > 0
    ) {
      const contextStr = JSON.stringify(context, null, 2);
      formattedMessage += ` | Context: ${contextStr}`;
    }

    // Use VS Code's native log levels
    switch (level) {
      case LogLevel.TRACE:
        this.channel.trace(formattedMessage);
        break;
      case LogLevel.DEBUG:
        this.channel.debug(formattedMessage);
        break;
      case LogLevel.INFO:
        this.channel.info(formattedMessage);
        break;
      case LogLevel.WARN:
        this.channel.warn(formattedMessage);
        break;
      case LogLevel.ERROR:
        this.channel.error(formattedMessage);
        break;
    }
  }
}
