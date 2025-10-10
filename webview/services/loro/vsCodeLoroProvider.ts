/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * VS Code Loro provider implementation.
 * Implements Loro's Provider interface using postMessage to communicate with extension.
 *
 * @module services/loro/vsCodeLoroProvider
 */

import { LoroDoc, EphemeralStore } from "loro-crdt";
import type { Provider, AwarenessProvider } from "@datalayer/lexical-loro";
import { AwarenessAdapter } from "./awarenessAdapter";
import { vsCodeAPI, MessageHandler, Disposable } from "../messageHandler";

/**
 * Message types for extension communication
 */
export interface LoroMessage {
  type: "connect" | "disconnect" | "message" | "status" | "error";
  adapterId: string;
  data?: unknown;
}

/**
 * WebSocket message protocol for Loro synchronization
 */
export interface WebSocketMessage {
  type: "update" | "ephemeral" | "query-snapshot" | "query-ephemeral";
  bytes?: number[];
  update?: number[]; // Server may send 'update' field instead of 'bytes'
  docId?: string;
  [key: string]: unknown;
}

/**
 * Provider implementation for VS Code environment.
 * Uses postMessage to communicate with extension's WebSocket adapter.
 */
export class VSCodeLoroProvider implements Provider {
  /** Adapter ID for identifying messages from extension */
  private readonly adapterId: string;
  /** Loro document for CRDT operations */
  private readonly doc: LoroDoc;
  /** Ephemeral store for awareness state (5 minute timeout) */
  private readonly ephemeralStore: EphemeralStore;
  /** Awareness adapter for collaborative presence information */
  private readonly _awareness: AwarenessAdapter;
  /** Listeners for synchronization state changes */
  private syncListeners: Set<(isSynced: boolean) => void> = new Set();
  /** Listeners for connection status changes */
  private statusListeners: Set<(status: { status: string }) => void> =
    new Set();
  /** Listeners for remote document updates */
  private updateListeners: Set<(update: unknown) => void> = new Set();
  /** Listeners for document reload events */
  private reloadListeners: Set<(doc: LoroDoc) => void> = new Set();
  /** Flag indicating whether document is synchronized with server */
  private isSynced = false;
  /** Disposable for cleanup of message listener registration */
  private messageDisposable: Disposable | null = null;

  /** WebSocket URL for server connection */
  private websocketUrl: string;
  /** Document ID extracted from adapter ID */
  private documentId: string;

  /**
   * Creates a new VS Code Loro provider instance
   * @param adapterId - Unique adapter identifier for this provider
   * @param doc - Loro document instance for CRDT operations
   * @param userName - Username for awareness state
   * @param userColor - User's display color for awareness presence
   * @param websocketUrl - Optional WebSocket URL for server connection
   */
  constructor(
    adapterId: string,
    doc: LoroDoc,
    userName: string,
    userColor: string,
    websocketUrl?: string,
  ) {
    this.adapterId = adapterId;
    this.doc = doc;
    this.websocketUrl = websocketUrl || "";
    // Extract document ID from adapter ID (format: "loro-{documentId}")
    this.documentId = adapterId.replace(/^loro-/, "");

    // Create shared ephemeral store (5 minute timeout)
    this.ephemeralStore = new EphemeralStore(300000);

    // Create awareness adapter with the shared ephemeral store
    this._awareness = new AwarenessAdapter(
      doc,
      userName,
      userColor,
      this.ephemeralStore,
    );

    // Register message listener with MessageHandler singleton
    this.messageDisposable = MessageHandler.instance.onMessage(
      this.handleExtensionMessage.bind(this),
    );

    // Subscribe to local document changes
    doc.subscribeLocalUpdates((update: Uint8Array) => {
      // Send local updates to server via extension
      // Server expects 'update' field, not 'bytes'
      const updateArray = Array.from(update);
      this.sendToExtension({
        type: "message",
        adapterId: this.adapterId,
        data: { type: "update", update: updateArray },
      });
    });

    // Subscribe to awareness changes
    this._awareness.on("update", () => {
      // Send awareness state to server
      const state = this._awareness.getLocalState();
      if (state) {
        const stateBytes = Array.from(this._awareness.encodeLocalState());
        this.sendToExtension({
          type: "message",
          adapterId: this.adapterId,
          data: {
            type: "ephemeral",
            ephemeral: stateBytes,
            docId: this.documentId,
          },
        });
      }
    });
  }

  /**
   * Get the awareness provider
   */
  get awareness(): AwarenessProvider {
    return this._awareness;
  }

  /**
   * Connect to the collaboration server
   */
  connect(): void {
    // Re-register message handler if it was disposed
    if (!this.messageDisposable) {
      this.messageDisposable = MessageHandler.instance.onMessage(
        this.handleExtensionMessage.bind(this),
      );
    }

    this.sendToExtension({
      type: "connect",
      adapterId: this.adapterId,
      data: {
        websocketUrl: this.websocketUrl,
      },
    });
  }

  /**
   * Disconnect from the collaboration server
   */
  disconnect(): void {
    this.sendToExtension({
      type: "disconnect",
      adapterId: this.adapterId,
    });

    // Clean up message listener
    if (this.messageDisposable) {
      this.messageDisposable.dispose();
      this.messageDisposable = null;
    }

    this._awareness.dispose();
  }

  /**
   * Register event listener for synchronization state changes
   * @param type - Event type 'sync'
   * @param cb - Callback function receiving sync state
   */
  on(type: "sync", cb: (isSynced: boolean) => void): void;
  /**
   * Register event listener for connection status changes
   * @param type - Event type 'status'
   * @param cb - Callback function receiving status object
   */
  on(type: "status", cb: (status: { status: string }) => void): void;
  /**
   * Register event listener for remote document updates
   * @param type - Event type 'update'
   * @param cb - Callback function receiving update data
   */
  on(type: "update", cb: (update: unknown) => void): void;
  /**
   * Register event listener for document reload events
   * @param type - Event type 'reload'
   * @param cb - Callback function receiving reloaded document
   */
  on(type: "reload", cb: (doc: LoroDoc) => void): void;
  /**
   * Register event listener implementation
   * @param type - Event type
   * @param cb - Callback function
   */
  on(type: string, cb: Function): void {
    switch (type) {
      case "sync":
        this.syncListeners.add(cb as (isSynced: boolean) => void);
        break;
      case "status":
        this.statusListeners.add(cb as (status: { status: string }) => void);
        break;
      case "update":
        this.updateListeners.add(cb as (update: unknown) => void);
        break;
      case "reload":
        this.reloadListeners.add(cb as (doc: LoroDoc) => void);
        break;
    }
  }

  /**
   * Unregister event listener for synchronization state changes
   * @param type - Event type 'sync'
   * @param cb - Callback function to remove
   */
  off(type: "sync", cb: (isSynced: boolean) => void): void;
  /**
   * Unregister event listener for connection status changes
   * @param type - Event type 'status'
   * @param cb - Callback function to remove
   */
  off(type: "status", cb: (status: { status: string }) => void): void;
  /**
   * Unregister event listener for remote document updates
   * @param type - Event type 'update'
   * @param cb - Callback function to remove
   */
  off(type: "update", cb: (update: unknown) => void): void;
  /**
   * Unregister event listener for document reload events
   * @param type - Event type 'reload'
   * @param cb - Callback function to remove
   */
  off(type: "reload", cb: (doc: LoroDoc) => void): void;
  /**
   * Unregister event listener implementation
   * @param type - Event type
   * @param cb - Callback function to remove
   */
  off(type: string, cb: Function): void {
    switch (type) {
      case "sync":
        this.syncListeners.delete(cb as (isSynced: boolean) => void);
        break;
      case "status":
        this.statusListeners.delete(cb as (status: { status: string }) => void);
        break;
      case "update":
        this.updateListeners.delete(cb as (update: unknown) => void);
        break;
      case "reload":
        this.reloadListeners.delete(cb as (doc: LoroDoc) => void);
        break;
    }
  }

  /**
   * Handle messages from the extension
   */
  private handleExtensionMessage(messageData: unknown): void {
    const message = messageData as LoroMessage;

    // Only handle messages for this adapter
    if (message.adapterId !== this.adapterId) {
      return;
    }

    switch (message.type) {
      case "status": {
        const status = message.data as { status: string };

        // Notify status listeners
        this.statusListeners.forEach((cb) => cb(status));

        // Handle connection status
        if (status.status === "connected") {
          // Request snapshot and ephemeral state on connect
          this.sendToExtension({
            type: "message",
            adapterId: this.adapterId,
            data: { type: "query-snapshot" },
          });

          this.sendToExtension({
            type: "message",
            adapterId: this.adapterId,
            data: { type: "query-ephemeral" },
          });

          // Send initial awareness state to server
          const state = this._awareness.getLocalState();
          if (state) {
            const stateBytes = Array.from(this._awareness.encodeLocalState());
            this.sendToExtension({
              type: "message",
              adapterId: this.adapterId,
              data: {
                type: "ephemeral",
                ephemeral: stateBytes,
                docId: this.documentId,
              },
            });
          }
        } else if (status.status === "disconnected") {
          this.isSynced = false;
          this.syncListeners.forEach((cb) => cb(false));
        }
        break;
      }

      case "message": {
        const wsMessage = message.data as WebSocketMessage;
        this.handleWebSocketMessage(wsMessage);
        break;
      }

      case "error": {
        const error = message.data as { message: string };
        console.error(`[VSCodeLoroProvider] Error:`, error.message);
        break;
      }
    }
  }

  /**
   * Handle WebSocket messages
   */
  private handleWebSocketMessage(message: WebSocketMessage): void {
    switch (message.type) {
      case "update": {
        // Remote document update - import into local doc
        // Server sends either 'bytes' or 'update' field
        const updateData = message.bytes || message.update;
        if (updateData && Array.isArray(updateData)) {
          const bytes = new Uint8Array(updateData);
          this.doc.import(bytes);

          // Notify update listeners
          this.updateListeners.forEach((cb) => cb(bytes));

          // Mark as synced on first update
          if (!this.isSynced) {
            this.isSynced = true;
            this.syncListeners.forEach((cb) => cb(true));
          }
        } else {
        }
        break;
      }

      case "ephemeral": {
        // Remote awareness state - decode and apply
        if (message.ephemeral && Array.isArray(message.ephemeral)) {
          const bytes = new Uint8Array(message.ephemeral);
          this._awareness.decodeRemoteState(bytes);
        }
        break;
      }

      default:
        console.warn(
          `[VSCodeLoroProvider ${this.adapterId}] Unknown message type:`,
          message.type,
        );
    }
  }

  /**
   * Send a message to the extension
   */
  private sendToExtension(message: LoroMessage): void {
    // Use VS Code webview API singleton from messageHandler
    vsCodeAPI.postMessage(message);
  }
}
