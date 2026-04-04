/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Ask User strategy for auto-connect.
 *
 * Shows a Quick Pick dialog with available runtimes (same as "Select Kernel" button).
 * Returns the selected runtime or null if the user cancels.
 *
 * @module services/autoConnect/strategies/askUserStrategy
 */

import type { RuntimeDTO } from "@datalayer/core/lib/models/RuntimeDTO";

import { selectDatalayerRuntime } from "../../../ui/dialogs/runtimeSelector";
import { ServiceLoggers } from "../../logging/loggers";
import type {
  AutoConnectContext,
  AutoConnectStrategy,
} from "../autoConnectService";

/**
 * Strategy that asks the user to select a runtime via Quick Pick.
 *
 */
export class AskUserStrategy implements AutoConnectStrategy {
  readonly name = "Ask";

  /**
   * Show a Quick Pick dialog to let the user select a runtime.
   * @param context - Auto-connect context with Datalayer client and auth.
   *
   * @returns The user-selected runtime, or null if cancelled.
   */
  async tryConnect(context: AutoConnectContext): Promise<RuntimeDTO | null> {
    ServiceLoggers.runtime.debug(
      `[AskUserStrategy] Showing runtime selector for ${context.documentUri.fsPath}`,
    );

    // Use the existing runtime selector dialog
    const runtime = await selectDatalayerRuntime(
      context.datalayer,
      context.authProvider,
    );

    if (runtime) {
      ServiceLoggers.runtime.debug(
        `[AskUserStrategy] User selected runtime: ${runtime.uid}`,
      );
      return runtime;
    }

    ServiceLoggers.runtime.debug(
      "[AskUserStrategy] User cancelled runtime selection",
    );
    return null;
  }
}
