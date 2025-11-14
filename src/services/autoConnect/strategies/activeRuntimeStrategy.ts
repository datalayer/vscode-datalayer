/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Active Runtime strategy for auto-connect.
 *
 * Returns the runtime with the most remaining time from the Runtimes tree view cache.
 * Runtimes are sorted by available time (expiredAt - now) in descending order.
 * If no runtimes are running, returns null.
 *
 * @module services/autoConnect/strategies/activeRuntimeStrategy
 */

import type { RuntimeDTO } from "@datalayer/core/lib/models/RuntimeDTO";
import type {
  AutoConnectStrategy,
  AutoConnectContext,
} from "../autoConnectService";

/**
 * Strategy that uses any available running runtime.
 * Selects the runtime with the most time remaining to maximize session duration.
 */
export class ActiveRuntimeStrategy implements AutoConnectStrategy {
  readonly name = "Active Runtime";

  async tryConnect(context: AutoConnectContext): Promise<RuntimeDTO | null> {
    // Get runtimes from the tree provider cache (already loaded in sidebar)
    const runtimes = context.runtimesTreeProvider?.getCachedRuntimes() || [];

    if (runtimes.length > 0) {
      const now = Date.now();

      // Filter out expired runtimes before sorting
      const validRuntimes = runtimes.filter(
        (runtime) => runtime.expiredAt.getTime() > now,
      );

      if (validRuntimes.length > 0) {
        // Sort valid runtimes by remaining time (expiredAt - now) in descending order.
        // This ensures we select the runtime with the most time available,
        // which is better for the user as it maximizes their session duration
        // before the runtime expires.
        const sortedRuntimes = [...validRuntimes].sort((a, b) => {
          const remainingA = a.expiredAt.getTime() - now;
          const remainingB = b.expiredAt.getTime() - now;
          return remainingB - remainingA; // Descending order (most time first)
        });

        const runtime = sortedRuntimes[0];
        const remainingMinutes = Math.floor(
          (runtime.expiredAt.getTime() - now) / 60000,
        );
        console.log(
          `[ActiveRuntimeStrategy] Using runtime with most time available: ${runtime.uid} (~${remainingMinutes} minutes remaining)`,
        );
        return runtime;
      }

      console.log(
        "[ActiveRuntimeStrategy] All runtimes are expired, no valid runtime available",
      );
      return null;
    }

    console.log("[ActiveRuntimeStrategy] No running runtimes available");
    return null;
  }
}
