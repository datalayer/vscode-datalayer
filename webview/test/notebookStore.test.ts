/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import {
  createNotebookStore,
  type RuntimeWithCredits,
} from "../stores/notebookStore";

describe("createNotebookStore", () => {
  it("creates isolated store instances", () => {
    const storeA = createNotebookStore();
    const storeB = createNotebookStore();
    expect(storeA).not.toBe(storeB);
  });

  describe("initial state", () => {
    it("has correct default values", () => {
      const store = createNotebookStore();
      const state = store.getState();

      expect(state.nbformat).toBeUndefined();
      expect(state.isDatalayerNotebook).toBe(false);
      expect(state.documentId).toBeUndefined();
      expect(state.documentUri).toBe("");
      expect(state.serverUrl).toBeUndefined();
      expect(state.token).toBeUndefined();
      expect(state.notebookId).toBe("local-notebook");
      expect(state.isInitialized).toBe(false);
      expect(state.selectedRuntime).toBeUndefined();
      expect(state.theme).toBe("light");
    });
  });

  describe("setter actions", () => {
    it("setNbformat updates nbformat", () => {
      const store = createNotebookStore();
      const format = { major: 4, minor: 5 };
      store.getState().setNbformat(format);
      expect(store.getState().nbformat).toEqual(format);
    });

    it("setIsDatalayerNotebook updates isDatalayerNotebook", () => {
      const store = createNotebookStore();
      store.getState().setIsDatalayerNotebook(true);
      expect(store.getState().isDatalayerNotebook).toBe(true);
    });

    it("setDocumentId updates documentId", () => {
      const store = createNotebookStore();
      store.getState().setDocumentId("doc-123");
      expect(store.getState().documentId).toBe("doc-123");
    });

    it("setDocumentUri updates documentUri", () => {
      const store = createNotebookStore();
      store.getState().setDocumentUri("file:///test.ipynb");
      expect(store.getState().documentUri).toBe("file:///test.ipynb");
    });

    it("setServerUrl updates serverUrl", () => {
      const store = createNotebookStore();
      store.getState().setServerUrl("https://example.com");
      expect(store.getState().serverUrl).toBe("https://example.com");
    });

    it("setToken updates token", () => {
      const store = createNotebookStore();
      store.getState().setToken("jwt-token-abc");
      expect(store.getState().token).toBe("jwt-token-abc");
    });

    it("setNotebookId updates notebookId", () => {
      const store = createNotebookStore();
      store.getState().setNotebookId("nb-456");
      expect(store.getState().notebookId).toBe("nb-456");
    });

    it("setIsInitialized updates isInitialized", () => {
      const store = createNotebookStore();
      store.getState().setIsInitialized(true);
      expect(store.getState().isInitialized).toBe(true);
    });

    it("setRuntime updates selectedRuntime", () => {
      const store = createNotebookStore();
      const runtime = {
        name: "test-runtime",
        ingress: "https://rt.example.com",
      } as RuntimeWithCredits;
      store.getState().setRuntime(runtime);
      expect(store.getState().selectedRuntime).toEqual(runtime);
    });

    it("setRuntime with undefined clears selectedRuntime", () => {
      const store = createNotebookStore();
      store.getState().setRuntime({ name: "rt" } as RuntimeWithCredits);
      store.getState().setRuntime(undefined);
      expect(store.getState().selectedRuntime).toBeUndefined();
    });

    it("setTheme updates theme", () => {
      const store = createNotebookStore();
      store.getState().setTheme("dark");
      expect(store.getState().theme).toBe("dark");
    });
  });

  describe("reset", () => {
    it("reverts all state to initial values", () => {
      const store = createNotebookStore();
      const state = store.getState();

      state.setNbformat({ major: 4 });
      state.setIsDatalayerNotebook(true);
      state.setDocumentId("doc-1");
      state.setDocumentUri("file:///changed.ipynb");
      state.setServerUrl("https://changed.com");
      state.setToken("changed-token");
      state.setNotebookId("changed-nb");
      state.setIsInitialized(true);
      state.setRuntime({ name: "rt" } as RuntimeWithCredits);
      state.setTheme("dark");

      store.getState().reset();

      const resetState = store.getState();
      expect(resetState.nbformat).toBeUndefined();
      expect(resetState.isDatalayerNotebook).toBe(false);
      expect(resetState.documentId).toBeUndefined();
      expect(resetState.documentUri).toBe("");
      expect(resetState.serverUrl).toBeUndefined();
      expect(resetState.token).toBeUndefined();
      expect(resetState.notebookId).toBe("local-notebook");
      expect(resetState.isInitialized).toBe(false);
      expect(resetState.selectedRuntime).toBeUndefined();
      expect(resetState.theme).toBe("light");
    });
  });

  describe("store isolation", () => {
    it("multiple stores do not share state", () => {
      const storeA = createNotebookStore();
      const storeB = createNotebookStore();

      storeA.getState().setTheme("dark");
      storeA.getState().setNotebookId("nb-A");

      expect(storeB.getState().theme).toBe("light");
      expect(storeB.getState().notebookId).toBe("local-notebook");
    });
  });
});
