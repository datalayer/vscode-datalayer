/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Tests for disposable utilities.
 * Validates resource cleanup and disposable pattern implementation.
 */

import * as assert from "assert";
import { disposeAll, Disposable } from "../../utils/dispose";

// Mock disposable for testing
class MockDisposable {
  public disposed = false;
  dispose(): void {
    this.disposed = true;
  }
}

// Test implementation of abstract Disposable class
class TestDisposable extends Disposable {
  public registerSpy<T extends { dispose(): void }>(value: T): T {
    return this._register(value as any);
  }

  public get isDisposedPublic(): boolean {
    return this.isDisposed;
  }
}

suite("Dispose Utils Tests", () => {
  suite("disposeAll", () => {
    test("disposes all items in array", () => {
      const mock1 = new MockDisposable();
      const mock2 = new MockDisposable();
      const mock3 = new MockDisposable();
      const disposables = [mock1, mock2, mock3];

      disposeAll(disposables as any);

      assert.strictEqual(mock1.disposed, true);
      assert.strictEqual(mock2.disposed, true);
      assert.strictEqual(mock3.disposed, true);
    });

    test("empties the disposables array", () => {
      const disposables = [new MockDisposable(), new MockDisposable()];

      disposeAll(disposables as any);

      assert.strictEqual(disposables.length, 0);
    });

    test("handles empty array", () => {
      const disposables: any[] = [];

      // Should not throw
      disposeAll(disposables);

      assert.strictEqual(disposables.length, 0);
    });

    test("handles null items gracefully", () => {
      const disposables = [new MockDisposable(), null, new MockDisposable()];

      // Should not throw
      disposeAll(disposables as any);

      assert.strictEqual(disposables.length, 0);
    });

    test("disposes items in reverse order (LIFO)", () => {
      const callOrder: number[] = [];
      const disposables = [
        { dispose: () => callOrder.push(1) },
        { dispose: () => callOrder.push(2) },
        { dispose: () => callOrder.push(3) },
      ];

      disposeAll(disposables as any);

      // Should be disposed in reverse order (3, 2, 1)
      assert.deepStrictEqual(callOrder, [3, 2, 1]);
    });
  });

  suite("Disposable Abstract Class", () => {
    test("can dispose instance", () => {
      const disposable = new TestDisposable();

      assert.strictEqual(disposable.isDisposedPublic, false);

      disposable.dispose();

      assert.strictEqual(disposable.isDisposedPublic, true);
    });

    test("dispose is idempotent", () => {
      const disposable = new TestDisposable();

      disposable.dispose();
      disposable.dispose();
      disposable.dispose();

      assert.strictEqual(disposable.isDisposedPublic, true);
    });

    test("disposes registered items", () => {
      const disposable = new TestDisposable();
      const mock1 = new MockDisposable();
      const mock2 = new MockDisposable();

      disposable.registerSpy(mock1);
      disposable.registerSpy(mock2);

      disposable.dispose();

      assert.strictEqual(mock1.disposed, true);
      assert.strictEqual(mock2.disposed, true);
    });

    test("register returns the registered item", () => {
      const disposable = new TestDisposable();
      const mock = new MockDisposable();

      const returned = disposable.registerSpy(mock);

      assert.strictEqual(returned, mock);
    });

    test("immediately disposes items registered after disposal", () => {
      const disposable = new TestDisposable();
      const mock = new MockDisposable();

      disposable.dispose();

      const returned = disposable.registerSpy(mock);

      assert.strictEqual(mock.disposed, true);
      assert.strictEqual(returned, mock);
    });

    test("multiple dispose calls do not re-dispose children", () => {
      const disposable = new TestDisposable();
      let disposeCount = 0;
      const mock = {
        dispose: () => {
          disposeCount++;
        },
      };

      disposable.registerSpy(mock);

      disposable.dispose();
      disposable.dispose();

      // Should only be disposed once
      assert.strictEqual(disposeCount, 1);
    });

    test("can register multiple disposables", () => {
      const disposable = new TestDisposable();
      const mocks = [
        new MockDisposable(),
        new MockDisposable(),
        new MockDisposable(),
        new MockDisposable(),
        new MockDisposable(),
      ];

      mocks.forEach((mock) => disposable.registerSpy(mock));

      disposable.dispose();

      mocks.forEach((mock) => {
        assert.strictEqual(mock.disposed, true);
      });
    });
  });
});
