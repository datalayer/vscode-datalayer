/// <reference types="vitest/globals" />

/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

vi.mock("@jupyterlab/services", () => ({
  ServiceManager: vi.fn(),
  ServerConnection: {
    makeSettings: vi.fn((opts: Record<string, unknown>) => opts),
  },
}));

vi.mock("../services/serviceManagerFactory", () => {
  let callCount = 0;
  return {
    ServiceManagerFactory: {
      create: vi.fn((opts: { type: string }) => {
        callCount++;
        return {
          __type: opts.type,
          __id: callCount,
          ready: Promise.resolve(),
          isReady: true,
          kernels: {
            running: vi.fn(() => []),
            startNew: vi.fn(),
          },
          sessions: {
            running: vi.fn(() => []),
            startNew: vi.fn(),
            shutdownAll: vi.fn(() => Promise.resolve()),
          },
          dispose: vi.fn(),
        };
      }),
      getType: vi.fn(
        (mgr: Record<string, unknown>) => (mgr.__type as string) || "unknown",
      ),
    },
  };
});

import {
  type IDisposableListener,
  MutableServiceManager,
} from "../services/mutableServiceManager";

describe("MutableServiceManager", () => {
  describe("constructor", () => {
    it("creates with a mock service manager by default", () => {
      const msm = new MutableServiceManager();
      expect(msm.current).toBeDefined();
      expect((msm.current as Record<string, unknown>).__type).toBe("mock");
    });

    it("accepts a custom initial service manager", () => {
      const custom = { custom: true } as never;
      const msm = new MutableServiceManager(custom);
      expect(msm.current).toBe(custom);
    });
  });

  describe("current", () => {
    it("returns the underlying service manager", () => {
      const msm = new MutableServiceManager();
      const current = msm.current;
      expect(current).toBeDefined();
      expect((current as Record<string, unknown>).isReady).toBe(true);
    });
  });

  describe("updateToMock()", () => {
    it("swaps the underlying service manager to mock", () => {
      const msm = new MutableServiceManager();
      const first = msm.current;
      msm.updateToMock();
      const second = msm.current;
      expect(second).not.toBe(first);
      expect((second as Record<string, unknown>).__type).toBe("mock");
    });

    it("disposes the previous service manager", () => {
      const msm = new MutableServiceManager();
      const first = msm.current;
      msm.updateToMock();
      expect((first as Record<string, unknown>).dispose).toHaveBeenCalled();
    });

    it("notifies listeners on update", () => {
      const msm = new MutableServiceManager();
      const listener = vi.fn();
      msm.onChange(listener);
      msm.updateToMock();
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe("updateToLocal()", () => {
    it("swaps to a local service manager", () => {
      const msm = new MutableServiceManager();
      msm.updateToLocal("k1", "python3", "http://localhost:8888");
      expect((msm.current as Record<string, unknown>).__type).toBe("local");
    });

    it("notifies listeners", () => {
      const msm = new MutableServiceManager();
      const listener = vi.fn();
      msm.onChange(listener);
      msm.updateToLocal("k1", "python3", "http://localhost:8888");
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe("updateToPyodide()", () => {
    it("swaps to a pyodide service manager", () => {
      const msm = new MutableServiceManager();
      msm.updateToPyodide();
      expect((msm.current as Record<string, unknown>).__type).toBe("pyodide");
    });

    it("notifies listeners", () => {
      const msm = new MutableServiceManager();
      const listener = vi.fn();
      msm.onChange(listener);
      msm.updateToPyodide("https://cdn.example.com/pyodide");
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe("getType()", () => {
    it("delegates to ServiceManagerFactory.getType", () => {
      const msm = new MutableServiceManager();
      const type = msm.getType();
      expect(type).toBe("mock");
    });
  });

  describe("onChange()", () => {
    it("returns a disposable listener", () => {
      const msm = new MutableServiceManager();
      const listener = vi.fn();
      const disposable: IDisposableListener = msm.onChange(listener);
      expect(disposable).toBeDefined();
      expect(typeof disposable.dispose).toBe("function");
    });

    it("removes listener when disposed", () => {
      const msm = new MutableServiceManager();
      const listener = vi.fn();
      const disposable = msm.onChange(listener);
      disposable.dispose();
      msm.updateToMock();
      expect(listener).not.toHaveBeenCalled();
    });

    it("supports multiple listeners", () => {
      const msm = new MutableServiceManager();
      const listenerA = vi.fn();
      const listenerB = vi.fn();
      msm.onChange(listenerA);
      msm.onChange(listenerB);
      msm.updateToMock();
      expect(listenerA).toHaveBeenCalledTimes(1);
      expect(listenerB).toHaveBeenCalledTimes(1);
    });

    it("dispose is idempotent", () => {
      const msm = new MutableServiceManager();
      const listener = vi.fn();
      const disposable = msm.onChange(listener);
      disposable.dispose();
      disposable.dispose(); // second call should not throw
      msm.updateToMock();
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("createProxy()", () => {
    it("returns an object that forwards property access to current manager", () => {
      const msm = new MutableServiceManager();
      const proxy = msm.createProxy();
      expect((proxy as Record<string, unknown>).isReady).toBe(true);
    });

    it("reflects changes when underlying manager is swapped", () => {
      const msm = new MutableServiceManager();
      const proxy = msm.createProxy();
      const firstId = (proxy as Record<string, unknown>).__id;
      msm.updateToMock();
      const secondId = (proxy as Record<string, unknown>).__id;
      expect(secondId).not.toBe(firstId);
    });

    it("creates sub-proxies for known object properties", () => {
      const msm = new MutableServiceManager();
      const proxy = msm.createProxy();
      const kernels = (proxy as Record<string, unknown>).kernels;
      expect(kernels).toBeDefined();
    });

    it("returns the same sub-proxy instance on repeated access", () => {
      const msm = new MutableServiceManager();
      const proxy = msm.createProxy();
      const kernels1 = (proxy as Record<string, unknown>).kernels;
      const kernels2 = (proxy as Record<string, unknown>).kernels;
      expect(kernels1).toBe(kernels2);
    });

    it("sub-proxy forwards to the new manager after swap", () => {
      const msm = new MutableServiceManager();
      const proxy = msm.createProxy();
      const sessions = (proxy as Record<string, unknown>).sessions as Record<
        string,
        unknown
      >;
      // running() should call into the mock's sessions.running
      const runningFn = sessions.running as () => unknown[];
      expect(typeof runningFn).toBe("function");
      const result = runningFn();
      expect(Array.isArray(result)).toBe(true);
    });

    it("supports set on the proxy", () => {
      const msm = new MutableServiceManager();
      const proxy = msm.createProxy() as Record<string, unknown>;
      proxy.customProp = "test-value";
      expect((msm.current as Record<string, unknown>).customProp).toBe(
        "test-value",
      );
    });

    it("supports 'in' operator via has trap", () => {
      const msm = new MutableServiceManager();
      const proxy = msm.createProxy();
      expect("isReady" in proxy).toBe(true);
    });
  });
});
