/*
 * Copyright (c) 2023-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
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

import * as vscode from "vscode";
import {
  deleteHomeFolderObject,
  listHomeFolderFiles,
  readHomeFolderFile,
  statHomeFolderObject,
  uploadHomeFolderFile,
} from "@datalayer/core/lib/api/contents";

export const HOME_FOLDER_SCHEME = "datalayer-home";

/** Where the service is and who is asking, resolved at each call. */
export type HomeFolderConnection = () => { contentsUrl: string; token: string } | undefined;

const basename = (path: string): string => path.split("/").filter(Boolean).pop() ?? "";

const dirname = (path: string): string => {
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
};

export class HomeFolderFileSystemProvider implements vscode.FileSystemProvider {
  private readonly _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  readonly onDidChangeFile = this._emitter.event;

  constructor(private readonly connection: HomeFolderConnection) {}

  private _connected(): { contentsUrl: string; token: string } {
    const connection = this.connection();
    if (!connection) {
      throw vscode.FileSystemError.NoPermissions("Sign in to Datalayer to open the Home Folder.");
    }
    return connection;
  }

  private static _path(uri: vscode.Uri): string {
    return uri.path.replace(/^\/+/, "");
  }

  watch(): vscode.Disposable {
    return new vscode.Disposable(() => undefined);
  }

  async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
    const path = HomeFolderFileSystemProvider._path(uri);
    const { contentsUrl, token } = this._connected();
    if (path === "") {
      return { type: vscode.FileType.Directory, ctime: 0, mtime: 0, size: 0 };
    }
    const parent = await listHomeFolderFiles(token, dirname(path), contentsUrl);
    const entry = parent.items.find(item => basename(String(item.path)) === basename(path));
    if (!entry) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
    const modified = entry.modifiedAt ? Date.parse(String(entry.modifiedAt)) : 0;
    return {
      type: entry.isDirectory ? vscode.FileType.Directory : vscode.FileType.File,
      ctime: modified,
      mtime: modified,
      size: Number(entry.size ?? 0),
    };
  }

  async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
    const { contentsUrl, token } = this._connected();
    const listing = await listHomeFolderFiles(token, HomeFolderFileSystemProvider._path(uri), contentsUrl);
    return listing.items.map(item => [
      basename(String(item.path)),
      item.isDirectory ? vscode.FileType.Directory : vscode.FileType.File,
    ]);
  }

  createDirectory(uri: vscode.Uri): void {
    throw vscode.FileSystemError.NoPermissions(
      `A folder appears in the Home Folder when a file is saved into it (${uri.path}).`,
    );
  }

  async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    const { contentsUrl, token } = this._connected();
    const { body } = await readHomeFolderFile(token, HomeFolderFileSystemProvider._path(uri), {}, contentsUrl);
    return new Uint8Array(body);
  }

  async writeFile(uri: vscode.Uri, content: Uint8Array): Promise<void> {
    const { contentsUrl, token } = this._connected();
    const path = HomeFolderFileSystemProvider._path(uri);
    await uploadHomeFolderFile(
      token,
      path,
      content,
      {
        // One key per file and size: the retry of an interrupted save resumes
        // the transfer it started rather than opening a second.
        idempotencyKey: `vscode-home-folder:${path}:${content.byteLength}`,
        overwrite: "new-version",
      },
      contentsUrl,
    );
    this._emitter.fire([{ type: vscode.FileChangeType.Changed, uri }]);
  }

  async delete(uri: vscode.Uri): Promise<void> {
    const { contentsUrl, token } = this._connected();
    const object = await statHomeFolderObject(token, HomeFolderFileSystemProvider._path(uri), contentsUrl);
    await deleteHomeFolderObject(token, object.uid, contentsUrl);
    this._emitter.fire([{ type: vscode.FileChangeType.Deleted, uri }]);
  }

  async rename(oldUri: vscode.Uri, newUri: vscode.Uri): Promise<void> {
    const content = await this.readFile(oldUri);
    await this.writeFile(newUri, content);
    await this.delete(oldUri);
  }
}
