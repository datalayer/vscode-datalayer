/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Awareness adapter for Loro collaboration.
 * Wraps Loro's EphemeralStore to implement the AwarenessProvider interface.
 *
 * @module services/loro/awarenessAdapter
 */

import { LoroDoc, EphemeralStore } from "loro-crdt";
import type { AwarenessProvider, UserState } from "@datalayer/lexical-loro";

/**
 * Adapter that wraps Loro's EphemeralStore to provide awareness functionality.
 */
export class AwarenessAdapter implements AwarenessProvider {
  /** @internal - Stored for potential future use */
  // @ts-ignore - TS6133: unused variable
  private readonly _doc: LoroDoc;
  private readonly ephemeralStore: EphemeralStore;
  private readonly clientId: number;
  private updateListeners: Set<() => void> = new Set();
  private localState: UserState | null = null;

  constructor(
    doc: LoroDoc,
    userName: string,
    userColor: string,
    ephemeralStore?: EphemeralStore,
  ) {
    this._doc = doc;
    // Create a new ephemeral store or use provided one (5 minute timeout)
    this.ephemeralStore = ephemeralStore || new EphemeralStore(300000);
    this.clientId = doc.peerId ? Number(doc.peerId) : 0;

    // Initialize local state
    this.localState = {
      name: userName,
      color: userColor,
      focusing: false,
      anchorPos: null,
      focusPos: null,
      awarenessData: {},
    };

    // Subscribe to ephemeral store updates
    this.ephemeralStore.subscribe(() => {
      // Notify listeners when remote states change
      this.updateListeners.forEach((cb) => cb());
    });

    // Write initial state to ephemeral store AFTER subscription
    // This ensures it's ready when collaboration starts
    this.updateEphemeralStore();
  }

  /**
   * Get the local user's awareness state
   */
  getLocalState(): UserState | null {
    return this.localState;
  }

  /**
   * Get all awareness states from all users
   */
  getStates(): Map<number, UserState> {
    const states = new Map<number, UserState>();

    // Add local state
    if (this.localState) {
      states.set(this.clientId, this.localState);
    }

    // Get remote states from ephemeral store
    try {
      const remoteStates = this.ephemeralStore.getAllStates();
      if (remoteStates && typeof remoteStates === "object") {
        for (const [peerId, state] of Object.entries(remoteStates)) {
          const clientId = parseInt(peerId, 10);
          if (!isNaN(clientId) && clientId !== this.clientId) {
            states.set(clientId, state as UserState);
          }
        }
      }
    } catch (error) {
      console.error("[AwarenessAdapter] Error getting remote states:", error);
    }

    return states;
  }

  /**
   * Set the entire local state
   */
  setLocalState(state: UserState): void {
    this.localState = state;
    this.updateEphemeralStore();
    this.notifyListeners();
  }

  /**
   * Update a specific field in the local state
   */
  setLocalStateField(field: string, value: unknown): void {
    if (!this.localState) {
      return;
    }

    this.localState = {
      ...this.localState,
      [field]: value,
    };

    this.updateEphemeralStore();
    this.notifyListeners();
  }

  /**
   * Register update listener
   */
  on(type: "update", cb: () => void): void {
    if (type === "update") {
      this.updateListeners.add(cb);
    }
  }

  /**
   * Unregister update listener
   */
  off(type: "update", cb: () => void): void {
    if (type === "update") {
      this.updateListeners.delete(cb);
    }
  }

  /**
   * Encode all ephemeral state to bytes for transmission (uses Loro's native encoding)
   */
  encodeLocalState(): Uint8Array {
    try {
      // Use Loro's native encoding - encodes ALL ephemeral states
      return this.ephemeralStore.encodeAll();
    } catch (error) {
      console.error(
        "[AwarenessAdapter] Error encoding ephemeral store:",
        error,
      );
      return new Uint8Array(0);
    }
  }

  /**
   * Decode and apply remote ephemeral state from bytes (uses Loro's native decoding)
   */
  decodeRemoteState(bytes: Uint8Array): void {
    try {
      // Use Loro's native apply - decodes and merges ephemeral states
      this.ephemeralStore.apply(bytes);
      this.notifyListeners();
    } catch (error) {
      console.error(
        "[AwarenessAdapter] Error applying ephemeral state:",
        error,
      );
    }
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.updateListeners.clear();
    this.localState = null;
  }

  /**
   * Update the ephemeral store with current local state
   */
  private updateEphemeralStore(): void {
    if (!this.localState) {
      return;
    }

    try {
      // Set local state in ephemeral store
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.ephemeralStore.set(this.clientId.toString(), this.localState as any);
    } catch (error) {
      console.error(
        "[AwarenessAdapter] Error updating ephemeral store:",
        error,
      );
    }
  }

  /**
   * Notify all update listeners
   */
  private notifyListeners(): void {
    this.updateListeners.forEach((cb) => {
      try {
        cb();
      } catch (error) {
        console.error("[AwarenessAdapter] Error in update listener:", error);
      }
    });
  }
}
