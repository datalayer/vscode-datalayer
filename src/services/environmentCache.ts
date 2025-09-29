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
      // Call SDK to list environments - returns Environment model instances
      const environments = await (sdk as any).listEnvironments();

      // SDK returns Environment model instances, store them directly
      this._environments = environments;
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

      // If no cached environments, return empty array
      if (this._environments.length === 0) {
        this._environments = [];
      }
    } finally {
      this._fetching = false;
    }
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
