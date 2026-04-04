/// <reference types="vitest/globals" />

/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

vi.mock("@jupyterlab/services", () => ({
  ServerConnection: {
    makeSettings: vi.fn((opts: Record<string, unknown>) => opts),
  },
  ServiceManager: vi.fn(),
}));

vi.mock("@jupyterlab/services/lib/kernel/serialize", () => ({
  serialize: vi.fn(),
  deserialize: vi.fn(),
}));

vi.mock("@lumino/coreutils", () => ({
  UUID: {
    uuid4: vi.fn(() => "test-uuid-1234"),
  },
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

vi.mock("../services/localKernelConnection", () => ({
  LocalKernelConnection: vi.fn(),
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

import { createLocalKernelServiceManager } from "../services/localKernelServiceManager";

describe("createLocalKernelServiceManager", () => {
  it("returns a service manager object", () => {
    const sm = createLocalKernelServiceManager(
      "kernel-1",
      "python3",
      "http://localhost:8888",
    );
    expect(sm).toBeDefined();
  });

  it("is ready immediately", async () => {
    const sm = createLocalKernelServiceManager(
      "kernel-1",
      "python3",
      "http://localhost:8888",
    );
    expect(sm.isReady).toBe(true);
    await expect(sm.ready).resolves.toBeUndefined();
  });

  it("is not disposed initially", () => {
    const sm = createLocalKernelServiceManager(
      "kernel-1",
      "python3",
      "http://localhost:8888",
    );
    expect(sm.isDisposed).toBe(false);
  });

  describe("serverSettings", () => {
    it("uses the provided URL as baseUrl", () => {
      const sm = createLocalKernelServiceManager(
        "kernel-1",
        "python3",
        "http://localhost:8888",
      );
      expect(sm.serverSettings.baseUrl).toBe("http://localhost:8888");
    });

    it("derives wsUrl from the base URL", () => {
      const sm = createLocalKernelServiceManager(
        "kernel-1",
        "python3",
        "http://localhost:8888",
      );
      expect(sm.serverSettings.wsUrl).toBe("ws://localhost:8888");
    });

    it("has an empty token", () => {
      const sm = createLocalKernelServiceManager(
        "kernel-1",
        "python3",
        "http://localhost:8888",
      );
      expect(sm.serverSettings.token).toBe("");
    });
  });

  describe("contents manager", () => {
    it("has normalize function that returns the path unchanged", () => {
      const sm = createLocalKernelServiceManager(
        "kernel-1",
        "python3",
        "http://localhost:8888",
      );
      const contents = sm.contents as Record<string, unknown>;
      expect((contents.normalize as (p: string) => string)("test/path")).toBe(
        "test/path",
      );
    });

    it("has localPath function that returns path unchanged", () => {
      const sm = createLocalKernelServiceManager(
        "kernel-1",
        "python3",
        "http://localhost:8888",
      );
      const contents = sm.contents as Record<string, unknown>;
      expect((contents.localPath as (p: string) => string)("test/path")).toBe(
        "test/path",
      );
    });

    it("has driveName function that returns empty string", () => {
      const sm = createLocalKernelServiceManager(
        "kernel-1",
        "python3",
        "http://localhost:8888",
      );
      const contents = sm.contents as Record<string, unknown>;
      expect((contents.driveName as (p: string) => string)("test/path")).toBe(
        "",
      );
    });
  });

  describe("kernels and sessions", () => {
    it("has kernels property", () => {
      const sm = createLocalKernelServiceManager(
        "kernel-1",
        "python3",
        "http://localhost:8888",
      );
      expect(sm.kernels).toBeDefined();
    });

    it("has sessions property", () => {
      const sm = createLocalKernelServiceManager(
        "kernel-1",
        "python3",
        "http://localhost:8888",
      );
      expect(sm.sessions).toBeDefined();
    });
  });

  describe("dispose()", () => {
    it("can be called without error", () => {
      const sm = createLocalKernelServiceManager(
        "kernel-1",
        "python3",
        "http://localhost:8888",
      );
      expect(() => sm.dispose()).not.toThrow();
    });
  });
});
