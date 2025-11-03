/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * @module providers/NotebookSymbolProvider
 * Provides document symbols for Jupyter notebooks (.ipynb files) to populate VS Code's Outline view.
 * Extracts markdown headers and code cells from notebook JSON structure.
 */

import * as vscode from "vscode";
import {
  parseMarkdownStructure,
  type MarkdownHeading,
  headingLevelToString,
} from "../utils/markdownParser";

/**
 * Jupyter notebook cell structure (nbformat).
 */
interface NotebookCell {
  cell_type: "markdown" | "code" | "raw";
  source: string | string[];
  execution_count?: number | null;
  metadata?: Record<string, unknown>;
}

/**
 * Jupyter notebook format structure.
 */
interface NotebookFormat {
  cells: NotebookCell[];
  metadata?: Record<string, unknown>;
  nbformat: number;
  nbformat_minor: number;
}

/**
 * Document symbol provider for Jupyter notebooks.
 * Parses .ipynb files and extracts markdown headings and code cells for the Outline view.
 *
 * @example
 * ```typescript
 * const provider = new NotebookSymbolProvider();
 * context.subscriptions.push(
 *   vscode.languages.registerDocumentSymbolProvider(
 *     { language: "json", pattern: "** /*.ipynb" },
 *     provider
 *   )
 * );
 * ```
 */
export class NotebookSymbolProvider implements vscode.DocumentSymbolProvider {
  /**
   * Provides document symbols for a Jupyter notebook file.
   *
   * @param document - The notebook document (as TextDocument containing JSON)
   * @param token - Cancellation token
   * @returns Array of document symbols representing notebook structure
   */
  async provideDocumentSymbols(
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
  ): Promise<vscode.DocumentSymbol[]> {
    // Only process .ipynb files
    if (!document.fileName.endsWith(".ipynb")) {
      return [];
    }

    try {
      // Parse notebook JSON
      const notebookJson = document.getText();
      const notebook: NotebookFormat = JSON.parse(notebookJson);

      if (!notebook.cells || !Array.isArray(notebook.cells)) {
        return [];
      }

      // Track symbols and heading hierarchy
      const symbols: vscode.DocumentSymbol[] = [];
      const headingStack: vscode.DocumentSymbol[] = [];

      // Process each cell
      for (let cellIndex = 0; cellIndex < notebook.cells.length; cellIndex++) {
        if (token.isCancellationRequested) {
          return [];
        }

        const cell = notebook.cells[cellIndex];
        const cellSource = this.getCellSource(cell);

        // Find cell position in document
        const cellPosition = this.findCellPosition(document, cellIndex);
        if (!cellPosition) {
          continue;
        }

        if (cell.cell_type === "markdown" && cellSource.trim()) {
          // Extract markdown headings
          const headings = parseMarkdownStructure(cellSource);
          this.processMarkdownHeadings(
            headings,
            cellPosition,
            symbols,
            headingStack,
          );
        } else if (cell.cell_type === "code") {
          // Add code cell symbol
          const codeSymbol = this.createCodeCellSymbol(
            cell,
            cellIndex,
            cellPosition,
          );

          // Code cells reset the heading stack (they're at root level)
          headingStack.length = 0;
          symbols.push(codeSymbol);
        }
      }

      return symbols;
    } catch (error) {
      // If JSON parsing fails or any other error, return empty symbols
      console.error("Failed to parse notebook for outline:", error);
      return [];
    }
  }

  /**
   * Gets source text from a cell (handles both string and string[] formats).
   */
  private getCellSource(cell: NotebookCell): string {
    if (typeof cell.source === "string") {
      return cell.source;
    } else if (Array.isArray(cell.source)) {
      return cell.source.join("");
    }
    return "";
  }

  /**
   * Finds the byte range of a cell in the document.
   * Returns the Range object for the cell's position.
   */
  private findCellPosition(
    document: vscode.TextDocument,
    cellIndex: number,
  ): vscode.Range | null {
    const text = document.getText();

    // Find the cell in the JSON structure
    // Look for the cell index pattern in the cells array
    const cellsArrayMatch = text.match(/"cells"\s*:\s*\[/);
    if (!cellsArrayMatch || !cellsArrayMatch.index) {
      return null;
    }

    let cellCount = 0;
    let currentPos = cellsArrayMatch.index + cellsArrayMatch[0].length;
    let braceDepth = 0;
    let cellStart = currentPos;

    // Traverse through cells array to find the target cell
    for (let i = currentPos; i < text.length; i++) {
      const char = text[i];

      if (char === "{") {
        if (braceDepth === 0 && cellCount === cellIndex) {
          cellStart = i;
        }
        braceDepth++;
      } else if (char === "}") {
        braceDepth--;
        if (braceDepth === 0) {
          if (cellCount === cellIndex) {
            // Found the target cell
            const startPos = document.positionAt(cellStart);
            const endPos = document.positionAt(i + 1);
            return new vscode.Range(startPos, endPos);
          }
          cellCount++;
        }
      } else if (char === "]" && braceDepth === 0) {
        // End of cells array
        break;
      }
    }

    // Fallback: use a small range at the beginning of the file
    return new vscode.Range(0, 0, 0, 1);
  }

  /**
   * Processes markdown headings and adds them to the symbol tree.
   */
  private processMarkdownHeadings(
    headings: MarkdownHeading[],
    cellRange: vscode.Range,
    rootSymbols: vscode.DocumentSymbol[],
    headingStack: vscode.DocumentSymbol[],
  ): void {
    for (const heading of headings) {
      const symbol = this.createHeadingSymbol(heading, cellRange);

      // Build hierarchy based on heading levels
      while (
        headingStack.length > 0 &&
        this.getHeadingLevel(headingStack[headingStack.length - 1]) >=
          heading.level
      ) {
        headingStack.pop();
      }

      if (headingStack.length === 0) {
        // Root level heading
        rootSymbols.push(symbol);
      } else {
        // Child of previous heading
        const parent = headingStack[headingStack.length - 1];
        parent.children.push(symbol);
      }

      headingStack.push(symbol);

      // Recursively process children
      if (heading.children.length > 0) {
        this.processMarkdownHeadings(
          heading.children,
          cellRange,
          rootSymbols,
          headingStack,
        );
      }
    }
  }

  /**
   * Creates a DocumentSymbol for a markdown heading.
   */
  private createHeadingSymbol(
    heading: MarkdownHeading,
    cellRange: vscode.Range,
  ): vscode.DocumentSymbol {
    // Use the cell range as an approximation
    // In practice, clicking will open the notebook at this cell
    const range = cellRange;
    const selectionRange = cellRange;

    const symbol = new vscode.DocumentSymbol(
      heading.text,
      headingLevelToString(heading.level),
      heading.level === 1 ? vscode.SymbolKind.Module : vscode.SymbolKind.Class,
      range,
      selectionRange,
    );

    symbol.children = [];
    return symbol;
  }

  /**
   * Creates a DocumentSymbol for a code cell.
   */
  private createCodeCellSymbol(
    cell: NotebookCell,
    cellIndex: number,
    cellRange: vscode.Range,
  ): vscode.DocumentSymbol {
    const executionCount = cell.execution_count ?? " ";
    const name = `[${executionCount}]`;
    const detail = `Code cell ${cellIndex + 1}`;

    const symbol = new vscode.DocumentSymbol(
      name,
      detail,
      vscode.SymbolKind.Function,
      cellRange,
      cellRange,
    );

    symbol.children = [];
    return symbol;
  }

  /**
   * Extracts heading level from a DocumentSymbol.
   */
  private getHeadingLevel(symbol: vscode.DocumentSymbol): number {
    // Extract level from detail string (e.g., "H2" -> 2)
    const match = symbol.detail.match(/^H(\d)$/);
    return match ? parseInt(match[1], 10) : 999;
  }
}
