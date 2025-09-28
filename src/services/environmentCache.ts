/*
 * Copyright (c) 2021-2023 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Environment caching service for Datalayer runtime creation.
 * Loads and caches available environments to avoid repeated API calls.
 *
 * @module services/environmentCache
 */

import type { DatalayerSDK, Environment } from "../../../core/lib/index.js";

/**
 * Caches Datalayer environments for efficient runtime creation.
 * Singleton pattern ensures single cache instance across extension.
 */
export class EnvironmentCache {
  private static _instance: EnvironmentCache;
  private _environments: Environment[] = [];
  private _lastFetch: number = 0;
  private _cacheTimeout = 3600000; // 1 hour cache
  private _fetching = false;

  /**
   * Gets the singleton instance of EnvironmentCache.
   *
   * @returns The singleton instance
   */
  public static getInstance(): EnvironmentCache {
    if (!EnvironmentCache._instance) {
      EnvironmentCache._instance = new EnvironmentCache();
    }
    return EnvironmentCache._instance;
  }

  /**
   * Private constructor for singleton pattern.
   */
  private constructor() {
    console.log("[EnvironmentCache] Cache initialized");
  }

  /**
   * Gets cached environments or fetches them if cache is stale.
   *
   * @param sdk - Datalayer SDK instance
   * @param forceRefresh - Force refresh even if cache is valid
   * @returns Array of available environments
   */
  public async getEnvironments(
    sdk: DatalayerSDK,
    forceRefresh = false
  ): Promise<Environment[]> {
    const now = Date.now();
    const cacheValid = now - this._lastFetch < this._cacheTimeout;

    // Return cached if valid and not forcing refresh
    if (!forceRefresh && cacheValid && this._environments.length > 0) {
      console.log(
        "[EnvironmentCache] Returning cached environments:",
        this._environments.length
      );
      return this._environments;
    }

    // Avoid concurrent fetches
    if (this._fetching) {
      console.log("[EnvironmentCache] Already fetching, waiting...");
      await this.waitForFetch();
      return this._environments;
    }

    // Fetch new environments
    await this.fetchEnvironments(sdk);
    return this._environments;
  }

  /**
   * Fetches environments from the API.
   *
   * @param sdk - Datalayer SDK instance
   */
  private async fetchEnvironments(sdk: DatalayerSDK): Promise<void> {
    console.log("[EnvironmentCache] Fetching environments from API");
    this._fetching = true;

    try {
      // Call SDK to list environments
      const environments = await (sdk as any).listEnvironments();

      // Filter and process environments
      this._environments = this.processEnvironments(environments);
      this._lastFetch = Date.now();

      console.log(
        "[EnvironmentCache] Fetched",
        this._environments.length,
        "environments"
      );
    } catch (error) {
      console.error("[EnvironmentCache] Failed to fetch environments:", error);

      // On error, keep existing cache but mark as stale
      this._lastFetch = 0;

      // If no cached environments, provide defaults
      if (this._environments.length === 0) {
        this._environments = this.getDefaultEnvironments();
      }
    } finally {
      this._fetching = false;
    }
  }

  /**
   * Processes raw environment data from API.
   *
   * @param environments - Raw environment data
   * @returns Processed environments
   */
  private processEnvironments(environments: any[]): Environment[] {
    if (!Array.isArray(environments)) {
      console.warn(
        "[EnvironmentCache] Invalid environments response, using defaults"
      );
      return this.getDefaultEnvironments();
    }

    // Filter and map environments
    return environments
      .filter((env) => env && env.name)
      .map(
        (env) =>
          ({
            uid: env.uid || env.name,
            name: env.name,
            title: env.title || this.formatEnvironmentTitle(env.name),
            description:
              env.description || this.getEnvironmentDescription(env.name),
            ...env,
          } as Environment)
      )
      .sort((a, b) => {
        // Sort with common environments first
        const priority = ["python-cpu-env", "ai-env", "python-gpu-env"];
        const aIndex = priority.indexOf(a.name || "");
        const bIndex = priority.indexOf(b.name || "");

        if (aIndex !== -1 && bIndex !== -1) {
          return aIndex - bIndex;
        }
        if (aIndex !== -1) {
          return -1;
        }
        if (bIndex !== -1) {
          return 1;
        }

        return (a.name || "").localeCompare(b.name || "");
      });
  }

  /**
   * Formats environment name into a readable title.
   *
   * @param name - Environment name
   * @returns Formatted title
   */
  private formatEnvironmentTitle(name: string): string {
    return name
      .replace(/-env$/, "")
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .replace(/Cpu/g, "CPU")
      .replace(/Gpu/g, "GPU")
      .replace(/Ai/g, "AI");
  }

  /**
   * Gets a description for an environment based on its name.
   *
   * @param name - Environment name
   * @returns Environment description
   */
  private getEnvironmentDescription(name: string): string {
    const descriptions: { [key: string]: string } = {
      "python-cpu-env": "Standard Python environment with CPU support",
      "python-gpu-env": "Python environment with GPU acceleration",
      "ai-env": "AI/ML environment with popular frameworks",
      "data-science-env": "Data science environment with analytics tools",
      "r-env": "R statistical computing environment",
      "julia-env": "Julia scientific computing environment",
    };

    return (
      descriptions[name] || `${this.formatEnvironmentTitle(name)} environment`
    );
  }

  /**
   * Provides default environments when API is unavailable.
   *
   * @returns Default environment list
   */
  private getDefaultEnvironments(): Environment[] {
    return [
      {
        uid: "python-cpu-env",
        name: "python-cpu-env",
        title: "Python CPU",
        description: "Standard Python environment with CPU support",
        dockerImage: "",
        language: "python",
        burning_rate: 0,
      } as Environment,
      {
        uid: "ai-env",
        name: "ai-env",
        title: "AI Environment",
        description: "AI/ML environment with popular frameworks",
        dockerImage: "",
        language: "python",
        burning_rate: 0,
      } as Environment,
    ];
  }

  /**
   * Waits for ongoing fetch to complete.
   */
  private async waitForFetch(): Promise<void> {
    const maxWait = 30000; // 30 seconds
    const startTime = Date.now();

    while (this._fetching && Date.now() - startTime < maxWait) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    if (this._fetching) {
      console.warn("[EnvironmentCache] Fetch timeout, returning stale cache");
    }
  }

  /**
   * Clears the environment cache.
   */
  public clear(): void {
    this._environments = [];
    this._lastFetch = 0;
    console.log("[EnvironmentCache] Cache cleared");
  }

  /**
   * Sets custom cache timeout.
   *
   * @param timeout - Timeout in milliseconds
   */
  public setCacheTimeout(timeout: number): void {
    this._cacheTimeout = timeout;
    console.log("[EnvironmentCache] Cache timeout set to:", timeout);
  }

  /**
   * Gets current cache status.
   *
   * @returns Cache status information
   */
  public getStatus(): {
    environmentCount: number;
    lastFetch: Date | null;
    cacheValid: boolean;
    fetching: boolean;
  } {
    const now = Date.now();
    return {
      environmentCount: this._environments.length,
      lastFetch: this._lastFetch ? new Date(this._lastFetch) : null,
      cacheValid: now - this._lastFetch < this._cacheTimeout,
      fetching: this._fetching,
    };
  }
}
