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
  Session: {},
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

import type { Session } from "@jupyterlab/services";
import { ServerConnection } from "@jupyterlab/services";

import {
  BaseSessionManager,
  type SessionManagerType,
} from "../services/base/baseSessionManager";

class TestSessionManager extends BaseSessionManager {
  readonly managerType: SessionManagerType = "mock";

  async startNew(): Promise<Session.ISessionConnection> {
    const mockSession = {
      id: "test-session-1",
      path: "/notebooks/test.ipynb",
      name: "test",
      model: {
        id: "test-session-1",
        path: "/notebooks/test.ipynb",
        name: "test",
        type: "notebook",
        kernel: { id: "k1", name: "python3" },
      },
      shutdown: vi.fn().mockResolvedValue(undefined),
    } as unknown as Session.ISessionConnection;
    this._activeSession = mockSession;
    return mockSession;
  }
}

describe("BaseSessionManager", () => {
  let manager: TestSessionManager;

  beforeEach(() => {
    const settings = ServerConnection.makeSettings();
    manager = new TestSessionManager(settings);
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

    it("has correct manager type", () => {
      expect(manager.managerType).toBe("mock");
    });
  });

  describe("running", () => {
    it("yields nothing when no active session", () => {
      const sessions = [...manager.running()];
      expect(sessions).toEqual([]);
    });

    it("yields active session model after startNew", async () => {
      await manager.startNew({} as Session.ISessionOptions);
      const sessions = [...manager.running()];
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe("test-session-1");
    });
  });

  describe("requestRunning", () => {
    it("returns empty array when no active session", async () => {
      const result = await manager.requestRunning();
      expect(result).toEqual([]);
    });

    it("returns active session model", async () => {
      await manager.startNew({} as Session.ISessionOptions);
      const result = await manager.requestRunning();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("test-session-1");
    });
  });

  describe("refreshRunning", () => {
    it("resolves without error (no-op)", async () => {
      await expect(manager.refreshRunning()).resolves.toBeUndefined();
    });
  });

  describe("findById", () => {
    it("returns undefined when no active session", async () => {
      const result = await manager.findById("test-session-1");
      expect(result).toBeUndefined();
    });

    it("returns session model when ID matches", async () => {
      await manager.startNew({} as Session.ISessionOptions);
      const result = await manager.findById("test-session-1");
      expect(result).toBeDefined();
      expect(result!.id).toBe("test-session-1");
    });

    it("returns undefined when ID does not match", async () => {
      await manager.startNew({} as Session.ISessionOptions);
      const result = await manager.findById("other-id");
      expect(result).toBeUndefined();
    });
  });

  describe("findByPath", () => {
    it("returns undefined when no active session", async () => {
      const result = await manager.findByPath("/notebooks/test.ipynb");
      expect(result).toBeUndefined();
    });

    it("returns session model when path matches", async () => {
      await manager.startNew({} as Session.ISessionOptions);
      const result = await manager.findByPath("/notebooks/test.ipynb");
      expect(result).toBeDefined();
      expect(result!.path).toBe("/notebooks/test.ipynb");
    });

    it("returns undefined when path does not match", async () => {
      await manager.startNew({} as Session.ISessionOptions);
      const result = await manager.findByPath("/other/path.ipynb");
      expect(result).toBeUndefined();
    });
  });

  describe("getModel", () => {
    it("returns undefined when no active session", () => {
      const result = manager.getModel("test-session-1");
      expect(result).toBeUndefined();
    });

    it("returns session model when ID matches", async () => {
      await manager.startNew({} as Session.ISessionOptions);
      const result = manager.getModel("test-session-1");
      expect(result).toBeDefined();
      expect(result!.id).toBe("test-session-1");
    });

    it("returns undefined when ID does not match", async () => {
      await manager.startNew({} as Session.ISessionOptions);
      const result = manager.getModel("wrong-id");
      expect(result).toBeUndefined();
    });
  });

  describe("shutdown", () => {
    it("shuts down active session with matching ID", async () => {
      const session = await manager.startNew({} as Session.ISessionOptions);
      await manager.shutdown("test-session-1");
      expect(
        (session as unknown as { shutdown: ReturnType<typeof vi.fn> }).shutdown,
      ).toHaveBeenCalled();
      const sessions = [...manager.running()];
      expect(sessions).toHaveLength(0);
    });

    it("does nothing for non-matching ID", async () => {
      await manager.startNew({} as Session.ISessionOptions);
      await manager.shutdown("other-id");
      const sessions = [...manager.running()];
      expect(sessions).toHaveLength(1);
    });
  });

  describe("shutdownAll", () => {
    it("shuts down all sessions", async () => {
      const session = await manager.startNew({} as Session.ISessionOptions);
      await manager.shutdownAll();
      expect(
        (session as unknown as { shutdown: ReturnType<typeof vi.fn> }).shutdown,
      ).toHaveBeenCalled();
      const sessions = [...manager.running()];
      expect(sessions).toHaveLength(0);
    });

    it("does nothing when no active session", async () => {
      await expect(manager.shutdownAll()).resolves.toBeUndefined();
    });
  });

  describe("stopIfNeeded", () => {
    it("stops session with matching path", async () => {
      const session = await manager.startNew({} as Session.ISessionOptions);
      await manager.stopIfNeeded("/notebooks/test.ipynb");
      expect(
        (session as unknown as { shutdown: ReturnType<typeof vi.fn> }).shutdown,
      ).toHaveBeenCalled();
    });

    it("does nothing for non-matching path", async () => {
      await manager.startNew({} as Session.ISessionOptions);
      await manager.stopIfNeeded("/other/path.ipynb");
      const sessions = [...manager.running()];
      expect(sessions).toHaveLength(1);
    });
  });

  describe("connectTo", () => {
    it("returns active session when one exists", async () => {
      const session = await manager.startNew({} as Session.ISessionOptions);
      const connected = manager.connectTo(
        {} as Session.ISessionConnection.IOptions,
      );
      expect(connected).toBe(session);
    });

    it("throws when no active session", () => {
      expect(() =>
        manager.connectTo({} as Session.ISessionConnection.IOptions),
      ).toThrow("connectTo called without active session");
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

    it("shuts down active session on disposal", async () => {
      const session = await manager.startNew({} as Session.ISessionOptions);
      manager.dispose();
      expect(
        (session as unknown as { shutdown: ReturnType<typeof vi.fn> }).shutdown,
      ).toHaveBeenCalled();
    });
  });

  describe("validateSessionId", () => {
    it("throws when no active session", () => {
      expect(() => {
        // @ts-ignore - accessing protected method
        manager.validateSessionId("test");
      }).toThrow("No active session found");
    });

    it("throws when ID does not match", async () => {
      await manager.startNew({} as Session.ISessionOptions);
      expect(() => {
        // @ts-ignore - accessing protected method
        manager.validateSessionId("wrong-id");
      }).toThrow("Session wrong-id not found");
    });

    it("does not throw when ID matches", async () => {
      await manager.startNew({} as Session.ISessionOptions);
      expect(() => {
        // @ts-ignore - accessing protected method
        manager.validateSessionId("test-session-1");
      }).not.toThrow();
    });
  });
});
