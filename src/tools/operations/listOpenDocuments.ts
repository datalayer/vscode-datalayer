/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * VS Code-specific tool: List all open Datalayer documents
 *
 * Returns every notebook and lexical document currently registered with the
 * Datalayer editor, sorted by most-recently-used first, so the caller can
 * pick the correct URI to pass as `notebook_uri` / `documentUri` on
 * subsequent cell or block tool calls.
 */

import { getServiceContainer } from "../../extension";

/** A single entry in the open-documents list. */
export interface OpenDocumentEntry {
  rank: number;
  filename: string;
  uri: string;
  type: "notebook" | "lexical";
  mostRecent: boolean;
}

/** Result returned by the listOpenDocuments operation. */
export interface ListOpenDocumentsResult {
  documents: OpenDocumentEntry[];
  total: number;
  usage: string;
}

/**
 * Lists all Datalayer documents currently open in the editor, sorted by
 * most-recently-used first.
 *
 * @returns List of open documents with URIs and recency rank.
 */
export async function listOpenDocuments(): Promise<ListOpenDocumentsResult> {
  const services = getServiceContainer();
  const notebooks = services.documentRegistry.getByType("notebook");
  const lexicals = services.documentRegistry.getByType("lexical");

  const all = [...notebooks, ...lexicals].sort(
    (a, b) => b.lastUsed - a.lastUsed,
  );

  const documents: OpenDocumentEntry[] = all.map((entry, idx) => ({
    rank: idx + 1,
    filename: entry.documentUri.split("/").pop() ?? entry.documentUri,
    uri: entry.documentUri,
    type: entry.type,
    mostRecent: idx === 0,
  }));

  return {
    documents,
    total: documents.length,
    usage:
      "Pass `notebook_uri` (notebook cell tools) or `documentUri` (lexical block tools) from the `uri` field to target a specific document.",
  };
}

/**
 * List Open Documents Operation
 *
 * Standard ToolOperation wrapping the listOpenDocuments helper.
 */
export const listOpenDocumentsOperation: import("@datalayer/jupyter-react").ToolOperation<
  Record<string, never>,
  ListOpenDocumentsResult
> = {
  name: "listOpenDocuments",

  async execute(
    _params: Record<string, never>,
    _context: import("@datalayer/jupyter-react").ToolExecutionContext,
  ): Promise<ListOpenDocumentsResult> {
    return listOpenDocuments();
  },
};
