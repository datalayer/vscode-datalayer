/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Performance monitoring and logging utilities.
 * Provides automatic timing, memory tracking, and performance analysis.
 *
 * @module services/performanceLogger
 */

import { ServiceLoggers } from "./loggers";

/**
 * Performance monitoring utilities for tracking operation timing and memory usage.
 */
export class PerformanceLogger {
  private static get logger() {
    // Return no-op logger if ServiceLoggers not initialized yet
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
    return ServiceLoggers.main;
  }

  /**
   * Track operation performance with automatic logging and memory monitoring.
   * Logs start, completion, and failure with detailed performance metrics.
   *
   * @param operationName - Human-readable name for the operation
   * @param operation - Async function to execute and monitor
   * @param context - Additional context information
   * @returns Promise that resolves with the operation result
   *
   * @example
   * ```typescript
   * const result = await PerformanceLogger.trackOperation(
   *   "notebook_save",
   *   () => saveNotebook(notebook),
   *   { notebookId: notebook.id, cellCount: notebook.cells.length }
   * );
   * ```
   */
  static async trackOperation<T>(
    operationName: string,
    operation: () => Promise<T>,
    context?: Record<string, unknown>,
  ): Promise<T> {
    const startTime = performance.now();
    const startMemory = PerformanceLogger.getMemorySnapshot();

    this.logger.debug(`Performance: Starting ${operationName}`, {
      operation: operationName,
      startMemory,
      ...context,
    });

    try {
      const result = await operation();
      const endTime = performance.now();
      const endMemory = PerformanceLogger.getMemorySnapshot();
      const duration = endTime - startTime;

      this.logger.info(`Performance: ${operationName} completed`, {
        operation: operationName,
        duration: `${duration.toFixed(2)}ms`,
        memoryDelta: PerformanceLogger.calculateMemoryDelta(
          startMemory,
          endMemory,
        ),
        performanceCategory: PerformanceLogger.categorizePerformance(duration),
        ...context,
      });

      // Log performance warnings for slow operations
      if (duration > 5000) {
        // 5 seconds
        this.logger.warn(`Performance: Slow operation detected`, {
          operation: operationName,
          duration: `${duration.toFixed(2)}ms`,
          threshold: "5000ms",
          ...context,
        });
      }

      return result;
    } catch (error) {
      const endTime = performance.now();
      const duration = endTime - startTime;

      this.logger.error(
        `Performance: ${operationName} failed`,
        error as Error,
        {
          operation: operationName,
          duration: `${duration.toFixed(2)}ms`,
          failurePoint: "execution",
          ...context,
        },
      );

      throw error;
    }
  }

  /**
   * Track synchronous operation performance.
   * For operations that don't return promises but still need timing.
   *
   * @param operationName - Human-readable name for the operation
   * @param operation - Synchronous function to execute and monitor
   * @param context - Additional context information
   * @returns The operation result
   */
  static trackSync<T>(
    operationName: string,
    operation: () => T,
    context?: Record<string, unknown>,
  ): T {
    const startTime = performance.now();
    const startMemory = PerformanceLogger.getMemorySnapshot();

    this.logger.debug(`Performance: Starting ${operationName} (sync)`, {
      operation: operationName,
      startMemory,
      ...context,
    });

    try {
      const result = operation();
      const endTime = performance.now();
      const endMemory = PerformanceLogger.getMemorySnapshot();
      const duration = endTime - startTime;

      this.logger.info(`Performance: ${operationName} completed (sync)`, {
        operation: operationName,
        duration: `${duration.toFixed(2)}ms`,
        memoryDelta: PerformanceLogger.calculateMemoryDelta(
          startMemory,
          endMemory,
        ),
        performanceCategory: PerformanceLogger.categorizePerformance(duration),
        ...context,
      });

      return result;
    } catch (error) {
      const endTime = performance.now();
      const duration = endTime - startTime;

      this.logger.error(
        `Performance: ${operationName} failed (sync)`,
        error as Error,
        {
          operation: operationName,
          duration: `${duration.toFixed(2)}ms`,
          failurePoint: "execution",
          ...context,
        },
      );

      throw error;
    }
  }

  /**
   * Create a performance timer that can be manually controlled.
   * Useful for tracking operations that span multiple function calls.
   *
   * @param operationName - Human-readable name for the operation
   * @param context - Additional context information
   * @returns PerformanceTimer instance
   *
   * @example
   * ```typescript
   * const timer = PerformanceLogger.createTimer("multi_step_operation", { userId: "123" });
   * timer.start();
   * // ... do some work
   * timer.checkpoint("step_1_complete");
   * // ... do more work
   * timer.end("success");
   * ```
   */
  static createTimer(
    operationName: string,
    context?: Record<string, unknown>,
  ): PerformanceTimer {
    return new PerformanceTimer(operationName, this.logger, context);
  }

  /**
   * Get current memory usage snapshot.
   */
  private static getMemorySnapshot(): MemorySnapshot {
    const memUsage = process.memoryUsage();
    return {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
    };
  }

  /**
   * Calculate memory usage delta between two snapshots.
   */
  private static calculateMemoryDelta(
    start: MemorySnapshot,
    end: MemorySnapshot,
  ): MemoryDelta {
    return {
      heapUsed: PerformanceLogger.formatBytes(end.heapUsed - start.heapUsed),
      heapTotal: PerformanceLogger.formatBytes(end.heapTotal - start.heapTotal),
      external: PerformanceLogger.formatBytes(end.external - start.external),
      rss: PerformanceLogger.formatBytes(end.rss - start.rss),
    };
  }

  /**
   * Categorize performance based on duration.
   */
  private static categorizePerformance(durationMs: number): string {
    if (durationMs < 100) {
      return "fast";
    }
    if (durationMs < 500) {
      return "normal";
    }
    if (durationMs < 2000) {
      return "slow";
    }
    return "very_slow";
  }

  /**
   * Format bytes into human-readable format.
   */
  private static formatBytes(bytes: number): string {
    if (bytes === 0) {
      return "0B";
    }
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
    const formatted = (bytes / Math.pow(k, i)).toFixed(2);
    const sign = bytes < 0 ? "-" : "+";
    return `${sign}${formatted}${sizes[i]}`;
  }
}

/**
 * Manual performance timer for complex operations.
 */
export class PerformanceTimer {
  private startTime?: number;
  private checkpoints: Array<{
    name: string;
    time: number;
    memory: MemorySnapshot;
  }> = [];
  private startMemory?: MemorySnapshot;

  constructor(
    private operationName: string,
    private logger: {
      trace: (msg: string, ctx?: Record<string, unknown>) => void;
      debug: (msg: string, ctx?: Record<string, unknown>) => void;
      info: (msg: string, ctx?: Record<string, unknown>) => void;
      warn: (msg: string, ctx?: Record<string, unknown>) => void;
      error: (msg: string, err?: Error, ctx?: Record<string, unknown>) => void;
    },
    private context?: Record<string, unknown>,
  ) {}

  /**
   * Start the timer.
   */
  start(): void {
    this.startTime = performance.now();
    this.startMemory = this.getMemorySnapshot();
    this.checkpoints = [];

    this.logger.debug(`Performance Timer: Starting ${this.operationName}`, {
      operation: this.operationName,
      startMemory: this.startMemory,
      ...this.context,
    });
  }

  /**
   * Add a checkpoint with optional name.
   */
  checkpoint(name?: string): void {
    if (!this.startTime) {
      throw new Error("Timer not started. Call start() first.");
    }

    const checkpointName = name || `checkpoint_${this.checkpoints.length + 1}`;
    const time = performance.now();
    const memory = this.getMemorySnapshot();

    this.checkpoints.push({ name: checkpointName, time, memory });

    this.logger.debug(`Performance Timer: Checkpoint ${checkpointName}`, {
      operation: this.operationName,
      checkpoint: checkpointName,
      elapsedTime: `${(time - this.startTime).toFixed(2)}ms`,
      memory,
      ...this.context,
    });
  }

  /**
   * End the timer and log final results.
   */
  end(status: "success" | "failure" | "cancelled" = "success"): void {
    if (!this.startTime || !this.startMemory) {
      throw new Error("Timer not started. Call start() first.");
    }

    const endTime = performance.now();
    const endMemory = this.getMemorySnapshot();
    const totalDuration = endTime - this.startTime;

    const checkpointSummary = this.checkpoints.map((cp) => ({
      name: cp.name,
      time: `${(cp.time - this.startTime!).toFixed(2)}ms`,
    }));

    const logContext = {
      operation: this.operationName,
      status,
      totalDuration: `${totalDuration.toFixed(2)}ms`,
      checkpoints: checkpointSummary,
      memoryDelta: this.calculateMemoryDelta(this.startMemory, endMemory),
      performanceCategory: this.categorizePerformance(totalDuration),
      ...this.context,
    };

    if (status === "success") {
      this.logger.info(
        `Performance Timer: ${this.operationName} ${status}`,
        logContext,
      );
    } else {
      this.logger.error(
        `Performance Timer: ${this.operationName} ${status}`,
        undefined,
        logContext,
      );
    }

    // Reset timer
    this.startTime = undefined;
    this.startMemory = undefined;
    this.checkpoints = [];
  }

  private getMemorySnapshot(): MemorySnapshot {
    const memUsage = process.memoryUsage();
    return {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
    };
  }

  private calculateMemoryDelta(
    start: MemorySnapshot,
    end: MemorySnapshot,
  ): MemoryDelta {
    return {
      heapUsed: this.formatBytes(end.heapUsed - start.heapUsed),
      heapTotal: this.formatBytes(end.heapTotal - start.heapTotal),
      external: this.formatBytes(end.external - start.external),
      rss: this.formatBytes(end.rss - start.rss),
    };
  }

  private categorizePerformance(durationMs: number): string {
    if (durationMs < 100) {
      return "fast";
    }
    if (durationMs < 500) {
      return "normal";
    }
    if (durationMs < 2000) {
      return "slow";
    }
    return "very_slow";
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) {
      return "0B";
    }
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
    const formatted = (bytes / Math.pow(k, i)).toFixed(2);
    const sign = bytes < 0 ? "-" : "+";
    return `${sign}${formatted}${sizes[i]}`;
  }
}

// Type definitions
export interface MemorySnapshot {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
}

export interface MemoryDelta {
  heapUsed: string;
  heapTotal: string;
  external: string;
  rss: string;
}
