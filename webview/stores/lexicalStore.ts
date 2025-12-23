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
  /** Whether real-time collaboration is enabled for this document */
  enabled: boolean;
  /** WebSocket URL for collaboration server connection */
  websocketUrl?: string;
  /** Unique identifier for the document being collaborated on */
  documentId?: string;
  /** Unique session identifier for this collaboration session */
  sessionId?: string;
  /** Display name of the current user in collaboration UI */
  username?: string;
  /** Color assigned to the user for cursor and selection highlighting */
  userColor?: string;
}

/**
 * Lexical state interface
 *
 * Defines the complete state structure for the Lexical editor store,
 * including document properties, editor settings, collaboration state, and action methods.
 */
export interface LexicalState {
  // Document state
  /** Current content of the Lexical document */
  content: string;
  /** Whether the document is in edit mode (true) or read-only (false) */
  isEditable: boolean;
  /** Whether the Lexical editor has been initialized and is ready to render */
  isReady: boolean;
  /** Whether this is the first load of the document */
  isInitialLoad: boolean;
  /** Full URI of the document (used for outline and navigation context) */
  documentUri: string;
  /** ID of outline item to navigate to (null if no pending navigation) */
  navigationTarget: string | null;
  /** Lexical document ID for tool execution context and tracking */
  lexicalId: string | null;

  // Theme state
  /** Current editor theme: 'light' or 'dark' */
  theme: "light" | "dark";

  // Collaboration state
  /** Configuration for real-time collaboration features */
  collaborationConfig: CollaborationConfig;
  /** User information for comments (independent of collaboration sync) */
  userInfo: { username: string; userColor: string } | null;

  // Actions
  /**
   * Updates the document content
   * @param content The new document content
   */
  setContent: (content: string) => void;
  /**
   * Updates the editable state of the document
   * @param editable True for edit mode, false for read-only
   */
  setIsEditable: (editable: boolean) => void;
  /**
   * Updates the ready state of the editor
   * @param ready True when editor has initialized and is ready to render
   */
  setIsReady: (ready: boolean) => void;
  /**
   * Updates the initial load flag
   * @param isInitial True for the first load, false after initial rendering
   */
  setIsInitialLoad: (isInitial: boolean) => void;
  /**
   * Updates the document URI
   * @param uri The new document URI
   */
  setDocumentUri: (uri: string) => void;
  /**
   * Updates the navigation target outline item
   * @param itemId The ID of the outline item to navigate to, or null to clear
   */
  setNavigationTarget: (itemId: string | null) => void;
  /**
   * Updates the Lexical document ID
   * @param id The new Lexical document ID
   */
  setLexicalId: (id: string) => void;
  /**
   * Updates the editor theme
   * @param theme The new theme: 'light' or 'dark'
   */
  setTheme: (theme: "light" | "dark") => void;
  /**
   * Updates the collaboration configuration
   * @param config The new collaboration configuration
   */
  setCollaborationConfig: (config: CollaborationConfig) => void;
  /**
   * Updates the user information for comments
   * @param info User information (username and color) or null if not logged in
   */
  setUserInfo: (info: { username: string; userColor: string } | null) => void;
  /**
   * Resets the entire store to initial state
   */
  reset: () => void;
}

/**
 * Initial state for the Lexical store
 *
 * Defines the default values for all state properties when creating a new store instance.
 * All documents start in edit mode with an empty theme, and no collaboration enabled.
 */
const initialState = {
  /** Default empty content */
  content: "",
  /** Default to editable mode */
  isEditable: true,
  /** Default to not ready until editor initializes */
  isReady: false,
  /** Default to initial load state */
  isInitialLoad: true,
  /** Default to empty URI */
  documentUri: "",
  /** Default to no navigation target */
  navigationTarget: null as string | null,
  /** Default to no Lexical ID assigned */
  lexicalId: null as string | null,
  /** Default theme is dark */
  theme: "dark" as const,
  /** Default collaboration is disabled */
  collaborationConfig: {
    enabled: false,
  },
  /** Default to no user info (not logged in) */
  userInfo: null as { username: string; userColor: string } | null,
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
    setDocumentUri: (uri) => set({ documentUri: uri }),
    setNavigationTarget: (itemId) => set({ navigationTarget: itemId }),
    setLexicalId: (lexicalId) => set({ lexicalId }),
    setCollaborationConfig: (config) => set({ collaborationConfig: config }),
    setUserInfo: (info) => set({ userInfo: info }),
    reset: () => set(initialState),
  }));
