/*
 * Copyright (c) 2021-2023 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Chat Context Provider for Datalayer notebooks and lexical documents.
 * This makes notebook and lexical content automatically available to Copilot Chat
 * when these files are open in the editor.
 *
 * Uses the proposed chatContextProvider API from VS Code.
 * @see https://github.com/microsoft/vscode/issues/271104
 */

import * as vscode from "vscode";

/**
 * Registers a chat context provider for Datalayer notebooks (.ipynb) and lexical documents (.lexical, .dlex).
 * This allows Copilot Chat to automatically access the content of these files
 * when they are open, without requiring manual file attachment.
 */
export function registerChatContextProvider(
  _context: vscode.ExtensionContext,
): vscode.Disposable {
  const disposables: vscode.Disposable[] = [];

  // Register provider for notebook files
  disposables.push(
    (
      vscode as unknown as {
        chat: {
          registerChatContextProvider: (
            ...args: unknown[]
          ) => vscode.Disposable;
        };
      }
    ).chat.registerChatContextProvider(
      [{ pattern: "**/*.ipynb" }],
      "datalayer-notebook",
      {
        provideChatContextForResource: async (
          options: { resource: vscode.Uri },
          _token: vscode.CancellationToken,
        ) => {
          return await getNotebookContext(options.resource);
        },
        resolveChatContext: async (
          context: unknown,
          _token: vscode.CancellationToken,
        ) => {
          // Value is already provided, no need to resolve
          return context;
        },
      },
    ),
  );

  // Register provider for lexical files (.lexical and .dlex)
  disposables.push(
    (
      vscode as unknown as {
        chat: {
          registerChatContextProvider: (
            ...args: unknown[]
          ) => vscode.Disposable;
        };
      }
    ).chat.registerChatContextProvider(
      [{ pattern: "**/*.lexical" }, { pattern: "**/*.dlex" }],
      "datalayer-lexical",
      {
        provideChatContextForResource: async (
          options: { resource: vscode.Uri },
          _token: vscode.CancellationToken,
        ) => {
          return await getLexicalContext(options.resource);
        },
        resolveChatContext: async (
          context: unknown,
          _token: vscode.CancellationToken,
        ) => {
          return context;
        },
      },
    ),
  );

  return vscode.Disposable.from(...disposables);
}

/**
 * Extract context from a Jupyter notebook file
 */
async function getNotebookContext(uri: vscode.Uri): Promise<
  | {
      icon: vscode.ThemeIcon;
      label: string;
      modelDescription: string;
      value: string;
    }
  | undefined
> {
  try {
    const content = await vscode.workspace.fs.readFile(uri);
    const notebook = JSON.parse(new TextDecoder().decode(content));

    // Extract all cell content
    const cells = notebook.cells || [];
    const cellContents: string[] = [];

    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const cellType = cell.cell_type;
      const source = Array.isArray(cell.source)
        ? cell.source.join("")
        : cell.source || "";

      if (source.trim()) {
        cellContents.push(`Cell ${i + 1} (${cellType}):\n${source}`);
      }
    }

    const fileName = uri.path.split("/").pop() || "notebook.ipynb";
    const value = cellContents.join("\n\n");

    return {
      icon: new vscode.ThemeIcon("notebook"),
      label: fileName,
      modelDescription: `Jupyter Notebook (.ipynb): ${fileName}. Use insertCell tool to add cells to this notebook (NOT insertBlock - that's for .dlex files).`,
      value: value || "Empty notebook",
    };
  } catch (error) {
    console.error("Failed to extract notebook context:", error);
    return undefined;
  }
}

/**
 * Extract context from a Lexical document file
 */
async function getLexicalContext(uri: vscode.Uri): Promise<
  | {
      icon: vscode.ThemeIcon;
      label: string;
      modelDescription: string;
      value: string;
    }
  | undefined
> {
  try {
    const content = await vscode.workspace.fs.readFile(uri);
    const lexicalData = JSON.parse(new TextDecoder().decode(content));

    // Extract text from lexical structure
    const textContent = extractTextFromLexical(lexicalData);
    const fileName = uri.path.split("/").pop() || "document.lexical";

    return {
      icon: new vscode.ThemeIcon("file-text"),
      label: fileName,
      modelDescription: `Lexical Document (.dlex): ${fileName}. IMPORTANT: Lexical documents can contain EXECUTABLE jupyter-cell blocks that run code via kernel, just like .ipynb notebooks. Use insertBlock with type="jupyter-cell" to add executable code cells.`,
      value: textContent || "Empty document",
    };
  } catch (error) {
    console.error("Failed to extract lexical context:", error);
    return undefined;
  }
}

/**
 * Extract plain text from Lexical JSON structure
 */
function extractTextFromLexical(data: unknown): string {
  if (typeof data === "string") {
    return data;
  }

  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;

    // Try to extract from root.children (standard lexical structure)
    if (obj.root && typeof obj.root === "object") {
      const root = obj.root as Record<string, unknown>;
      if (Array.isArray(root.children)) {
        return extractTextFromNodes(root.children);
      }
    }
  }

  // Fallback: just stringify it
  return JSON.stringify(data, null, 2);
}

/**
 * Recursively extract text from Lexical nodes
 */
function extractTextFromNodes(nodes: unknown[]): string {
  if (!Array.isArray(nodes)) {
    return "";
  }

  return nodes
    .map((node) => {
      if (node && typeof node === "object") {
        const n = node as Record<string, unknown>;

        // Text node
        if (typeof n.text === "string") {
          return n.text;
        }

        // Node with children
        if (Array.isArray(n.children)) {
          return extractTextFromNodes(n.children);
        }
      }
      return "";
    })
    .filter((text) => text.trim())
    .join("\n");
}
