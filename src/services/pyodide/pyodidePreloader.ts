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
import { getNonce } from "../../utils/webviewSecurity";

/**
 * Key for storing whether user has been prompted for preload
 */
const PRELOAD_PROMPTED_KEY = "datalayer.pyodide.preloadPrompted";

/**
 * Key for storing the hash of successfully preloaded packages
 * Format: "version:package1,package2,package3" (sorted alphabetically with version prefix)
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
  ) {
    // Native notebooks no longer use PyodideCacheManager - they download packages
    // directly to filesystem cache using npm Pyodide package (0.29.0)
  }

  /**
   * Initialize the preloader service.
   * - Prompts user on first startup (if enabled)
   * - Watches for config changes
   * - Starts preload if appropriate
   */
  public async initialize(): Promise<void> {
    const config = vscode.workspace.getConfiguration("datalayer.pyodide");
    const preloadBehavior = config.get<string>("preloadBehavior", "ask-once");

    if (preloadBehavior === "disabled") {
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
        await this._startPreload();
      }
    } else if (preloadBehavior === "ask-always") {
      // Always ask mode: Prompt every time if packages aren't cached
      if (!arePackagesPreloaded) {
        await this._promptUserForPreload();
      }
    } else {
      // ask-once mode (default): Prompt only first time
      if (!hasPrompted) {
        // First time - prompt user
        await this._promptUserForPreload();
      } else if (!arePackagesPreloaded) {
        // Packages changed or haven't been preloaded yet - download silently
        await this._startPreload();
      }
    }

    // Watch for config changes
    this._watchConfigChanges();
  }

  /**
   * Generate a stable key from package list AND version for caching
   */
  private _getPackagesKey(packages: string[]): string {
    const config = vscode.workspace.getConfiguration("datalayer.pyodide");
    const version = config.get<string>("version", "0.27.3");
    // Format: "version:package1,package2,package3"
    return `${version}:${[...packages].sort().join(",")}`;
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
    }
  }

  /**
   * Watch for configuration changes and trigger preload if packages or version changed
   */
  private _watchConfigChanges(): void {
    this._configWatcher = vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration("datalayer.pyodide.preloadPackages") ||
        e.affectsConfiguration("datalayer.pyodide.preloadBehavior") ||
        e.affectsConfiguration("datalayer.pyodide.version")
      ) {
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
      return;
    }

    const config = vscode.workspace.getConfiguration("datalayer.pyodide");
    const packages = config.get<string[]>("preloadPackages", []);

    if (packages.length === 0) {
      return;
    }

    this._isPreloading = true;

    // Show progress notification
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Datalayer: Preloading Pyodide packages",
        cancellable: false,
      },
      async (progress) => {
        try {
          const pyodideVersion = config.get<string>("version", "0.27.3");

          // Preload for NATIVE notebooks (filesystem cache)
          progress.report({ message: "Preloading packages..." });
          await this._executeNativePreload(pyodideVersion, packages, progress);

          // Mark packages as successfully preloaded
          const packagesKey = this._getPackagesKey(packages);
          await this._context.globalState.update(
            PRELOADED_PACKAGES_KEY,
            packagesKey,
          );

          vscode.window.showInformationMessage(
            "Pyodide packages preloaded successfully",
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
   * Preload packages for NATIVE notebooks (Node.js filesystem cache).
   * NOTE: Native notebooks use the npm Pyodide package (0.29.0), so we ONLY download packages,
   * NOT core files. Core files come from npm package, not CDN!
   */
  private async _executeNativePreload(
    _pyodideVersion: string, // Ignored - native notebooks use npm package version (0.29.0)
    packages: string[],
    progress: vscode.Progress<{ message?: string; increment?: number }>,
  ): Promise<void> {
    // Import Node.js modules for cache directory
    const os = await import("os");
    const path = await import("path");
    const fs = await import("fs/promises");

    // IMPORTANT: Native notebooks use npm package version (0.29.0), NOT config version!
    const npmPyodideVersion = "0.29.0";

    // Create cache directory path (same location as runtime!)
    const cacheDir = path.join(
      os.homedir(),
      ".cache",
      "datalayer-pyodide",
      npmPyodideVersion,
      "packages",
    );

    // Ensure cache directory exists
    await fs.mkdir(cacheDir, { recursive: true });

    // Load Pyodide using npm package (follows ZeroMQ pattern)
    // Pyodide is copied to dist/node_modules/pyodide during build
    // Webpack marks pyodide as external, so this import resolves from dist/node_modules/
    const { loadPyodide } = await import("pyodide");

    // CRITICAL: Add packageCacheDir for persistent caching
    const pyodide = await loadPyodide({
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
          progress.report({ message: `Loading ${pkg}...` });
          await pyodide.loadPackage(pkg);
          return { pkg, success: true };
        } catch (error) {
          this._logger.warn(
            `Failed to load ${pkg}: ${error instanceof Error ? error.message : String(error)}`,
          );
          return { pkg, success: false, error };
        }
      }),
    );

    const succeeded = results.filter(
      (r) => r.status === "fulfilled" && r.value.success,
    ).length;

    progress.report({
      message: `Loaded ${succeeded}/${packages.length} packages`,
    });

    // Clean up Pyodide instance (free memory)
    try {
      // destroy() method exists at runtime but not in TypeScript types
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (pyodide as any).destroy?.();
    } catch (error) {
      this._logger.warn(
        `Failed to destroy Pyodide instance: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Preload packages for WEBVIEW notebooks (browser IndexedDB cache).
   * Creates a hidden webview panel that downloads packages via micropip.
   * NOTE: Currently disabled due to poor UX (see line 262).
   */
  // @ts-expect-error - Method kept for potential future re-enabling
  private async _executeWebviewPreload(
    packages: string[],
    progress: vscode.Progress<{ message?: string; increment?: number }>,
  ): Promise<void> {
    const config = vscode.workspace.getConfiguration("datalayer.pyodide");
    const pyodideVersion = config.get<string>("version", "0.27.3");

    return new Promise<void>((resolve, reject) => {
      // Create hidden webview panel for preloading (background, no focus steal)
      const panel = vscode.window.createWebviewPanel(
        "datalayer.pyodide.preload",
        "Pyodide Preload",
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
        {
          enableScripts: true,
          retainContextWhenHidden: true,
        },
      );

      // Set up message listener BEFORE setting HTML
      const messageListener = panel.webview.onDidReceiveMessage(
        async (message) => {
          switch (message.type) {
            case "progress":
              progress.report({
                message: message.text,
                increment: message.increment,
              });
              this._logger.info(`Preload progress: ${message.text}`);
              break;

            case "complete":
              const successMsg =
                message.message || "Preload completed successfully";
              this._logger.info(successMsg);
              messageListener.dispose();
              panel.dispose();
              resolve();
              break;

            case "error":
              this._logger.error("Preload failed", new Error(message.error));
              messageListener.dispose();
              panel.dispose();
              reject(new Error(message.error));
              break;
          }
        },
      );

      // Generate minimal HTML that loads Pyodide and packages
      panel.webview.html = this._getPreloadHtml(
        panel.webview,
        pyodideVersion,
        packages,
      );
    });
  }

  /**
   * Generate minimal HTML for preloading Pyodide
   */
  private _getPreloadHtml(
    _webview: vscode.Webview,
    pyodideVersion: string,
    packages: string[],
  ): string {
    const nonce = getNonce();

    return /* html */ `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="
          default-src 'none';
          script-src 'nonce-${nonce}' 'unsafe-eval' https://cdn.jsdelivr.net;
          connect-src https://cdn.jsdelivr.net https://files.pythonhosted.org https://pypi.org;
        ">
      </head>
      <body>
        <div id="status">Initializing Pyodide...</div>
        <script nonce="${nonce}">
          const vscode = acquireVsCodeApi();
          const packages = ${JSON.stringify(packages)};

          (async () => {
            try {
              // Report progress
              vscode.postMessage({
                type: 'progress',
                text: 'Loading Pyodide runtime...',
                increment: 10
              });

              // Load Pyodide from CDN
              const pyodideUrl = "https://cdn.jsdelivr.net/pyodide/v${pyodideVersion}/full/pyodide.js";
              const script = document.createElement('script');
              script.src = pyodideUrl;
              await new Promise((resolve, reject) => {
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
              });

              vscode.postMessage({
                type: 'progress',
                text: 'Initializing Pyodide...',
                increment: 30
              });

              const pyodide = await loadPyodide({
                indexURL: "https://cdn.jsdelivr.net/pyodide/v${pyodideVersion}/full/"
              });

              vscode.postMessage({
                type: 'progress',
                text: 'Loading micropip...',
                increment: 10
              });

              // Load micropip for package installation
              await pyodide.loadPackage("micropip");
              const micropip = pyodide.pyimport("micropip");

              // Download packages (this caches them in IndexedDB)
              const totalPackages = packages.length;
              const succeeded = [];
              const failed = [];

              for (let i = 0; i < totalPackages; i++) {
                const pkg = packages[i];
                vscode.postMessage({
                  type: 'progress',
                  text: \`Downloading \${pkg} (\${i + 1}/\${totalPackages})...\`,
                  increment: 50 / totalPackages
                });

                try {
                  await micropip.install(pkg);
                  succeeded.push(pkg);
                } catch (pkgError) {
                  console.error(\`Failed to install \${pkg}:\`, pkgError);
                  failed.push({ pkg, error: pkgError.message || String(pkgError) });
                  // Continue with next package instead of failing completely
                }
              }

              // Report results - succeed if at least some packages were installed
              if (succeeded.length > 0) {
                const message = failed.length > 0
                  ? \`Preloaded \${succeeded.length}/\${totalPackages} packages. Failed: \${failed.map(f => f.pkg).join(', ')}\`
                  : \`All \${succeeded.length} packages preloaded successfully\`;
                vscode.postMessage({ type: 'complete', message });
              } else {
                // All packages failed
                const errorDetails = failed.map(f => \`\${f.pkg}: \${f.error}\`).join('\\n');
                throw new Error(\`All packages failed to install:\\n\${errorDetails}\`);
              }

            } catch (error) {
              vscode.postMessage({
                type: 'error',
                error: error.message || String(error)
              });
            }
          })();
        </script>
      </body>
    </html>
  `;
  }

  /**
   * Dispose the preloader service
   */
  public dispose(): void {
    this._configWatcher?.dispose();
    this._configWatcher = null;
  }
}
