/// <reference types="vitest/globals" />

/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

vi.mock("@jupyterlab/services/lib/kernel/serialize", () => ({
  serialize: vi.fn(),
  deserialize: vi.fn(),
}));

import { createMockServiceManager } from "../services/mockServiceManager";

describe("createMockServiceManager", () => {
  it("returns a service manager object", () => {
    const sm = createMockServiceManager();
    expect(sm).toBeDefined();
  });

  it("has __isMockServiceManager flag set to true", () => {
    const sm = createMockServiceManager();
    expect((sm as Record<string, unknown>).__isMockServiceManager).toBe(true);
  });

  it("is ready immediately", async () => {
    const sm = createMockServiceManager();
    expect(sm.isReady).toBe(true);
    await expect(sm.ready).resolves.toBeUndefined();
  });

  it("is not disposed initially", () => {
    const sm = createMockServiceManager();
    expect(sm.isDisposed).toBe(false);
  });

  describe("kernelspecs", () => {
    it("has a default python3 kernelspec", () => {
      const sm = createMockServiceManager();
      const specs = (sm.kernelspecs as Record<string, unknown>).specs as Record<
        string,
        unknown
      >;
      expect(specs.default).toBe("python3");
      const kernelspecs = specs.kernelspecs as Record<
        string,
        Record<string, unknown>
      >;
      expect(kernelspecs.python3).toBeDefined();
      expect(kernelspecs.python3.name).toBe("python3");
      expect(kernelspecs.python3.language).toBe("python");
    });
  });

  describe("kernels (MockKernelManager)", () => {
    it("rejects startNew with an appropriate error", async () => {
      const sm = createMockServiceManager();
      await expect(sm.kernels.startNew()).rejects.toThrow(
        "you must select a kernel",
      );
    });

    it("throws on connectTo", () => {
      const sm = createMockServiceManager();
      expect(() => sm.kernels.connectTo({} as never)).toThrow(
        "you must select a kernel",
      );
    });
  });

  describe("sessions (MockSessionManager)", () => {
    it("rejects startNew with an appropriate error", async () => {
      const sm = createMockServiceManager();
      await expect(sm.sessions.startNew({} as never)).rejects.toThrow(
        "you must select a kernel",
      );
    });
  });

  describe("contents", () => {
    it("has normalize and localPath functions", () => {
      const sm = createMockServiceManager();
      const contents = sm.contents as Record<string, unknown>;
      expect(typeof contents.normalize).toBe("function");
      expect(typeof contents.localPath).toBe("function");
      expect((contents.normalize as (p: string) => string)("test/path")).toBe(
        "test/path",
      );
    });

    it("rejects get with error", async () => {
      const sm = createMockServiceManager();
      await expect(sm.contents.get("any")).rejects.toThrow(
        "Contents not available",
      );
    });
  });

  describe("terminals", () => {
    it("reports as unavailable", () => {
      const sm = createMockServiceManager();
      const terminals = sm.terminals as Record<string, unknown>;
      expect((terminals.isAvailable as () => boolean)()).toBe(false);
    });
  });

  describe("dispose()", () => {
    it("can be called without error", () => {
      const sm = createMockServiceManager();
      expect(() => sm.dispose()).not.toThrow();
    });
  });

  describe("serverSettings", () => {
    it("has empty base URL and token", () => {
      const sm = createMockServiceManager();
      expect(sm.serverSettings.baseUrl).toBe("");
      expect(sm.serverSettings.token).toBe("");
    });
  });
});
