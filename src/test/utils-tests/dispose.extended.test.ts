/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Extended tests for disposable utilities.
 * Covers edge cases: register after dispose, error in dispose handler,
 * multiple rapid registrations, and interaction patterns.
 */

import * as assert from "assert";

import { Disposable, disposeAll } from "../../utils/dispose";

// Mock disposable that tracks dispose calls
class TrackedDisposable {
  public disposeCount = 0;
  public disposed = false;
  dispose(): void {
    this.disposeCount++;
    this.disposed = true;
  }
}

// Mock that throws during dispose
class ThrowingDisposable {
  dispose(): void {
    throw new Error("dispose failed");
  }
}

// Test subclass of abstract Disposable
class ConcreteDisposable extends Disposable {
  public registerItem<T extends { dispose(): void }>(value: T): T {
    return this._register(value);
  }

  public get disposed(): boolean {
    return this.isDisposed;
  }

  public get registeredCount(): number {
    return this._disposables.length;
  }
}

suite("Dispose Extended Tests", () => {
  suite("disposeAll - edge cases", () => {
    test("handles single-element array", () => {
      const mock = new TrackedDisposable();
      disposeAll([mock as { dispose(): void }]);

      assert.strictEqual(mock.disposed, true);
    });

    test("handles large number of disposables", () => {
      const mocks = Array.from({ length: 100 }, () => new TrackedDisposable());
      disposeAll(mocks as { dispose(): void }[]);

      assert.strictEqual(mocks.length, 0);
      // All mocks should be disposed (note: array is emptied)
    });

    test("processes items from end (pop behavior)", () => {
      const order: string[] = [];
      const disposables = [
        { dispose: () => order.push("first") },
        { dispose: () => order.push("second") },
        { dispose: () => order.push("third") },
      ];

      disposeAll(disposables);

      // pop() removes from end, so order is third, second, first
      assert.deepStrictEqual(order, ["third", "second", "first"]);
    });

    test("handles undefined items in array", () => {
      const mock = new TrackedDisposable();
      const disposables = [mock, undefined, mock] as { dispose(): void }[];

      // Should not throw
      assert.doesNotThrow(() => disposeAll(disposables));
      assert.strictEqual(disposables.length, 0);
    });
  });

  suite("Disposable - register after dispose", () => {
    test("immediately disposes newly registered item", () => {
      const disposable = new ConcreteDisposable();
      disposable.dispose();

      const late = new TrackedDisposable();
      disposable.registerItem(late);

      assert.strictEqual(late.disposed, true);
    });

    test("returns the item even when immediately disposed", () => {
      const disposable = new ConcreteDisposable();
      disposable.dispose();

      const late = new TrackedDisposable();
      const returned = disposable.registerItem(late);

      assert.strictEqual(returned, late);
      assert.strictEqual(returned.disposed, true);
    });

    test("does not add to internal disposables array after dispose", () => {
      const disposable = new ConcreteDisposable();
      disposable.dispose();

      assert.strictEqual(disposable.registeredCount, 0);

      disposable.registerItem(new TrackedDisposable());

      // Should still be 0 since it was disposed immediately
      assert.strictEqual(disposable.registeredCount, 0);
    });
  });

  suite("Disposable - multiple register", () => {
    test("registers same item twice", () => {
      const disposable = new ConcreteDisposable();
      const item = new TrackedDisposable();

      disposable.registerItem(item);
      disposable.registerItem(item);

      assert.strictEqual(disposable.registeredCount, 2);

      disposable.dispose();

      // Disposed twice because registered twice
      assert.strictEqual(item.disposeCount, 2);
    });

    test("registers many items in sequence", () => {
      const disposable = new ConcreteDisposable();
      const items: TrackedDisposable[] = [];

      for (let i = 0; i < 50; i++) {
        const item = new TrackedDisposable();
        items.push(item);
        disposable.registerItem(item);
      }

      assert.strictEqual(disposable.registeredCount, 50);

      disposable.dispose();

      items.forEach((item) => {
        assert.strictEqual(item.disposed, true);
      });
    });
  });

  suite("Disposable - error in dispose handler", () => {
    test("disposeAll propagates errors from dispose handlers", () => {
      const throwingItem = new ThrowingDisposable();
      const disposables = [throwingItem as { dispose(): void }];

      // disposeAll does not catch errors; they propagate
      assert.throws(() => disposeAll(disposables), /dispose failed/);
    });

    test("Disposable.dispose propagates errors from child disposables", () => {
      const disposable = new ConcreteDisposable();
      const throwingItem = new ThrowingDisposable();

      disposable.registerItem(throwingItem);

      // The error from the child dispose propagates
      assert.throws(() => disposable.dispose(), /dispose failed/);
    });

    test("items before throwing item in array are still popped", () => {
      const safe1 = new TrackedDisposable();
      const safe2 = new TrackedDisposable();
      const throwing = new ThrowingDisposable();

      // Order: safe1, safe2, throwing
      // Pop order: throwing (throws), safe2 and safe1 are never reached
      const disposables = [
        safe1 as { dispose(): void },
        safe2 as { dispose(): void },
        throwing as { dispose(): void },
      ];

      try {
        disposeAll(disposables);
      } catch {
        // Expected
      }

      // throwing was popped, so array should have 2 items left
      assert.strictEqual(disposables.length, 2);
    });
  });

  suite("Disposable - isDisposed state tracking", () => {
    test("isDisposed is false initially", () => {
      const disposable = new ConcreteDisposable();
      assert.strictEqual(disposable.disposed, false);
    });

    test("isDisposed is true after dispose", () => {
      const disposable = new ConcreteDisposable();
      disposable.dispose();
      assert.strictEqual(disposable.disposed, true);
    });

    test("isDisposed remains true after multiple dispose calls", () => {
      const disposable = new ConcreteDisposable();
      disposable.dispose();
      disposable.dispose();
      disposable.dispose();
      assert.strictEqual(disposable.disposed, true);
    });
  });

  suite("Disposable - idempotency", () => {
    test("children are only disposed once despite multiple parent dispose calls", () => {
      const disposable = new ConcreteDisposable();
      const child = new TrackedDisposable();

      disposable.registerItem(child);

      disposable.dispose();
      disposable.dispose();
      disposable.dispose();

      assert.strictEqual(child.disposeCount, 1);
    });

    test("internal array is cleared after first dispose", () => {
      const disposable = new ConcreteDisposable();
      disposable.registerItem(new TrackedDisposable());
      disposable.registerItem(new TrackedDisposable());

      disposable.dispose();

      assert.strictEqual(disposable.registeredCount, 0);
    });
  });
});
