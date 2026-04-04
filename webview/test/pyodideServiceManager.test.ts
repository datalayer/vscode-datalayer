/// <reference types="vitest/globals" />

/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

vi.mock("@jupyterlab/services", () => ({
  ServerConnection: {
    makeSettings: vi.fn((opts: Record<string, unknown>) => ({
      baseUrl: opts.baseUrl || "",
      wsUrl: opts.wsUrl || "",
      token: opts.token || "",
    })),
  },
  ServiceManager: vi.fn(),
}));

vi.mock("@lumino/signaling", () => {
  class MockSignal {
    connect = vi.fn();
    disconnect = vi.fn();
    emit = vi.fn();
  }
  return {
    Signal: MockSignal,
    ISignal: {},
  };
});

vi.mock("../services/pyodideInlineKernel", () => ({
  PyodideInlineKernel: vi.fn(),
}));

vi.mock("../services/base", () => {
  class BaseKernelManager {
    serverSettings: unknown;
    _activeKernel: unknown = null;
    _runningChanged = { emit: vi.fn() };
    isDisposed = false;
    constructor(serverSettings: unknown) {
      this.serverSettings = serverSettings;
    }
    log = vi.fn();
    dispose = vi.fn();
    running = vi.fn(() => []);
    refreshRunning = vi.fn(() => Promise.resolve());
    shutdown = vi.fn(() => Promise.resolve());
    shutdownAll = vi.fn(() => Promise.resolve());
  }
  class BaseSessionManager {
    serverSettings: unknown;
    _activeSession: unknown = null;
    _runningChanged = { emit: vi.fn() };
    isDisposed = false;
    constructor(serverSettings: unknown) {
      this.serverSettings = serverSettings;
    }
    log = vi.fn();
    dispose = vi.fn();
    running = vi.fn(() => []);
    refreshRunning = vi.fn(() => Promise.resolve());
    shutdown = vi.fn(() => Promise.resolve());
    shutdownAll = vi.fn(() => Promise.resolve());
  }
  return { BaseKernelManager, BaseSessionManager };
});

import { createPyodideServiceManager } from "../services/pyodideServiceManager";

describe("createPyodideServiceManager", () => {
  it("returns a service manager object", () => {
    const sm = createPyodideServiceManager();
    expect(sm).toBeDefined();
  });

  it("is ready immediately", async () => {
    const sm = createPyodideServiceManager();
    expect(sm.isReady).toBe(true);
    await expect(sm.ready).resolves.toBeUndefined();
  });

  it("is not disposed initially", () => {
    const sm = createPyodideServiceManager();
    expect(sm.isDisposed).toBe(false);
  });

  describe("serverSettings", () => {
    it("uses pyodide-local base URL", () => {
      const sm = createPyodideServiceManager();
      expect(sm.serverSettings.baseUrl).toBe("http://pyodide-local");
    });

    it("uses pyodide-local WebSocket URL", () => {
      const sm = createPyodideServiceManager();
      expect(sm.serverSettings.wsUrl).toBe("ws://pyodide-local");
    });

    it("has empty token", () => {
      const sm = createPyodideServiceManager();
      expect(sm.serverSettings.token).toBe("");
    });
  });

  describe("kernels", () => {
    it("has kernels property", () => {
      const sm = createPyodideServiceManager();
      expect(sm.kernels).toBeDefined();
    });
  });

  describe("sessions", () => {
    it("has sessions property", () => {
      const sm = createPyodideServiceManager();
      expect(sm.sessions).toBeDefined();
    });
  });

  describe("kernelspecs", () => {
    it("has a pyodide kernelspec", () => {
      const sm = createPyodideServiceManager();
      const kernelspecs = sm.kernelspecs as Record<string, unknown>;
      const specs = kernelspecs.specs as Record<string, unknown>;
      expect(specs.default).toBe("pyodide");
      const ks = specs.kernelspecs as Record<string, Record<string, unknown>>;
      expect(ks.pyodide).toBeDefined();
      expect(ks.pyodide.name).toBe("pyodide");
      expect(ks.pyodide.language).toBe("python");
    });
  });

  describe("contents", () => {
    it("has normalize function", () => {
      const sm = createPyodideServiceManager();
      const contents = sm.contents as Record<string, unknown>;
      expect(typeof contents.normalize).toBe("function");
      expect((contents.normalize as (p: string) => string)("test/path")).toBe(
        "test/path",
      );
    });
  });

  describe("user", () => {
    it("has user manager with userChanged signal", () => {
      const sm = createPyodideServiceManager();
      const user = sm.user as Record<string, unknown>;
      expect(user).toBeDefined();
      expect(user.userChanged).toBeDefined();
    });
  });

  describe("__NAME__ marker", () => {
    it("is marked as DirectPyodideServiceManager", () => {
      const sm = createPyodideServiceManager();
      expect((sm as Record<string, unknown>)["__NAME__"]).toBe(
        "DirectPyodideServiceManager",
      );
    });
  });

  describe("dispose()", () => {
    it("can be called without error", () => {
      const sm = createPyodideServiceManager();
      expect(() => sm.dispose()).not.toThrow();
    });
  });
});
