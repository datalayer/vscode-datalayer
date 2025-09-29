/*
 * Copyright (c) 2021-2023 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Document lifecycle management between Datalayer platform and VS Code.
 * Handles downloading, caching, and runtime association for documents.
 *
 * @module services/documentBridge
 */

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { Document } from "../models/spaceItem";
import { getSDKInstance } from "./sdkAdapter";
import type { DatalayerSDK } from "../../../core/lib/index.js";
import type { Runtime } from "../../../core/lib/index.js";
import { DatalayerFileSystemProvider } from "../providers/documentsFileSystemProvider";
import { detectDocumentType } from "../utils/documentUtils";

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
 * Manages document lifecycle between Datalayer platform and local filesystem.
 * Singleton service that handles document caching and runtime association.
 *
 * @example
 * ```typescript
 * const bridge = DocumentBridge.getInstance(context);
 * const uri = await bridge.openDocument(document, spaceId, spaceName);
 * ```
 */
export class DocumentBridge {
  private static instance: DocumentBridge;
  private sdk: DatalayerSDK;
  private documentMetadata: Map<string, DocumentMetadata> = new Map();
  private tempDir: string;
  private activeRuntimes: Set<string> = new Set();

  private constructor(context?: vscode.ExtensionContext, sdk?: DatalayerSDK) {
    if (!sdk) {
      throw new Error("SDK is required for DocumentBridge");
    }
    this.sdk = sdk;
    // Create a temp directory for Datalayer documents
    this.tempDir = path.join(os.tmpdir(), "datalayer-vscode");
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Gets the singleton instance of DocumentBridge.
   *
   * @param context - Extension context (required on first call)
   * @param sdk - SDK instance (required on first call)
   * @returns The singleton instance
   */
  static getInstance(
    context?: vscode.ExtensionContext,
    sdk?: DatalayerSDK
  ): DocumentBridge {
    if (!DocumentBridge.instance) {
      DocumentBridge.instance = new DocumentBridge(context, sdk);
    }
    return DocumentBridge.instance;
  }

  /**
   * Opens a document from Datalayer platform.
   * Downloads content, caches locally, and creates virtual URI for VS Code.
   *
   * @param document - The document to open
   * @param spaceId - ID of the containing space
   * @param spaceName - Name of the containing space
   * @returns Virtual URI for the opened document
   */
  async openDocument(
    document: Document,
    spaceId?: string,
    spaceName?: string
  ): Promise<vscode.Uri> {
    // Use SDK model properties directly
    const docName = document.name;
    const typeInfo = detectDocumentType(document);
    const { isNotebook, isLexical } = typeInfo;

    try {
      // Create a clean filename without UID visible
      const extension = isNotebook ? ".ipynb" : isLexical ? ".lexical" : "";
      const cleanName = docName.replace(/\.[^/.]+$/, "");

      // Create a subdirectory using the space name for better organization
      // Sanitize the space name to be filesystem-friendly
      const safeSpaceName = (spaceName ?? "Untitled Space")
        .replace(/[<>:"/\\|?*]/g, "_") // Replace invalid filesystem characters
        .trim();

      const spaceDir = path.join(this.tempDir, safeSpaceName);
      if (!fs.existsSync(spaceDir)) {
        fs.mkdirSync(spaceDir, { recursive: true });
      }

      // Use the clean name for the file
      // If there's a conflict, append the UID to make it unique
      let fileName = cleanName + extension;
      let localPath = path.join(spaceDir, fileName);

      // Check if a different document with the same name already exists
      const existingMetadata = this.getMetadataByPath(localPath);
      if (existingMetadata && existingMetadata.document.uid !== document.uid) {
        // Append a short version of the UID to make it unique
        fileName = `${cleanName}_${document.uid.substring(0, 8)}${extension}`;
        localPath = path.join(spaceDir, fileName);
      }

      // Check if we already have this document open
      if (this.documentMetadata.has(document.uid)) {
        const metadata = this.documentMetadata.get(document.uid)!;
        if (fs.existsSync(metadata.localPath)) {
          console.log(
            "[DocumentBridge] Document already cached:",
            metadata.localPath
          );

          // Return the virtual URI, not the real file path
          const fileSystemProvider = DatalayerFileSystemProvider.getInstance();
          const existingVirtualUri = fileSystemProvider.getVirtualUri(
            metadata.localPath
          );

          if (existingVirtualUri) {
            console.log(
              "[DocumentBridge] Returning existing virtual URI:",
              existingVirtualUri.toString()
            );
            return existingVirtualUri;
          } else {
            // If for some reason the virtual mapping is lost, recreate it
            const cleanName = docName.replace(/\.[^/.]+$/, "");
            const virtualPath = metadata.spaceName
              ? `${metadata.spaceName}/${cleanName}${extension}`
              : `${cleanName}${extension}`;

            const virtualUri = fileSystemProvider.registerMapping(
              virtualPath,
              metadata.localPath
            );

            console.log(
              "[DocumentBridge] Recreated virtual URI for cached file:",
              virtualUri.toString()
            );
            return virtualUri;
          }
        }
      }

      // Fetch the document content - both Notebook and Lexical models have getContent() method
      const content = await document.getContent();

      console.log("[DocumentBridge] Raw content fetched:", content);
      console.log("[DocumentBridge] Content type:", typeof content);
      if (typeof content === "object") {
        console.log("[DocumentBridge] Content keys:", Object.keys(content));
        console.log(
          "[DocumentBridge] Content stringified preview:",
          JSON.stringify(content).substring(0, 500)
        );
      }

      // Write to local file
      if (typeof content === "string") {
        fs.writeFileSync(localPath, content);
      } else {
        fs.writeFileSync(localPath, JSON.stringify(content, null, 2));
      }

      // Verify the file was written successfully and wait a bit for filesystem
      if (!fs.existsSync(localPath)) {
        throw new Error(`Failed to write file to ${localPath}`);
      }

      // Small delay to ensure file system operations are complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Double-check the file exists after the delay
      if (!fs.existsSync(localPath)) {
        throw new Error(`File disappeared after writing: ${localPath}`);
      }

      // Store metadata
      const metadata: DocumentMetadata = {
        document,
        spaceId,
        spaceName,
        localPath,
        lastDownloaded: new Date(),
      };
      this.documentMetadata.set(document.uid, metadata);

      console.log("[DocumentBridge] Document downloaded to:", localPath);
      console.log("[DocumentBridge] File exists:", fs.existsSync(localPath));
      console.log("[DocumentBridge] File size:", fs.statSync(localPath).size);

      // Create a virtual URI that shows clean path structure
      const virtualPath = spaceName
        ? `${spaceName}/${cleanName}${extension}`
        : `${cleanName}${extension}`;

      // Register the mapping with the file system provider
      const fileSystemProvider = DatalayerFileSystemProvider.getInstance();
      const virtualUri = fileSystemProvider.registerMapping(
        virtualPath,
        localPath
      );

      console.log(
        "[DocumentBridge] Virtual URI created:",
        virtualUri.toString()
      );

      return virtualUri;
    } catch (error) {
      console.error("[DocumentBridge] Error opening document:", error);
      throw error;
    }
  }

  /**
   * Gets document metadata by path.
   * Resolves virtual URIs to real paths for lookup.
   *
   * @param inputPath - Virtual or real filesystem path
   * @returns Document metadata if found
   */
  getMetadataByPath(inputPath: string): DocumentMetadata | undefined {
    let realPath = inputPath;

    // If this looks like a virtual URI path, resolve it to real path
    if (inputPath.startsWith("datalayer:/")) {
      const fileSystemProvider = DatalayerFileSystemProvider.getInstance();
      const virtualUri = vscode.Uri.parse(inputPath);
      const resolved = fileSystemProvider.getRealPath(virtualUri);
      if (resolved) {
        realPath = resolved;
      }
    }

    for (const metadata of this.documentMetadata.values()) {
      if (metadata.localPath === realPath) {
        return metadata;
      }
    }
    return undefined;
  }

  /**
   * Gets document metadata by document ID.
   *
   * @param documentId - Document UID
   * @returns Document metadata if found
   */
  getMetadataById(documentId: string): DocumentMetadata | undefined {
    return this.documentMetadata.get(documentId);
  }

  /**
   * Gets document metadata by VS Code URI.
   * Handles both real filesystem and virtual URI schemes.
   *
   * @param uri - Document URI
   * @returns Document metadata if found
   */
  getDocumentMetadata(uri: vscode.Uri): DocumentMetadata | undefined {
    // Try to find metadata by matching the localPath
    for (const [id, metadata] of this.documentMetadata.entries()) {
      // Check if the URI matches the local path
      if (uri.fsPath === metadata.localPath) {
        return metadata;
      }
      // Also check for virtual URIs
      if (uri.scheme === "datalayer") {
        // Virtual URIs may have been mapped, check if this document ID matches
        if (metadata.document.uid === id) {
          return metadata;
        }
      }
    }
    return undefined;
  }

  /**
   * Clears cached document from filesystem and memory.
   *
   * @param documentId - Document UID to clear
   */
  clearDocument(documentId: string): void {
    const metadata = this.documentMetadata.get(documentId);
    if (metadata && fs.existsSync(metadata.localPath)) {
      try {
        fs.unlinkSync(metadata.localPath);
        this.documentMetadata.delete(documentId);
      } catch (error) {
        console.error("[DocumentBridge] Error clearing document:", error);
      }
    }
  }

  /**
   * Ensures a runtime exists for the document.
   * Verifies cached runtime status or creates a new one if needed.
   *
   * @param documentId - Document UID needing runtime
   * @returns Runtime instance or undefined if creation fails
   */
  async ensureRuntime(documentId: string): Promise<Runtime | undefined> {
    const metadata = this.documentMetadata.get(documentId);

    // Check if we have a cached runtime, but verify it's still running
    if (metadata?.runtime?.podName) {
      console.log(
        "[DocumentBridge] Checking if cached runtime is still active:",
        metadata.runtime.podName
      );

      try {
        // Verify the runtime still exists and is running
        const sdk = getSDKInstance();
        const currentRuntime = await (sdk as any).getRuntime(
          metadata.runtime.podName
        );

        if (
          currentRuntime &&
          (currentRuntime.status === "running" ||
            currentRuntime.status === "ready") &&
          currentRuntime.ingress &&
          currentRuntime.token
        ) {
          console.log(
            "[DocumentBridge] Cached runtime is still active:",
            currentRuntime.pod_name
          );

          // Update the cached runtime with fresh data
          metadata.runtime = currentRuntime;
          this.documentMetadata.set(documentId, metadata);

          return currentRuntime;
        } else {
          console.log(
            "[DocumentBridge] Cached runtime is no longer active or missing URLs, will create new one"
          );
          // Clear the invalid cached runtime
          metadata.runtime = undefined;
          this.documentMetadata.set(documentId, metadata);
        }
      } catch (error) {
        console.warn(
          "[DocumentBridge] Failed to verify cached runtime, will create new one:",
          error
        );
        // Clear the invalid cached runtime
        if (metadata) {
          metadata.runtime = undefined;
          this.documentMetadata.set(documentId, metadata);
        }
      }
    }

    // Create or get a runtime
    const sdk = getSDKInstance();
    const runtime = await (sdk as any).ensureRuntime();

    // Store the runtime with the document metadata
    if (runtime && metadata) {
      metadata.runtime = runtime;
      this.documentMetadata.set(documentId, metadata);

      // Track active runtimes
      if (runtime.podName) {
        this.activeRuntimes.add(runtime.podName);
      }
    }

    return runtime;
  }

  /**
   * Gets list of active runtime pod names.
   *
   * @returns Array of runtime pod names
   */
  getActiveRuntimes(): string[] {
    return Array.from(this.activeRuntimes);
  }

  /**
   * Cleans up temporary files and metadata on disposal.
   * Removes cached documents and clears runtime tracking.
   */
  dispose(): void {
    // Clean up temp files
    for (const metadata of this.documentMetadata.values()) {
      if (fs.existsSync(metadata.localPath)) {
        try {
          fs.unlinkSync(metadata.localPath);
          // Also try to remove the space directory if it's empty
          const dirPath = path.dirname(metadata.localPath);
          const files = fs.readdirSync(dirPath);
          if (files.length === 0) {
            fs.rmdirSync(dirPath);
          }
        } catch (error) {
          console.error("[DocumentBridge] Error cleaning up file:", error);
        }
      }
    }

    // Log active runtimes (they should be cleaned up by the platform automatically)
    if (this.activeRuntimes.size > 0) {
      console.log(
        "[DocumentBridge] Active runtimes at shutdown:",
        Array.from(this.activeRuntimes)
      );
    }

    this.documentMetadata.clear();
    this.activeRuntimes.clear();
  }
}
