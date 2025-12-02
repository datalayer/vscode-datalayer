/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Auto-connect service for automatically connecting notebooks and lexical documents to runtimes.
 *
 * Implements a strategy pattern where multiple strategies can be tried in sequence
 * until one successfully returns a runtime.
 *
 * Configuration: datalayer.autoConnect.strategies
 * - ["Pyodide"] - Always use browser Python (default)
 * - ["Active Runtime", "Pyodide"] - Try cloud runtime first, fallback to Pyodide
 * - ["Ask"] - Always ask user
 * - [] - No auto-connect (manual selection required)
 *
 * @module services/autoConnect/autoConnectService
 */

import * as vscode from "vscode";
import type { DatalayerClient } from "@datalayer/core/lib/client";
import type { RuntimeDTO } from "@datalayer/core/lib/models/RuntimeDTO";
import type { IAuthProvider } from "../interfaces/IAuthProvider";
import type { RuntimesTreeProvider } from "../../providers/runtimesTreeProvider";
import { ActiveRuntimeStrategy } from "./strategies/activeRuntimeStrategy";
import { AskUserStrategy } from "./strategies/askUserStrategy";
import { PyodideStrategy } from "./strategies/pyodideStrategy";

/**
 * Context passed to auto-connect strategies.
 */
export interface AutoConnectContext {
  /** The document being opened */
  documentUri: vscode.Uri;
  /** Currently selected runtime, if any */
  currentRuntime?: RuntimeDTO;
  /** Datalayer SDK client */
  sdk: DatalayerClient;
  /** Authentication provider */
  authProvider: IAuthProvider;
  /** Runtimes tree provider for accessing cached runtimes */
  runtimesTreeProvider?: RuntimesTreeProvider;
}

/**
 * Strategy for auto-connecting to a runtime.
 */
export interface AutoConnectStrategy {
  /** Strategy name (matches configuration enum) */
  readonly name: string;

  /**
   * Attempts to connect to a runtime using this strategy.
   * @param context - Context information for the connection attempt
   * @returns Runtime if successful, null if strategy cannot provide a runtime
   */
  tryConnect(context: AutoConnectContext): Promise<RuntimeDTO | null>;
}

/**
 * Result from auto-connect attempt.
 */
export interface AutoConnectResult {
  /** Runtime if a cloud runtime was selected, null for Pyodide/local */
  runtime: RuntimeDTO | null;
  /** Name of the strategy that succeeded */
  strategyName: string;
}

/**
 * Service for auto-connecting documents to runtimes based on configured strategies.
 */
export class AutoConnectService {
  private readonly strategies = new Map<string, AutoConnectStrategy>();

  constructor() {
    // Register available strategies
    this.strategies.set("Pyodide", new PyodideStrategy());
    this.strategies.set("Active Runtime", new ActiveRuntimeStrategy());
    this.strategies.set("Ask", new AskUserStrategy());
  }

  /**
   * Attempts to auto-connect to a runtime using configured strategies.
   *
   * @param documentUri - Document being opened
   * @param currentRuntime - Currently selected runtime, if any
   * @param sdk - Datalayer SDK client
   * @param authProvider - Authentication provider
   * @param runtimesTreeProvider - Optional tree provider for accessing cached runtimes
   * @returns Result with runtime and strategy name, or null if all strategies fail
   */
  async connect(
    documentUri: vscode.Uri,
    currentRuntime: RuntimeDTO | undefined,
    sdk: DatalayerClient,
    authProvider: IAuthProvider,
    runtimesTreeProvider?: RuntimesTreeProvider,
  ): Promise<AutoConnectResult | null> {
    // Get configured strategies
    const config = vscode.workspace.getConfiguration("datalayer");
    const strategyNames = config.get<string[]>("autoConnect.strategies", [
      "Active Runtime",
      "Ask",
    ]);

    // Empty array means no auto-connect
    if (strategyNames.length === 0) {
      return null;
    }

    // Build context
    const context: AutoConnectContext = {
      documentUri,
      currentRuntime,
      sdk,
      authProvider,
      runtimesTreeProvider,
    };

    // Try each strategy in order
    for (const strategyName of strategyNames) {
      const strategy = this.strategies.get(strategyName);

      if (!strategy) {
        console.warn(
          `[AutoConnect] Unknown strategy: "${strategyName}", skipping`,
        );
        continue;
      }

      try {
        const runtime = await strategy.tryConnect(context);

        // For Pyodide, runtime will be null but strategy succeeds
        if (strategyName === "Pyodide") {
          console.log(
            `[AutoConnect] Success using Pyodide strategy for ${documentUri.fsPath}`,
          );
          return {
            runtime: null, // Pyodide doesn't use RuntimeDTO
            strategyName: "Pyodide",
          };
        }

        // For other strategies, check if runtime was returned
        if (runtime) {
          console.log(
            `[AutoConnect] Success using strategy "${strategyName}" for ${documentUri.fsPath}`,
          );
          return {
            runtime,
            strategyName,
          };
        }
        console.log(
          `[AutoConnect] Strategy "${strategyName}" returned no runtime, trying next`,
        );
      } catch (error) {
        console.error(
          `[AutoConnect] Strategy "${strategyName}" failed:`,
          error,
        );
        // Continue to next strategy on error
      }
    }

    console.log(
      `[AutoConnect] All strategies exhausted for ${documentUri.fsPath}, no runtime selected`,
    );
    return null;
  }
}
