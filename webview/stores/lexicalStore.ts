/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * @module stores/lexicalStore
 * Centralized state management for lexical webview using Zustand.
 * Mirrors the pattern used by notebookStore for consistency.
 */

import { create } from "zustand";

/**
 * Collaboration configuration from extension
 */
export interface CollaborationConfig {
  enabled: boolean;
  websocketUrl?: string;
  documentId?: string;
  sessionId?: string;
  username?: string;
  userColor?: string;
}

/**
 * Lexical state interface
 */
export interface LexicalState {
  // Document state
  content: string;
  isEditable: boolean;
  isReady: boolean;
  isInitialLoad: boolean;

  // Theme state
  theme: "light" | "dark";

  // Collaboration state
  collaborationConfig: CollaborationConfig;

  // Actions
  setContent: (content: string) => void;
  setIsEditable: (editable: boolean) => void;
  setIsReady: (ready: boolean) => void;
  setIsInitialLoad: (isInitial: boolean) => void;
  setTheme: (theme: "light" | "dark") => void;
  setCollaborationConfig: (config: CollaborationConfig) => void;
  reset: () => void;
}

/**
 * Initial state
 */
const initialState = {
  content: "",
  isEditable: true,
  isReady: false,
  isInitialLoad: true,
  theme: "dark" as const,
  collaborationConfig: {
    enabled: false,
  },
};

/**
 * Creates a new isolated Lexical store instance.
 * Each webview should create its own store to prevent state sharing.
 *
 * IMPORTANT: This is a factory function, NOT a global singleton.
 * Calling this multiple times creates independent store instances.
 *
 * @returns A new Zustand store instance for Lexical state management
 */
export const createLexicalStore = () =>
  create<LexicalState>((set) => ({
    ...initialState,
    setContent: (content) => set({ content }),
    setTheme: (theme) => set({ theme }),
    setIsEditable: (editable) => set({ isEditable: editable }),
    setIsReady: (ready) => set({ isReady: ready }),
    setIsInitialLoad: (isInitial) => set({ isInitialLoad: isInitial }),
    setCollaborationConfig: (config) => set({ collaborationConfig: config }),
    reset: () => set(initialState),
  }));
