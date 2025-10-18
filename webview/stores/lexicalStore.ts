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
 * Lexical store using Zustand
 * Provides centralized state management for lexical webview
 */
export const useLexicalStore = create<LexicalState>((set) => ({
  ...initialState,

  setContent: (content) => set({ content }),
  setIsEditable: (editable) => set({ isEditable: editable }),
  setIsReady: (ready) => set({ isReady: ready }),
  setIsInitialLoad: (isInitial) => set({ isInitialLoad: isInitial }),
  setTheme: (theme) => set({ theme }),
  setCollaborationConfig: (config) => set({ collaborationConfig: config }),
  reset: () => set(initialState),
}));
