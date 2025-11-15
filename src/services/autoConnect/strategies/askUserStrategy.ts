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
import type {
  AutoConnectStrategy,
  AutoConnectContext,
} from "../autoConnectService";
import { selectDatalayerRuntime } from "../../../ui/dialogs/runtimeSelector";

/**
 * Strategy that asks the user to select a runtime via Quick Pick.
 */
export class AskUserStrategy implements AutoConnectStrategy {
  readonly name = "Ask";

  async tryConnect(context: AutoConnectContext): Promise<RuntimeDTO | null> {
    console.log(
      `[AskUserStrategy] Showing runtime selector for ${context.documentUri.fsPath}`,
    );

    // Use the existing runtime selector dialog
    const runtime = await selectDatalayerRuntime(
      context.sdk,
      context.authProvider,
    );

    if (runtime) {
      console.log(`[AskUserStrategy] User selected runtime: ${runtime.uid}`);
      return runtime;
    }

    console.log("[AskUserStrategy] User cancelled runtime selection");
    return null;
  }
}
