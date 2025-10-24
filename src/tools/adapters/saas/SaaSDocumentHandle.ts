/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * SaaS implementation of DocumentHandle using direct Jupyter widget APIs
 *
 * @module tools/adapters/saas/SaaSDocumentHandle
 */

import type {
  DocumentHandle,
  CellData,
  NotebookMetadata,
  ExecutionResult,
} from "../../core/interfaces";

// Type imports for JupyterLab (these would come from @jupyterlab/notebook)
type NotebookPanel = any; // INotebookPanel from @jupyterlab/notebook
type ICellModel = any; // From @jupyterlab/cells
type INotebookModel = any; // From @jupyterlab/notebook

/**
 * SaaS implementation of DocumentHandle.
 *
 * This adapter uses JupyterLab's native widget APIs to directly manipulate
 * notebooks in the browser, without any message passing or webview complexity.
 *
 * Usage in SaaS:
 * ```typescript
 * const notebookWidget = app.shell.currentWidget as NotebookPanel;
 * const handle = new SaaSDocumentHandle(notebookWidget);
 * await handle.insertCell(0, { type: 'code', source: 'print("Hello")' });
 * ```
 */
export class SaaSDocumentHandle implements DocumentHandle {
  private readonly notebook: INotebookModel;

  constructor(private readonly notebookPanel: NotebookPanel) {
    this.notebook = notebookPanel.content.model;
  }

  async getCellCount(): Promise<number> {
    return this.notebook.cells.length;
  }

  async getCell(index: number): Promise<CellData> {
    const cell = this.notebook.cells.get(index);
    if (!cell) {
      throw new Error(
        `Cell index ${index} out of bounds (0-${this.notebook.cells.length - 1})`,
      );
    }

    return this.cellModelToData(cell);
  }

  async getAllCells(): Promise<CellData[]> {
    const cells: CellData[] = [];
    for (let i = 0; i < this.notebook.cells.length; i++) {
      const cell = this.notebook.cells.get(i);
      if (cell) {
        cells.push(this.cellModelToData(cell));
      }
    }
    return cells;
  }

  async getMetadata(): Promise<NotebookMetadata> {
    const cells = await this.getAllCells();
    const cellTypes = cells.reduce(
      (acc, cell) => {
        if (cell.type === "code") acc.code++;
        else if (cell.type === "markdown") acc.markdown++;
        else if (cell.type === "raw") acc.raw++;
        return acc;
      },
      { code: 0, markdown: 0, raw: 0 },
    );

    const metadata = this.notebook.metadata;
    const kernelspec = metadata.get("kernelspec") as any;
    const languageInfo = metadata.get("language_info") as any;

    return {
      path: this.notebookPanel.context.path,
      cellCount: cells.length,
      cellTypes,
      kernelspec: kernelspec
        ? {
            name: kernelspec.name,
            display_name: kernelspec.display_name,
            language: kernelspec.language,
          }
        : undefined,
      language_info: languageInfo
        ? {
            name: languageInfo.name,
            version: languageInfo.version,
            mimetype: languageInfo.mimetype,
            file_extension: languageInfo.file_extension,
          }
        : undefined,
    };
  }

  async insertCell(index: number, cell: CellData): Promise<void> {
    if (index < 0 || index > this.notebook.cells.length) {
      throw new Error(
        `Cell index ${index} out of bounds (0-${this.notebook.cells.length})`,
      );
    }

    // Create cell model using factory
    const cellModel = this.notebook.contentFactory.createCell(
      cell.type,
      {},
    ) as ICellModel;

    // Set source
    const source = Array.isArray(cell.source)
      ? cell.source.join("")
      : cell.source;
    cellModel.value.text = source;

    // Set metadata if provided
    if (cell.metadata) {
      Object.entries(cell.metadata).forEach(([key, value]) => {
        cellModel.metadata.set(key, value);
      });
    }

    // Insert into notebook
    this.notebook.cells.insert(index, cellModel);
  }

  async deleteCell(index: number): Promise<void> {
    if (index < 0 || index >= this.notebook.cells.length) {
      throw new Error(
        `Cell index ${index} out of bounds (0-${this.notebook.cells.length - 1})`,
      );
    }

    this.notebook.cells.remove(index);
  }

  async updateCell(index: number, source: string): Promise<void> {
    const cell = this.notebook.cells.get(index);
    if (!cell) {
      throw new Error(
        `Cell index ${index} out of bounds (0-${this.notebook.cells.length - 1})`,
      );
    }

    cell.value.text = source;
  }

  async executeCell(index: number): Promise<ExecutionResult> {
    const cell = this.notebook.cells.get(index);
    if (!cell) {
      throw new Error(
        `Cell index ${index} out of bounds (0-${this.notebook.cells.length - 1})`,
      );
    }

    if (cell.type !== "code") {
      throw new Error(
        `Cell at index ${index} is not a code cell (type: ${cell.type})`,
      );
    }

    // Get session manager and execute
    const { sessionContext } = this.notebookPanel;
    if (!sessionContext || !sessionContext.session?.kernel) {
      throw new Error("No kernel available for execution");
    }

    const startTime = Date.now();

    // Execute the cell
    const future = sessionContext.session.kernel.requestExecute({
      code: cell.value.text,
    });

    // Collect outputs
    const outputs: ExecutionResult["outputs"] = [];
    let success = true;
    let executionOrder: number | undefined;

    await new Promise<void>((resolve, reject) => {
      future.onIOPub = (msg: any) => {
        const msgType = msg.header.msg_type;

        if (msgType === "execute_input") {
          executionOrder = msg.content.execution_count;
        } else if (msgType === "stream") {
          outputs.push({
            output_type: "stream",
            name: msg.content.name,
            text: msg.content.text,
          });
        } else if (msgType === "execute_result" || msgType === "display_data") {
          outputs.push({
            output_type: msgType,
            data: msg.content.data,
            metadata: msg.content.metadata,
            execution_count: msg.content.execution_count,
          });
        } else if (msgType === "error") {
          success = false;
          outputs.push({
            output_type: "error",
            ename: msg.content.ename,
            evalue: msg.content.evalue,
            traceback: msg.content.traceback,
          });
        }
      };

      future.done
        .then(() => resolve())
        .catch((error) => {
          success = false;
          reject(error);
        });
    });

    const duration = Date.now() - startTime;

    return {
      success,
      executionOrder,
      outputs,
      duration,
    };
  }

  async save(): Promise<void> {
    await this.notebookPanel.context.save();
  }

  async close(): Promise<void> {
    this.notebookPanel.close();
  }

  /**
   * Converts JupyterLab cell model to CellData
   */
  private cellModelToData(cell: ICellModel): CellData {
    const outputs = [];

    if (cell.type === "code" && cell.outputs) {
      for (let i = 0; i < cell.outputs.length; i++) {
        const output = cell.outputs.get(i);
        if (output) {
          outputs.push(output.toJSON());
        }
      }
    }

    return {
      type: cell.type as "code" | "markdown" | "raw",
      source: cell.value.text,
      outputs,
      metadata: cell.metadata.toJSON(),
      execution_count:
        cell.type === "code" ? (cell as any).executionCount : undefined,
    };
  }
}
