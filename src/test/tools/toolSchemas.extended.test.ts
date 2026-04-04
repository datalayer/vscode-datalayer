/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Extended tests for tool schemas.
 * Covers edge cases: very long strings, special characters, negative numbers,
 * boundary values, and unusual but valid inputs.
 */

import * as assert from "assert";
import { ZodError } from "zod";

import { createDocumentParamsSchema } from "../../tools/schemas/createDocument";
import { createLexicalParamsSchema } from "../../tools/schemas/createLexical";
import { createNotebookParamsSchema } from "../../tools/schemas/createNotebook";
import { getActiveDocumentParamsSchema } from "../../tools/schemas/getActiveDocument";
import { listKernelsParamsSchema } from "../../tools/schemas/listKernels";
import {
  connectRuntimeParamsSchema,
  startRuntimeParamsSchema,
} from "../../tools/schemas/manageRuntime";
import { selectKernelParamsSchema } from "../../tools/schemas/selectKernel";

suite("Tool Schemas Extended Tests", () => {
  suite("Very Long Strings", () => {
    const longString = "a".repeat(10000);

    test("createDocument accepts very long name", () => {
      const result = createDocumentParamsSchema.parse({
        name: longString,
        documentType: "notebook",
      });
      assert.strictEqual(result.name.length, 10000);
    });

    test("createNotebook accepts very long description", () => {
      const result = createNotebookParamsSchema.parse({
        name: "nb",
        description: longString,
      });
      assert.strictEqual(result.description!.length, 10000);
    });

    test("createLexical accepts very long name", () => {
      const result = createLexicalParamsSchema.parse({
        name: longString,
      });
      assert.strictEqual(result.name.length, 10000);
    });

    test("connectRuntime accepts very long runtimeName", () => {
      const result = connectRuntimeParamsSchema.parse({
        runtimeName: longString,
      });
      assert.strictEqual(result.runtimeName.length, 10000);
    });

    test("selectKernel accepts very long kernelId", () => {
      const result = selectKernelParamsSchema.parse({
        kernelId: longString,
      });
      assert.strictEqual(result.kernelId.length, 10000);
    });

    test("listKernels accepts very long filter string", () => {
      const result = listKernelsParamsSchema.parse({
        filter: longString,
      });
      assert.strictEqual(result.filter!.length, 10000);
    });
  });

  suite("Special Characters", () => {
    test("createDocument name with unicode characters", () => {
      const result = createDocumentParamsSchema.parse({
        name: "notebook-\u00e9\u00e8\u00ea\u00eb-\u4e16\u754c-\ud83d\ude80",
        documentType: "notebook",
      });
      assert.ok(result.name.includes("\u00e9"));
      assert.ok(result.name.includes("\u4e16"));
    });

    test("createNotebook name with path separators", () => {
      const result = createNotebookParamsSchema.parse({
        name: "path/to/my\\notebook",
      });
      assert.strictEqual(result.name, "path/to/my\\notebook");
    });

    test("connectRuntime notebookUri with encoded characters", () => {
      const result = connectRuntimeParamsSchema.parse({
        runtimeName: "rt",
        notebookUri: "file:///path/to/my%20notebook%23special.ipynb",
      });
      assert.ok(result.notebookUri!.includes("%20"));
      assert.ok(result.notebookUri!.includes("%23"));
    });

    test("createDocument name with newlines and tabs", () => {
      const result = createDocumentParamsSchema.parse({
        name: "name\nwith\nnewlines\tand\ttabs",
        documentType: "lexical",
      });
      assert.ok(result.name.includes("\n"));
      assert.ok(result.name.includes("\t"));
    });

    test("createLexical description with HTML entities", () => {
      const result = createLexicalParamsSchema.parse({
        name: "doc",
        description: '<script>alert("xss")</script>',
      });
      assert.ok(result.description!.includes("<script>"));
    });

    test("createDocument name with empty string", () => {
      const result = createDocumentParamsSchema.parse({
        name: "",
        documentType: "notebook",
      });
      assert.strictEqual(result.name, "");
    });

    test("selectKernel with special chars in kernelId", () => {
      const result = selectKernelParamsSchema.parse({
        kernelId: "python-env-/usr/bin/python3.11 (venv)",
      });
      assert.strictEqual(
        result.kernelId,
        "python-env-/usr/bin/python3.11 (venv)",
      );
    });
  });

  suite("Negative Numbers and Boundary Values", () => {
    test("startRuntime rejects negative durationMinutes", () => {
      assert.throws(() => {
        startRuntimeParamsSchema.parse({ durationMinutes: -1 });
      }, ZodError);
    });

    test("startRuntime rejects -0", () => {
      // -0 is technically zero which is non-positive
      assert.throws(() => {
        startRuntimeParamsSchema.parse({ durationMinutes: -0 });
      }, ZodError);
    });

    test("startRuntime accepts minimum positive integer (1)", () => {
      const result = startRuntimeParamsSchema.parse({ durationMinutes: 1 });
      assert.strictEqual(result.durationMinutes, 1);
    });

    test("startRuntime accepts large integer", () => {
      const result = startRuntimeParamsSchema.parse({
        durationMinutes: 999999,
      });
      assert.strictEqual(result.durationMinutes, 999999);
    });

    test("startRuntime rejects NaN", () => {
      assert.throws(() => {
        startRuntimeParamsSchema.parse({ durationMinutes: NaN });
      }, ZodError);
    });

    test("startRuntime rejects Infinity", () => {
      assert.throws(() => {
        startRuntimeParamsSchema.parse({ durationMinutes: Infinity });
      }, ZodError);
    });

    test("startRuntime rejects -Infinity", () => {
      assert.throws(() => {
        startRuntimeParamsSchema.parse({ durationMinutes: -Infinity });
      }, ZodError);
    });

    test("startRuntime rejects floating point", () => {
      assert.throws(() => {
        startRuntimeParamsSchema.parse({ durationMinutes: 1.5 });
      }, ZodError);
    });

    test("selectKernel rejects negative durationMinutes", () => {
      assert.throws(() => {
        selectKernelParamsSchema.parse({
          kernelId: "test",
          durationMinutes: -10,
        });
      }, ZodError);
    });

    test("selectKernel rejects float durationMinutes", () => {
      assert.throws(() => {
        selectKernelParamsSchema.parse({
          kernelId: "test",
          durationMinutes: 0.5,
        });
      }, ZodError);
    });

    test("selectKernel accepts durationMinutes of 1", () => {
      const result = selectKernelParamsSchema.parse({
        kernelId: "test",
        durationMinutes: 1,
      });
      assert.strictEqual(result.durationMinutes, 1);
    });
  });

  suite("Type Coercion and Invalid Types", () => {
    test("createDocument rejects numeric name", () => {
      assert.throws(() => {
        createDocumentParamsSchema.parse({
          name: 42,
          documentType: "notebook",
        });
      }, ZodError);
    });

    test("createDocument rejects boolean name", () => {
      assert.throws(() => {
        createDocumentParamsSchema.parse({
          name: true,
          documentType: "notebook",
        });
      }, ZodError);
    });

    test("createDocument rejects array name", () => {
      assert.throws(() => {
        createDocumentParamsSchema.parse({
          name: ["notebook"],
          documentType: "notebook",
        });
      }, ZodError);
    });

    test("createDocument rejects null name", () => {
      assert.throws(() => {
        createDocumentParamsSchema.parse({
          name: null,
          documentType: "notebook",
        });
      }, ZodError);
    });

    test("listKernels rejects numeric filter", () => {
      assert.throws(() => {
        listKernelsParamsSchema.parse({ filter: 123 });
      }, ZodError);
    });

    test("listKernels rejects string includeLocal", () => {
      assert.throws(() => {
        listKernelsParamsSchema.parse({ includeLocal: "true" });
      }, ZodError);
    });

    test("startRuntime rejects string durationMinutes", () => {
      assert.throws(() => {
        startRuntimeParamsSchema.parse({ durationMinutes: "60" });
      }, ZodError);
    });

    test("startRuntime rejects boolean durationMinutes", () => {
      assert.throws(() => {
        startRuntimeParamsSchema.parse({ durationMinutes: true });
      }, ZodError);
    });
  });

  suite("getActiveDocument Edge Cases", () => {
    test("accepts object with many unknown properties", () => {
      const result = getActiveDocumentParamsSchema.parse({
        a: 1,
        b: "two",
        c: true,
        d: [1, 2, 3],
        e: { nested: "object" },
      });
      // All unknown properties should be stripped
      assert.deepStrictEqual(result, {});
    });

    test("accepts null-like values in unknown properties", () => {
      const result = getActiveDocumentParamsSchema.parse({
        x: null,
        y: undefined,
      });
      assert.deepStrictEqual(result, {});
    });
  });

  suite("createNotebook initialCells Edge Cases", () => {
    test("accepts initialCells with mixed cell types", () => {
      const cells = [
        { cell_type: "code", source: "import pandas" },
        { cell_type: "markdown", source: "# Title" },
        { cell_type: "raw", source: "raw content" },
      ];
      const result = createNotebookParamsSchema.parse({
        name: "nb",
        initialCells: cells,
      });
      assert.strictEqual(result.initialCells!.length, 3);
    });

    test("accepts initialCells with nested objects", () => {
      const cells = [
        {
          cell_type: "code",
          source: "x = 1",
          metadata: { scrolled: true, tags: ["test"] },
          outputs: [{ output_type: "execute_result", data: {} }],
        },
      ];
      const result = createNotebookParamsSchema.parse({
        name: "nb",
        initialCells: cells,
      });
      assert.strictEqual(result.initialCells!.length, 1);
    });

    test("accepts initialCells with very large array", () => {
      const cells = Array.from({ length: 1000 }, (_, i) => ({
        cell_type: "code",
        source: `cell_${i}`,
      }));
      const result = createNotebookParamsSchema.parse({
        name: "nb",
        initialCells: cells,
      });
      assert.strictEqual(result.initialCells!.length, 1000);
    });
  });

  suite("connectRuntime Edge Cases", () => {
    test("accepts runtimeName with spaces", () => {
      const result = connectRuntimeParamsSchema.parse({
        runtimeName: "my runtime name",
      });
      assert.strictEqual(result.runtimeName, "my runtime name");
    });

    test("accepts empty string runtimeName", () => {
      const result = connectRuntimeParamsSchema.parse({
        runtimeName: "",
      });
      assert.strictEqual(result.runtimeName, "");
    });

    test("accepts notebookUri with various schemes", () => {
      for (const uri of [
        "file:///local/path.ipynb",
        "datalayer://Space/notebook.ipynb",
        "untitled:Untitled-1.ipynb",
        "vscode-notebook-cell://notebook/cell",
      ]) {
        const result = connectRuntimeParamsSchema.parse({
          runtimeName: "rt",
          notebookUri: uri,
        });
        assert.strictEqual(result.notebookUri, uri);
      }
    });
  });
});
