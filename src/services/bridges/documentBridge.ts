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
import { Document } from "../../models/spaceItem";
import { getServiceContainer } from "../../extension";
import type { DatalayerClient } from "@datalayer/core/lib/client";
import type { RuntimeDTO } from "@datalayer/core/lib/models/RuntimeDTO";
import { DatalayerFileSystemProvider } from "../../providers/documentsFileSystemProvider";
import { detectDocumentType } from "../../utils/documentUtils";

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
  runtime?: RuntimeDTO;
}

/**
 * Promise that resolves when the extension is fully initialized.
 * Used to queue document operations during startup.
 */
let extensionReadyPromise: Promise<void> | null = null;
let extensionReadyResolve: (() => void) | null = null;

/**
 * Notifies DocumentBridge that the extension is ready.
 * Called from extension.ts after successful activation.
 */
export function notifyExtensionReady(): void {
  if (extensionReadyResolve) {
    extensionReadyResolve();
    // Don't nullify the promise - allow it to remain resolved for future waiters
    extensionReadyResolve = null;
  } else if (!extensionReadyPromise) {
    // Extension is ready but promise was never created - create a pre-resolved one
    extensionReadyPromise = Promise.resolve();
  }
}

/**
 * Waits for the extension to be fully initialized.
 * Returns immediately if already ready.
 * Shows progress notification to user during wait.
 *
 * @param timeout - Maximum time to wait in milliseconds (default: 30000)
 * @returns Promise that resolves when extension is ready or rejects on timeout
 */
async function waitForExtensionReady(timeout = 30000): Promise<void> {
  if (!extensionReadyPromise) {
    extensionReadyPromise = new Promise((resolve) => {
      extensionReadyResolve = resolve;
    });
  }

  // Show progress notification to user
  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Loading Datalayer document...",
      cancellable: false,
    },
    async () => {
      // Race between ready promise and timeout
      return Promise.race([
        extensionReadyPromise!,
        new Promise<void>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(
                  "Extension initialization timeout. Please try reopening the document.",
                ),
              ),
            timeout,
          ),
        ),
      ]);
    },
  );
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
  private static sdk: DatalayerClient;
  private static readonly METADATA_STORAGE_KEY = "datalayer.documentMetadata";
  private static context?: vscode.ExtensionContext;

  private documentMetadata: Map<string, DocumentMetadata> = new Map();
  private tempDir: string;
  private activeRuntimes: Set<string> = new Set();

  private constructor(
    context?: vscode.ExtensionContext,
    sdk?: DatalayerClient,
  ) {
    if (!sdk) {
      throw new Error("SDK is required for DocumentBridge");
    }
    // Store SDK and context for later use
    DocumentBridge.sdk = sdk;
    if (context) {
      DocumentBridge.context = context;
      this.loadMetadata();
    }

    // Create a temp directory for Datalayer documents
    this.tempDir = path.join(os.tmpdir(), "datalayer-vscode");
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Load persisted document metadata from storage.
   * Only restores metadata where the local file still exists.
   */
  private loadMetadata(): void {
    if (!DocumentBridge.context) {
      return;
    }

    const saved = DocumentBridge.context.globalState.get<
      Record<string, DocumentMetadata>
    >(DocumentBridge.METADATA_STORAGE_KEY, {});

    // Restore metadata for documents whose files still exist
    for (const [key, value] of Object.entries(saved)) {
      if (value && value.localPath && fs.existsSync(value.localPath)) {
        this.documentMetadata.set(key, value as DocumentMetadata);
      }
    }
  }

  /**
   * Persist document metadata to storage.
   */
  private async saveMetadata(): Promise<void> {
    if (!DocumentBridge.context) {
      return;
    }

    // Convert Map to plain object for storage
    const toSave: Record<string, DocumentMetadata> = {};
    for (const [key, value] of this.documentMetadata.entries()) {
      toSave[key] = value;
    }

    await DocumentBridge.context.globalState.update(
      DocumentBridge.METADATA_STORAGE_KEY,
      toSave,
    );
  }

  /**
   * Gets the singleton instance of DocumentBridge.
   * Waits for extension initialization if necessary.
   *
   * @param context - Extension context (required on first call)
   * @param sdk - SDK instance (required on first call)
   * @returns The singleton instance
   */
  static async getInstanceAsync(
    context?: vscode.ExtensionContext,
    sdk?: DatalayerClient,
  ): Promise<DocumentBridge> {
    // If called during VS Code startup before extension is ready, wait for it
    if (!DocumentBridge.instance && !sdk && !DocumentBridge.sdk) {
      try {
        await waitForExtensionReady();
        // After extension is ready, try to get SDK from service container
        try {
          const container = getServiceContainer();
          sdk = container.sdk;
        } catch {
          // Service container not ready yet, will retry
        }
      } catch (error) {
        throw new Error(
          "Extension failed to initialize in time. Please try reopening the document.",
        );
      }
    }

    if (!DocumentBridge.instance) {
      // Use provided SDK or fall back to stored SDK
      const sdkToUse = sdk || DocumentBridge.sdk;
      if (!sdkToUse) {
        throw new Error(
          "SDK not available. Please ensure you are logged in to Datalayer.",
        );
      }
      DocumentBridge.instance = new DocumentBridge(context, sdkToUse);
    }
    return DocumentBridge.instance;
  }

  /**
   * Gets the singleton instance of DocumentBridge (synchronous).
   * Use getInstanceAsync() for better reliability during startup.
   *
   * @param context - Extension context (required on first call)
   * @param sdk - SDK instance (required on first call)
   * @returns The singleton instance
   * @deprecated Use getInstanceAsync() for documents opened during VS Code startup
   */
  static getInstance(
    context?: vscode.ExtensionContext,
    sdk?: DatalayerClient,
  ): DocumentBridge {
    if (!DocumentBridge.instance) {
      // Use provided SDK or fall back to stored SDK
      const sdkToUse = sdk || DocumentBridge.sdk;
      DocumentBridge.instance = new DocumentBridge(context, sdkToUse);
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
    spaceName?: string,
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
          // Return the virtual URI, not the real file path
          const fileSystemProvider = DatalayerFileSystemProvider.getInstance();
          const existingVirtualUri = fileSystemProvider.getVirtualUri(
            metadata.localPath,
          );

          if (existingVirtualUri) {
            return existingVirtualUri;
          } else {
            // If for some reason the virtual mapping is lost, recreate it
            const cleanName = docName.replace(/\.[^/.]+$/, "");

            // Sanitize space name for URI compatibility
            const sanitizedSpaceName = metadata.spaceName
              ? metadata.spaceName
                  .replace(/:/g, "-")
                  .replace(/[<>"\\|?*]/g, "_")
                  .trim()
              : null;

            const virtualPath = sanitizedSpaceName
              ? `${sanitizedSpaceName}/${cleanName}${extension}`
              : `${cleanName}${extension}`;

            const virtualUri = fileSystemProvider.registerMapping(
              virtualPath,
              metadata.localPath,
            );

            return virtualUri;
          }
        }
      }

      // For Datalayer notebooks and lexical documents, create an empty file - content will come via collaboration
      // For local documents, we need to fetch the content
      if (isNotebook) {
        // Datalayer notebook - create empty notebook structure
        // Content will be synced via Y.js collaboration provider
        const emptyNotebook = {
          cells: [],
          metadata: {},
          nbformat: 4,
          nbformat_minor: 5,
        };
        fs.writeFileSync(localPath, JSON.stringify(emptyNotebook, null, 2));
      } else if (isLexical) {
        // Datalayer lexical document - create empty lexical structure
        // Content will be synced via Loro collaboration provider
        const emptyLexical = {
          root: {
            children: [
              {
                children: [],
                direction: null,
                format: "",
                indent: 0,
                type: "paragraph",
                version: 1,
              },
            ],
            direction: null,
            format: "",
            indent: 0,
            type: "root",
            version: 1,
          },
        };
        fs.writeFileSync(localPath, JSON.stringify(emptyLexical, null, 2));
      } else {
        // Other document types - fetch content
        let content;
        let retries = 3;
        let lastError;

        while (retries > 0) {
          try {
            content = await document.getContent();
            if (content !== undefined && content !== null) {
              break; // Success, exit retry loop
            }
          } catch (error) {
            lastError = error;
          }

          retries--;
          if (retries > 0) {
            // Wait 1 second before retrying
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }

        // Process the fetched content
        if (content === undefined || content === null) {
          throw (
            lastError ||
            new Error(
              `Failed to fetch content for document ${document.uid}: content is ${content}`,
            )
          );
        }

        // Write to local file
        if (typeof content === "string") {
          fs.writeFileSync(localPath, content);
        } else {
          fs.writeFileSync(localPath, JSON.stringify(content, null, 2));
        }
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

      // Document downloaded successfully

      // CRITICAL: Store metadata by UID for methods that need UID-based lookup
      // (clearDocument, ensureRuntime, getMetadataById)
      this.documentMetadata.set(document.uid, metadata);

      // Create a virtual URI that shows clean path structure
      // Sanitize space name for URI compatibility (remove characters that cause URI errors)
      const sanitizedSpaceName = spaceName
        ? spaceName
            .replace(/:/g, "-") // Replace colons with dashes (colons are illegal in URI paths)
            .replace(/[<>"\\|?*]/g, "_") // Replace other problematic characters
            .trim()
        : null;

      // CRITICAL: Include document UID in the path to guarantee uniqueness
      // Multiple documents with the same name in the same space would otherwise collide
      // Format: spaceName/UID/documentName.extension
      // This keeps the filename clean for tab titles while ensuring path uniqueness
      const virtualPath = sanitizedSpaceName
        ? `${sanitizedSpaceName}/${document.uid}/${cleanName}${extension}`
        : `${document.uid}/${cleanName}${extension}`;

      // Register the mapping with the file system provider
      const fileSystemProvider = DatalayerFileSystemProvider.getInstance();
      const virtualUri = fileSystemProvider.registerMapping(
        virtualPath,
        localPath,
      );

      // CRITICAL: Also store metadata by URI for fast O(1) lookups in editor/provider code
      // The UID is embedded in the path, making each URI globally unique
      // This enables direct lookup via getDocumentMetadata(uri)
      this.documentMetadata.set(virtualUri.toString(), metadata);

      // Persist metadata to storage (fire and forget)
      this.saveMetadata();

      // Virtual URI created successfully (UID is embedded in path, no query params needed)
      return virtualUri;
    } catch (error) {
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
    // Direct O(1) lookup by URI
    // Metadata is keyed by virtualUri.toString() which includes the UID in the path
    return this.documentMetadata.get(uri.toString());
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
      } catch (error) {}
    }
  }

  /**
   * Ensures a runtime exists for the document.
   * Verifies cached runtime status or creates a new one if needed.
   *
   * @param documentId - Document UID needing runtime
   * @returns Runtime instance or undefined if creation fails
   */
  async ensureRuntime(documentId: string): Promise<RuntimeDTO | undefined> {
    const metadata = this.documentMetadata.get(documentId);

    // Check if we have a cached runtime, but verify it's still running
    if (metadata?.runtime?.podName) {
      try {
        // Verify the runtime still exists and is running
        const sdk = getServiceContainer().sdk;
        const currentRuntime = await sdk.getRuntime(metadata.runtime.podName);

        if (currentRuntime && currentRuntime.ingress && currentRuntime.token) {
          // Update the cached runtime with fresh data
          metadata.runtime = currentRuntime;
          this.documentMetadata.set(documentId, metadata);

          return currentRuntime;
        } else {
          // Clear the invalid cached runtime
          metadata.runtime = undefined;
          this.documentMetadata.set(documentId, metadata);
        }
      } catch (error) {
        // Clear the invalid cached runtime
        if (metadata) {
          metadata.runtime = undefined;
          this.documentMetadata.set(documentId, metadata);
        }
      }
    }

    // Create or get a runtime
    const sdk = getServiceContainer().sdk;
    const runtime = await sdk.ensureRuntime();

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
        } catch (error) {}
      }
    }

    // Log active runtimes (they should be cleaned up by the platform automatically)

    this.documentMetadata.clear();
    this.activeRuntimes.clear();
  }
}
