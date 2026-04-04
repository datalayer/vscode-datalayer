/// <reference types="vitest/globals" />

/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

vi.mock("@jupyterlab/services", () => {
  const mockServiceManager = {
    ready: Promise.resolve(),
    isReady: true,
    serverSettings: {},
    kernels: {},
    sessions: {},
    dispose: vi.fn(),
  };
  return {
    ServiceManager: vi.fn(() => mockServiceManager),
    ServerConnection: {
      makeSettings: vi.fn(() => ({})),
    },
  };
});

vi.mock("../services/mockServiceManager", () => ({
  createMockServiceManager: vi.fn(() => ({
    __isMockServiceManager: true,
    ready: Promise.resolve(),
    isReady: true,
    dispose: vi.fn(),
  })),
}));

vi.mock("../services/localKernelServiceManager", () => ({
  createLocalKernelServiceManager: vi.fn(
    (kernelId: string, kernelName: string, url: string) => ({
      __isLocalServiceManager: true,
      kernelId,
      kernelName,
      url,
      ready: Promise.resolve(),
      isReady: true,
      dispose: vi.fn(),
    }),
  ),
}));

vi.mock("../services/pyodideServiceManager", () => ({
  createPyodideServiceManager: vi.fn((pyodideUrl?: string) => ({
    __isPyodideServiceManager: true,
    pyodideUrl,
    ready: Promise.resolve(),
    isReady: true,
    dispose: vi.fn(),
  })),
}));

import { ServiceManagerFactory } from "../services/serviceManagerFactory";

describe("ServiceManagerFactory", () => {
  describe("create()", () => {
    it("creates a mock service manager", () => {
      const manager = ServiceManagerFactory.create({ type: "mock" });
      expect(manager).toBeDefined();
      expect((manager as Record<string, unknown>).__isMockServiceManager).toBe(
        true,
      );
    });

    it("creates a local service manager with correct params", () => {
      const manager = ServiceManagerFactory.create({
        type: "local",
        kernelId: "kernel-1",
        kernelName: "python3",
        url: "http://localhost:8888",
      });
      expect(manager).toBeDefined();
      const m = manager as Record<string, unknown>;
      expect(m.__isLocalServiceManager).toBe(true);
      expect(m.kernelId).toBe("kernel-1");
      expect(m.kernelName).toBe("python3");
      expect(m.url).toBe("http://localhost:8888");
    });

    // Remote service manager requires real @jupyterlab/services ServiceManager constructor
    // which can't run in jsdom. Tested via extension integration tests instead.

    it("creates a pyodide service manager", () => {
      const manager = ServiceManagerFactory.create({ type: "pyodide" });
      expect(manager).toBeDefined();
      expect(
        (manager as Record<string, unknown>).__isPyodideServiceManager,
      ).toBe(true);
    });

    it("passes pyodideUrl when provided", () => {
      const manager = ServiceManagerFactory.create({
        type: "pyodide",
        pyodideUrl: "https://cdn.example.com/pyodide",
      });
      expect((manager as Record<string, unknown>).pyodideUrl).toBe(
        "https://cdn.example.com/pyodide",
      );
    });
  });

  describe("isMock()", () => {
    it("returns true for a mock service manager", () => {
      const manager = ServiceManagerFactory.create({ type: "mock" });
      expect(ServiceManagerFactory.isMock(manager)).toBe(true);
    });

    it("returns false for a non-mock service manager", () => {
      const manager = ServiceManagerFactory.create({
        type: "local",
        kernelId: "k1",
        kernelName: "python3",
        url: "http://localhost",
      });
      expect(ServiceManagerFactory.isMock(manager)).toBe(false);
    });

    it("returns false for a plain object without the marker", () => {
      const plain = { ready: Promise.resolve() } as never;
      expect(ServiceManagerFactory.isMock(plain)).toBe(false);
    });
  });

  describe("getType()", () => {
    it("returns 'mock' for a mock service manager", () => {
      const manager = ServiceManagerFactory.create({ type: "mock" });
      expect(ServiceManagerFactory.getType(manager)).toBe("mock");
    });

    it("returns 'unknown' for non-mock service managers", () => {
      const manager = ServiceManagerFactory.create({
        type: "local",
        kernelId: "k1",
        kernelName: "python3",
        url: "http://localhost",
      });
      expect(ServiceManagerFactory.getType(manager)).toBe("unknown");
    });

    it("returns 'unknown' for a plain object", () => {
      const plain = { ready: Promise.resolve() } as never;
      expect(ServiceManagerFactory.getType(plain)).toBe("unknown");
    });
  });
});
