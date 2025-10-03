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
  enabled: boolean;
  websocketUrl: string;
  documentId: string;
  sessionId: string;
  username: string;
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
  private static instance: LexicalCollaborationService;

  static getInstance(): LexicalCollaborationService {
    if (!LexicalCollaborationService.instance) {
      LexicalCollaborationService.instance = new LexicalCollaborationService();
    }
    return LexicalCollaborationService.instance;
  }

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

      const documentBridge = DocumentBridge.getInstance();
      const metadata = documentBridge.getDocumentMetadata(document.uri);

      if (!metadata?.document) {
        return undefined;
      }

      // Build websocket URL directly using document UID (no session needed)
      // Similar to Desktop app: `${configuration.spacerRunUrl.replace(/^http/, 'ws')}/api/spacer/v1/lexical/ws/${id}`
      const config = vscode.workspace.getConfiguration("datalayer");
      const spacerUrl = config.get<string>(
        "spacerUrl",
        "https://prod1.datalayer.run",
      );

      // Convert http(s) to ws(s)
      const websocketUrl = `${spacerUrl.replace(/^http/, "ws")}/api/spacer/v1/lexical/ws/${metadata.document.uid}`;

      const user = authState.user;
      const username =
        user?.displayName || user?.handle || user?.email || "Anonymous";

      return {
        enabled: true,
        websocketUrl,
        documentId: metadata.document.uid,
        sessionId: metadata.document.uid, // Use UID as session ID
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
