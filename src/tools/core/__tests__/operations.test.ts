/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Unit tests for core operations
 *
 * These tests demonstrate that core operations are platform-agnostic
 * and can be tested in isolation using mock DocumentHandles.
 *
 * @module tools/core/__tests__/operations.test
 */

import { describe, it, expect, beforeEach } from "vitest";
import { MockDocumentHandle } from "./mockDocumentHandle";
import type { ToolExecutionContext } from "../interfaces";
import {
  insertCellOperation,
  deleteCellOperation,
  updateCellOperation,
  readCellOperation,
  readAllCellsOperation,
  executeCellOperation,
  getNotebookInfoOperation,
} from "../operations";

describe("Core Operations - Platform Agnostic", () => {
  let mockDocument: MockDocumentHandle;
  let context: ToolExecutionContext;

  beforeEach(() => {
    // Reset mock document before each test
    mockDocument = new MockDocumentHandle([
      { type: "code", source: "print('Hello')", outputs: [] },
      { type: "markdown", source: "# Title", outputs: [] },
    ]);

    context = {
      document: mockDocument,
    };
  });

  describe("insertCellOperation", () => {
    it("should insert a code cell at the end by default", async () => {
      const result = await insertCellOperation.execute(
        {
          cellType: "code",
          cellSource: "x = 42",
        },
        context,
      );

      expect(result.success).toBe(true);
      expect(result.index).toBe(2);
      expect(result.message).toContain("Code cell inserted");

      const cells = mockDocument.getCells();
      expect(cells.length).toBe(3);
      expect(cells[2].source).toBe("x = 42");
    });

    it("should insert a cell at a specific index", async () => {
      const result = await insertCellOperation.execute(
        {
          cellType: "markdown",
          cellSource: "## Subtitle",
          cellIndex: 1,
        },
        context,
      );

      expect(result.success).toBe(true);
      expect(result.index).toBe(1);

      const cells = mockDocument.getCells();
      expect(cells.length).toBe(3);
      expect(cells[1].source).toBe("## Subtitle");
      expect(cells[1].type).toBe("markdown");
    });

    it("should throw error when document handle is missing", async () => {
      await expect(
        insertCellOperation.execute(
          { cellType: "code", cellSource: "test" },
          {},
        ),
      ).rejects.toThrow("Document handle is required");
    });

    it("should throw error for out of bounds index", async () => {
      await expect(
        insertCellOperation.execute(
          { cellType: "code", cellSource: "test", cellIndex: 10 },
          context,
        ),
      ).rejects.toThrow("out of bounds");
    });
  });

  describe("deleteCellOperation", () => {
    it("should delete a cell at the specified index", async () => {
      const result = await deleteCellOperation.execute(
        { cellIndex: 0 },
        context,
      );

      expect(result.success).toBe(true);
      expect(result.index).toBe(0);
      expect(result.message).toContain("deleted successfully");

      const cells = mockDocument.getCells();
      expect(cells.length).toBe(1);
      expect(cells[0].type).toBe("markdown");
    });

    it("should throw error for out of bounds index", async () => {
      await expect(
        deleteCellOperation.execute({ cellIndex: 5 }, context),
      ).rejects.toThrow("out of bounds");
    });
  });

  describe("updateCellOperation", () => {
    it("should update a cell's source code", async () => {
      const result = await updateCellOperation.execute(
        {
          cellIndex: 0,
          cellSource: "print('Updated')",
        },
        context,
      );

      expect(result.success).toBe(true);
      expect(result.index).toBe(0);

      const cell = await mockDocument.getCell(0);
      expect(cell.source).toBe("print('Updated')");
    });
  });

  describe("readCellOperation", () => {
    it("should read a cell by index", async () => {
      const result = await readCellOperation.execute({ cellIndex: 1 }, context);

      expect(result.success).toBe(true);
      expect(result.index).toBe(1);
      expect(result.cell.type).toBe("markdown");
      expect(result.cell.source).toBe("# Title");
    });
  });

  describe("readAllCellsOperation", () => {
    it("should read all cells from the notebook", async () => {
      const result = await readAllCellsOperation.execute({}, context);

      expect(result.success).toBe(true);
      expect(result.cellCount).toBe(2);
      expect(result.cells.length).toBe(2);
      expect(result.cells[0].type).toBe("code");
      expect(result.cells[1].type).toBe("markdown");
    });

    it("should handle empty notebooks", async () => {
      mockDocument.reset([]);
      const result = await readAllCellsOperation.execute({}, context);

      expect(result.success).toBe(true);
      expect(result.cellCount).toBe(0);
      expect(result.cells.length).toBe(0);
    });
  });

  describe("executeCellOperation", () => {
    it("should execute a code cell successfully", async () => {
      const result = await executeCellOperation.execute(
        { cellIndex: 0 },
        context,
      );

      expect(result.success).toBe(true);
      expect(result.index).toBe(0);
      expect(result.execution.success).toBe(true);
      expect(result.execution.executionOrder).toBe(1);
      expect(result.execution.outputs.length).toBeGreaterThan(0);
    });

    it("should fail when trying to execute a non-code cell", async () => {
      await expect(
        executeCellOperation.execute({ cellIndex: 1 }, context),
      ).rejects.toThrow("not a code cell");
    });

    it("should handle execution errors", async () => {
      // Insert a cell that will trigger error in mock
      await insertCellOperation.execute(
        {
          cellType: "code",
          cellSource: "raise error",
        },
        context,
      );

      const result = await executeCellOperation.execute(
        { cellIndex: 2 },
        context,
      );

      expect(result.success).toBe(false);
      expect(result.execution.success).toBe(false);
      expect(result.execution.outputs[0].output_type).toBe("error");
    });
  });

  describe("getNotebookInfoOperation", () => {
    it("should get notebook metadata", async () => {
      const result = await getNotebookInfoOperation.execute({}, context);

      expect(result.success).toBe(true);
      expect(result.metadata.cellCount).toBe(2);
      expect(result.metadata.cellTypes.code).toBe(1);
      expect(result.metadata.cellTypes.markdown).toBe(1);
      expect(result.metadata.path).toBe("test-notebook.ipynb");
    });
  });

  describe("Integration: Multiple Operations", () => {
    it("should support a complete workflow", async () => {
      // 1. Get initial info
      let info = await getNotebookInfoOperation.execute({}, context);
      expect(info.metadata.cellCount).toBe(2);

      // 2. Insert a new cell
      await insertCellOperation.execute(
        {
          cellType: "code",
          cellSource: "y = 10",
        },
        context,
      );

      // 3. Verify insertion
      info = await getNotebookInfoOperation.execute({}, context);
      expect(info.metadata.cellCount).toBe(3);

      // 4. Update the new cell
      await updateCellOperation.execute(
        {
          cellIndex: 2,
          cellSource: "y = 20",
        },
        context,
      );

      // 5. Read and verify
      const cell = await readCellOperation.execute({ cellIndex: 2 }, context);
      expect(cell.cell.source).toBe("y = 20");

      // 6. Execute the cell
      const execution = await executeCellOperation.execute(
        { cellIndex: 2 },
        context,
      );
      expect(execution.success).toBe(true);

      // 7. Delete the cell
      await deleteCellOperation.execute({ cellIndex: 2 }, context);

      // 8. Verify deletion
      info = await getNotebookInfoOperation.execute({}, context);
      expect(info.metadata.cellCount).toBe(2);
    });
  });
});
