/*
 * Copyright (c) 2021-2023 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Utility functions for document type detection and handling.
 *
 * @module utils/documentUtils
 */

import type { Document } from "../models/spaceItem";

/**
 * Document type detection results.
 */
export interface DocumentTypeInfo {
  isNotebook: boolean;
  isLexical: boolean;
  isCell: boolean;
  type: "notebook" | "lexical" | "cell" | "unknown";
}

/**
 * Detects document type using consistent logic across the extension.
 * Matches the filtering logic used in the spaces tree provider.
 *
 * @param document - The document to analyze
 * @returns Document type information with boolean flags and type string
 */
export function detectDocumentType(document: Document): DocumentTypeInfo {
  const isNotebook =
    document.type_s === "notebook" || document.notebook_extension_s === "ipynb";

  const isLexical =
    document.document_format_s === "lexical" ||
    document.document_extension_s === "lexical" ||
    (document.type_s === "document" &&
      document.document_format_s === "lexical");

  const isCell = document.type_s === "cell";

  let type: "notebook" | "lexical" | "cell" | "unknown" = "unknown";
  if (isNotebook) {
    type = "notebook";
  } else if (isLexical) {
    type = "lexical";
  } else if (isCell) {
    type = "cell";
  }

  return {
    isNotebook,
    isLexical,
    isCell,
    type,
  };
}

/**
 * Gets display name for a document using consistent logic.
 * Automatically adds appropriate file extensions if missing.
 *
 * @param document - The document to get display name for
 * @param typeInfo - Document type info (detected if not provided)
 * @returns Display name with appropriate extension
 */
export function getDocumentDisplayName(
  document: Document,
  typeInfo?: DocumentTypeInfo
): string {
  if (!typeInfo) {
    typeInfo = detectDocumentType(document);
  }

  const baseName =
    document.name_t ||
    document.notebook_name_s ||
    document.document_name_s ||
    "Untitled";

  if (typeInfo.isNotebook) {
    return baseName.endsWith(".ipynb") ? baseName : `${baseName}.ipynb`;
  } else if (typeInfo.isLexical) {
    return baseName.endsWith(".lexical") ? baseName : `${baseName}.lexical`;
  }

  return baseName;
}
