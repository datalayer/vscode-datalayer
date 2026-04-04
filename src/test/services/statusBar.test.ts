/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import * as assert from "assert";

import type { DatalayerAuthProvider } from "../../services/core/authProvider";
import { DatalayerStatusBar } from "../../services/ui/statusBar";

/**
 * Creates a mock DatalayerAuthProvider.
 */
function createMockAuthProvider(
  isAuthenticated: boolean,
  user: unknown = null,
): DatalayerAuthProvider {
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
    _setAuthState: (auth: boolean, newUser: unknown = null) => {
      isAuthenticated = auth;
      user = newUser;
    },
  } as unknown as DatalayerAuthProvider;
}

suite("DatalayerStatusBar Tests", () => {
  // Reset singleton between tests
  setup(() => {
    // Access and reset the private static instance
    (
      DatalayerStatusBar as unknown as {
        instance: DatalayerStatusBar | undefined;
      }
    ).instance = undefined;
  });

  test("getInstance creates singleton", () => {
    const authProvider = createMockAuthProvider(false);
    const bar = DatalayerStatusBar.getInstance(authProvider);

    assert.ok(bar);
    assert.ok(bar instanceof DatalayerStatusBar);
  });

  test("getInstance returns same instance on second call", () => {
    const authProvider = createMockAuthProvider(false);
    const bar1 = DatalayerStatusBar.getInstance(authProvider);
    const bar2 = DatalayerStatusBar.getInstance();

    assert.strictEqual(bar1, bar2);
  });

  test("getInstance throws when first call has no authProvider", () => {
    assert.throws(() => {
      DatalayerStatusBar.getInstance();
    }, /AuthProvider is required/);
  });

  test("implements Disposable interface", () => {
    const authProvider = createMockAuthProvider(false);
    const bar = DatalayerStatusBar.getInstance(authProvider);

    assert.ok(typeof bar.dispose === "function");
  });

  test("dispose does not throw", () => {
    const authProvider = createMockAuthProvider(false);
    const bar = DatalayerStatusBar.getInstance(authProvider);

    assert.doesNotThrow(() => {
      bar.dispose();
    });
  });
});
