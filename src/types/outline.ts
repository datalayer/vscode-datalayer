/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Shared outline message types used by both the extension host (src) and the
 * webview. Defined under src so the `watch:lib` build (rootDir=src) does not
 * pull webview sources outside its rootDir.
 *
 * @module types/outline
 */

/** Outline item structure. */
export interface OutlineItem {
  /** Unique identifier. */
  id: string;
  /** Display text. */
  label: string;
  /** Item type. */
  type:
    | "heading"
    | "h1"
    | "h2"
    | "h3"
    | "h4"
    | "h5"
    | "h6"
    | "code"
    | "code-cell"
    | "markdown-cell";
  /** Heading level (1-6 for headings). */
  level?: number;
  /** Line or node index in editor. */
  line?: number;
  /** Cell index (for notebooks). */
  cellIndex?: number;
  /** Nested children. */
  children?: OutlineItem[];
}

/** Outline update from webview to extension. */
export interface OutlineUpdateMessage {
  /** Message type discriminator. */
  type: "outline-update";
  /** Document URI. */
  documentUri: string;
  /** Outline items. */
  items: OutlineItem[];
  /** Currently focused/selected item ID. */
  activeItemId?: string;
}
