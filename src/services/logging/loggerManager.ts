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
import type {
  ILoggerManager,
  LoggerConfig,
} from "../interfaces/ILoggerManager";
import { LogLevel } from "../interfaces/ILoggerManager";

// Re-export LogLevel from interface for backward compatibility
export { LogLevel } from "../interfaces/ILoggerManager";

/**
 * Central logging manager for the Datalayer VS Code extension.
 * Manages multiple log channels with different purposes.
 */
export class LoggerManager implements ILoggerManager {
  private static instance: LoggerManager;
  private channels = new Map<string, vscode.LogOutputChannel>();
  private config: LoggerConfig;

  private constructor(private context: vscode.ExtensionContext) {
    // Get logging configuration from VS Code settings
    const vsConfig = vscode.workspace.getConfiguration("datalayer.logging");
    this.config = {
      level: this.parseLogLevel(vsConfig.get<string>("level") || "info"),
      enableTimestamps: vsConfig.get<boolean>("enableTimestamps") ?? true,
      enableContext: vsConfig.get<boolean>("enableContext") ?? true,
    };

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
   * @param context - VS Code extension context (required for initial creation)
   * @returns The singleton LoggerManager instance
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
   * @param channelName - Name of the logging channel
   * @returns Logger instance for the specified channel
   */
  createLogger(channelName: string): Logger {
    if (!this.channels.has(channelName)) {
      const channel = vscode.window.createOutputChannel(
        `Datalayer ${channelName}`,
        { log: true },
      );
      this.channels.set(channelName, channel);
      this.context.subscriptions.push(channel);
    }

    return new Logger(
      this.channels.get(channelName)!,
      channelName,
      this.config,
    );
  }

  /**
   * Get configuration for external integrations (SDK handlers, etc.)
   *
   * @returns Copy of the current logger configuration
   */
  getConfig(): LoggerConfig {
    return { ...this.config };
  }

  /**
   * Updates logging configuration.
   * Affects all existing and future loggers.
   *
   * @param config - Partial configuration to update
   */
  setConfig(config: Partial<LoggerConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };
  }

  /**
   * Shows the log output channel in VS Code.
   *
   * @param channelName - Optional specific channel to show. If not provided, shows main channel.
   */
  showChannel(channelName?: string): void {
    if (channelName && this.channels.has(channelName)) {
      this.channels.get(channelName)!.show();
    } else {
      // Show the first available channel or the main one
      const firstChannel = this.channels.values().next().value;
      if (firstChannel) {
        firstChannel.show();
      }
    }
  }

  /**
   * Clears all log output channels.
   */
  clearAll(): void {
    for (const channel of this.channels.values()) {
      channel.clear();
    }
  }

  /**
   * Disposes all loggers and cleans up resources.
   */
  dispose(): void {
    for (const channel of this.channels.values()) {
      channel.dispose();
    }
    this.channels.clear();
  }

  /**
   * Parse log level string to enum value.
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
    const vsConfig = vscode.workspace.getConfiguration("datalayer.logging");
    this.config = {
      level: this.parseLogLevel(vsConfig.get<string>("level") || "info"),
      enableTimestamps: vsConfig.get<boolean>("enableTimestamps") ?? true,
      enableContext: vsConfig.get<boolean>("enableContext") ?? true,
    };
  }
}

/**
 * Individual logger instance for a specific channel.
 */
export class Logger {
  constructor(
    private channel: vscode.LogOutputChannel,
    // @ts-expect-error - Reserved for future log formatting features
    private _channelName: string,
    private config: LoggerConfig,
  ) {}

  /**
   * Log trace level message with optional context.
   */
  trace(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.TRACE, message, context);
  }

  /**
   * Log debug level message with optional context.
   */
  debug(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  /**
   * Log info level message with optional context.
   */
  info(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, context);
  }

  /**
   * Log warning level message with optional context.
   */
  warn(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, context);
  }

  /**
   * Log error level message with error object and optional context.
   */
  error(message: string, error?: Error, context?: Record<string, any>): void {
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
   * @param operation - Name of the operation being timed
   * @param fn - Async function to execute and time
   * @param context - Optional context information
   * @returns Promise that resolves with the function result
   */
  async timeAsync<T>(
    operation: string,
    fn: () => Promise<T>,
    context?: Record<string, any>,
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
   */
  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, any>,
  ): void {
    if (level < this.config.level) {
      return;
    }

    let formattedMessage = message;

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
