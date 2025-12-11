/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Manages local filesystem cache for Pyodide (native notebooks).
 * Downloads Pyodide core files and packages to global storage.
 *
 * @module services/pyodide/pyodideCacheManager
 */

import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";
import * as https from "https";
import type { PyodideInterface } from "pyodide";

/**
 * Manages Pyodide cache in local filesystem for native notebooks.
 * Separate from browser IndexedDB cache used by webview notebooks.
 */
export class PyodideCacheManager {
  constructor(private readonly _globalStoragePath: string) {}

  /**
   * Ensures Pyodide core files are cached locally.
   * Downloads from CDN if not present.
   *
   * @param version - Pyodide version
   * @param progress - Optional progress reporter
   * @returns Path to local Pyodide directory
   */
  async ensurePyodideCore(
    version: string,
    progress?: vscode.Progress<{ message?: string; increment?: number }>,
  ): Promise<string> {
    const pyodideCacheDir = path.join(
      this._globalStoragePath,
      "pyodide",
      version,
    );

    // Check if already cached
    try {
      await fs.access(pyodideCacheDir);
      console.log(
        "[PyodideCacheManager] Using cached Pyodide at:",
        pyodideCacheDir,
      );
      progress?.report({
        message: "Pyodide core files already cached",
        increment: 20,
      });
      return pyodideCacheDir;
    } catch {
      // Not cached, need to download
      console.log(
        "[PyodideCacheManager] Downloading Pyodide v" + version + "...",
      );
    }

    // Create cache directory
    await fs.mkdir(pyodideCacheDir, { recursive: true });

    // Download required Pyodide core files
    const baseUrl = `https://cdn.jsdelivr.net/pyodide/v${version}/full/`;
    const requiredFiles = [
      "pyodide.asm.js", // Main JavaScript loader
      "pyodide.asm.wasm", // WebAssembly binary
      "pyodide-lock.json", // Package metadata (version-specific)
      "python_stdlib.zip", // Python standard library
    ];

    const totalFiles = requiredFiles.length;
    for (let i = 0; i < totalFiles; i++) {
      const file = requiredFiles[i];
      progress?.report({
        message: `Downloading ${file} (${i + 1}/${totalFiles})`,
        increment: 20 / totalFiles,
      });

      const url = baseUrl + file;
      const destPath = path.join(pyodideCacheDir, file);

      await this._downloadFile(url, destPath);
    }

    console.log(
      "[PyodideCacheManager] Pyodide core downloaded to:",
      pyodideCacheDir,
    );
    return pyodideCacheDir;
  }

  /**
   * Preloads packages into local Pyodide cache.
   * Must be called after ensurePyodideCore().
   *
   * @param version - Pyodide version
   * @param packages - Package names to download
   * @param progress - Optional progress reporter
   */
  async preloadPackages(
    version: string,
    packages: string[],
    progress?: vscode.Progress<{ message?: string; increment?: number }>,
  ): Promise<{ succeeded: string[]; failed: string[] }> {
    const pyodidePath = path.join(this._globalStoragePath, "pyodide", version);

    // Verify core files exist
    try {
      await fs.access(pyodidePath);
    } catch {
      throw new Error(
        "Pyodide core files not cached. Call ensurePyodideCore() first.",
      );
    }

    progress?.report({
      message: "Initializing Pyodide for package download...",
      increment: 5,
    });

    // Load Pyodide using npm package (follows ZeroMQ pattern)
    // Pyodide is copied to dist/node_modules/pyodide during build
    // Webpack marks pyodide as external, so this import resolves from dist/node_modules/
    const { loadPyodide } = await import("pyodide");

    // Create package cache directory
    const packageCache = path.join(pyodidePath, "packages");
    await fs.mkdir(packageCache, { recursive: true });

    // CRITICAL FIX: Add packageCacheDir for persistent caching
    // Type assertion needed - packageCacheDir exists in runtime but TypeScript may cache old types
    const pyodide: PyodideInterface = await loadPyodide({
      indexURL: pyodidePath,
      packageCacheDir: packageCache,
      stdout: () => {}, // Suppress stdout
      stderr: () => {}, // Suppress stderr
    } as Parameters<typeof loadPyodide>[0]);

    progress?.report({
      message: "Loading micropip...",
      increment: 5,
    });

    // Load micropip for package management
    await pyodide.loadPackage("micropip");
    const micropip = pyodide.pyimport("micropip");

    // Download packages
    const succeeded: string[] = [];
    const failed: string[] = [];
    const totalPackages = packages.length;

    for (let i = 0; i < totalPackages; i++) {
      const pkg = packages[i];
      progress?.report({
        message: `Downloading ${pkg} (${i + 1}/${totalPackages})`,
        increment: 70 / totalPackages,
      });

      try {
        await micropip.install(pkg);
        succeeded.push(pkg);
        console.log(`[PyodideCacheManager] Downloaded package: ${pkg}`);
      } catch (error) {
        failed.push(pkg);
        console.warn(`[PyodideCacheManager] Failed to download ${pkg}:`, error);
      }
    }

    console.log(
      `[PyodideCacheManager] Package preload complete: ${succeeded.length} succeeded, ${failed.length} failed`,
    );

    return { succeeded, failed };
  }

  /**
   * Downloads a file from URL to local path.
   *
   * @param url - File URL
   * @param destPath - Destination path
   */
  private async _downloadFile(url: string, destPath: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      https
        .get(url, (response) => {
          if (response.statusCode !== 200) {
            reject(
              new Error(`Failed to download ${url}: ${response.statusCode}`),
            );
            return;
          }

          const chunks: Buffer[] = [];
          response.on("data", (chunk) => chunks.push(chunk));
          response.on("end", async () => {
            await fs.writeFile(destPath, Buffer.concat(chunks));
            resolve();
          });
          response.on("error", reject);
        })
        .on("error", reject);
    });
  }
}
