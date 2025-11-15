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
 * - ["Active Runtime"] - Only connect to active runtime
 * - ["Active Runtime", "Ask"] - Try active runtime, then ask user
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
 * Service for auto-connecting documents to runtimes based on configured strategies.
 */
export class AutoConnectService {
  private readonly strategies = new Map<string, AutoConnectStrategy>();

  constructor() {
    // Register available strategies
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
   * @returns Runtime if a strategy succeeds, null if all strategies fail or config is empty
   */
  async connect(
    documentUri: vscode.Uri,
    currentRuntime: RuntimeDTO | undefined,
    sdk: DatalayerClient,
    authProvider: IAuthProvider,
    runtimesTreeProvider?: RuntimesTreeProvider,
  ): Promise<RuntimeDTO | null> {
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
        if (runtime) {
          console.log(
            `[AutoConnect] Success using strategy "${strategyName}" for ${documentUri.fsPath}`,
          );
          return runtime;
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
