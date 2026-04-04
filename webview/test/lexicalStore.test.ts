/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/// <reference types="vitest/globals" />

vi.mock("@datalayer/jupyter-lexical", () => ({}));

import {
  type CollaborationConfig,
  createLexicalStore,
} from "../stores/lexicalStore";

describe("createLexicalStore", () => {
  it("creates isolated store instances", () => {
    const storeA = createLexicalStore();
    const storeB = createLexicalStore();
    expect(storeA).not.toBe(storeB);
  });

  describe("initial state", () => {
    it("has correct default values", () => {
      const store = createLexicalStore();
      const state = store.getState();

      expect(state.content).toBe("");
      expect(state.isEditable).toBe(true);
      expect(state.isReady).toBe(false);
      expect(state.isInitialLoad).toBe(true);
      expect(state.documentUri).toBe("");
      expect(state.navigationTarget).toBeNull();
      expect(state.lexicalId).toBeNull();
      expect(state.theme).toBe("dark");
      expect(state.collaborationConfig).toEqual({ enabled: false });
      expect(state.userInfo).toBeNull();
      expect(state.completionConfig).toBeNull();
    });
  });

  describe("setter actions", () => {
    it("setContent updates content", () => {
      const store = createLexicalStore();
      store.getState().setContent("Hello world");
      expect(store.getState().content).toBe("Hello world");
    });

    it("setIsEditable updates isEditable", () => {
      const store = createLexicalStore();
      store.getState().setIsEditable(false);
      expect(store.getState().isEditable).toBe(false);
    });

    it("setIsReady updates isReady", () => {
      const store = createLexicalStore();
      store.getState().setIsReady(true);
      expect(store.getState().isReady).toBe(true);
    });

    it("setIsInitialLoad updates isInitialLoad", () => {
      const store = createLexicalStore();
      store.getState().setIsInitialLoad(false);
      expect(store.getState().isInitialLoad).toBe(false);
    });

    it("setDocumentUri updates documentUri", () => {
      const store = createLexicalStore();
      store.getState().setDocumentUri("file:///test.lexical");
      expect(store.getState().documentUri).toBe("file:///test.lexical");
    });

    it("setNavigationTarget updates navigationTarget", () => {
      const store = createLexicalStore();
      store.getState().setNavigationTarget("heading-1");
      expect(store.getState().navigationTarget).toBe("heading-1");
    });

    it("setNavigationTarget with null clears target", () => {
      const store = createLexicalStore();
      store.getState().setNavigationTarget("heading-1");
      store.getState().setNavigationTarget(null);
      expect(store.getState().navigationTarget).toBeNull();
    });

    it("setLexicalId updates lexicalId", () => {
      const store = createLexicalStore();
      store.getState().setLexicalId("lex-123");
      expect(store.getState().lexicalId).toBe("lex-123");
    });

    it("setTheme updates theme", () => {
      const store = createLexicalStore();
      store.getState().setTheme("light");
      expect(store.getState().theme).toBe("light");
    });

    it("setCollaborationConfig updates collaborationConfig", () => {
      const store = createLexicalStore();
      const config: CollaborationConfig = {
        enabled: true,
        websocketUrl: "wss://collab.example.com",
        documentId: "doc-1",
        sessionId: "session-1",
        username: "testuser",
        userColor: "#ff0000",
      };
      store.getState().setCollaborationConfig(config);
      expect(store.getState().collaborationConfig).toEqual(config);
    });

    it("setUserInfo updates userInfo", () => {
      const store = createLexicalStore();
      const info = { username: "alice", userColor: "#00ff00" };
      store.getState().setUserInfo(info);
      expect(store.getState().userInfo).toEqual(info);
    });

    it("setUserInfo with null clears userInfo", () => {
      const store = createLexicalStore();
      store.getState().setUserInfo({ username: "a", userColor: "#000" });
      store.getState().setUserInfo(null);
      expect(store.getState().userInfo).toBeNull();
    });

    it("setCompletionConfig updates completionConfig", () => {
      const store = createLexicalStore();
      const config = { enabled: true } as unknown;
      store.getState().setCompletionConfig(config);
      expect(store.getState().completionConfig).toEqual(config);
    });

    it("setCompletionConfig with null clears config", () => {
      const store = createLexicalStore();
      store.getState().setCompletionConfig({ enabled: true } as unknown);
      store.getState().setCompletionConfig(null);
      expect(store.getState().completionConfig).toBeNull();
    });
  });

  describe("reset", () => {
    it("reverts all state to initial values", () => {
      const store = createLexicalStore();
      const state = store.getState();

      state.setContent("changed");
      state.setIsEditable(false);
      state.setIsReady(true);
      state.setIsInitialLoad(false);
      state.setDocumentUri("file:///changed.lexical");
      state.setNavigationTarget("heading-99");
      state.setLexicalId("lex-changed");
      state.setTheme("light");
      state.setCollaborationConfig({ enabled: true, username: "bob" });
      state.setUserInfo({ username: "bob", userColor: "#fff" });
      state.setCompletionConfig({ enabled: true } as unknown);

      store.getState().reset();

      const resetState = store.getState();
      expect(resetState.content).toBe("");
      expect(resetState.isEditable).toBe(true);
      expect(resetState.isReady).toBe(false);
      expect(resetState.isInitialLoad).toBe(true);
      expect(resetState.documentUri).toBe("");
      expect(resetState.navigationTarget).toBeNull();
      expect(resetState.lexicalId).toBeNull();
      expect(resetState.theme).toBe("dark");
      expect(resetState.collaborationConfig).toEqual({ enabled: false });
      expect(resetState.userInfo).toBeNull();
      expect(resetState.completionConfig).toBeNull();
    });
  });

  describe("store isolation", () => {
    it("multiple stores do not share state", () => {
      const storeA = createLexicalStore();
      const storeB = createLexicalStore();

      storeA.getState().setContent("store A content");
      storeA.getState().setTheme("light");

      expect(storeB.getState().content).toBe("");
      expect(storeB.getState().theme).toBe("dark");
    });
  });
});
