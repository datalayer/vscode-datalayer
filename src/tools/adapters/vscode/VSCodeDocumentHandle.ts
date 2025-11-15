/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * VS Code implementation of DocumentHandle using webview message passing
 *
 * @module tools/adapters/vscode/VSCodeDocumentHandle
 */

import * as vscode from "vscode";
import type {
  DocumentHandle,
  CellData,
  NotebookMetadata,
  ExecutionResult,
} from "../../core/interfaces";

/**
 * VS Code implementation of DocumentHandle.
 *
 * This adapter translates the unified DocumentHandle interface into
 * VS Code-specific operations using webview message passing via
 * internal commands.
 */
export class VSCodeDocumentHandle implements DocumentHandle {
  constructor(
    private readonly uri: vscode.Uri,
    private readonly commandExecutor: typeof vscode.commands.executeCommand = vscode
      .commands.executeCommand,
  ) {}

  async getCellCount(): Promise<number> {
    const metadata = await this.getMetadata();
    return metadata.cellCount;
  }

  async getCell(index: number): Promise<CellData> {
    const cell = await this.commandExecutor<{
      index: number;
      type: string;
      source: string;
      outputs?: string[];
    }>("datalayer.internal.readCell", {
      uri: this.uri.toString(),
      cellIndex: index,
    });

    return {
      type: cell.type as "code" | "markdown" | "raw",
      source: cell.source,
      outputs: cell.outputs?.map((output) => ({
        output_type: "stream" as const,
        name: "stdout" as const,
        text: output,
      })),
    };
  }

  async getAllCells(): Promise<CellData[]> {
    const cells = await this.commandExecutor<
      Array<{
        index: number;
        type: string;
        source: string;
        outputs?: string[];
      }>
    >("datalayer.internal.readAllCells", {
      uri: this.uri.toString(),
    });

    return cells.map((cell) => ({
      type: cell.type as "code" | "markdown" | "raw",
      source: cell.source,
      outputs: cell.outputs?.map((output) => ({
        output_type: "stream" as const,
        name: "stdout" as const,
        text: output,
      })),
    }));
  }

  async getMetadata(): Promise<NotebookMetadata> {
    // Get metadata from internal command
    const info = await this.commandExecutor<{
      path: string;
      cellCount: number;
      cellTypes: { code: number; markdown: number; raw: number };
    }>("datalayer.internal.getNotebookInfo", {
      uri: this.uri.toString(),
    });

    return {
      path: info.path || this.uri.fsPath,
      cellCount: info.cellCount,
      cellTypes: info.cellTypes || { code: 0, markdown: 0, raw: 0 },
    };
  }

  async insertCell(index: number, cell: CellData): Promise<void> {
    await this.commandExecutor("datalayer.internal.insertCell", {
      uri: this.uri.toString(),
      cellType: cell.type,
      cellSource: Array.isArray(cell.source)
        ? cell.source.join("")
        : cell.source,
      cellIndex: index,
    });
  }

  async deleteCell(index: number): Promise<void> {
    await this.commandExecutor("datalayer.internal.deleteCell", {
      uri: this.uri.toString(),
      cellIndex: index,
    });
  }

  async updateCell(index: number, source: string): Promise<void> {
    await this.commandExecutor("datalayer.internal.overwriteCell", {
      uri: this.uri.toString(),
      cellIndex: index,
      cellSource: source,
    });
  }

  async executeCell(index: number): Promise<ExecutionResult> {
    // Use VS Code's notebook.cell.execute command
    const document = await vscode.workspace.openNotebookDocument(this.uri);

    // Validate cell exists and is code
    if (index < 0 || index >= document.cellCount) {
      throw new Error(
        `Cell index ${index} out of bounds (0-${document.cellCount - 1})`,
      );
    }

    const cell = document.cellAt(index);
    if (cell.kind !== vscode.NotebookCellKind.Code) {
      throw new Error(
        `Cell ${index} is not a code cell (it's a ${cell.kind === vscode.NotebookCellKind.Markup ? "markdown" : "unknown"} cell)`,
      );
    }

    // Execute the cell
    await this.commandExecutor("notebook.cell.execute", {
      ranges: [{ start: index, end: index + 1 }],
      document: this.uri,
    });

    // Wait for execution to complete
    const maxWaitTime = 30000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      const currentCell = document.cellAt(index);

      if (
        currentCell.executionSummary?.executionOrder !== undefined &&
        currentCell.executionSummary?.success !== undefined
      ) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const executedCell = document.cellAt(index);

    // Extract outputs
    const outputs = [];
    for (const output of executedCell.outputs) {
      for (const item of output.items) {
        if (
          item.mime === "text/plain" ||
          item.mime === "application/vnd.code.notebook.stdout"
        ) {
          const text = new TextDecoder().decode(item.data);
          outputs.push({
            output_type: "stream" as const,
            name: "stdout" as const,
            text,
          });
        } else if (item.mime === "application/vnd.code.notebook.error") {
          const errorData = JSON.parse(new TextDecoder().decode(item.data));
          outputs.push({
            output_type: "error" as const,
            ename: errorData.name,
            evalue: errorData.message,
            traceback: [errorData.stack],
          });
        }
      }
    }

    return {
      success: executedCell.executionSummary?.success !== false,
      executionOrder: executedCell.executionSummary?.executionOrder,
      outputs,
    };
  }

  async save(): Promise<void> {
    await this.commandExecutor("workbench.action.files.save", this.uri);
  }

  async close(): Promise<void> {
    await this.commandExecutor("workbench.action.closeActiveEditor");
  }
}
