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
import { PyodideCacheManager } from "./pyodideCacheManager";

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
  private _cacheManager: PyodideCacheManager;

  constructor(
    private readonly _context: vscode.ExtensionContext,
    private readonly _logger: ILogger,
  ) {
    this._cacheManager = new PyodideCacheManager(
      this._context.globalStorageUri.fsPath,
    );
  }

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
      this._logger.info("User disabled Pyodide preload");
    } else {
      this._logger.info("User skipped Pyodide preload");
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
          const pyodideVersion = config.get<string>("version", "0.27.3");

          // Step 1: Preload for NATIVE notebooks (filesystem cache)
          progress.report({ message: "Preloading for native notebooks..." });
          await this._executeNativePreload(pyodideVersion, packages, progress);

          // Step 2: Preload for WEBVIEW notebooks (IndexedDB cache)
          progress.report({ message: "Preloading for webview notebooks..." });
          await this._executeWebviewPreload(packages, progress);

          // Mark packages as successfully preloaded
          const packagesKey = this._getPackagesKey(packages);
          await this._context.globalState.update(
            PRELOADED_PACKAGES_KEY,
            packagesKey,
          );

          this._logger.info("Pyodide package preload completed successfully");
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
   */
  private async _executeNativePreload(
    pyodideVersion: string,
    packages: string[],
    progress: vscode.Progress<{ message?: string; increment?: number }>,
  ): Promise<void> {
    this._logger.info("Starting native notebook preload");

    // Download Pyodide core files
    await this._cacheManager.ensurePyodideCore(pyodideVersion, progress);

    // Download packages
    const result = await this._cacheManager.preloadPackages(
      pyodideVersion,
      packages,
      progress,
    );

    if (result.failed.length > 0) {
      this._logger.warn(
        `Some packages failed to download: ${result.failed.join(", ")}`,
      );
    }

    this._logger.info(
      `Native preload complete: ${result.succeeded.length} succeeded, ${result.failed.length} failed`,
    );
  }

  /**
   * Preload packages for WEBVIEW notebooks (browser IndexedDB cache).
   * Creates a hidden webview panel that downloads packages via micropip.
   */
  private async _executeWebviewPreload(
    packages: string[],
    progress: vscode.Progress<{ message?: string; increment?: number }>,
  ): Promise<void> {
    const config = vscode.workspace.getConfiguration("datalayer.pyodide");
    const pyodideVersion = config.get<string>("version", "0.27.3");

    return new Promise<void>((resolve, reject) => {
      // Create hidden webview panel for preloading
      const panel = vscode.window.createWebviewPanel(
        "datalayer.pyodide.preload",
        "Pyodide Preload",
        { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
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
