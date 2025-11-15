/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * SaaS Tool Context - Manages document access in browser environment
 *
 * @module tools/adapters/saas/SaaSToolContext
 */

import type { SaaSDocumentHandle } from "./SaaSDocumentHandle";

// Type imports for JupyterLab
/* eslint-disable @typescript-eslint/no-explicit-any */
type JupyterFrontEnd = any; // From @jupyterlab/application
type NotebookPanel = any; // From @jupyterlab/notebook
type DatalayerClient = any; // From @datalayer/core
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * SaaS Tool Context
 *
 * Provides access to open documents, SDK, and authentication in the
 * browser environment. This is the SaaS equivalent of VS Code's
 * extension context.
 *
 * Usage:
 * ```typescript
 * const context = new SaaSToolContext(app, sdk, authProvider);
 *
 * // Get active notebook
 * const notebook = context.getActiveDocument();
 *
 * // Execute operation
 * await insertCellOperation.execute(
 *   { cellType: 'code', cellSource: 'x = 42' },
 *   {
 *     document: context.createDocumentHandle(notebook),
 *     sdk: context.sdk,
 *     auth: context.auth
 *   }
 * );
 * ```
 */
export class SaaSToolContext {
  private documentHandles = new Map<string, SaaSDocumentHandle>();

  constructor(
    private readonly app: JupyterFrontEnd,
    public readonly sdk: DatalayerClient,
    public readonly auth: unknown, // AuthProvider
  ) {}

  /**
   * Get the currently active notebook widget
   */
  getActiveDocument(): NotebookPanel | null {
    const widget = this.app.shell.currentWidget;

    // Check if it's a notebook
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (widget && (widget as any).content?.model) {
      return widget as NotebookPanel;
    }

    return null;
  }

  /**
   * Get a notebook widget by ID
   */
  getDocumentById(id: string): NotebookPanel | null {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const widget = this.app.shell.widgets("main").find((w: any) => w.id === id);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (widget && (widget as any).content?.model) {
      return widget as NotebookPanel;
    }

    return null;
  }

  /**
   * Get all open notebook widgets
   */
  getAllDocuments(): NotebookPanel[] {
    const notebooks: NotebookPanel[] = [];

    for (const widget of this.app.shell.widgets("main")) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((widget as any).content?.model) {
        notebooks.push(widget as NotebookPanel);
      }
    }

    return notebooks;
  }

  /**
   * Creates a DocumentHandle for the given notebook widget
   * Reuses existing handles for performance
   */
  createDocumentHandle(notebook: NotebookPanel): SaaSDocumentHandle {
    const { SaaSDocumentHandle } = require("./SaaSDocumentHandle");

    const id = notebook.id;
    const existingHandle = this.documentHandles.get(id);

    if (existingHandle) {
      return existingHandle;
    }

    const handle = new SaaSDocumentHandle(notebook);
    this.documentHandles.set(id, handle);

    // Clean up when widget is disposed
    notebook.disposed.connect(() => {
      this.documentHandles.delete(id);
    });

    return handle;
  }

  /**
   * Clears all cached document handles
   */
  clearHandles(): void {
    this.documentHandles.clear();
  }
}
