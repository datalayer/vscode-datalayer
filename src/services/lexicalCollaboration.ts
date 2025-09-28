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
import { LexicalDocument } from "../models/lexicalDocument";
import { DocumentBridge } from "./documentBridge";
import { SDKAuthProvider } from "./authProvider";
import { getSDKInstance } from "./sdkAdapter";

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
    document: LexicalDocument
  ): Promise<LexicalCollaborationConfig | undefined> {
    if (document.uri.scheme !== "datalayer") {
      return undefined;
    }

    try {
      const authService = SDKAuthProvider.getInstance();
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

      const sdk = getSDKInstance();
      const sessionResult = await (sdk as any).getLexicalCollaborationSessionId(
        metadata.document.uid
      );

      if (!sessionResult.success || !sessionResult.sessionId) {
        return undefined;
      }

      const user = authState.user as any;
      const username = user?.githubLogin
        ? `@${user.githubLogin}`
        : user?.name || user?.email || "Anonymous";

      const config = vscode.workspace.getConfiguration("datalayer");
      const spacerWsUrl = config.get<string>(
        "spacerWsUrl",
        "wss://prod1.datalayer.run"
      );

      const websocketUrl = `${spacerWsUrl}/api/spacer/v1/lexical/ws/${sessionResult.sessionId}?token=${token}`;

      return {
        enabled: true,
        websocketUrl,
        documentId: metadata.document.uid,
        sessionId: sessionResult.sessionId,
        username,
        userColor: "#" + Math.floor(Math.random() * 16777215).toString(16),
      };
    } catch (error) {
      console.error(
        "[LexicalCollaboration] Failed to setup collaboration:",
        error
      );
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
