/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Preloader for native VS Code notebook Pyodide packages.
 * Downloads Python packages on extension activation so they're cached when user runs cells.
 * Uses bundled npm Pyodide (v0.29.0).
 *
 * @module services/pyodide/nativeNotebookPreloader
 */

import * as vscode from "vscode";
import type { ILogger } from "../interfaces/ILogger";
import type { PyodideInterface } from "pyodide";

/**
 * Key for storing whether packages have been preloaded for native notebooks
 */
const NATIVE_PRELOAD_KEY = "datalayer.pyodide.nativePreloaded";

/**
 * Preloads Python packages for native VS Code notebooks.
 * Respects the preloadBehavior configuration setting.
 * Runs in background without blocking extension activation.
 *
 * @param context - Extension context
 * @param logger - Logger instance
 */
export async function preloadPackagesForNativeNotebooks(
  context: vscode.ExtensionContext,
  logger: ILogger,
): Promise<void> {
  try {
    // Get configuration
    const config = vscode.workspace.getConfiguration("datalayer.pyodide");
    const preloadBehavior = config.get<string>("preloadBehavior", "auto");
    const packages = config.get<string[]>("preloadPackages", []);

    if (preloadBehavior === "disabled") {
      logger.info(
        "[NativeNotebookPreloader] Preload disabled in settings, skipping",
      );
      return;
    }

    if (packages.length === 0) {
      logger.info(
        "[NativeNotebookPreloader] No packages configured for preload",
      );
      return;
    }

    // Check if already preloaded
    const hasPreloaded = context.globalState.get<boolean>(
      NATIVE_PRELOAD_KEY,
      false,
    );

    // For "ask-once" or "ask-always", we rely on PyodidePreloader's prompts
    // For "auto", we preload without asking
    if (preloadBehavior === "auto") {
      if (hasPreloaded) {
        logger.info(
          "[NativeNotebookPreloader] Packages already preloaded, skipping",
        );
        return;
      }

      logger.info(
        `[NativeNotebookPreloader] Starting auto-preload of ${packages.length} packages`,
      );
      await _executePreload(packages, logger);
      await context.globalState.update(NATIVE_PRELOAD_KEY, true);
      logger.info(
        "[NativeNotebookPreloader] Auto-preload completed successfully",
      );
    } else {
      // For ask-once and ask-always, the preload happens via PyodidePreloader prompts
      // We'll defer to first execution so user sees the prompt
      logger.info(
        `[NativeNotebookPreloader] Preload behavior is '${preloadBehavior}', deferring to first execution`,
      );
    }
  } catch (error) {
    logger.error(
      "[NativeNotebookPreloader] Preload failed:",
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}

/**
 * Executes the actual package preload by initializing Pyodide and downloading packages.
 *
 * @param packages - List of package names to download
 * @param logger - Logger instance
 */
async function _executePreload(
  packages: string[],
  logger: ILogger,
): Promise<void> {
  let pyodide: PyodideInterface | null = null;

  try {
    logger.info("[NativeNotebookPreloader] Initializing Pyodide runtime...");

    // Load Pyodide using npm package (Node.js compatible)
    const { loadPyodide } = await import("pyodide");

    pyodide = await loadPyodide({
      stdout: () => {}, // Suppress stdout during preload
      stderr: () => {}, // Suppress stderr during preload
    });

    logger.info("[NativeNotebookPreloader] Loading micropip...");
    await pyodide.loadPackage("micropip");
    const micropip = pyodide.pyimport("micropip");

    logger.info(
      `[NativeNotebookPreloader] Downloading ${packages.length} packages in parallel...`,
    );

    // Download packages in parallel for speed
    const results = await Promise.allSettled(
      packages.map(async (pkg) => {
        try {
          await micropip.install(pkg);
          logger.info(`[NativeNotebookPreloader] ✓ Downloaded: ${pkg}`);
          return { pkg, success: true };
        } catch (error) {
          logger.warn(
            `[NativeNotebookPreloader] ✗ Failed to download ${pkg}: ${error instanceof Error ? error.message : String(error)}`,
          );
          return { pkg, success: false, error };
        }
      }),
    );

    // Log summary
    const succeeded = results.filter(
      (r) => r.status === "fulfilled" && r.value.success,
    ).length;
    const failed = results.length - succeeded;

    logger.info(
      `[NativeNotebookPreloader] Package preload complete: ${succeeded} succeeded, ${failed} failed`,
    );
  } catch (error) {
    logger.error(
      "[NativeNotebookPreloader] Failed to execute preload:",
      error instanceof Error ? error : new Error(String(error)),
    );
    throw error;
  } finally {
    // Clean up Pyodide instance (free memory)
    if (pyodide) {
      try {
        // destroy() method exists at runtime but not in TypeScript types
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (pyodide as any).destroy?.();
      } catch (error) {
        logger.warn(
          `[NativeNotebookPreloader] Failed to destroy Pyodide instance: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}
