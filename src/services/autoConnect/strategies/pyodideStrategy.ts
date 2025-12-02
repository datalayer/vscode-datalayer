/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Pyodide strategy for auto-connect.
 *
 * Returns a virtual runtime representing the browser-based Pyodide Python kernel.
 * Always succeeds as Pyodide is built-in and requires no external dependencies.
 *
 * @module services/autoConnect/strategies/pyodideStrategy
 */

import type { RuntimeDTO } from "@datalayer/core/lib/models/RuntimeDTO";
import type {
  AutoConnectStrategy,
  AutoConnectContext,
} from "../autoConnectService";

/**
 * Strategy that uses the browser-based Pyodide Python kernel.
 * Always succeeds as Pyodide is embedded in the extension.
 */
/**
 * Marker interface for Pyodide connection.
 * Pyodide is not a cloud runtime, so we use a marker pattern.
 */
export interface PyodideMarker {
  __isPyodide: true;
  uid: "pyodide-local";
}

export class PyodideStrategy implements AutoConnectStrategy {
  readonly name = "Pyodide";

  async tryConnect(_context: AutoConnectContext): Promise<RuntimeDTO | null> {
    console.log("[PyodideStrategy] Pyodide selected as auto-connect strategy");

    // Pyodide is not a cloud runtime, so we return null
    // The providers will detect this strategy and handle Pyodide specially
    // by calling kernelBridge.connectWebviewDocumentToPyodide()
    return null;
  }

  /**
   * Check if Pyodide should be used based on strategy name.
   * @param strategyName - Strategy name from config
   * @returns True if Pyodide should be used
   */
  static isPyodideStrategy(strategyName: string): boolean {
    return strategyName === "Pyodide";
  }
}
