/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Auto-connect service for automatically connecting notebooks and lexical documents to runtimes.
 *
 * Implements a strategy pattern where multiple strategies can be tried in sequence
 * Until one successfully returns a runtime.
 *
 * Configuration: datalayer.autoConnect.strategies.
 * - ["Pyodide"] - Always use browser Python (default)
 * - ["Active Runtime", "Pyodide"] - Try cloud runtime first, fallback to Pyodide
 * - ["Ask"] - Always ask user
 * - [] - No auto-connect (manual selection required)
 *
 * @module services/autoConnect/autoConnectService
 */

import type { DatalayerClient } from "@datalayer/core/lib/client";
import type { RuntimeDTO } from "@datalayer/core/lib/models/RuntimeDTO";
import * as vscode from "vscode";

import type { RuntimesTreeProvider } from "../../providers/runtimesTreeProvider";
import { getValidatedSettingsGroup } from "../config/settingsValidator";
import type { IAuthProvider } from "../interfaces/IAuthProvider";
import { ServiceLoggers } from "../logging/loggers";
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
  /** Datalayer client */
  datalayer: DatalayerClient;
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
   * @param context - Context information for the connection attempt.
   *
   * @returns Runtime if successful, null if strategy cannot provide a runtime.
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
 *
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
   * Attempts to auto-connect to a runtime using configured strategies in order.
   *
   * @param documentUri - Document being opened.
   * @param currentRuntime - Currently selected runtime, if any.
   * @param datalayer - Datalayer client for API calls.
   * @param authProvider - Authentication provider for checking login state.
   * @param runtimesTreeProvider - Optional tree provider for accessing cached runtimes.
   *
   * @returns Result with runtime and strategy name, or null if all strategies fail.
   */
  async connect(
    documentUri: vscode.Uri,
    currentRuntime: RuntimeDTO | undefined,
    datalayer: DatalayerClient,
    authProvider: IAuthProvider,
    runtimesTreeProvider?: RuntimesTreeProvider,
  ): Promise<AutoConnectResult | null> {
    // Get configured strategies
    const strategyNames = getValidatedSettingsGroup("autoConnect").strategies;

    // Empty array means no auto-connect
    if (strategyNames.length === 0) {
      return null;
    }

    // Build context
    const context: AutoConnectContext = {
      documentUri,
      currentRuntime,
      datalayer,
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
          ServiceLoggers.runtime.debug(
            `[AutoConnect] Success using Pyodide strategy for ${documentUri.fsPath}`,
          );
          return {
            runtime: null, // Pyodide doesn't use RuntimeDTO
            strategyName: "Pyodide",
          };
        }

        // For other strategies, check if runtime was returned
        if (runtime) {
          ServiceLoggers.runtime.debug(
            `[AutoConnect] Success using strategy "${strategyName}" for ${documentUri.fsPath}`,
          );
          return {
            runtime,
            strategyName,
          };
        }
        ServiceLoggers.runtime.debug(
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

    ServiceLoggers.runtime.debug(
      `[AutoConnect] All strategies exhausted for ${documentUri.fsPath}, no runtime selected`,
    );
    return null;
  }
}
