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

    if (preloadBehavior === "disabled" || packages.length === 0) {
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
        return;
      }

      logger.info(
        `[NativeNotebookPreloader] Preloading ${packages.length} packages`,
      );
      await _executePreload(packages, logger);
      await context.globalState.update(NATIVE_PRELOAD_KEY, true);
      logger.info("[NativeNotebookPreloader] Preload complete");
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
    // Import Node.js modules for cache directory
    const os = await import("os");
    const path = await import("path");
    const fs = await import("fs/promises");

    // IMPORTANT: Native notebooks use npm package version (0.29.0)
    // The datalayer.pyodide.version config is ONLY for webview notebooks (CDN)
    const pyodideVersion = "0.29.1";

    // Create cache directory path (same location as runtime!)
    const cacheDir = path.join(
      os.homedir(),
      ".cache",
      "datalayer-pyodide",
      pyodideVersion,
      "packages",
    );

    // Ensure cache directory exists
    await fs.mkdir(cacheDir, { recursive: true });

    // Load Pyodide using npm package (follows ZeroMQ pattern)
    // Pyodide is copied to dist/node_modules/pyodide during build
    // Webpack marks pyodide as external, so this import resolves from dist/node_modules/
    const { loadPyodide } = await import("pyodide");

    // CRITICAL FIX: Add packageCacheDir for persistent caching
    // Type assertion needed - packageCacheDir exists in runtime but TypeScript may cache old types
    pyodide = await loadPyodide({
      packageCacheDir: cacheDir,
      stdout: () => {}, // Suppress stdout during preload
      stderr: () => {}, // Suppress stderr during preload
    } as Parameters<typeof loadPyodide>[0]);

    // Use loadPackage() for built-in packages - this respects packageCacheDir!
    // micropip.install() does NOT use packageCacheDir and re-downloads every time
    // Load packages individually to handle errors gracefully (skip failed packages)
    const results = await Promise.allSettled(
      packages.map(async (pkg) => {
        try {
          await pyodide!.loadPackage(pkg);
          return { pkg, success: true };
        } catch (error) {
          logger.warn(
            `[NativeNotebookPreloader] Failed to load ${pkg}: ${error instanceof Error ? error.message : String(error)}`,
          );
          return { pkg, success: false, error };
        }
      }),
    );

    const succeeded = results.filter(
      (r) => r.status === "fulfilled" && r.value.success,
    ).length;

    if (succeeded < packages.length) {
      logger.info(
        `[NativeNotebookPreloader] Loaded ${succeeded}/${packages.length} packages`,
      );
    }
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
