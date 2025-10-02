/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Logger manager interface for centralized logging management.
 * Provides logger creation and configuration for the extension.
 *
 * @module services/interfaces/ILoggerManager
 */

import type { ILogger } from "./ILogger";

/**
 * Log levels supported by the logging system.
 */
export enum LogLevel {
  TRACE = 0,
  DEBUG = 1,
  INFO = 2,
  WARN = 3,
  ERROR = 4,
}

/**
 * Configuration for logger behavior.
 */
export interface LoggerConfig {
  /** Minimum log level to output */
  level: LogLevel;
  /** Whether to include timestamps in logs */
  enableTimestamps: boolean;
  /** Whether to include context metadata in logs */
  enableContext: boolean;
}

/**
 * Logger manager interface for managing multiple log channels.
 * Implementations should provide logger creation and configuration.
 */
export interface ILoggerManager {
  /**
   * Creates or retrieves a logger for a specific channel.
   *
   * @param channelName - Name of the logging channel
   * @returns Logger instance for the channel
   */
  createLogger(channelName: string): ILogger;

  /**
   * Gets current logging configuration.
   *
   * @returns Current logger configuration
   */
  getConfig(): LoggerConfig;

  /**
   * Updates logging configuration.
   * Affects all existing and future loggers.
   *
   * @param config - New logger configuration
   */
  setConfig(config: Partial<LoggerConfig>): void;

  /**
   * Shows the log output channel in VS Code.
   *
   * @param channelName - Optional specific channel to show
   */
  showChannel(channelName?: string): void;

  /**
   * Clears all log output channels.
   */
  clearAll(): void;

  /**
   * Disposes all loggers and cleans up resources.
   */
  dispose(): void;
}
