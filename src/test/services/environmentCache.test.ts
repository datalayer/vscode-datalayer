/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Tests for EnvironmentCache service.
 * Validates caching behavior and singleton pattern.
 */

import * as assert from "assert";
import { EnvironmentCache } from "../../services/cache/environmentCache";
import { DatalayerAuthProvider } from "../../services/core/authProvider";
import { LoggerManager } from "../../services/logging/loggerManager";
import { ServiceLoggers } from "../../services/logging/loggers";
import type { DatalayerClient } from "@datalayer/core/lib/client";
import type { UserDTO } from "@datalayer/core/lib/models/UserDTO";
import {
  createMockDatalayer,
  createMockExtensionContext,
  createMockLogger,
} from "../utils/mockFactory";
import { sleep as _sleep } from "../utils/testHelpers";

suite("EnvironmentCache Tests", () => {
  let cache: EnvironmentCache;
  let mockDatalayer: ReturnType<typeof createMockDatalayer>;
  let authProvider: DatalayerAuthProvider;

  setup(() => {
    // Reset singleton
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (EnvironmentCache as any)._instance = undefined;
    cache = EnvironmentCache.getInstance();

    // Setup Datalayer and auth
    mockDatalayer = createMockDatalayer();
    const context = createMockExtensionContext();

    // Initialize ServiceLoggers
    const loggerManager = LoggerManager.getInstance(context);
    ServiceLoggers.initialize(loggerManager);

    // Create mock logger for dependency injection
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
  });

  suite("Singleton Pattern", () => {
    test("getInstance returns same instance", () => {
      const instance1 = EnvironmentCache.getInstance();
      const instance2 = EnvironmentCache.getInstance();

      assert.strictEqual(instance1, instance2);
    });
  });

  suite("Cache Behavior", () => {
    test("returns empty array when not authenticated", async () => {
      // Mock not authenticated
      authProvider["_authState"] = {
        isAuthenticated: false,
        user: null,
        error: null,
      };
      mockDatalayer.auth.isAuthenticated.mockReturnValue(false);

      const environments = await cache.getEnvironments(
        mockDatalayer as unknown as DatalayerClient,
        authProvider,
      );

      assert.deepStrictEqual(environments, []);
      // Datalayer should not have been called
      assert.strictEqual(mockDatalayer.runtimes.environments.calls.length, 0);
    });

    test("fetches environments when authenticated", async () => {
      // Mock authenticated
      authProvider["_authState"] = {
        isAuthenticated: true,
        user: { uid: "test-user" } as unknown as UserDTO,
        error: null,
      };
      mockDatalayer.auth.isAuthenticated.mockReturnValue(true);

      const mockEnvironments = [
        { name: "python-env", displayName: "Python" },
        { name: "ai-env", displayName: "AI" },
      ];

      mockDatalayer.listEnvironments.mockResolvedValue(mockEnvironments as unknown);

      const environments = await cache.getEnvironments(
        mockDatalayer as unknown as DatalayerClient,
        authProvider,
      );

      assert.strictEqual(environments.length, 2);
      assert.strictEqual(environments[0].name, "python-env");
      assert.strictEqual(mockDatalayer.listEnvironments.calls.length, 1);
    });

    test("returns cached environments on second call", async () => {
      authProvider["_authState"] = {
        isAuthenticated: true,
        user: { uid: "test-user" } as unknown as UserDTO,
        error: null,
      };
      mockDatalayer.auth.isAuthenticated.mockReturnValue(true);

      const mockEnvironments = [{ name: "python-env", displayName: "Python" }];

      mockDatalayer.listEnvironments.mockResolvedValue(mockEnvironments as unknown);

      // First call - fetches
      await cache.getEnvironments(
        mockDatalayer as unknown as DatalayerClient,
        authProvider,
      );

      // Reset call count
      mockDatalayer.listEnvironments.reset();

      // Second call - should use cache
      const environments = await cache.getEnvironments(
        mockDatalayer as unknown as DatalayerClient,
        authProvider,
      );

      assert.strictEqual(environments.length, 1);
      // Datalayer should not have been called again
      assert.strictEqual(mockDatalayer.listEnvironments.calls.length, 0);
    });

    test("forceRefresh bypasses cache", async () => {
      authProvider["_authState"] = {
        isAuthenticated: true,
        user: { uid: "test-user" } as unknown as UserDTO,
        error: null,
      };
      mockDatalayer.auth.isAuthenticated.mockReturnValue(true);

      const mockEnvironments = [{ name: "python-env", displayName: "Python" }];

      mockDatalayer.listEnvironments.mockResolvedValue(mockEnvironments as unknown);

      // First call
      await cache.getEnvironments(
        mockDatalayer as unknown as DatalayerClient,
        authProvider,
      );

      // Reset and change mock data
      mockDatalayer.listEnvironments.reset();
      const newMockEnvironments = [
        { name: "python-env", displayName: "Python" },
        { name: "ai-env", displayName: "AI" },
      ];
      mockDatalayer.listEnvironments.mockResolvedValue(
        newMockEnvironments as unknown,
      );

      // Force refresh
      const environments = await cache.getEnvironments(
        mockDatalayer as unknown as DatalayerClient,
        authProvider,
        true, // forceRefresh
      );

      assert.strictEqual(environments.length, 2);
      assert.strictEqual(mockDatalayer.listEnvironments.calls.length, 1);
    });
  });

  suite("Error Handling", () => {
    test("handles Datalayer errors gracefully", async () => {
      authProvider["_authState"] = {
        isAuthenticated: true,
        user: { uid: "test-user" } as unknown as UserDTO,
        error: null,
      };
      mockDatalayer.auth.isAuthenticated.mockReturnValue(true);

      mockDatalayer.listEnvironments.mockRejectedValue(new Error("Network error"));

      const environments = await cache.getEnvironments(
        mockDatalayer as unknown as DatalayerClient,
        authProvider,
      );

      // Should return empty array on error
      assert.deepStrictEqual(environments, []);
    });
  });
});
