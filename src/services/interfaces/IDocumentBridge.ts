/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Document bridge interface for managing document lifecycle.
 * Handles downloading, caching, and runtime association for documents.
 *
 * @module services/interfaces/IDocumentBridge
 */

import * as vscode from "vscode";
import type { Document } from "../../models/spaceItem";
import type { Runtime } from "../../../../core/lib/client/models/Runtime";

/**
 * Metadata for a downloaded document.
 */
export interface DocumentMetadata {
  /** The document from Datalayer */
  document: Document;
  /** ID of the containing space */
  spaceId?: string;
  /** Name of the containing space */
  spaceName?: string;
  /** Local filesystem path */
  localPath: string;
  /** When the document was last downloaded */
  lastDownloaded: Date;
  /** Associated runtime for notebooks */
  runtime?: Runtime;
}

/**
 * Document bridge interface for document lifecycle management.
 * Implementations should handle downloading, caching, and runtime management.
 */
export interface IDocumentBridge {
  /**
   * Opens a document from Datalayer platform.
   * Downloads content, caches locally, and creates virtual URI for VS Code.
   *
   * @param document - The document to open
   * @param spaceId - ID of the containing space
   * @param spaceName - Name of the containing space
   * @returns Virtual URI for the opened document
   */
  openDocument(
    document: Document,
    spaceId?: string,
    spaceName?: string,
  ): Promise<vscode.Uri>;

  /**
   * Gets document metadata by path.
   * Resolves virtual URIs to real paths for lookup.
   *
   * @param inputPath - Virtual or real filesystem path
   * @returns Document metadata if found
   */
  getMetadataByPath(inputPath: string): DocumentMetadata | undefined;

  /**
   * Gets document metadata by document ID.
   *
   * @param documentId - Document UID
   * @returns Document metadata if found
   */
  getMetadataById(documentId: string): DocumentMetadata | undefined;

  /**
   * Gets document metadata by VS Code URI.
   * Handles both real filesystem and virtual URI schemes.
   *
   * @param uri - Document URI
   * @returns Document metadata if found
   */
  getDocumentMetadata(uri: vscode.Uri): DocumentMetadata | undefined;

  /**
   * Clears cached document from filesystem and memory.
   *
   * @param documentId - Document UID to clear
   */
  clearDocument(documentId: string): void;

  /**
   * Ensures a runtime exists for the document.
   * Verifies cached runtime status or creates a new one if needed.
   *
   * @param documentId - Document UID needing runtime
   * @returns Runtime instance or undefined if creation fails
   */
  ensureRuntime(documentId: string): Promise<Runtime | undefined>;

  /**
   * Gets list of active runtime pod names.
   *
   * @returns Array of runtime pod names
   */
  getActiveRuntimes(): string[];
}
