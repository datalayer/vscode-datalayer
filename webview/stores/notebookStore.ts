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
import type { RuntimeJSON } from "@datalayer/core/lib/client";

/**
 * Extended interface for runtime with credits information
 */
export interface RuntimeWithCredits extends RuntimeJSON {
  /** Number of credits consumed by the runtime */
  creditsUsed?: number;
  /** Maximum number of credits available for the runtime */
  creditsLimit?: number;
}

/**
 * Notebook state interface
 */
export interface NotebookState {
  // Document state
  /** Notebook format version */
  nbformat: unknown;
  /** Whether this is a Datalayer-hosted notebook */
  isDatalayerNotebook: boolean;
  /** Unique document identifier for Datalayer notebooks */
  documentId?: string;
  /** VS Code document URI for outline tracking and identification */
  documentUri: string;
  /** Datalayer server URL for API communication */
  serverUrl?: string;
  /** Authentication token for API requests */
  token?: string;
  /** Notebook identifier, defaults to "local-notebook" */
  notebookId: string;
  /** Whether the notebook has been initialized with required data */
  isInitialized: boolean;

  // Runtime state
  /** Currently selected runtime with optional credits information */
  selectedRuntime?: RuntimeWithCredits;

  // Theme state
  /** Current theme mode for the notebook editor */
  theme: "light" | "dark";

  // Actions
  /** Updates the notebook format version */
  setNbformat: (nbformat: unknown) => void;
  /** Updates whether the notebook is a Datalayer notebook */
  setIsDatalayerNotebook: (isDatalayer: boolean) => void;
  /** Updates the document identifier */
  setDocumentId: (id: string) => void;
  /** Updates the VS Code document URI */
  setDocumentUri: (uri: string) => void;
  /** Updates the Datalayer server URL */
  setServerUrl: (url: string) => void;
  /** Updates the authentication token */
  setToken: (token: string) => void;
  /** Updates the notebook identifier */
  setNotebookId: (id: string) => void;
  /** Updates the initialization state */
  setIsInitialized: (initialized: boolean) => void;
  /** Updates the selected runtime */
  setRuntime: (runtime: RuntimeWithCredits | undefined) => void;
  /** Updates the theme mode */
  setTheme: (theme: "light" | "dark") => void;
  /** Resets all state to initial values */
  reset: () => void;
}

/**
 * Initial state
 */
const initialState = {
  nbformat: undefined,
  isDatalayerNotebook: false,
  documentId: undefined,
  documentUri: "", // Will be set from init message
  serverUrl: undefined,
  token: undefined,
  notebookId: "local-notebook",
  isInitialized: false,
  selectedRuntime: undefined,
  theme: "light" as const,
};

/**
 * Creates a new isolated Notebook store instance.
 * Each webview should create its own store to prevent state sharing.
 *
 * IMPORTANT: This is a factory function, NOT a global singleton.
 * Calling this multiple times creates independent store instances.
 *
 * @returns A new Zustand store instance for Notebook state management
 */
export const createNotebookStore = () =>
  create<NotebookState>((set) => ({
    ...initialState,

    setNbformat: (nbformat) => set({ nbformat }),
    setIsDatalayerNotebook: (isDatalayer) =>
      set({ isDatalayerNotebook: isDatalayer }),
    setDocumentId: (id) => set({ documentId: id }),
    setDocumentUri: (uri) => set({ documentUri: uri }),
    setServerUrl: (url) => set({ serverUrl: url }),
    setToken: (token) => set({ token }),
    setNotebookId: (id) => set({ notebookId: id }),
    setIsInitialized: (initialized) => set({ isInitialized: initialized }),
    setRuntime: (runtime) => set({ selectedRuntime: runtime }),
    setTheme: (theme) => set({ theme }),
    reset: () => set(initialState),
  }));
