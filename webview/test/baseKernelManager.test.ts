/// <reference types="vitest/globals" />

/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

vi.mock("vscode", () => ({
  Uri: { parse: vi.fn((s: string) => ({ toString: () => s })) },
}));

vi.mock("@jupyterlab/services", () => ({
  Kernel: {},
  ServerConnection: {
    makeSettings: vi.fn(() => ({
      baseUrl: "http://localhost:8888/",
      wsUrl: "ws://localhost:8888/",
      token: "",
    })),
  },
}));

vi.mock("@lumino/signaling", () => {
  class Signal {
    private _listeners: Array<(sender: unknown, args: unknown) => void> = [];
    constructor(public sender: unknown) {}
    connect(fn: (sender: unknown, args: unknown) => void): boolean {
      this._listeners.push(fn);
      return true;
    }
    disconnect(fn: (sender: unknown, args: unknown) => void): boolean {
      this._listeners = this._listeners.filter((l) => l !== fn);
      return true;
    }
    emit(args: unknown): void {
      this._listeners.forEach((fn) => fn(this.sender, args));
    }
    static clearData(_owner: unknown): void {}
  }
  return { Signal, ISignal: {} };
});

import type { Kernel } from "@jupyterlab/services";
import { ServerConnection } from "@jupyterlab/services";

import {
  BaseKernelManager,
  type KernelManagerType,
} from "../services/base/baseKernelManager";

class TestKernelManager extends BaseKernelManager {
  readonly managerType: KernelManagerType = "mock";

  async startNew(): Promise<Kernel.IKernelConnection> {
    const mockKernel = {
      id: "test-kernel-1",
      name: "test",
      model: { id: "test-kernel-1", name: "test" },
      shutdown: vi.fn().mockResolvedValue(undefined),
    } as unknown as Kernel.IKernelConnection;
    this._activeKernel = mockKernel;
    return mockKernel;
  }
}

describe("BaseKernelManager", () => {
  let manager: TestKernelManager;
  let settings: ServerConnection.ISettings;

  beforeEach(() => {
    settings = ServerConnection.makeSettings();
    manager = new TestKernelManager(settings);
  });

  describe("initial state", () => {
    it("is ready by default", () => {
      expect(manager.isReady).toBe(true);
    });

    it("resolves ready promise immediately", async () => {
      await expect(manager.ready).resolves.toBeUndefined();
    });

    it("is not disposed initially", () => {
      expect(manager.isDisposed).toBe(false);
    });

    it("is active initially", () => {
      expect(manager.isActive).toBe(true);
    });

    it("has zero running count initially", () => {
      expect(manager.runningCount).toBe(0);
    });

    it("has correct manager type", () => {
      expect(manager.managerType).toBe("mock");
    });
  });

  describe("running", () => {
    it("yields nothing when no active kernel", () => {
      const kernels = [...manager.running()];
      expect(kernels).toEqual([]);
    });

    it("yields active kernel model after startNew", async () => {
      await manager.startNew();
      const kernels = [...manager.running()];
      expect(kernels).toHaveLength(1);
      expect(kernels[0].id).toBe("test-kernel-1");
    });
  });

  describe("runningCount", () => {
    it("returns 1 when there is an active kernel", async () => {
      await manager.startNew();
      expect(manager.runningCount).toBe(1);
    });
  });

  describe("requestRunning", () => {
    it("returns empty array when no active kernel", async () => {
      const result = await manager.requestRunning();
      expect(result).toEqual([]);
    });

    it("returns active kernel model", async () => {
      await manager.startNew();
      const result = await manager.requestRunning();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("test-kernel-1");
    });
  });

  describe("refreshRunning", () => {
    it("resolves without error (no-op)", async () => {
      await expect(manager.refreshRunning()).resolves.toBeUndefined();
    });
  });

  describe("findById", () => {
    it("returns undefined when no active kernel", async () => {
      const result = await manager.findById("test-kernel-1");
      expect(result).toBeUndefined();
    });

    it("returns kernel model when ID matches", async () => {
      await manager.startNew();
      const result = await manager.findById("test-kernel-1");
      expect(result).toBeDefined();
      expect(result!.id).toBe("test-kernel-1");
    });

    it("returns undefined when ID does not match", async () => {
      await manager.startNew();
      const result = await manager.findById("other-id");
      expect(result).toBeUndefined();
    });
  });

  describe("shutdown", () => {
    it("shuts down active kernel with matching ID", async () => {
      const kernel = await manager.startNew();
      await manager.shutdown("test-kernel-1");
      expect(
        (kernel as unknown as { shutdown: ReturnType<typeof vi.fn> }).shutdown,
      ).toHaveBeenCalled();
      expect(manager.runningCount).toBe(0);
    });

    it("does nothing for non-matching ID", async () => {
      await manager.startNew();
      await manager.shutdown("other-id");
      expect(manager.runningCount).toBe(1);
    });
  });

  describe("shutdownAll", () => {
    it("shuts down all kernels", async () => {
      const kernel = await manager.startNew();
      await manager.shutdownAll();
      expect(
        (kernel as unknown as { shutdown: ReturnType<typeof vi.fn> }).shutdown,
      ).toHaveBeenCalled();
      expect(manager.runningCount).toBe(0);
    });

    it("does nothing when no active kernel", async () => {
      await expect(manager.shutdownAll()).resolves.toBeUndefined();
    });
  });

  describe("connectTo", () => {
    it("returns active kernel when one exists", async () => {
      const kernel = await manager.startNew();
      const connected = manager.connectTo(
        {} as Kernel.IKernelConnection.IOptions,
      );
      expect(connected).toBe(kernel);
    });

    it("throws when no active kernel", () => {
      expect(() =>
        manager.connectTo({} as Kernel.IKernelConnection.IOptions),
      ).toThrow("connectTo called without active kernel");
    });
  });

  describe("dispose", () => {
    it("marks manager as disposed", () => {
      manager.dispose();
      expect(manager.isDisposed).toBe(true);
    });

    it("is not active after disposal", () => {
      manager.dispose();
      expect(manager.isActive).toBe(false);
    });

    it("is idempotent", () => {
      manager.dispose();
      manager.dispose();
      expect(manager.isDisposed).toBe(true);
    });

    it("shuts down active kernel on disposal", async () => {
      const kernel = await manager.startNew();
      manager.dispose();
      expect(
        (kernel as unknown as { shutdown: ReturnType<typeof vi.fn> }).shutdown,
      ).toHaveBeenCalled();
    });
  });

  describe("validateKernelId", () => {
    it("throws when no active kernel", () => {
      expect(() => {
        // @ts-ignore - accessing protected method
        manager.validateKernelId("test");
      }).toThrow("No active kernel found");
    });

    it("throws when ID does not match", async () => {
      await manager.startNew();
      expect(() => {
        // @ts-ignore - accessing protected method
        manager.validateKernelId("wrong-id");
      }).toThrow("Kernel wrong-id not found");
    });

    it("does not throw when ID matches", async () => {
      await manager.startNew();
      expect(() => {
        // @ts-ignore - accessing protected method
        manager.validateKernelId("test-kernel-1");
      }).not.toThrow();
    });
  });
});
