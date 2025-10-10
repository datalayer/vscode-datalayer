/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import * as fs from "fs";
import * as path from "path";

/**
 * Fast ipykernel detection by checking filesystem
 * Avoids slow subprocess calls (pip list)
 *
 * Performance: ~1-2ms per environment (vs 100-500ms for subprocess)
 *
 * @param pythonPath - Absolute path to Python executable
 * @param envType - Optional environment type (conda, venv, etc.)
 * @returns true if ipykernel is installed
 */
export function hasIpykernel(pythonPath: string, envType?: string): boolean {
  try {
    const pythonDir = path.dirname(pythonPath);

    // Determine environment root directory
    // Python paths can be:
    //   /path/to/env/bin/python  → env root is /path/to/env
    //   /path/to/env/python      → env root is /path/to/env
    const envRoot =
      path.basename(pythonDir) === "bin"
        ? path.dirname(pythonDir) // Go up one more level if in /bin/
        : pythonDir; // Already at env root

    if (envType?.toLowerCase() === "conda") {
      // Conda: check <env>/conda-meta/ipykernel-*.json
      const condaMetaDir = path.join(envRoot, "conda-meta");
      if (fs.existsSync(condaMetaDir)) {
        const files = fs.readdirSync(condaMetaDir);
        return files.some(
          (f) => f.startsWith("ipykernel-") && f.endsWith(".json"),
        );
      }
    }

    // Standard: check site-packages/ipykernel/
    const sitePackages = path.join(envRoot, "lib", "python*", "site-packages");
    const sitePackagesDirs = findMatchingDirs(sitePackages);

    for (const dir of sitePackagesDirs) {
      const ipykernelPath = path.join(dir, "ipykernel");
      if (fs.existsSync(ipykernelPath)) {
        return true;
      }
    }

    // Windows: check Lib/site-packages/ipykernel/
    const windowsSitePackages = path.join(
      envRoot,
      "Lib",
      "site-packages",
      "ipykernel",
    );
    if (fs.existsSync(windowsSitePackages)) {
      return true;
    }

    return false;
  } catch (error) {
    console.error("[ipykernelDetection] Error checking ipykernel:", error);
    return false; // If check fails, assume no ipykernel
  }
}

/**
 * Helper to expand glob patterns like python3.*
 */
function findMatchingDirs(pattern: string): string[] {
  const parentDir = path.dirname(pattern);
  const globPattern = path.basename(pattern);

  try {
    if (!fs.existsSync(parentDir)) {
      return [];
    }

    const entries = fs.readdirSync(parentDir);
    return entries
      .filter((entry) => {
        if (globPattern.includes("*")) {
          const regex = new RegExp("^" + globPattern.replace("*", ".*") + "$");
          return regex.test(entry);
        }
        return entry === globPattern;
      })
      .map((entry) => path.join(parentDir, entry))
      .filter((fullPath) => {
        try {
          return fs.statSync(fullPath).isDirectory();
        } catch {
          return false;
        }
      });
  } catch {
    return [];
  }
}
