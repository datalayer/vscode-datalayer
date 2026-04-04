/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import * as assert from "assert";

import type { RuntimesTreeProvider } from "../../providers/runtimesTreeProvider";
import type { SettingsTreeProvider } from "../../providers/settingsTreeProvider";
import type { SmartDynamicControllerManager } from "../../providers/smartDynamicControllerManager";
import type { SpacesTreeProvider } from "../../providers/spacesTreeProvider";
import { setupAuthStateManagement } from "../../services/core/authManager";
import type { DatalayerAuthProvider } from "../../services/core/authProvider";

/** Mock auth provider with a test helper to fire state changes. */
interface MockAuthProvider extends Partial<DatalayerAuthProvider> {
  _fireStateChange: (state: unknown) => void;
}

/** Mock tree provider with a test helper to read the refresh count. */
interface MockTreeProvider {
  refresh: () => void;
  getRefreshCount: () => number;
}

/** Mock controller manager with a test helper to read the refresh count. */
interface MockControllerManager {
  refreshControllers: () => Promise<void>;
  getRefreshCount: () => number;
}

/**
 * Creates a mock DatalayerAuthProvider for testing auth state management.
 */
function createMockAuthProvider(
  isAuthenticated = false,
  user: unknown = null,
): MockAuthProvider {
  const listeners: Array<(state: unknown) => void> = [];

  return {
    getAuthState: () => ({
      isAuthenticated,
      user: user as null,
      error: null,
    }),
    onAuthStateChanged: ((listener: (state: unknown) => void) => {
      listeners.push(listener);
      return { dispose: () => {} };
    }) as DatalayerAuthProvider["onAuthStateChanged"],
    _fireStateChange: (state: unknown) => {
      for (const listener of listeners) {
        listener(state);
      }
    },
  };
}

/**
 * Creates a mock SpacesTreeProvider.
 */
function createMockSpacesTreeProvider(): MockTreeProvider {
  let refreshCount = 0;
  return {
    refresh: () => {
      refreshCount++;
    },
    getRefreshCount: () => refreshCount,
  };
}

/**
 * Creates a mock RuntimesTreeProvider.
 */
function createMockRuntimesTreeProvider(): MockTreeProvider {
  let refreshCount = 0;
  return {
    refresh: () => {
      refreshCount++;
    },
    getRefreshCount: () => refreshCount,
  };
}

/**
 * Creates a mock SettingsTreeProvider.
 */
function createMockSettingsTreeProvider(): MockTreeProvider {
  let refreshCount = 0;
  return {
    refresh: () => {
      refreshCount++;
    },
    getRefreshCount: () => refreshCount,
  };
}

/**
 * Creates a mock SmartDynamicControllerManager.
 */
function createMockControllerManager(): MockControllerManager {
  let refreshCount = 0;
  return {
    refreshControllers: async () => {
      refreshCount++;
    },
    getRefreshCount: () => refreshCount,
  };
}

suite("AuthManager Tests", () => {
  suite("setupAuthStateManagement", () => {
    test("returns a function", () => {
      const authProvider = createMockAuthProvider();
      const spacesTree = createMockSpacesTreeProvider();
      const controllerManager = createMockControllerManager();

      const updateAuthState = setupAuthStateManagement(
        authProvider as unknown as DatalayerAuthProvider,
        spacesTree as unknown as SpacesTreeProvider,
        controllerManager as unknown as SmartDynamicControllerManager,
      );

      assert.strictEqual(typeof updateAuthState, "function");
    });

    test("sets initial context on setup", () => {
      const authProvider = createMockAuthProvider(true);
      const spacesTree = createMockSpacesTreeProvider();
      const controllerManager = createMockControllerManager();

      setupAuthStateManagement(
        authProvider as unknown as DatalayerAuthProvider,
        spacesTree as unknown as SpacesTreeProvider,
        controllerManager as unknown as SmartDynamicControllerManager,
      );

      // The function executes setContext command during setup.
      // We verify no errors are thrown.
    });

    test("returned function refreshes spaces tree", () => {
      const authProvider = createMockAuthProvider(false);
      const spacesTree = createMockSpacesTreeProvider();
      const controllerManager = createMockControllerManager();

      const updateAuthState = setupAuthStateManagement(
        authProvider as unknown as DatalayerAuthProvider,
        spacesTree as unknown as SpacesTreeProvider,
        controllerManager as unknown as SmartDynamicControllerManager,
      );

      updateAuthState();

      assert.strictEqual(spacesTree.getRefreshCount(), 1);
    });

    test("returned function refreshes runtimes tree when provided", () => {
      const authProvider = createMockAuthProvider(false);
      const spacesTree = createMockSpacesTreeProvider();
      const controllerManager = createMockControllerManager();
      const runtimesTree = createMockRuntimesTreeProvider();

      const updateAuthState = setupAuthStateManagement(
        authProvider as unknown as DatalayerAuthProvider,
        spacesTree as unknown as SpacesTreeProvider,
        controllerManager as unknown as SmartDynamicControllerManager,
        runtimesTree as unknown as RuntimesTreeProvider,
      );

      updateAuthState();

      assert.strictEqual(runtimesTree.getRefreshCount(), 1);
    });

    test("returned function refreshes settings tree when provided", () => {
      const authProvider = createMockAuthProvider(false);
      const spacesTree = createMockSpacesTreeProvider();
      const controllerManager = createMockControllerManager();
      const runtimesTree = createMockRuntimesTreeProvider();
      const settingsTree = createMockSettingsTreeProvider();

      const updateAuthState = setupAuthStateManagement(
        authProvider as unknown as DatalayerAuthProvider,
        spacesTree as unknown as SpacesTreeProvider,
        controllerManager as unknown as SmartDynamicControllerManager,
        runtimesTree as unknown as RuntimesTreeProvider,
        settingsTree as unknown as SettingsTreeProvider,
      );

      updateAuthState();

      assert.strictEqual(settingsTree.getRefreshCount(), 1);
    });

    test("returned function refreshes controllers", () => {
      const authProvider = createMockAuthProvider(false);
      const spacesTree = createMockSpacesTreeProvider();
      const controllerManager = createMockControllerManager();

      const updateAuthState = setupAuthStateManagement(
        authProvider as unknown as DatalayerAuthProvider,
        spacesTree as unknown as SpacesTreeProvider,
        controllerManager as unknown as SmartDynamicControllerManager,
      );

      updateAuthState();

      assert.strictEqual(controllerManager.getRefreshCount(), 1);
    });

    test("works without optional providers", () => {
      const authProvider = createMockAuthProvider(false);
      const spacesTree = createMockSpacesTreeProvider();
      const controllerManager = createMockControllerManager();

      const updateAuthState = setupAuthStateManagement(
        authProvider as unknown as DatalayerAuthProvider,
        spacesTree as unknown as SpacesTreeProvider,
        controllerManager as unknown as SmartDynamicControllerManager,
      );

      assert.doesNotThrow(() => {
        updateAuthState();
      });
    });

    test("can be called multiple times without errors", () => {
      const authProvider = createMockAuthProvider(false);
      const spacesTree = createMockSpacesTreeProvider();
      const controllerManager = createMockControllerManager();

      const updateAuthState = setupAuthStateManagement(
        authProvider as unknown as DatalayerAuthProvider,
        spacesTree as unknown as SpacesTreeProvider,
        controllerManager as unknown as SmartDynamicControllerManager,
      );

      assert.doesNotThrow(() => {
        updateAuthState();
        updateAuthState();
        updateAuthState();
      });

      assert.strictEqual(spacesTree.getRefreshCount(), 3);
    });
  });
});
