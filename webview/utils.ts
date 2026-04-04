/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * @module utils
 * Utility functions for the webview application.
 * Provides helper functions for notebook data manipulation.
 */

/**
 * Loads a notebook from binary data.
 * @param raw - Raw binary data containing JSON-encoded notebook content.
 *
 * @returns Parsed notebook object with inlined HTML outputs.
 *
 */
export function loadFromBytes(raw: Uint8Array): unknown {
  const rawContent = new TextDecoder().decode(raw);
  const parsed = JSON.parse(rawContent);
  // Inline html output to fix an issue seen in JupyterLab 4 (prior to 4.2)
  for (const cell of parsed.cells) {
    if (cell.outputs) {
      for (const output of cell.outputs) {
        if (Array.isArray(output.data?.["text/html"])) {
          output.data["text/html"] = output.data["text/html"].join("");
        }
      }
    }
  }
  return parsed;
}

/**
 * Saves a notebook to binary data.
 * @param notebook - Notebook object to serialize.
 *
 * @returns UTF-8 encoded binary representation of the JSON notebook.
 *
 */
export function saveToBytes(notebook: unknown): Uint8Array {
  const stringData = JSON.stringify(notebook, null, 2);
  return new TextEncoder().encode(stringData);
}

/**
 * Returns the CSP nonce from the page meta tag, used by the fast design system for style injection.
 * @returns The CSP nonce string or null if no meta tag is found.
 *
 */
export function getNonce(): string | null {
  const node = document.querySelector('meta[property="csp-nonce"]');
  if (node) {
    return node.getAttribute("content");
  } else {
    return null;
  }
}
