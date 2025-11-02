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

import type { DatalayerClient } from "@datalayer/core/lib/client";
import type { EnvironmentDTO } from "@datalayer/core/lib/models/EnvironmentDTO";
import type { IAuthProvider } from "../interfaces/IAuthProvider";

/**
 * Caches Datalayer environments for efficient runtime creation.
 * Singleton pattern ensures single cache instance across extension.
 */
export class EnvironmentCache {
  private static _instance: EnvironmentCache;
  private _environments: EnvironmentDTO[] = [];
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
  private constructor() {}

  /**
   * Gets cached environments or fetches them if cache is stale.
   *
   * @param sdk - Datalayer SDK instance
   * @param authProvider - Authentication provider to check if user is logged in
   * @param forceRefresh - Force refresh even if cache is valid
   * @returns Array of available environments
   */
  public async getEnvironments(
    sdk: DatalayerClient,
    authProvider: IAuthProvider,
    forceRefresh = false,
  ): Promise<EnvironmentDTO[]> {
    const now = Date.now();
    const cacheValid = now - this._lastFetch < this._cacheTimeout;

    // Return cached if valid and not forcing refresh
    if (!forceRefresh && cacheValid && this._environments.length > 0) {
      return this._environments;
    }

    // Check if user is authenticated before making API calls
    if (!authProvider.isAuthenticated()) {
      // Return cached environments if available from previous session
      // This allows UI to show available environments before user logs in
      // Will be empty array if user has never logged in or cache was cleared
      return this._environments;
    }

    // Avoid concurrent fetches
    if (this._fetching) {
      await this.waitForFetch();
      return this._environments;
    }

    // Fetch new environments (only when authenticated)
    await this.fetchEnvironments(sdk);
    return this._environments;
  }

  /**
   * Fetches environments from the API.
   *
   * @param sdk - Datalayer SDK instance
   */
  private async fetchEnvironments(sdk: DatalayerClient): Promise<void> {
    this._fetching = true;

    try {
      // Call SDK to list environments - returns Environment model instances
      const environments = await sdk.listEnvironments();

      // SDK returns Environment model instances, store them directly
      this._environments = environments;
      this._lastFetch = Date.now();
    } catch (error) {
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
      // Fetch timeout, returning stale cache
    }
  }

  /**
   * Clears the environment cache.
   */
  public clear(): void {
    this._environments = [];
    this._lastFetch = 0;
  }

  /**
   * Refreshes environment cache when user logs in.
   * Should be called when authentication state changes to authenticated.
   *
   * @param sdk - Datalayer SDK instance
   */
  public async onUserLogin(sdk: DatalayerClient): Promise<void> {
    // Clear stale cache and fetch fresh environments
    this.clear();
    try {
      await this.fetchEnvironments(sdk);
    } catch (error) {
      // Silently handle errors - environments will be fetched on next request
    }
  }

  /**
   * Clears environment cache when user logs out.
   * Should be called when authentication state changes to unauthenticated.
   */
  public onUserLogout(): void {
    this.clear();
  }

  /**
   * Sets custom cache timeout.
   *
   * @param timeout - Timeout in milliseconds
   */
  public setCacheTimeout(timeout: number): void {
    this._cacheTimeout = timeout;
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
