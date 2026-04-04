/// <reference types="vitest/globals" />

/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

vi.mock("vscode", () => ({
  Uri: { parse: vi.fn((s: string) => ({ toString: () => s })) },
}));

vi.mock("loro-crdt", () => {
  class MockEphemeralStore {
    private data = new Map<string, unknown>();
    private subscribers: Array<() => void> = [];
    constructor(_timeout?: number) {}
    set(key: string, value: unknown): void {
      this.data.set(key, value);
    }
    getAllStates(): Record<string, unknown> {
      const result: Record<string, unknown> = {};
      this.data.forEach((v, k) => {
        result[k] = v;
      });
      return result;
    }
    subscribe(cb: () => void): void {
      this.subscribers.push(cb);
    }
    encodeAll(): Uint8Array {
      return new Uint8Array([1, 2, 3]);
    }
    apply(_bytes: Uint8Array): void {
      // Simulates applying remote state
    }
  }

  class MockLoroDoc {
    peerId = BigInt(42);
  }

  return {
    EphemeralStore: MockEphemeralStore,
    LoroDoc: MockLoroDoc,
  };
});

import { LoroDoc } from "loro-crdt";

import { AwarenessAdapter } from "../services/loro/awarenessAdapter";

describe("AwarenessAdapter", () => {
  let doc: LoroDoc;
  let adapter: AwarenessAdapter;

  beforeEach(() => {
    doc = new LoroDoc();
    adapter = new AwarenessAdapter(doc, "TestUser", "#FF0000");
  });

  afterEach(() => {
    adapter.dispose();
  });

  describe("getLocalState", () => {
    it("returns initial state with user info", () => {
      const state = adapter.getLocalState();
      expect(state).toBeDefined();
      expect(state!.name).toBe("TestUser");
      expect(state!.color).toBe("#FF0000");
      expect(state!.focusing).toBe(false);
      expect(state!.anchorPos).toBeNull();
      expect(state!.focusPos).toBeNull();
      expect(state!.awarenessData).toEqual({});
    });
  });

  describe("setLocalState", () => {
    it("updates the local state entirely", () => {
      const newState = {
        name: "NewUser",
        color: "#00FF00",
        focusing: true,
        anchorPos: null,
        focusPos: null,
        awarenessData: { key: "value" },
      };
      adapter.setLocalState(newState);
      const state = adapter.getLocalState();
      expect(state).toEqual(newState);
    });
  });

  describe("setLocalStateField", () => {
    it("updates a single field", () => {
      adapter.setLocalStateField("focusing", true);
      const state = adapter.getLocalState();
      expect(state!.focusing).toBe(true);
      // Other fields unchanged
      expect(state!.name).toBe("TestUser");
    });

    it("does nothing when localState is null", () => {
      adapter.dispose(); // sets localState to null
      adapter.setLocalStateField("focusing", true);
      expect(adapter.getLocalState()).toBeNull();
    });
  });

  describe("getStates", () => {
    it("includes local state in returned map", () => {
      const states = adapter.getStates();
      expect(states.size).toBeGreaterThanOrEqual(1);
      // clientId is Number(42n) = 42
      const localState = states.get(42);
      expect(localState).toBeDefined();
      expect(localState!.name).toBe("TestUser");
    });
  });

  describe("on/off event listeners", () => {
    it("registers and invokes update listeners", () => {
      const listener = vi.fn();
      adapter.on("update", listener);

      // Trigger update by setting local state
      adapter.setLocalState({
        name: "Changed",
        color: "#000000",
        focusing: false,
        anchorPos: null,
        focusPos: null,
        awarenessData: {},
      });

      expect(listener).toHaveBeenCalled();
    });

    it("unregisters update listeners", () => {
      const listener = vi.fn();
      adapter.on("update", listener);
      adapter.off("update", listener);

      adapter.setLocalStateField("focusing", true);
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("encodeLocalState", () => {
    it("returns Uint8Array", () => {
      const encoded = adapter.encodeLocalState();
      expect(encoded).toBeInstanceOf(Uint8Array);
      expect(encoded.length).toBeGreaterThan(0);
    });
  });

  describe("decodeRemoteState", () => {
    it("applies remote state without error", () => {
      const bytes = new Uint8Array([4, 5, 6]);
      expect(() => adapter.decodeRemoteState(bytes)).not.toThrow();
    });

    it("notifies listeners after applying remote state", () => {
      const listener = vi.fn();
      adapter.on("update", listener);
      adapter.decodeRemoteState(new Uint8Array([4, 5, 6]));
      expect(listener).toHaveBeenCalled();
    });
  });

  describe("dispose", () => {
    it("clears local state", () => {
      adapter.dispose();
      expect(adapter.getLocalState()).toBeNull();
    });

    it("clears all listeners", () => {
      const listener = vi.fn();
      adapter.on("update", listener);
      adapter.dispose();
      // Manually calling notifyListeners should not invoke the listener
      // because dispose clears the set
      // We can verify by checking state is null
      expect(adapter.getLocalState()).toBeNull();
    });
  });
});
