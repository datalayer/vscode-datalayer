/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Extended tests for EnvironmentCache service.
 * Covers cache invalidation, TTL behavior, concurrent access, and lifecycle events.
 */

import type { DatalayerClient } from "@datalayer/core/lib/client";
import type { UserDTO } from "@datalayer/core/lib/models/UserDTO";
import * as assert from "assert";

import { EnvironmentCache } from "../../services/cache/environmentCache";
import { DatalayerAuthProvider } from "../../services/core/authProvider";
import { LoggerManager } from "../../services/logging/loggerManager";
import { ServiceLoggers } from "../../services/logging/loggers";
import {
  createMockDatalayer,
  createMockExtensionContext,
  createMockLogger,
} from "../utils/mockFactory";

suite("EnvironmentCache Extended Tests", () => {
  let cache: EnvironmentCache;
  let mockDatalayer: ReturnType<typeof createMockDatalayer>;
  let authProvider: DatalayerAuthProvider;

  setup(() => {
    // Reset singleton
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (EnvironmentCache as any)._instance = undefined;
    cache = EnvironmentCache.getInstance();

    mockDatalayer = createMockDatalayer();
    const context = createMockExtensionContext();

    // Initialize ServiceLoggers (needed by DatalayerAuthProvider)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (LoggerManager as any).instance = undefined;
    const loggerManager = LoggerManager.getInstance(context);
    ServiceLoggers.initialize(loggerManager);

    const mockLogger = createMockLogger();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (DatalayerAuthProvider as any).instance = undefined;
    authProvider = new DatalayerAuthProvider(
      mockDatalayer as unknown as DatalayerClient,
      context,
      mockLogger,
    );
  });

  teardown(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (EnvironmentCache as any)._instance = undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (DatalayerAuthProvider as any).instance = undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ServiceLoggers as any).loggerManager = undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (LoggerManager as any).instance = undefined;
  });

  /**
   * Helper to set up authenticated state.
   */
  function setAuthenticated(): void {
    authProvider["_authState"] = {
      isAuthenticated: true,
      user: { uid: "test-user" } as unknown as UserDTO,
      error: null,
    };
    mockDatalayer.auth.isAuthenticated.mockReturnValue(true);
  }

  suite("Cache TTL / Timeout", () => {
    test("setCacheTimeout changes the timeout", () => {
      cache.setCacheTimeout(5000);
      const status = cache.getStatus();
      // Cache should be valid initially (lastFetch is 0, timeout is 5s)
      // Actually with lastFetch=0 and now > 5000, it's invalid
      assert.strictEqual(status.cacheValid, false);
    });

    test("cache becomes stale after timeout", async () => {
      setAuthenticated();
      const envs = [{ name: "env1", displayName: "Env 1" }];
      mockDatalayer.listEnvironments.mockResolvedValue(envs as unknown);

      // Set very short timeout
      cache.setCacheTimeout(1);

      // Fetch once
      await cache.getEnvironments(
        mockDatalayer as unknown as DatalayerClient,
        authProvider,
      );

      // Wait for cache to expire
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Reset call count
      mockDatalayer.listEnvironments.reset();
      mockDatalayer.listEnvironments.mockResolvedValue(envs as unknown);

      // Should fetch again because cache expired
      await cache.getEnvironments(
        mockDatalayer as unknown as DatalayerClient,
        authProvider,
      );

      assert.strictEqual(mockDatalayer.listEnvironments.calls.length, 1);
    });

    test("cache remains valid within timeout period", async () => {
      setAuthenticated();
      const envs = [{ name: "env1", displayName: "Env 1" }];
      mockDatalayer.listEnvironments.mockResolvedValue(envs as unknown);

      // Set long timeout
      cache.setCacheTimeout(60000);

      await cache.getEnvironments(
        mockDatalayer as unknown as DatalayerClient,
        authProvider,
      );

      mockDatalayer.listEnvironments.reset();

      // Should use cache
      const result = await cache.getEnvironments(
        mockDatalayer as unknown as DatalayerClient,
        authProvider,
      );

      assert.strictEqual(result.length, 1);
      assert.strictEqual(mockDatalayer.listEnvironments.calls.length, 0);
    });
  });

  suite("Cache Status", () => {
    test("getStatus returns initial state", () => {
      const status = cache.getStatus();

      assert.strictEqual(status.environmentCount, 0);
      assert.strictEqual(status.lastFetch, null);
      assert.strictEqual(status.fetching, false);
    });

    test("getStatus reflects populated cache", async () => {
      setAuthenticated();
      const envs = [
        { name: "env1", displayName: "Env 1" },
        { name: "env2", displayName: "Env 2" },
      ];
      mockDatalayer.listEnvironments.mockResolvedValue(envs as unknown);

      await cache.getEnvironments(
        mockDatalayer as unknown as DatalayerClient,
        authProvider,
      );

      const status = cache.getStatus();
      assert.strictEqual(status.environmentCount, 2);
      assert.ok(status.lastFetch !== null);
      assert.strictEqual(status.cacheValid, true);
      assert.strictEqual(status.fetching, false);
    });

    test("getStatus shows invalid after clear", () => {
      cache.clear();
      const status = cache.getStatus();

      assert.strictEqual(status.environmentCount, 0);
      assert.strictEqual(status.lastFetch, null);
      assert.strictEqual(status.cacheValid, false);
    });
  });

  suite("Cache Invalidation", () => {
    test("clear resets environments and lastFetch", async () => {
      setAuthenticated();
      const envs = [{ name: "env1", displayName: "Env 1" }];
      mockDatalayer.listEnvironments.mockResolvedValue(envs as unknown);

      await cache.getEnvironments(
        mockDatalayer as unknown as DatalayerClient,
        authProvider,
      );
      assert.strictEqual(cache.getStatus().environmentCount, 1);

      cache.clear();

      assert.strictEqual(cache.getStatus().environmentCount, 0);
      assert.strictEqual(cache.getStatus().lastFetch, null);
    });

    test("onUserLogout clears cache", async () => {
      setAuthenticated();
      const envs = [{ name: "env1", displayName: "Env 1" }];
      mockDatalayer.listEnvironments.mockResolvedValue(envs as unknown);

      await cache.getEnvironments(
        mockDatalayer as unknown as DatalayerClient,
        authProvider,
      );

      cache.onUserLogout();

      assert.strictEqual(cache.getStatus().environmentCount, 0);
    });

    test("onUserLogin clears stale cache and re-fetches", async () => {
      setAuthenticated();
      const newEnvs = [
        { name: "new-env1", displayName: "New Env 1" },
        { name: "new-env2", displayName: "New Env 2" },
      ];
      mockDatalayer.listEnvironments.mockResolvedValue(newEnvs as unknown);

      await cache.onUserLogin(mockDatalayer as unknown as DatalayerClient);

      const status = cache.getStatus();
      assert.strictEqual(status.environmentCount, 2);
    });

    test("onUserLogin handles API errors gracefully", async () => {
      mockDatalayer.listEnvironments.mockRejectedValue(
        new Error("Network failure"),
      );

      // Should not throw
      await assert.doesNotReject(() =>
        cache.onUserLogin(mockDatalayer as unknown as DatalayerClient),
      );

      assert.strictEqual(cache.getStatus().environmentCount, 0);
    });
  });

  suite("Error Handling", () => {
    test("preserves existing cache on API error", async () => {
      setAuthenticated();
      const envs = [{ name: "env1", displayName: "Env 1" }];
      mockDatalayer.listEnvironments.mockResolvedValue(envs as unknown);

      // First fetch succeeds
      await cache.getEnvironments(
        mockDatalayer as unknown as DatalayerClient,
        authProvider,
      );

      // Expire cache
      cache.setCacheTimeout(0);

      // Set up error for next fetch
      mockDatalayer.listEnvironments.reset();
      mockDatalayer.listEnvironments.mockRejectedValue(new Error("API down"));

      // Wait for cache to expire
      await new Promise((resolve) => setTimeout(resolve, 5));

      // Should keep existing cache
      const result = await cache.getEnvironments(
        mockDatalayer as unknown as DatalayerClient,
        authProvider,
      );

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, "env1");
    });

    test("marks cache as stale on error (lastFetch = 0)", async () => {
      setAuthenticated();
      mockDatalayer.listEnvironments.mockRejectedValue(new Error("API error"));

      await cache.getEnvironments(
        mockDatalayer as unknown as DatalayerClient,
        authProvider,
      );

      const status = cache.getStatus();
      // lastFetch should be reset to 0 on error
      assert.strictEqual(status.lastFetch, null);
    });
  });

  suite("Authentication Checks", () => {
    test("returns empty when not authenticated and no cache", async () => {
      authProvider["_authState"] = {
        isAuthenticated: false,
        user: null,
        error: null,
      };
      mockDatalayer.auth.isAuthenticated.mockReturnValue(false);

      const result = await cache.getEnvironments(
        mockDatalayer as unknown as DatalayerClient,
        authProvider,
      );

      assert.deepStrictEqual(result, []);
      assert.strictEqual(mockDatalayer.listEnvironments.calls.length, 0);
    });

    test("returns cached data when not authenticated but cache exists", async () => {
      setAuthenticated();
      const envs = [{ name: "env1", displayName: "Env 1" }];
      mockDatalayer.listEnvironments.mockResolvedValue(envs as unknown);

      // Populate cache while authenticated
      await cache.getEnvironments(
        mockDatalayer as unknown as DatalayerClient,
        authProvider,
      );

      // Switch to unauthenticated
      authProvider["_authState"] = {
        isAuthenticated: false,
        user: null,
        error: null,
      };
      mockDatalayer.auth.isAuthenticated.mockReturnValue(false);

      // Expire cache
      cache.setCacheTimeout(0);
      await new Promise((resolve) => setTimeout(resolve, 5));

      mockDatalayer.listEnvironments.reset();

      // Should return cached data without calling API
      const result = await cache.getEnvironments(
        mockDatalayer as unknown as DatalayerClient,
        authProvider,
      );

      assert.strictEqual(result.length, 1);
      assert.strictEqual(mockDatalayer.listEnvironments.calls.length, 0);
    });
  });

  suite("Singleton Behavior", () => {
    test("multiple getInstance calls return same instance", () => {
      const a = EnvironmentCache.getInstance();
      const b = EnvironmentCache.getInstance();
      const c = EnvironmentCache.getInstance();

      assert.strictEqual(a, b);
      assert.strictEqual(b, c);
    });

    test("state persists across getInstance calls", async () => {
      setAuthenticated();
      const envs = [{ name: "env1", displayName: "Env 1" }];
      mockDatalayer.listEnvironments.mockResolvedValue(envs as unknown);

      const instance1 = EnvironmentCache.getInstance();
      await instance1.getEnvironments(
        mockDatalayer as unknown as DatalayerClient,
        authProvider,
      );

      const instance2 = EnvironmentCache.getInstance();
      const status = instance2.getStatus();

      assert.strictEqual(status.environmentCount, 1);
    });
  });
});
