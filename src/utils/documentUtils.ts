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
import { ItemTypes } from "../../../core/lib/client/constants";

/**
 * Document type detection results.
 */
export interface DocumentTypeInfo {
  isNotebook: boolean;
  isLexical: boolean;
  isCell: boolean;
  type: string; // Uses ItemTypes constants
}

/**
 * Detects document type using consistent logic across the extension.
 * Works with SDK model instances that have a 'type' property.
 *
 * @param document - The document to analyze (SDK model instance)
 * @returns Document type information with boolean flags and type string
 */
export function detectDocumentType(document: Document): DocumentTypeInfo {
  // SDK models have a 'type' property that returns the ItemTypes constant
  const docType = document.type;

  const isNotebook = docType === ItemTypes.NOTEBOOK;
  const isLexical = docType === ItemTypes.LEXICAL;
  const isCell = docType === ItemTypes.CELL;

  let type: string = ItemTypes.UNKNOWN;
  if (isNotebook) {
    type = ItemTypes.NOTEBOOK;
  } else if (isLexical) {
    type = ItemTypes.LEXICAL;
  } else if (isCell) {
    type = ItemTypes.CELL;
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
 * @param document - The document to get display name for (SDK model instance)
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

  // SDK models have a 'name' property
  const baseName = document.name;

  if (typeInfo.isNotebook) {
    return baseName.endsWith(".ipynb") ? baseName : `${baseName}.ipynb`;
  } else if (typeInfo.isLexical) {
    return baseName.endsWith(".lexical") ? baseName : `${baseName}.lexical`;
  }

  return baseName;
}
