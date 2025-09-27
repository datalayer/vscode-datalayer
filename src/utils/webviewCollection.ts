/*
 * Copyright (c) 2021-2023 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Utility for tracking and managing webview panels.
 * Provides collection management for multiple webviews per document.
 *
 * @module utils/webviewCollection
 */

import * as vscode from "vscode";

/**
 * Tracks all webviews associated with documents.
 * Automatically handles cleanup when webviews are disposed.
 */
export class WebviewCollection {
  private readonly _webviews = new Set<{
    readonly resource: string;
    readonly webviewPanel: vscode.WebviewPanel;
  }>();

  /**
   * Gets all webviews for a given URI.
   *
   * @param uri - Document URI to find webviews for
   * @returns Iterable of webview panels
   */
  public *get(uri: vscode.Uri): Iterable<vscode.WebviewPanel> {
    const key = uri.toString();
    for (const entry of this._webviews) {
      if (entry.resource === key) {
        yield entry.webviewPanel;
      }
    }
  }

  /**
   * Adds a webview to the collection.
   * Automatically sets up disposal cleanup when the webview is closed.
   *
   * @param uri - Document URI to associate with webview
   * @param webviewPanel - The webview panel to track
   */
  public add(uri: vscode.Uri, webviewPanel: vscode.WebviewPanel): void {
    const entry = { resource: uri.toString(), webviewPanel };
    this._webviews.add(entry);

    webviewPanel.onDidDispose(() => {
      this._webviews.delete(entry);
    });
  }
}
