/*
 * Copyright (c) 2021-2023 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Virtual file system provider for Datalayer documents.
 * Maps remote documents to clean datalayer:// URIs for VS Code integration.
 *
 * @module providers/documentsFileSystemProvider
 *
 * @see https://code.visualstudio.com/api/extension-guides/virtual-documents
 */

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

/**
 * Virtual file system provider that maps Datalayer documents to clean URI scheme.
 * Allows VS Code to display "datalayer://Space Name/Notebook.ipynb" instead of temp paths.
 * Persists mappings across VS Code restarts using globalState.
 *
 */
export class DatalayerFileSystemProvider implements vscode.FileSystemProvider {
  private static instance: DatalayerFileSystemProvider;
  private static readonly STORAGE_KEY = "datalayer.documentMappings";

  private virtualToReal: Map<string, string> = new Map();
  private realToVirtual: Map<string, vscode.Uri> = new Map();
  private context?: vscode.ExtensionContext;

  private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  /**
   * Event fired when files change in the virtual file system.
   */
  readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> =
    this._emitter.event;

  private constructor() {}

  /**
   * Gets the singleton instance of DatalayerFileSystemProvider.
   * @returns The singleton provider instance.
   */
  static getInstance(): DatalayerFileSystemProvider {
    if (!DatalayerFileSystemProvider.instance) {
      DatalayerFileSystemProvider.instance = new DatalayerFileSystemProvider();
    }
    return DatalayerFileSystemProvider.instance;
  }

  /**
   * Initializes the provider with extension context for persistent storage.
   * Restores any previously saved mappings from globalState.
   *
   * @param context - Extension context for accessing globalState.
   */
  initialize(context: vscode.ExtensionContext): void {
    this.context = context;
    this.loadMappings();
  }

  /**
   * Loads saved mappings from persistent storage.
   * Only restores mappings where the real file still exists on disk.
   */
  private loadMappings(): void {
    if (!this.context) {
      return;
    }

    const saved = this.context.globalState.get<Record<string, string>>(
      DatalayerFileSystemProvider.STORAGE_KEY,
      {},
    );

    // Restore mappings, but only if the real file still exists
    for (const [virtualUriString, realPath] of Object.entries(saved)) {
      if (fs.existsSync(realPath)) {
        this.virtualToReal.set(virtualUriString, realPath);
        try {
          const virtualUri = vscode.Uri.parse(virtualUriString);
          this.realToVirtual.set(realPath, virtualUri);
        } catch (error) {
          // Skip invalid URIs
        }
      }
    }
  }

  /**
   * Save current mappings to persistent storage.
   */
  private async saveMappings(): Promise<void> {
    if (!this.context) {
      return;
    }

    // Convert Map to plain object for storage
    const toSave: Record<string, string> = {};
    for (const [key, value] of this.virtualToReal.entries()) {
      toSave[key] = value;
    }

    await this.context.globalState.update(
      DatalayerFileSystemProvider.STORAGE_KEY,
      toSave,
    );
  }

  /**
   * Registers a mapping between a virtual URI and a real file path.
   * Persists the mapping to globalState for restoration after restart.
   *
   * @param virtualPath - Clean path for the virtual URI such as "Space Name/Notebook.ipynb".
   * @param realPath - Actual file system path to the document on disk.
   *
   * @returns The created virtual URI with datalayer:// scheme.
   */
  registerMapping(virtualPath: string, realPath: string): vscode.Uri {
    // Sanitize the virtual path to ensure it doesn't contain URI-illegal characters
    // Replace characters that are problematic in URIs (but keep spaces - they'll be encoded)
    const sanitizedPath = virtualPath
      .replace(/:/g, "-") // Replace colons with dashes
      .replace(/[<>"\|?*]/g, "_") // Replace other illegal characters
      .replace(/\/\/+/g, "/"); // Remove duplicate slashes

    // Create a virtual URI with the datalayer scheme
    // Use vscode.Uri.file() to create a file-like URI, then change the scheme
    // This ensures proper encoding of spaces and special characters
    const virtualUri = vscode.Uri.file("/" + sanitizedPath).with({
      scheme: "datalayer",
    });
    const key = virtualUri.toString();

    this.virtualToReal.set(key, realPath);
    this.realToVirtual.set(realPath, virtualUri);

    // Persist mapping to storage (fire and forget)
    this.saveMappings();

    return virtualUri;
  }

  /**
   * Gets the real file path for a virtual URI.
   *
   * @param uri - Virtual URI to resolve to a local file path.
   *
   * @returns Real file path or undefined if no mapping exists.
   */
  getRealPath(uri: vscode.Uri): string | undefined {
    // Strip query parameters from URI before lookup
    // URIs may have query params (e.g., ?docId=xxx) but mappings are stored without them
    const uriWithoutQuery = uri.with({ query: "" });
    return this.virtualToReal.get(uriWithoutQuery.toString());
  }

  /**
   * Gets the virtual URI for a real file path.
   *
   * @param realPath - Real file path to resolve to a virtual URI.
   *
   * @returns Virtual URI or undefined if no mapping exists.
   */
  getVirtualUri(realPath: string): vscode.Uri | undefined {
    return this.realToVirtual.get(realPath);
  }

  /**
   * Removes a mapping for a closed document.
   * Updates persistent storage accordingly.
   *
   * @param uri - Virtual URI whose mapping should be removed.
   */
  removeMapping(uri: vscode.Uri): void {
    const key = uri.toString();
    const realPath = this.virtualToReal.get(key);

    if (realPath) {
      this.realToVirtual.delete(realPath);
    }
    this.virtualToReal.delete(key);

    // Persist the change (fire and forget)
    this.saveMappings();
  }

  /**
   * Watches a file or directory for changes.
   *
   * @param _uri - The URI to watch for changes.
   *
   * @returns A disposable that stops watching when disposed.
   */
  watch(_uri: vscode.Uri): vscode.Disposable {
    return new vscode.Disposable(() => {});
  }

  /**
   * Gets metadata about a file or directory.
   *
   * @param uri - The URI of the file or directory to inspect.
   *
   * @returns File stat containing type, timestamps, and size.
   *
   * @throws If the file is not found.
   *
   */
  stat(uri: vscode.Uri): vscode.FileStat {
    const realPath = this.getRealPath(uri);
    if (!realPath || !fs.existsSync(realPath)) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }

    const stats = fs.statSync(realPath);
    return {
      type: stats.isDirectory()
        ? vscode.FileType.Directory
        : vscode.FileType.File,
      ctime: stats.ctimeMs,
      mtime: stats.mtimeMs,
      size: stats.size,
    };
  }

  /**
   * Reads the contents of a directory.
   *
   * @param uri - The URI of the directory to list.
   *
   * @returns Array of name and type tuples representing directory entries.
   *
   * @throws If the directory is not found.
   *
   */
  readDirectory(uri: vscode.Uri): [string, vscode.FileType][] {
    const realPath = this.getRealPath(uri);
    if (!realPath || !fs.existsSync(realPath)) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }

    const entries = fs.readdirSync(realPath);
    const result: [string, vscode.FileType][] = [];

    for (const entry of entries) {
      const entryPath = path.join(realPath, entry);
      const stats = fs.statSync(entryPath);
      result.push([
        entry,
        stats.isDirectory() ? vscode.FileType.Directory : vscode.FileType.File,
      ]);
    }

    return result;
  }

  /**
   * Creates a new directory at the given URI.
   *
   * @param uri - The URI of the directory to create.
   *
   * @throws If the URI has no mapping.
   */
  createDirectory(uri: vscode.Uri): void {
    const realPath = this.getRealPath(uri);
    if (!realPath) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }

    if (!fs.existsSync(realPath)) {
      fs.mkdirSync(realPath, { recursive: true });
    }
  }

  /**
   * Reads the contents of a file from the mapped real path.
   * Mappings are restored from persistent storage during initialization,
   * so this should always find the real path for valid documents.
   *
   * @param uri - The URI of the file to read.
   *
   * @returns The file contents as a byte array.
   *
   * @throws If the file is not found or has no mapping.
   */
  readFile(uri: vscode.Uri): Uint8Array {
    const realPath = this.getRealPath(uri);

    if (!realPath) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }

    if (!fs.existsSync(realPath)) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }

    return new Uint8Array(fs.readFileSync(realPath));
  }

  /**
   * Writes data to a file at the mapped real path.
   *
   * @param uri - The URI of the file to write.
   * @param content - The binary content to write to disk.
   * @param options - Write options controlling create and overwrite behavior.
   * @param options.create - Whether to create the file if it does not exist.
   * @param options.overwrite - Whether to overwrite existing file content.
   *
   * @throws If the file is not found or cannot be written.
   */
  writeFile(
    uri: vscode.Uri,
    content: Uint8Array,
    options: { create: boolean; overwrite: boolean },
  ): void {
    const realPath = this.getRealPath(uri);
    if (!realPath) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }

    if (!options.create && !fs.existsSync(realPath)) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }

    if (!options.overwrite && fs.existsSync(realPath)) {
      throw vscode.FileSystemError.FileExists(uri);
    }

    const dirPath = path.dirname(realPath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    fs.writeFileSync(realPath, content);
    this._emitter.fire([{ type: vscode.FileChangeType.Changed, uri }]);
  }

  /**
   * Deletes a file or directory and removes its mapping.
   *
   * @param uri - The URI of the resource to delete.
   * @param options - Delete options controlling recursive behavior.
   * @param options.recursive - Whether to delete directory contents recursively.
   *
   * @throws If the file or directory is not found.
   */
  delete(uri: vscode.Uri, options: { recursive: boolean }): void {
    const realPath = this.getRealPath(uri);
    if (!realPath || !fs.existsSync(realPath)) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }

    const stats = fs.statSync(realPath);
    if (stats.isDirectory()) {
      if (options.recursive) {
        fs.rmSync(realPath, { recursive: true, force: true });
      } else {
        fs.rmdirSync(realPath);
      }
    } else {
      fs.unlinkSync(realPath);
    }

    this.virtualToReal.delete(uri.toString());
    this.realToVirtual.delete(realPath);
    this._emitter.fire([{ type: vscode.FileChangeType.Deleted, uri }]);
  }

  /**
   * Renames or moves a file or directory and updates mappings.
   *
   * @param oldUri - The current URI of the resource.
   * @param newUri - The target URI after the rename or move.
   * @param options - Rename options controlling overwrite behavior.
   * @param options.overwrite - Whether to overwrite if target already exists.
   *
   * @throws If the source or target is not found or already exists.
   */
  rename(
    oldUri: vscode.Uri,
    newUri: vscode.Uri,
    options: { overwrite: boolean },
  ): void {
    const oldRealPath = this.getRealPath(oldUri);
    const newRealPath = this.getRealPath(newUri);

    if (!oldRealPath || !fs.existsSync(oldRealPath)) {
      throw vscode.FileSystemError.FileNotFound(oldUri);
    }

    if (!newRealPath) {
      throw vscode.FileSystemError.FileNotFound(newUri);
    }

    if (!options.overwrite && fs.existsSync(newRealPath)) {
      throw vscode.FileSystemError.FileExists(newUri);
    }

    fs.renameSync(oldRealPath, newRealPath);

    this.virtualToReal.delete(oldUri.toString());
    this.realToVirtual.delete(oldRealPath);
    this.virtualToReal.set(newUri.toString(), newRealPath);
    this.realToVirtual.set(newRealPath, newUri);

    this._emitter.fire([
      { type: vscode.FileChangeType.Deleted, uri: oldUri },
      { type: vscode.FileChangeType.Created, uri: newUri },
    ]);
  }

  /**
   * Clean up all mappings.
   */
  dispose(): void {
    this.virtualToReal.clear();
    this.realToVirtual.clear();
  }
}
