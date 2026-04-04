/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import * as assert from "assert";

import { BaseService, ServiceState } from "../../services/core/baseService";
import { createMockLogger } from "../utils/mockFactory";

class TestService extends BaseService {
  public initializeCalled = false;
  public disposeCalled = false;
  public shouldFailInit = false;
  public shouldFailDispose = false;

  constructor(logger: ReturnType<typeof createMockLogger>) {
    super("TestService", logger);
  }

  protected async onInitialize(): Promise<void> {
    if (this.shouldFailInit) {
      throw new Error("init failed");
    }
    this.initializeCalled = true;
  }

  protected async onDispose(): Promise<void> {
    if (this.shouldFailDispose) {
      throw new Error("dispose failed");
    }
    this.disposeCalled = true;
  }

  public callAssertReady(): void {
    this.assertReady();
  }
}

suite("BaseService Tests", () => {
  let service: TestService;
  let logger: ReturnType<typeof createMockLogger>;

  setup(() => {
    logger = createMockLogger();
    service = new TestService(logger);
  });

  suite("Initial state", () => {
    test("starts in Uninitialized state", () => {
      assert.strictEqual(service.state, ServiceState.Uninitialized);
    });

    test("onInitialize has not been called", () => {
      assert.strictEqual(service.initializeCalled, false);
    });

    test("onDispose has not been called", () => {
      assert.strictEqual(service.disposeCalled, false);
    });
  });

  suite("initialize", () => {
    test("transitions to Ready state", async () => {
      await service.initialize();
      assert.strictEqual(service.state, ServiceState.Ready);
    });

    test("calls onInitialize", async () => {
      await service.initialize();
      assert.strictEqual(service.initializeCalled, true);
    });

    test("double initialize is a no-op (logs warning)", async () => {
      let warnCalled = false;
      logger.warn = (..._args: unknown[]) => {
        warnCalled = true;
      };

      await service.initialize();
      await service.initialize();

      assert.strictEqual(warnCalled, true);
      assert.strictEqual(service.state, ServiceState.Ready);
    });

    test("transitions to Error state on failure", async () => {
      service.shouldFailInit = true;

      try {
        await service.initialize();
        assert.fail("Should have thrown");
      } catch (e) {
        assert.strictEqual((e as Error).message, "init failed");
      }

      assert.strictEqual(service.state, ServiceState.Error);
    });

    test("rethrows the initialization error", async () => {
      service.shouldFailInit = true;

      await assert.rejects(() => service.initialize(), {
        message: "init failed",
      });
    });
  });

  suite("dispose", () => {
    test("transitions to Disposed state", async () => {
      await service.initialize();
      await service.dispose();
      assert.strictEqual(service.state, ServiceState.Disposed);
    });

    test("calls onDispose", async () => {
      await service.initialize();
      await service.dispose();
      assert.strictEqual(service.disposeCalled, true);
    });

    test("double dispose is a no-op", async () => {
      await service.initialize();
      await service.dispose();

      // Second dispose should not throw
      await service.dispose();
      assert.strictEqual(service.state, ServiceState.Disposed);
    });

    test("can dispose from Uninitialized state", async () => {
      await service.dispose();
      assert.strictEqual(service.state, ServiceState.Disposed);
      assert.strictEqual(service.disposeCalled, true);
    });

    test("rethrows disposal error", async () => {
      service.shouldFailDispose = true;
      await service.initialize();

      await assert.rejects(() => service.dispose(), {
        message: "dispose failed",
      });
    });
  });

  suite("assertReady", () => {
    test("throws when Uninitialized", () => {
      assert.throws(() => service.callAssertReady(), /not ready/);
    });

    test("does not throw when Ready", async () => {
      await service.initialize();
      assert.doesNotThrow(() => service.callAssertReady());
    });

    test("throws when Disposed", async () => {
      await service.initialize();
      await service.dispose();

      assert.throws(() => service.callAssertReady(), /not ready/);
    });

    test("throws when in Error state", async () => {
      service.shouldFailInit = true;

      try {
        await service.initialize();
      } catch {
        // expected
      }

      assert.throws(() => service.callAssertReady(), /not ready/);
    });

    test("error message includes service name", () => {
      try {
        service.callAssertReady();
        assert.fail("Should have thrown");
      } catch (e) {
        assert.ok((e as Error).message.includes("TestService"));
      }
    });

    test("error message includes current state", () => {
      try {
        service.callAssertReady();
        assert.fail("Should have thrown");
      } catch (e) {
        assert.ok((e as Error).message.includes("uninitialized"));
      }
    });
  });

  suite("ServiceState enum", () => {
    test("has all expected values", () => {
      assert.strictEqual(ServiceState.Uninitialized, "uninitialized");
      assert.strictEqual(ServiceState.Initializing, "initializing");
      assert.strictEqual(ServiceState.Ready, "ready");
      assert.strictEqual(ServiceState.Disposing, "disposing");
      assert.strictEqual(ServiceState.Disposed, "disposed");
      assert.strictEqual(ServiceState.Error, "error");
    });
  });

  suite("lifecycle sequence", () => {
    test("full lifecycle: init -> ready -> dispose -> disposed", async () => {
      assert.strictEqual(service.state, ServiceState.Uninitialized);

      await service.initialize();
      assert.strictEqual(service.state, ServiceState.Ready);

      await service.dispose();
      assert.strictEqual(service.state, ServiceState.Disposed);
    });

    test("logger receives info messages during lifecycle", async () => {
      const infoMessages: string[] = [];
      logger.info = (msg: unknown, ..._args: unknown[]) => {
        infoMessages.push(String(msg));
      };

      await service.initialize();
      await service.dispose();

      assert.ok(infoMessages.some((m) => m.includes("Initializing")));
      assert.ok(infoMessages.some((m) => m.includes("ready")));
      assert.ok(infoMessages.some((m) => m.includes("Disposing")));
      assert.ok(infoMessages.some((m) => m.includes("disposed")));
    });
  });
});
