/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Unified Document Registry.
 *
 * Maintains bidirectional mapping between document IDs and document URIs.
 * Works for BOTH notebooks AND lexical documents.
 *
 * This is necessary because:
 * - Core tools work with documentId (platform-agnostic)
 * - VS Code internal commands work with documentUri (VS Code-specific)
 * - For local documents: documentId === documentUri
 * - For remote documents: documentId !== documentUri
 *
 * @module tools/vscode/documentRegistry
 */

import * as vscode from "vscode";

import { getActiveCustomEditorUri } from "../../utils/activeDocument";
import { ServiceLoggers } from "../logging/loggers";

/** Document type: notebook (.ipynb) or lexical (.lexical). */
export type DocumentType = "notebook" | "lexical";

/** Registry entry storing document identifier, URI, type, and optional webview panel. */
export interface DocumentRegistryEntry {
  /** Document identifier (UID for remote, URI for local) */
  documentId: string;
  /** VS Code document URI */
  documentUri: string;
  /** Document type */
  type: DocumentType;
  /** Webview panel for tool execution messaging */
  webviewPanel?: vscode.WebviewPanel;
  /**
   * Whether the webview has sent its "ready" message, meaning the React app is
   * fully loaded and the tool-execution message handler is live. Set to false
   * by the early registration in resolveCustomEditor; set to true by
   * markWebviewReady() when the "ready" message arrives.
   */
  isWebviewReady: boolean;
  /**
   * Unix timestamp (ms) of the last time this entry was accessed via the MCP
   * executor or explicitly touched. Used to prefer the most-recently-used
   * document when multiple documents of the same type are registered.
   */
  lastUsed: number;
}

/**
 * Bidirectional registry for document ID ↔ document URI mapping.
 * Handles both notebooks (.ipynb) and lexical documents (.lexical).
 */
class DocumentRegistry {
  /**
   * Map from documentId → entry.
   * - Local: "file:///path/to/doc.ipynb" → {id, uri, type: "notebook"}
   * - Remote: "01KAJ42KE2XKM7NBNZV568KXQX" → {id, uri: "datalayer://...", type: "notebook"}
   */
  private idToEntry = new Map<string, DocumentRegistryEntry>();

  /**
   * Map from documentUri → documentId.
   * Reverse lookup for when we have URI but need ID.
   */
  private uriToId = new Map<string, string>();

  /**
   * Subscribe to VS Code tab-change events so that manually focusing a
   * Datalayer custom editor tab also updates `lastUsed`, making it the
   * preferred target for subsequent MCP tool calls.
   *
   * Call once during extension activation and push the returned disposable
   * onto `context.subscriptions`.
   *
   * @returns A VS Code disposable that tears down the listener.
   */
  startTabWatcher(): vscode.Disposable {
    return vscode.window.tabGroups.onDidChangeTabs(() => {
      const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
      if (!activeTab?.input || typeof activeTab.input !== "object") {
        return;
      }
      const tabInput = activeTab.input as { uri?: vscode.Uri; viewType?: string };
      if (
        tabInput.uri &&
        (tabInput.viewType === "datalayer.jupyter-notebook" ||
          tabInput.viewType === "datalayer.lexical-editor")
      ) {
        const uriStr = tabInput.uri.toString();
        const documentId = this.uriToId.get(uriStr);
        if (documentId) {
          this.touch(documentId);
          ServiceLoggers.main.debug(
            `[DocumentRegistry] Tab focus updated lastUsed for: ${uriStr}`,
          );
        }
      }
    });
  }

  /**
   * Register a document with its ID, URI, and type.
   *
   * @param documentId - Document identifier (UID for remote, URI for local).
   * @param documentUri - VS Code document URI.
   * @param type - Document type (notebook or lexical).
   * @param webviewPanel - Optional webview panel for tool execution messaging.
   */
  register(
    documentId: string,
    documentUri: string,
    type: DocumentType,
    webviewPanel?: vscode.WebviewPanel,
    isWebviewReady = false,
  ): void {
    const entry: DocumentRegistryEntry = {
      documentId,
      documentUri,
      type,
      webviewPanel,
      isWebviewReady,
      lastUsed: Date.now(),
    };
    this.idToEntry.set(documentId, entry);
    this.uriToId.set(documentUri, documentId);
  }

  /**
   * Get webview panel for a document.
   *
   * @param documentUri - String representation of the document's VS Code URI.
   *
   * @returns Webview panel or undefined if not registered or no webview.
   */
  getWebviewPanel(documentUri: string): vscode.WebviewPanel | undefined {
    const documentId = this.uriToId.get(documentUri);
    if (!documentId) {
      return undefined;
    }
    const entry = this.idToEntry.get(documentId);
    return entry?.webviewPanel;
  }

  /**
   * Update the last-used timestamp for a document.
   *
   * Call this whenever a document is targeted by an MCP tool call so that
   * recency-based selection prefers the correct document on the next call.
   *
   * @param documentId - Document identifier to touch.
   */
  touch(documentId: string): void {
    const entry = this.idToEntry.get(documentId);
    if (entry) {
      entry.lastUsed = Date.now();
    }
  }

  /**
   * Mark a document's webview as ready to receive tool-execution messages.
   *
   * Call this from the provider's handleReadyMessage when the webview React app
   * has finished loading and sent its "ready" handshake.
   *
   * @param documentUri - VS Code document URI string.
   */
  markWebviewReady(documentUri: string): void {
    const documentId = this.uriToId.get(documentUri);
    if (documentId) {
      const entry = this.idToEntry.get(documentId);
      if (entry) {
        entry.isWebviewReady = true;
        ServiceLoggers.main.debug(
          `[DocumentRegistry] Webview ready: ${documentUri.substring(0, 60)}`,
        );
      }
    }
  }

  /**
   * Get webview panel for active document.
   * Checks active custom editor tab (notebook or lexical).
   *
   * @returns Webview panel or undefined if no active document with webview.
   */
  getActiveWebviewPanel(): vscode.WebviewPanel | undefined {
    // Check for active custom editor (notebook or lexical)
    const uri = getActiveCustomEditorUri();
    if (uri) {
      return this.getWebviewPanel(uri.toString());
    }
    return undefined;
  }

  /**
   * Get the best available webview panel for tool execution.
   *
   * Prefers the currently active Datalayer editor tab (same as
   * {@link getActiveWebviewPanel}), but when VS Code focus is elsewhere
   * (e.g. the Cascade/Windsurf MCP chat panel is active), falls back to
   * the first registered webview panel that is still visible.
   *
   * This is required for the MCP path where the user is interacting with
   * Cascade in a side panel while the notebook tab is open but not focused.
   *
   * @returns Best available webview panel, or undefined if none registered.
   */
  getBestWebviewPanel(): vscode.WebviewPanel | undefined {
    // Prefer active tab first (handles the focused-tab case)
    const active = this.getActiveWebviewPanel();
    if (active) {
      return active;
    }

    // Fall back to any registered panel, sorted by most recently used.
    // Prefer notebook panels over lexical ones to match the most common MCP use case.
    // Within each type, prefer panels where the webview is already ready.
    for (const type of ["notebook", "lexical"] as const) {
      const entries = this.getByType(type);
      const ready = entries.find((e) => e.webviewPanel && e.isWebviewReady);
      if (ready) {
        return ready.webviewPanel;
      }
      // Fall back to any panel with a webviewPanel, even if not yet ready.
      const anyPanel = entries.find((e) => e.webviewPanel);
      if (anyPanel) {
        return anyPanel.webviewPanel;
      }
    }

    return undefined;
  }

  /**
   * Returns the best webview panel AND whether its webview is ready.
   * Used by the MCP executor to give a precise "still loading" error
   * instead of a 30-second timeout when the panel exists but the React
   * app hasn't finished initializing.
   *
   * @returns Object with panel and isReady flag, or undefined if no panel found.
   */
  getBestWebviewPanelWithStatus():
    | { panel: vscode.WebviewPanel; isReady: boolean }
    | undefined {
    for (const type of ["notebook", "lexical"] as const) {
      const entries = this.getByType(type);
      const ready = entries.find((e) => e.webviewPanel && e.isWebviewReady);
      if (ready) {
        return { panel: ready.webviewPanel!, isReady: true };
      }
      const anyPanel = entries.find((e) => e.webviewPanel);
      if (anyPanel) {
        return { panel: anyPanel.webviewPanel!, isReady: false };
      }
    }
    return undefined;
  }

  /**
   * Unregister a document by its URI (called when webview is closed).
   *
   * @param documentUri - VS Code document URI.
   */
  unregisterByUri(documentUri: string): void {
    const documentId = this.uriToId.get(documentUri);
    if (documentId) {
      const entry = this.idToEntry.get(documentId);
      this.idToEntry.delete(documentId);
      this.uriToId.delete(documentUri);

      ServiceLoggers.main.debug(
        `[DocumentRegistry] Unregistered ${entry?.type || "unknown"}: ${documentUri.substring(0, 50)}...`,
      );
    }
  }

  /**
   * Convert document ID to document URI.
   *
   * @param documentId - Unique identifier assigned during registration.
   *
   * @returns The VS Code URI string associated with the given identifier.
   *
   * @throws Error if the identifier is not registered.
   */
  getUriFromId(documentId: string): string {
    const entry = this.idToEntry.get(documentId);
    if (!entry) {
      throw new Error(
        `Document ID "${documentId}" is not registered! ` +
          `This means the document was not properly registered when opened. ` +
          `Available IDs: ${Array.from(this.idToEntry.keys()).join(", ") || "(none)"}`,
      );
    }
    return entry.documentUri;
  }

  /**
   * Convert document URI to document ID.
   *
   * @param documentUri - String representation of the document's VS Code URI.
   *
   * @returns The unique identifier assigned during registration.
   *
   * @throws Error if the URI is not registered.
   */
  getIdFromUri(documentUri: string): string {
    const id = this.uriToId.get(documentUri);
    if (!id) {
      throw new Error(
        `Document URI "${documentUri}" is not registered! ` +
          `This means the document was not properly registered when opened. ` +
          `Available URIs: ${Array.from(this.uriToId.keys()).join(", ") || "(none)"}`,
      );
    }
    return id;
  }

  /**
   * Get full registry entry for a document ID.
   *
   * @param documentId - Document identifier.
   *
   * @returns Registry entry with id, uri, and type.
   *
   * @throws Error if documentId is not registered.
   */
  getEntry(documentId: string): DocumentRegistryEntry {
    const entry = this.idToEntry.get(documentId);
    if (!entry) {
      throw new Error(
        `Document ID "${documentId}" is not registered! ` +
          `This means the document was not properly registered when opened. ` +
          `Available IDs: ${Array.from(this.idToEntry.keys()).join(", ") || "(none)"}`,
      );
    }
    return entry;
  }

  /**
   * Check if a document is registered.
   *
   * @param documentId - Document identifier.
   *
   * @returns True if registered.
   */
  has(documentId: string): boolean {
    return this.idToEntry.has(documentId);
  }

  /**
   * Get document type (notebook or lexical).
   *
   * @param documentId - Unique identifier assigned during registration.
   *
   * @returns Whether the document is a notebook or lexical type.
   *
   * @throws Error if the identifier is not registered.
   */
  getType(documentId: string): DocumentType {
    return this.getEntry(documentId).type;
  }

  /**
   * Get all registered document IDs.
   *
   * @returns Array of document IDs.
   */
  getAllIds(): string[] {
    return Array.from(this.idToEntry.keys());
  }

  /**
   * Get all registered documents of a specific type.
   *
   * @param type - Document type to filter by.
   *
   * @returns Array of registry entries.
   */
  getByType(type: DocumentType): DocumentRegistryEntry[] {
    return Array.from(this.idToEntry.values())
      .filter((entry) => entry.type === type)
      .sort((a, b) => b.lastUsed - a.lastUsed);
  }

  /**
   * Clear all registrations (for testing).
   */
  clear(): void {
    this.idToEntry.clear();
    this.uriToId.clear();
    ServiceLoggers.main.debug("[DocumentRegistry] Cleared all registrations");
  }

  /**
   * Get registry statistics.
   * @returns Object with total, notebook, and lexical document counts.
   */
  getStats(): {
    /** Total number of registered documents */
    total: number;
    /** Number of registered notebooks */
    notebooks: number;
    /** Number of registered lexical documents */
    lexicals: number;
  } {
    const notebooks = this.getByType("notebook").length;
    const lexicals = this.getByType("lexical").length;
    return {
      total: this.idToEntry.size,
      notebooks,
      lexicals,
    };
  }
}

/**
 * Export the class for ServiceContainer to instantiate.
 */
export { DocumentRegistry };
