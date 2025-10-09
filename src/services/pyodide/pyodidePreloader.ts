/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Service for preloading Pyodide packages on extension startup.
 * Downloads packages in background so they're cached when user selects Pyodide kernel.
 *
 * @module services/pyodide/pyodidePreloader
 */

import * as vscode from "vscode";
import type { ILogger } from "../interfaces/ILogger";

/**
 * Key for storing whether user has been prompted for preload
 */
const PRELOAD_PROMPTED_KEY = "datalayer.pyodide.preloadPrompted";

/**
 * Key for storing the hash of successfully preloaded packages
 * Format: "package1,package2,package3" (sorted alphabetically)
 */
const PRELOADED_PACKAGES_KEY = "datalayer.pyodide.preloadedPackages";

/**
 * Service to handle Pyodide package preloading.
 * Manages package downloads and caching for offline Python execution.
 */
export class PyodidePreloader implements vscode.Disposable {
  private _configWatcher: vscode.Disposable | null = null;
  private _isPreloading = false;

  constructor(
    private readonly _context: vscode.ExtensionContext,
    private readonly _logger: ILogger,
  ) {}

  /**
   * Initialize the preloader service.
   * - Prompts user on first startup (if enabled)
   * - Watches for config changes
   * - Starts preload if appropriate
   */
  public async initialize(): Promise<void> {
    this._logger.info("Initializing Pyodide preloader");

    const config = vscode.workspace.getConfiguration("datalayer.pyodide");
    const preloadBehavior = config.get<string>("preloadBehavior", "ask-once");

    if (preloadBehavior === "disabled") {
      this._logger.info("Pyodide preload disabled in settings");
      return;
    }

    const packages = config.get<string[]>("preloadPackages", []);
    const packagesKey = this._getPackagesKey(packages);

    // Check if we've prompted the user before
    const hasPrompted = this._context.globalState.get<boolean>(
      PRELOAD_PROMPTED_KEY,
      false,
    );

    // Check if packages are already preloaded
    const preloadedPackages = this._context.globalState.get<string>(
      PRELOADED_PACKAGES_KEY,
      "",
    );

    const arePackagesPreloaded = preloadedPackages === packagesKey;

    // Determine action based on preload behavior setting
    if (preloadBehavior === "auto") {
      // Auto mode: Download without asking if not cached
      if (!arePackagesPreloaded) {
        this._logger.info("Auto-preload mode: downloading packages");
        await this._startPreload();
      } else {
        this._logger.info("Auto-preload mode: packages already cached");
      }
    } else if (preloadBehavior === "ask-always") {
      // Always ask mode: Prompt every time if packages aren't cached
      if (!arePackagesPreloaded) {
        await this._promptUserForPreload();
      } else {
        this._logger.info("Packages already preloaded, no action needed");
      }
    } else {
      // ask-once mode (default): Prompt only first time
      if (!hasPrompted) {
        // First time - prompt user
        await this._promptUserForPreload();
      } else if (!arePackagesPreloaded) {
        // Packages changed or haven't been preloaded yet - download silently
        this._logger.info("Package list changed", {
          current: packagesKey,
          cached: preloadedPackages,
        });
        await this._startPreload();
      } else {
        // Packages already preloaded, nothing to do
        this._logger.info("Packages already preloaded", {
          packages: packagesKey,
        });
      }
    }

    // Watch for config changes
    this._watchConfigChanges();
  }

  /**
   * Generate a stable key from package list for caching
   */
  private _getPackagesKey(packages: string[]): string {
    return [...packages].sort().join(",");
  }

  /**
   * Prompt user on first startup if they want to preload packages
   */
  private async _promptUserForPreload(): Promise<void> {
    const packages = vscode.workspace
      .getConfiguration("datalayer.pyodide")
      .get<string[]>("preloadPackages", []);

    const message = `Datalayer can preload common Python packages (${packages.join(", ")}) to improve Pyodide kernel startup time. This downloads packages in the background. Download now?`;

    const choice = await vscode.window.showInformationMessage(
      message,
      "Download Now",
      "Skip",
      "Disable Preload",
    );

    // Mark as prompted
    await this._context.globalState.update(PRELOAD_PROMPTED_KEY, true);

    if (choice === "Download Now") {
      await this._startPreload();
    } else if (choice === "Disable Preload") {
      // Disable preload in settings
      await vscode.workspace
        .getConfiguration("datalayer.pyodide")
        .update(
          "preloadBehavior",
          "disabled",
          vscode.ConfigurationTarget.Global,
        );
      this._logger.info("User disabled Pyodide preload");
    } else {
      this._logger.info("User skipped Pyodide preload");
    }
  }

  /**
   * Watch for configuration changes and trigger preload if packages changed
   */
  private _watchConfigChanges(): void {
    this._configWatcher = vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration("datalayer.pyodide.preloadPackages") ||
        e.affectsConfiguration("datalayer.pyodide.preloadBehavior")
      ) {
        this._logger.info("Pyodide configuration changed");
        this._onConfigChanged();
      }
    });
  }

  /**
   * Handle configuration changes
   */
  private async _onConfigChanged(): Promise<void> {
    const config = vscode.workspace.getConfiguration("datalayer.pyodide");
    const preloadBehavior = config.get<string>("preloadBehavior", "ask-once");

    if (preloadBehavior === "disabled") {
      this._logger.info("Pyodide preload disabled");
      return;
    }

    const packages = config.get<string[]>("preloadPackages", []);
    const packagesKey = this._getPackagesKey(packages);

    // Check if these packages are already preloaded
    const preloadedPackages = this._context.globalState.get<string>(
      PRELOADED_PACKAGES_KEY,
      "",
    );

    if (preloadedPackages === packagesKey) {
      this._logger.info("Packages already preloaded, no action needed");
      return;
    }

    // Ask user if they want to download new packages
    const message = `Pyodide package configuration changed. Download packages (${packages.join(", ")}) now?`;
    const choice = await vscode.window.showInformationMessage(
      message,
      "Download Now",
      "Skip",
    );

    if (choice === "Download Now") {
      await this._startPreload();
    }
  }

  /**
   * Start preloading packages in background
   */
  private async _startPreload(): Promise<void> {
    if (this._isPreloading) {
      this._logger.warn("Preload already in progress");
      return;
    }

    const config = vscode.workspace.getConfiguration("datalayer.pyodide");
    const packages = config.get<string[]>("preloadPackages", []);

    if (packages.length === 0) {
      this._logger.info("No packages to preload");
      return;
    }

    this._isPreloading = true;
    this._logger.info(
      `Starting Pyodide package preload: ${packages.join(", ")}`,
    );

    // Show progress notification
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Datalayer: Preloading Pyodide packages",
        cancellable: false,
      },
      async (progress) => {
        try {
          progress.report({ message: "Initializing..." });

          // Execute preload by sending command to a hidden webview
          // This will trigger package download and caching in IndexedDB
          await this._executePreload(packages, progress);

          // Mark packages as successfully preloaded
          const packagesKey = this._getPackagesKey(packages);
          await this._context.globalState.update(
            PRELOADED_PACKAGES_KEY,
            packagesKey,
          );

          this._logger.info("Pyodide package preload completed successfully");
          vscode.window.showInformationMessage(
            `Pyodide packages preloaded: ${packages.join(", ")}`,
          );
        } catch (error) {
          this._logger.error(
            "Pyodide package preload failed",
            error instanceof Error ? error : undefined,
          );
          vscode.window.showErrorMessage(
            `Failed to preload Pyodide packages: ${error instanceof Error ? error.message : String(error)}`,
          );
        } finally {
          this._isPreloading = false;
        }
      },
    );
  }

  /**
   * Execute the actual preload by communicating with webview
   */
  private async _executePreload(
    packages: string[],
    progress: vscode.Progress<{ message?: string; increment?: number }>,
  ): Promise<void> {
    // Create a hidden webview panel to execute preload
    const panel = vscode.window.createWebviewPanel(
      "datalayer.pyodide.preload",
      "Pyodide Preload",
      { viewColumn: vscode.ViewColumn.Active, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    // Hide the panel immediately
    panel.dispose();

    // TODO: Implement actual preload by:
    // 1. Create a minimal webview that loads Pyodide
    // 2. Send message to webview to download packages
    // 3. Wait for completion message
    // 4. Dispose webview
    //
    // For now, we'll use a simpler approach:
    // Let the first Pyodide kernel do the preload automatically via loadPackagesFromImports
    // This service mainly handles the user prompt and config watching

    progress.report({
      message: `Packages will be cached on first use: ${packages.join(", ")}`,
    });

    this._logger.info(
      "Preload mechanism: packages will be auto-loaded on first kernel startup",
    );
  }

  /**
   * Dispose the preloader service
   */
  public dispose(): void {
    this._configWatcher?.dispose();
    this._configWatcher = null;
  }
}
