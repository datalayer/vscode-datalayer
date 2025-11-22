/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Unified Document Registry
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

type DocumentType = "notebook" | "lexical";

interface DocumentRegistryEntry {
  documentId: string;
  documentUri: string;
  type: DocumentType;
}

/**
 * Bidirectional registry for document ID ↔ document URI mapping
 * Handles both notebooks (.ipynb) and lexical documents (.lexical)
 */
class DocumentRegistry {
  /**
   * Map from documentId → entry
   * - Local: "file:///path/to/doc.ipynb" → {id, uri, type: "notebook"}
   * - Remote: "01KAJ42KE2XKM7NBNZV568KXQX" → {id, uri: "datalayer://...", type: "notebook"}
   */
  private idToEntry = new Map<string, DocumentRegistryEntry>();

  /**
   * Map from documentUri → documentId
   * Reverse lookup for when we have URI but need ID
   */
  private uriToId = new Map<string, string>();

  /**
   * Register a document with its ID, URI, and type
   *
   * @param documentId - Document identifier (UID for remote, URI for local)
   * @param documentUri - VS Code document URI
   * @param type - Document type (notebook or lexical)
   */
  register(documentId: string, documentUri: string, type: DocumentType): void {
    const entry: DocumentRegistryEntry = {
      documentId,
      documentUri,
      type,
    };
    this.idToEntry.set(documentId, entry);
    this.uriToId.set(documentUri, documentId);

    console.log(
      `[DocumentRegistry] Registered ${type}: ${documentId.substring(0, 20)}... → ${documentUri.substring(0, 50)}...`,
    );
  }

  /**
   * Unregister a document by its URI (called when webview is closed)
   *
   * @param documentUri - VS Code document URI
   */
  unregisterByUri(documentUri: string): void {
    const documentId = this.uriToId.get(documentUri);
    if (documentId) {
      const entry = this.idToEntry.get(documentId);
      this.idToEntry.delete(documentId);
      this.uriToId.delete(documentUri);

      console.log(
        `[DocumentRegistry] Unregistered ${entry?.type || "unknown"}: ${documentUri.substring(0, 50)}...`,
      );
    }
  }

  /**
   * Convert document ID to document URI
   *
   * @param documentId - Document identifier
   * @returns Document URI
   * @throws Error if documentId is not registered
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
   * Convert document URI to document ID
   *
   * @param documentUri - Document URI
   * @returns Document ID
   * @throws Error if documentUri is not registered
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
   * Get full registry entry for a document ID
   *
   * @param documentId - Document identifier
   * @returns Registry entry with id, uri, and type
   * @throws Error if documentId is not registered
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
   * Check if a document is registered
   *
   * @param documentId - Document identifier
   * @returns True if registered
   */
  has(documentId: string): boolean {
    return this.idToEntry.has(documentId);
  }

  /**
   * Get document type (notebook or lexical)
   *
   * @param documentId - Document identifier
   * @returns Document type
   * @throws Error if documentId is not registered
   */
  getType(documentId: string): DocumentType {
    return this.getEntry(documentId).type;
  }

  /**
   * Get all registered document IDs
   *
   * @returns Array of document IDs
   */
  getAllIds(): string[] {
    return Array.from(this.idToEntry.keys());
  }

  /**
   * Get all registered documents of a specific type
   *
   * @param type - Document type to filter by
   * @returns Array of registry entries
   */
  getByType(type: DocumentType): DocumentRegistryEntry[] {
    return Array.from(this.idToEntry.values()).filter(
      (entry) => entry.type === type,
    );
  }

  /**
   * Clear all registrations (for testing)
   */
  clear(): void {
    this.idToEntry.clear();
    this.uriToId.clear();
    console.log("[DocumentRegistry] Cleared all registrations");
  }

  /**
   * Get registry statistics
   */
  getStats(): {
    total: number;
    notebooks: number;
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
 * Export the class for ServiceContainer to instantiate
 */
export { DocumentRegistry };
