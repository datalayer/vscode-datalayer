/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Mock DocumentHandle for testing core operations
 *
 * @module tools/core/__tests__/mockDocumentHandle
 */

import type {
  DocumentHandle,
  CellData,
  NotebookMetadata,
  ExecutionResult,
} from "../interfaces";

/**
 * Mock implementation of DocumentHandle for unit testing.
 * Stores cells in memory and simulates notebook operations.
 */
export class MockDocumentHandle implements DocumentHandle {
  private cells: CellData[] = [];
  private executionCounter = 1;

  constructor(initialCells: CellData[] = []) {
    this.cells = [...initialCells];
  }

  async getCellCount(): Promise<number> {
    return this.cells.length;
  }

  async getCell(index: number): Promise<CellData> {
    if (index < 0 || index >= this.cells.length) {
      throw new Error(
        `Cell index ${index} out of bounds (0-${this.cells.length - 1})`,
      );
    }
    return { ...this.cells[index] };
  }

  async getAllCells(): Promise<CellData[]> {
    return this.cells.map((cell) => ({ ...cell }));
  }

  async getMetadata(): Promise<NotebookMetadata> {
    const cellTypes = this.cells.reduce(
      (acc, cell) => {
        if (cell.type === "code") {
          acc.code++;
        } else if (cell.type === "markdown") {
          acc.markdown++;
        } else if (cell.type === "raw") {
          acc.raw++;
        }
        return acc;
      },
      { code: 0, markdown: 0, raw: 0 },
    );

    return {
      path: "test-notebook.ipynb",
      cellCount: this.cells.length,
      cellTypes,
      kernelspec: {
        name: "python3",
        display_name: "Python 3",
      },
    };
  }

  async insertCell(index: number, cell: CellData): Promise<void> {
    if (index < 0 || index > this.cells.length) {
      throw new Error(
        `Cell index ${index} out of bounds (0-${this.cells.length})`,
      );
    }
    this.cells.splice(index, 0, { ...cell });
  }

  async deleteCell(index: number): Promise<void> {
    if (index < 0 || index >= this.cells.length) {
      throw new Error(
        `Cell index ${index} out of bounds (0-${this.cells.length - 1})`,
      );
    }
    this.cells.splice(index, 1);
  }

  async updateCell(index: number, source: string): Promise<void> {
    if (index < 0 || index >= this.cells.length) {
      throw new Error(
        `Cell index ${index} out of bounds (0-${this.cells.length - 1})`,
      );
    }
    this.cells[index].source = source;
  }

  async executeCell(index: number): Promise<ExecutionResult> {
    if (index < 0 || index >= this.cells.length) {
      throw new Error(
        `Cell index ${index} out of bounds (0-${this.cells.length - 1})`,
      );
    }

    const cell = this.cells[index];

    if (cell.type !== "code") {
      throw new Error(
        `Cell at index ${index} is not a code cell (type: ${cell.type})`,
      );
    }

    // Simulate execution
    const executionOrder = this.executionCounter++;
    cell.execution_count = executionOrder;

    // Mock output based on source
    const source = Array.isArray(cell.source)
      ? cell.source.join("")
      : cell.source;

    let outputs: ExecutionResult["outputs"] = [];
    let success = true;

    if (source.includes("error")) {
      // Simulate error
      success = false;
      outputs = [
        {
          output_type: "error",
          ename: "Exception",
          evalue: "Mock error",
          traceback: [
            "Traceback (most recent call last):",
            "  Exception: Mock error",
          ],
        },
      ];
    } else if (source.includes("print")) {
      // Simulate print output
      outputs = [
        {
          output_type: "stream",
          name: "stdout",
          text: "Mock output\n",
        },
      ];
    }

    cell.outputs = outputs;

    return {
      success,
      executionOrder,
      outputs,
    };
  }

  async save(): Promise<void> {
    // Mock save - do nothing
  }

  async close(): Promise<void> {
    // Mock close - do nothing
  }

  // Test helpers
  getCells(): CellData[] {
    return [...this.cells];
  }

  reset(cells: CellData[] = []): void {
    this.cells = [...cells];
    this.executionCounter = 1;
  }
}
