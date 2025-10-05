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
interface LoroMessage {
  type: "connect" | "disconnect" | "message" | "status" | "error";
  adapterId: string;
  data?: unknown;
}

/**
 * WebSocket message protocol
 */
interface WebSocketMessage {
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
  private readonly adapterId: string;
  private readonly doc: LoroDoc;
  private readonly ephemeralStore: EphemeralStore;
  private readonly _awareness: AwarenessAdapter;
  private syncListeners: Set<(isSynced: boolean) => void> = new Set();
  private statusListeners: Set<(status: { status: string }) => void> =
    new Set();
  private updateListeners: Set<(update: unknown) => void> = new Set();
  private reloadListeners: Set<(doc: LoroDoc) => void> = new Set();
  private isSynced = false;
  private messageDisposable: Disposable | null = null;

  private websocketUrl: string;

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
          data: { type: "ephemeral", bytes: stateBytes },
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
   * Register event listener
   */
  on(type: "sync", cb: (isSynced: boolean) => void): void;
  on(type: "status", cb: (status: { status: string }) => void): void;
  on(type: "update", cb: (update: unknown) => void): void;
  on(type: "reload", cb: (doc: LoroDoc) => void): void;
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
   * Unregister event listener
   */
  off(type: "sync", cb: (isSynced: boolean) => void): void;
  off(type: "status", cb: (status: { status: string }) => void): void;
  off(type: "update", cb: (update: unknown) => void): void;
  off(type: "reload", cb: (doc: LoroDoc) => void): void;
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
          console.warn(`[LoroProvider] Update message missing data field`);
        }
        break;
      }

      case "ephemeral": {
        // Remote awareness state - decode and apply
        if (message.bytes && Array.isArray(message.bytes)) {
          const bytes = new Uint8Array(message.bytes);
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
