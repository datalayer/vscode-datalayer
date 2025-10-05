/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * @module stores/notebookStore
 * Centralized state management for notebook webview using Zustand.
 * Eliminates props drilling and sessionStorage hacks.
 */

import { create } from "zustand";
import type { RuntimeJSON } from "../../../core/lib/client/models/Runtime";

/**
 * Extended interface for runtime with credits information
 */
export interface RuntimeWithCredits extends RuntimeJSON {
  creditsUsed?: number;
  creditsLimit?: number;
}

/**
 * Notebook state interface
 */
export interface NotebookState {
  // Document state
  nbformat: unknown;
  isDatalayerNotebook: boolean;
  documentId?: string;
  serverUrl?: string;
  token?: string;
  notebookId: string;
  isInitialized: boolean;

  // Runtime state
  selectedRuntime?: RuntimeWithCredits;

  // Theme state
  theme: "light" | "dark";

  // Actions
  setNbformat: (nbformat: unknown) => void;
  setIsDatalayerNotebook: (isDatalayer: boolean) => void;
  setDocumentId: (id: string) => void;
  setServerUrl: (url: string) => void;
  setToken: (token: string) => void;
  setNotebookId: (id: string) => void;
  setIsInitialized: (initialized: boolean) => void;
  setRuntime: (runtime: RuntimeWithCredits | undefined) => void;
  setTheme: (theme: "light" | "dark") => void;
  reset: () => void;
}

/**
 * Initial state
 */
const initialState = {
  nbformat: undefined,
  isDatalayerNotebook: false,
  documentId: undefined,
  serverUrl: undefined,
  token: undefined,
  notebookId: "local-notebook",
  isInitialized: false,
  selectedRuntime: undefined,
  theme: "light" as const,
};

/**
 * Notebook store using Zustand
 * Provides centralized state management for notebook webview
 */
export const useNotebookStore = create<NotebookState>((set) => ({
  ...initialState,

  setNbformat: (nbformat) => set({ nbformat }),
  setIsDatalayerNotebook: (isDatalayer) =>
    set({ isDatalayerNotebook: isDatalayer }),
  setDocumentId: (id) => set({ documentId: id }),
  setServerUrl: (url) => set({ serverUrl: url }),
  setToken: (token) => set({ token }),
  setNotebookId: (id) => set({ notebookId: id }),
  setIsInitialized: (initialized) => set({ isInitialized: initialized }),
  setRuntime: (runtime) => set({ selectedRuntime: runtime }),
  setTheme: (theme) => set({ theme }),
  reset: () => set(initialState),
}));
