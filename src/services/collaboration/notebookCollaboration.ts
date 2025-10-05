/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Real-time collaboration service for Jupyter notebooks.
 * Configures WebSocket connections and user sessions for collaborative editing.
 *
 * @module services/collaboration/notebookCollaboration
 */

import * as vscode from "vscode";
import { NotebookDocument } from "../../models/notebookDocument";
import { DocumentBridge } from "../bridges/documentBridge";
import { getServiceContainer } from "../../extension";

/**
 * Configuration for notebook collaboration.
 */
export interface NotebookCollaborationConfig {
  enabled: boolean;
  documentId: string;
  serverUrl: string;
  token: string;
  sessionId: string;
  username: string;
  userColor: string;
}

/**
 * Singleton service for setting up Jupyter notebook collaboration.
 * Manages session ID fetching and collaboration configuration.
 *
 * @example
 * ```typescript
 * const service = NotebookCollaborationService.getInstance();
 * const config = await service.setupCollaboration(document);
 * ```
 */
export class NotebookCollaborationService {
  private static instance: NotebookCollaborationService;

  static getInstance(): NotebookCollaborationService {
    if (!NotebookCollaborationService.instance) {
      NotebookCollaborationService.instance =
        new NotebookCollaborationService();
    }
    return NotebookCollaborationService.instance;
  }

  private constructor() {}

  /**
   * Sets up collaboration configuration for a Datalayer notebook.
   * Fetches session ID from the server and creates configuration.
   *
   * @param document - Notebook document to enable collaboration for
   * @returns Collaboration configuration or undefined if setup fails
   */
  async setupCollaboration(
    document: NotebookDocument,
  ): Promise<NotebookCollaborationConfig | undefined> {
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

      const config = vscode.workspace.getConfiguration("datalayer");
      const serverUrl = config.get<string>(
        "spacerUrl",
        "https://prod1.datalayer.run",
      );

      // Fetch session ID from the Datalayer server
      const sessionUrl = `${serverUrl}/api/jupyter/datalayer/v1/collaborations/${metadata.document.uid}`;

      const response = await fetch(sessionUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        console.error(
          `[NotebookCollaboration] Failed to fetch session ID: ${response.status} ${response.statusText}`,
        );
        return undefined;
      }

      const data = (await response.json()) as { sessionId?: string };
      const sessionId = data.sessionId;

      if (!sessionId) {
        console.error(
          "[NotebookCollaboration] No session ID in response:",
          data,
        );
        return undefined;
      }

      const user = authState.user;
      const username =
        user?.displayName || user?.handle || user?.email || "Anonymous";

      console.log("[NotebookCollaboration] Setup successful:", {
        documentId: metadata.document.uid,
        sessionId,
        serverUrl,
        username,
      });

      return {
        enabled: true,
        documentId: metadata.document.uid,
        serverUrl,
        token,
        sessionId,
        username,
        userColor: this.generateUserColor(),
      };
    } catch (error) {
      console.error("[NotebookCollaboration] Setup failed:", error);
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
