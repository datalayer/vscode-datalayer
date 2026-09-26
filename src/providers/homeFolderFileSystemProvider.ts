/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * The caller's Datalayer Home Folders as a VS Code file system.
 *
 * `datalayer-home:/reports/earth.csv` reads from the shared filesystem — what
 * a sandbox wrote as well as what was uploaded — and writes through the same
 * transfer contract as the web browser, JupyterLab and the CLI: created,
 * parts checksummed, completed, resumed from the verified parts when a save
 * is retried. There is no second upload implementation here.
 *
 * @module providers/homeFolderFileSystemProvider
 */

import {
  deleteHomeFolderObject,
  listHomeFolderFiles,
  readHomeFolderFile,
  statHomeFolderObject,
  uploadHomeFolderFile,
} from "@datalayer/core/lib/api/contents";
import { createHash, randomUUID } from "crypto";
import * as vscode from "vscode";

/** The URI scheme the provider is registered for. */
export const HOME_FOLDER_SCHEME = "datalayer-home";

/** Where the service is and who is asking, resolved at each call. */
export type HomeFolderConnection = () =>
  { contentsUrl: string; token: string } | undefined;

const basename = (path: string): string =>
  path.split("/").filter(Boolean).pop() ?? "";

const dirname = (path: string): string => {
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
};

/**
 * Serves the `datalayer-home:` scheme over the Contents service's Home Folder
 * API, resolving the service URL and token on every call so that signing out
 * takes effect immediately.
 */
export class HomeFolderFileSystemProvider implements vscode.FileSystemProvider {
  private readonly _emitter = new vscode.EventEmitter<
    vscode.FileChangeEvent[]
  >();

  /** File change events, fired after a successful write, delete or rename. */
  readonly onDidChangeFile = this._emitter.event;

  constructor(private readonly connection: HomeFolderConnection) {}

  /**
   * Resolves the connection or fails the operation when nobody is signed in.
   *
   * @returns The Contents service URL and the caller's token.
   *
   * @throws {vscode.FileSystemError} `NoPermissions` when signed out.
   */
  private _connected(): { contentsUrl: string; token: string } {
    const connection = this.connection();
    if (!connection) {
      throw vscode.FileSystemError.NoPermissions(
        "Sign in to Datalayer to open the Home Folder.",
      );
    }
    return connection;
  }

  /**
   * The Home Folder path of a URI: its path without the leading slash.
   *
   * @param uri - A `datalayer-home:` URI.
   *
   * @returns The path relative to the Home Folder root.
   */
  private static _path(uri: vscode.Uri): string {
    return uri.path.replace(/^\/+/, "");
  }

  /**
   * Watching is not supported by the service: changes made elsewhere show up
   * on the next read.
   *
   * @returns A disposable that does nothing.
   */
  watch(): vscode.Disposable {
    return new vscode.Disposable(() => undefined);
  }

  /**
   * Describes a file or folder by finding it in its parent's listing.
   *
   * @param uri - The entry to describe.
   *
   * @returns The entry's type, timestamps and size.
   *
   * @throws {vscode.FileSystemError} `FileNotFound` when the parent has no such entry.
   */
  async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
    const path = HomeFolderFileSystemProvider._path(uri);
    const { contentsUrl, token } = this._connected();
    if (path === "") {
      return { type: vscode.FileType.Directory, ctime: 0, mtime: 0, size: 0 };
    }
    const parent = await listHomeFolderFiles(token, dirname(path), contentsUrl);
    const entry = parent.items.find(
      (item) => basename(String(item.path)) === basename(path),
    );
    if (!entry) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
    const modified = entry.modifiedAt
      ? Date.parse(String(entry.modifiedAt))
      : 0;
    return {
      type: entry.isDirectory
        ? vscode.FileType.Directory
        : vscode.FileType.File,
      ctime: modified,
      mtime: modified,
      size: Number(entry.size ?? 0),
    };
  }

  /**
   * Lists a folder.
   *
   * @param uri - The folder to list.
   *
   * @returns Each entry's name and type.
   */
  async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
    const { contentsUrl, token } = this._connected();
    const listing = await listHomeFolderFiles(
      token,
      HomeFolderFileSystemProvider._path(uri),
      contentsUrl,
    );
    return listing.items.map((item) => [
      basename(String(item.path)),
      item.isDirectory ? vscode.FileType.Directory : vscode.FileType.File,
    ]);
  }

  /**
   * Folders are implicit in the Home Folder: one appears when a file is
   * saved into it, so there is nothing to create.
   *
   * @param uri - The folder that was asked for.
   *
   * @throws {vscode.FileSystemError} `NoPermissions`, always.
   */
  createDirectory(uri: vscode.Uri): void {
    throw vscode.FileSystemError.NoPermissions(
      `A folder appears in the Home Folder when a file is saved into it (${uri.path}).`,
    );
  }

  /**
   * Reads a file's bytes.
   *
   * @param uri - The file to read.
   *
   * @returns The file content.
   */
  async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    const { contentsUrl, token } = this._connected();
    const { body } = await readHomeFolderFile(
      token,
      HomeFolderFileSystemProvider._path(uri),
      {},
      contentsUrl,
    );
    return new Uint8Array(body);
  }

  /**
   * Saves a file through the resumable transfer contract, honouring VS Code's
   * `create` and `overwrite` options the way the service's own `reject`
   * mode does: an existing file is only replaced when `overwrite` is set,
   * and a missing file is only created when `create` is set.
   *
   * @param uri - The file to write.
   * @param content - The bytes to save.
   * @param options - VS Code's write options.
   * @param options.create - Whether to create the file if it does not exist.
   * @param options.overwrite - Whether to replace an existing file.
   *
   * @throws {vscode.FileSystemError} `FileNotFound` when the file is missing and `create` is false; `FileExists` when it exists and `overwrite` is false.
   */
  async writeFile(
    uri: vscode.Uri,
    content: Uint8Array,
    options: { readonly create: boolean; readonly overwrite: boolean },
  ): Promise<void> {
    const { contentsUrl, token } = this._connected();
    const path = HomeFolderFileSystemProvider._path(uri);
    const exists = await this._exists(uri);
    if (!exists && !options.create) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
    if (exists && !options.overwrite) {
      throw vscode.FileSystemError.FileExists(uri);
    }
    await uploadHomeFolderFile(
      token,
      path,
      content,
      {
        // One key per path and content: the retry of an interrupted save
        // resumes the transfer it started rather than opening a second, and
        // a different payload of the same size is a different transfer.
        idempotencyKey: `vscode-home-folder:${path}:${digest(content)}`,
        overwrite: exists ? "new-version" : "reject",
      },
      contentsUrl,
    );
    this._emitter.fire([{ type: vscode.FileChangeType.Changed, uri }]);
  }

  /**
   * Deletes a file: the object is located by path, then deleted by uid.
   *
   * @param uri - The file to delete.
   */
  async delete(uri: vscode.Uri): Promise<void> {
    const { contentsUrl, token } = this._connected();
    const object = await statHomeFolderObject(
      token,
      HomeFolderFileSystemProvider._path(uri),
      contentsUrl,
    );
    await deleteHomeFolderObject(
      token,
      object.uid,
      `vscode-home-folder:delete:${randomUUID()}`,
      contentsUrl,
    );
    this._emitter.fire([{ type: vscode.FileChangeType.Deleted, uri }]);
  }

  /**
   * Renames a file by copying its content to the new path and deleting the
   * old object: the service has no rename call.
   *
   * @param oldUri - The current path.
   * @param newUri - The new path.
   * @param options - VS Code's rename options.
   * @param options.overwrite - Whether an existing file at the new path may be replaced.
   */
  async rename(
    oldUri: vscode.Uri,
    newUri: vscode.Uri,
    options: { readonly overwrite: boolean },
  ): Promise<void> {
    const content = await this.readFile(oldUri);
    await this.writeFile(newUri, content, {
      create: true,
      overwrite: options.overwrite,
    });
    await this.delete(oldUri);
  }

  /**
   * Whether a file exists, as `stat` sees it.
   *
   * @param uri - The file to look for.
   *
   * @returns True when the parent listing has the entry.
   */
  private async _exists(uri: vscode.Uri): Promise<boolean> {
    try {
      await this.stat(uri);
      return true;
    } catch (error) {
      if (
        error instanceof vscode.FileSystemError &&
        error.code === "FileNotFound"
      ) {
        return false;
      }
      throw error;
    }
  }
}

/**
 * The SHA-256 digest of a payload, in hex.
 *
 * @param content - The bytes to hash.
 *
 * @returns Sixty-four lowercase hex characters, stable across retries of the same payload.
 */
const digest = (content: Uint8Array): string =>
  createHash("sha256").update(content).digest("hex");
