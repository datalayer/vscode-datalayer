/*
 * Copyright (c) 2021-2023 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Real-time collaboration service for Lexical documents.
 * Configures WebSocket connections and user sessions for collaborative editing.
 *
 * @module services/lexicalCollaboration
 */

import * as vscode from "vscode";
import { LexicalDocument } from "../../models/lexicalDocument";
import { DocumentBridge } from "../bridges/documentBridge";
import { getServiceContainer } from "../../extension";

/**
 * Configuration for lexical document collaboration.
 */
export interface LexicalCollaborationConfig {
  /** Whether real-time collaboration is enabled for this document */
  enabled: boolean;
  /** WebSocket URL for Y.js collaboration server connection */
  websocketUrl: string;
  /** Unique identifier for the lexical document */
  documentId: string;
  /** Session identifier for the collaboration session */
  sessionId: string;
  /** Display name for the current user in the collaboration session */
  username: string;
  /** Hex color code for user cursor and presence indication */
  userColor: string;
}

/**
 * Singleton service for setting up lexical document collaboration.
 * Manages WebSocket connections and user session configuration.
 *
 * @example
 * ```typescript
 * const service = LexicalCollaborationService.getInstance();
 * const config = await service.setupCollaboration(document);
 * ```
 */
export class LexicalCollaborationService {
  /** Singleton instance of the collaboration service */
  private static instance: LexicalCollaborationService;

  /**
   * Gets the singleton instance of the collaboration service.
   * Creates a new instance if one doesn't exist.
   *
   * @returns The singleton instance of LexicalCollaborationService
   */
  static getInstance(): LexicalCollaborationService {
    if (!LexicalCollaborationService.instance) {
      LexicalCollaborationService.instance = new LexicalCollaborationService();
    }
    return LexicalCollaborationService.instance;
  }

  /**
   * Private constructor to enforce singleton pattern.
   * Use getInstance() to obtain an instance.
   */
  private constructor() {}

  /**
   * Sets up collaboration configuration for a Datalayer document.
   * Creates WebSocket URL and user session for real-time editing.
   *
   * @param document - Lexical document to enable collaboration for
   * @returns Collaboration configuration or undefined if setup fails
   */
  async setupCollaboration(
    document: LexicalDocument,
  ): Promise<LexicalCollaborationConfig | undefined> {
    if (document.uri.scheme !== "datalayer") {
      return undefined;
    }

    try {
      const authService = getServiceContainer().authProvider;
      const authState = authService.getAuthState();
      const token = authService.getToken();

      if (!authState.isAuthenticated || !token) {
        return undefined;
      }

      // Extract document ID from URI query parameter (embedded by DocumentBridge)
      const queryParams = new URLSearchParams(document.uri.query);
      let documentId = queryParams.get("docId");

      if (!documentId) {
        // Try to extract from URI path: datalayer://Space/DOCUMENT_UID/Document.lexical
        const pathParts = document.uri.path.split("/").filter((p) => p);
        if (pathParts.length >= 2) {
          // Second to last part is the document UID
          documentId = pathParts[pathParts.length - 2];
        }

        // Fallback to metadata lookup as last resort
        if (!documentId) {
          try {
            const documentBridge = await DocumentBridge.getInstanceAsync();
            const metadata = documentBridge.getDocumentMetadata(document.uri);

            if (metadata?.document?.uid) {
              documentId = metadata.document.uid;
            }
          } catch (error) {
            // DocumentBridge not ready or metadata not found
          }
        }
      }

      if (!documentId) {
        return undefined;
      }

      // Build websocket URL directly using document UID (no session needed)
      // Similar to Desktop app: `${configuration.spacerRunUrl.replace(/^http/, 'ws')}/api/spacer/v1/lexical/ws/${id}`
      const config = vscode.workspace.getConfiguration("datalayer.services");
      const spacerUrl = config.get<string>(
        "spacerUrl",
        "https://prod1.datalayer.run",
      );

      // Convert http(s) to ws(s)
      const websocketUrl = `${spacerUrl.replace(/^http/, "ws")}/api/spacer/v1/lexical/ws/${documentId}`;

      const user = authState.user;
      const baseUsername =
        user?.displayName || user?.handle || user?.email || "Anonymous";
      const username = `${baseUsername} (VSCode)`;

      console.log("[LexicalCollaboration] Creating config:", {
        username,
        baseUsername,
        user: user
          ? {
              displayName: user.displayName,
              handle: user.handle,
              email: user.email,
            }
          : null,
      });

      return {
        enabled: true,
        websocketUrl,
        documentId: documentId,
        sessionId: documentId, // Use UID as session ID
        username,
        userColor: this.generateUserColor(),
      };
    } catch (error) {
      // Failed to setup collaboration - return undefined
      return undefined;
    }
  }

  /**
   * Generates a random hex color for user identification.
   *
   * @returns Random hex color string
   */
  private generateUserColor(): string {
    return "#" + Math.floor(Math.random() * 16777215).toString(16);
  }
}
