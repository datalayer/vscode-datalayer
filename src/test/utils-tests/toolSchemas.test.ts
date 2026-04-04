/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
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

suite("Tool Schemas", () => {
  // -------------------------------------------------------------------------
  // createDocument
  // -------------------------------------------------------------------------
  suite("createDocumentParamsSchema", () => {
    test("accepts valid params with all fields", () => {
      const result = createDocumentParamsSchema.parse({
        name: "my-doc",
        description: "A test document",
        spaceName: "team-space",
        spaceId: "space-123",
        location: "cloud",
        documentType: "notebook",
        initialCells: [{ cell_type: "code", source: "print(1)" }],
      });
      assert.strictEqual(result.name, "my-doc");
      assert.strictEqual(result.description, "A test document");
      assert.strictEqual(result.spaceName, "team-space");
      assert.strictEqual(result.spaceId, "space-123");
      assert.strictEqual(result.location, "cloud");
      assert.strictEqual(result.documentType, "notebook");
      assert.strictEqual(result.initialCells?.length, 1);
    });

    test("accepts valid params with only required fields", () => {
      const result = createDocumentParamsSchema.parse({
        name: "minimal",
        documentType: "lexical",
      });
      assert.strictEqual(result.name, "minimal");
      assert.strictEqual(result.documentType, "lexical");
      assert.strictEqual(result.description, undefined);
      assert.strictEqual(result.spaceName, undefined);
      assert.strictEqual(result.spaceId, undefined);
      assert.strictEqual(result.location, undefined);
      assert.strictEqual(result.initialCells, undefined);
    });

    test("rejects missing name", () => {
      assert.throws(() => {
        createDocumentParamsSchema.parse({ documentType: "notebook" });
      }, ZodError);
    });

    test("rejects missing documentType", () => {
      assert.throws(() => {
        createDocumentParamsSchema.parse({ name: "test" });
      }, ZodError);
    });

    test("rejects invalid documentType value", () => {
      assert.throws(() => {
        createDocumentParamsSchema.parse({
          name: "test",
          documentType: "spreadsheet",
        });
      }, ZodError);
    });

    test("rejects invalid location value", () => {
      assert.throws(() => {
        createDocumentParamsSchema.parse({
          name: "test",
          documentType: "notebook",
          location: "s3",
        });
      }, ZodError);
    });

    test("rejects non-string name", () => {
      assert.throws(() => {
        createDocumentParamsSchema.parse({
          name: 123,
          documentType: "notebook",
        });
      }, ZodError);
    });

    test("accepts all location enum values", () => {
      for (const loc of ["local", "cloud", "remote"] as const) {
        const result = createDocumentParamsSchema.parse({
          name: "test",
          documentType: "notebook",
          location: loc,
        });
        assert.strictEqual(result.location, loc);
      }
    });

    test("accepts both documentType enum values", () => {
      for (const dt of ["notebook", "lexical"] as const) {
        const result = createDocumentParamsSchema.parse({
          name: "test",
          documentType: dt,
        });
        assert.strictEqual(result.documentType, dt);
      }
    });
  });

  // -------------------------------------------------------------------------
  // createLexical
  // -------------------------------------------------------------------------
  suite("createLexicalParamsSchema", () => {
    test("accepts valid params with all fields", () => {
      const result = createLexicalParamsSchema.parse({
        name: "my-lexical",
        description: "Rich text doc",
        space: "team-space",
        spaceId: "space-456",
        location: "cloud",
      });
      assert.strictEqual(result.name, "my-lexical");
      assert.strictEqual(result.description, "Rich text doc");
      assert.strictEqual(result.space, "team-space");
      assert.strictEqual(result.spaceId, "space-456");
      assert.strictEqual(result.location, "cloud");
    });

    test("accepts valid params with only required fields", () => {
      const result = createLexicalParamsSchema.parse({ name: "minimal" });
      assert.strictEqual(result.name, "minimal");
      assert.strictEqual(result.description, undefined);
      assert.strictEqual(result.space, undefined);
      assert.strictEqual(result.spaceId, undefined);
      assert.strictEqual(result.location, undefined);
    });

    test("rejects missing name", () => {
      assert.throws(() => {
        createLexicalParamsSchema.parse({});
      }, ZodError);
    });

    test("rejects non-string name", () => {
      assert.throws(() => {
        createLexicalParamsSchema.parse({ name: true });
      }, ZodError);
    });

    test("rejects invalid location value", () => {
      assert.throws(() => {
        createLexicalParamsSchema.parse({ name: "test", location: "azure" });
      }, ZodError);
    });

    test("accepts all location enum values", () => {
      for (const loc of ["local", "cloud", "remote"] as const) {
        const result = createLexicalParamsSchema.parse({
          name: "test",
          location: loc,
        });
        assert.strictEqual(result.location, loc);
      }
    });

    test("rejects non-string description", () => {
      assert.throws(() => {
        createLexicalParamsSchema.parse({ name: "test", description: 42 });
      }, ZodError);
    });
  });

  // -------------------------------------------------------------------------
  // createNotebook
  // -------------------------------------------------------------------------
  suite("createNotebookParamsSchema", () => {
    test("accepts valid params with all fields", () => {
      const cells = [{ cell_type: "code", source: "x = 1" }];
      const result = createNotebookParamsSchema.parse({
        name: "analysis",
        description: "Data analysis notebook",
        space: "data-team",
        spaceId: "sp-789",
        location: "remote",
        initialCells: cells,
      });
      assert.strictEqual(result.name, "analysis");
      assert.strictEqual(result.description, "Data analysis notebook");
      assert.strictEqual(result.space, "data-team");
      assert.strictEqual(result.spaceId, "sp-789");
      assert.strictEqual(result.location, "remote");
      assert.deepStrictEqual(result.initialCells, cells);
    });

    test("accepts valid params with only required fields", () => {
      const result = createNotebookParamsSchema.parse({ name: "nb" });
      assert.strictEqual(result.name, "nb");
      assert.strictEqual(result.description, undefined);
      assert.strictEqual(result.space, undefined);
      assert.strictEqual(result.spaceId, undefined);
      assert.strictEqual(result.location, undefined);
      assert.strictEqual(result.initialCells, undefined);
    });

    test("rejects missing name", () => {
      assert.throws(() => {
        createNotebookParamsSchema.parse({});
      }, ZodError);
    });

    test("rejects non-string name", () => {
      assert.throws(() => {
        createNotebookParamsSchema.parse({ name: 999 });
      }, ZodError);
    });

    test("rejects invalid location value", () => {
      assert.throws(() => {
        createNotebookParamsSchema.parse({ name: "nb", location: "gcs" });
      }, ZodError);
    });

    test("rejects non-array initialCells", () => {
      assert.throws(() => {
        createNotebookParamsSchema.parse({
          name: "nb",
          initialCells: "not-an-array",
        });
      }, ZodError);
    });

    test("accepts empty initialCells array", () => {
      const result = createNotebookParamsSchema.parse({
        name: "nb",
        initialCells: [],
      });
      assert.deepStrictEqual(result.initialCells, []);
    });

    test("accepts all location enum values", () => {
      for (const loc of ["local", "cloud", "remote"] as const) {
        const result = createNotebookParamsSchema.parse({
          name: "nb",
          location: loc,
        });
        assert.strictEqual(result.location, loc);
      }
    });
  });

  // -------------------------------------------------------------------------
  // getActiveDocument
  // -------------------------------------------------------------------------
  suite("getActiveDocumentParamsSchema", () => {
    test("accepts empty object", () => {
      const result = getActiveDocumentParamsSchema.parse({});
      assert.deepStrictEqual(result, {});
    });

    test("strips unknown properties", () => {
      const result = getActiveDocumentParamsSchema.parse({
        extra: "ignored",
      });
      assert.strictEqual((result as Record<string, unknown>).extra, undefined);
    });
  });

  // -------------------------------------------------------------------------
  // listKernels
  // -------------------------------------------------------------------------
  suite("listKernelsParamsSchema", () => {
    test("accepts valid params with all fields", () => {
      const result = listKernelsParamsSchema.parse({
        includeLocal: false,
        includeCloud: true,
        filter: "python",
      });
      assert.strictEqual(result.includeLocal, false);
      assert.strictEqual(result.includeCloud, true);
      assert.strictEqual(result.filter, "python");
    });

    test("applies default values for empty object", () => {
      const result = listKernelsParamsSchema.parse({});
      assert.strictEqual(result.includeLocal, true);
      assert.strictEqual(result.includeCloud, true);
      assert.strictEqual(result.filter, undefined);
    });

    test("applies default for includeLocal when omitted", () => {
      const result = listKernelsParamsSchema.parse({ includeCloud: false });
      assert.strictEqual(result.includeLocal, true);
      assert.strictEqual(result.includeCloud, false);
    });

    test("applies default for includeCloud when omitted", () => {
      const result = listKernelsParamsSchema.parse({ includeLocal: false });
      assert.strictEqual(result.includeLocal, false);
      assert.strictEqual(result.includeCloud, true);
    });

    test("rejects non-boolean includeLocal", () => {
      assert.throws(() => {
        listKernelsParamsSchema.parse({ includeLocal: "yes" });
      }, ZodError);
    });

    test("rejects non-boolean includeCloud", () => {
      assert.throws(() => {
        listKernelsParamsSchema.parse({ includeCloud: 1 });
      }, ZodError);
    });

    test("rejects non-string filter", () => {
      assert.throws(() => {
        listKernelsParamsSchema.parse({ filter: 42 });
      }, ZodError);
    });

    test("accepts filter as empty string", () => {
      const result = listKernelsParamsSchema.parse({ filter: "" });
      assert.strictEqual(result.filter, "");
    });

    test("accepts both booleans set to false", () => {
      const result = listKernelsParamsSchema.parse({
        includeLocal: false,
        includeCloud: false,
      });
      assert.strictEqual(result.includeLocal, false);
      assert.strictEqual(result.includeCloud, false);
    });
  });

  // -------------------------------------------------------------------------
  // manageRuntime - startRuntime
  // -------------------------------------------------------------------------
  suite("startRuntimeParamsSchema", () => {
    test("accepts valid params with all fields", () => {
      const result = startRuntimeParamsSchema.parse({
        environment: "python-3.11",
        durationMinutes: 30,
      });
      assert.strictEqual(result.environment, "python-3.11");
      assert.strictEqual(result.durationMinutes, 30);
    });

    test("accepts empty object (all fields optional)", () => {
      const result = startRuntimeParamsSchema.parse({});
      assert.strictEqual(result.environment, undefined);
      assert.strictEqual(result.durationMinutes, undefined);
    });

    test("accepts only environment", () => {
      const result = startRuntimeParamsSchema.parse({
        environment: "gpu-pytorch",
      });
      assert.strictEqual(result.environment, "gpu-pytorch");
      assert.strictEqual(result.durationMinutes, undefined);
    });

    test("accepts only durationMinutes", () => {
      const result = startRuntimeParamsSchema.parse({ durationMinutes: 60 });
      assert.strictEqual(result.environment, undefined);
      assert.strictEqual(result.durationMinutes, 60);
    });

    test("rejects non-integer durationMinutes", () => {
      assert.throws(() => {
        startRuntimeParamsSchema.parse({ durationMinutes: 10.5 });
      }, ZodError);
    });

    test("rejects zero durationMinutes", () => {
      assert.throws(() => {
        startRuntimeParamsSchema.parse({ durationMinutes: 0 });
      }, ZodError);
    });

    test("rejects negative durationMinutes", () => {
      assert.throws(() => {
        startRuntimeParamsSchema.parse({ durationMinutes: -10 });
      }, ZodError);
    });

    test("rejects non-number durationMinutes", () => {
      assert.throws(() => {
        startRuntimeParamsSchema.parse({ durationMinutes: "thirty" });
      }, ZodError);
    });

    test("rejects non-string environment", () => {
      assert.throws(() => {
        startRuntimeParamsSchema.parse({ environment: 123 });
      }, ZodError);
    });
  });

  // -------------------------------------------------------------------------
  // manageRuntime - connectRuntime
  // -------------------------------------------------------------------------
  suite("connectRuntimeParamsSchema", () => {
    test("accepts valid params with all fields", () => {
      const result = connectRuntimeParamsSchema.parse({
        runtimeName: "my-runtime",
        notebookUri: "file:///path/to/notebook.ipynb",
      });
      assert.strictEqual(result.runtimeName, "my-runtime");
      assert.strictEqual(result.notebookUri, "file:///path/to/notebook.ipynb");
    });

    test("accepts valid params with only required fields", () => {
      const result = connectRuntimeParamsSchema.parse({
        runtimeName: "runtime-1",
      });
      assert.strictEqual(result.runtimeName, "runtime-1");
      assert.strictEqual(result.notebookUri, undefined);
    });

    test("rejects missing runtimeName", () => {
      assert.throws(() => {
        connectRuntimeParamsSchema.parse({});
      }, ZodError);
    });

    test("rejects missing runtimeName with notebookUri present", () => {
      assert.throws(() => {
        connectRuntimeParamsSchema.parse({
          notebookUri: "file:///path/to/nb.ipynb",
        });
      }, ZodError);
    });

    test("rejects non-string runtimeName", () => {
      assert.throws(() => {
        connectRuntimeParamsSchema.parse({ runtimeName: 42 });
      }, ZodError);
    });

    test("rejects non-string notebookUri", () => {
      assert.throws(() => {
        connectRuntimeParamsSchema.parse({
          runtimeName: "rt",
          notebookUri: true,
        });
      }, ZodError);
    });
  });

  // -------------------------------------------------------------------------
  // selectKernel
  // -------------------------------------------------------------------------
  suite("selectKernelParamsSchema", () => {
    test("accepts valid params with all fields", () => {
      const result = selectKernelParamsSchema.parse({
        kernelId: "pyodide",
        autoStart: false,
        environmentType: "GPU",
        durationMinutes: 120,
      });
      assert.strictEqual(result.kernelId, "pyodide");
      assert.strictEqual(result.autoStart, false);
      assert.strictEqual(result.environmentType, "GPU");
      assert.strictEqual(result.durationMinutes, 120);
    });

    test("accepts valid params with only required fields and applies defaults", () => {
      const result = selectKernelParamsSchema.parse({ kernelId: "local" });
      assert.strictEqual(result.kernelId, "local");
      assert.strictEqual(result.autoStart, true);
      assert.strictEqual(result.environmentType, undefined);
      assert.strictEqual(result.durationMinutes, undefined);
    });

    test("rejects missing kernelId", () => {
      assert.throws(() => {
        selectKernelParamsSchema.parse({});
      }, ZodError);
    });

    test("rejects non-string kernelId", () => {
      assert.throws(() => {
        selectKernelParamsSchema.parse({ kernelId: 123 });
      }, ZodError);
    });

    test("applies default autoStart of true", () => {
      const result = selectKernelParamsSchema.parse({ kernelId: "active" });
      assert.strictEqual(result.autoStart, true);
    });

    test("allows autoStart to be explicitly false", () => {
      const result = selectKernelParamsSchema.parse({
        kernelId: "new",
        autoStart: false,
      });
      assert.strictEqual(result.autoStart, false);
    });

    test("rejects non-boolean autoStart", () => {
      assert.throws(() => {
        selectKernelParamsSchema.parse({
          kernelId: "test",
          autoStart: "yes",
        });
      }, ZodError);
    });

    test("accepts CPU environmentType", () => {
      const result = selectKernelParamsSchema.parse({
        kernelId: "new",
        environmentType: "CPU",
      });
      assert.strictEqual(result.environmentType, "CPU");
    });

    test("accepts GPU environmentType", () => {
      const result = selectKernelParamsSchema.parse({
        kernelId: "new",
        environmentType: "GPU",
      });
      assert.strictEqual(result.environmentType, "GPU");
    });

    test("rejects invalid environmentType", () => {
      assert.throws(() => {
        selectKernelParamsSchema.parse({
          kernelId: "new",
          environmentType: "TPU",
        });
      }, ZodError);
    });

    test("rejects non-positive durationMinutes", () => {
      assert.throws(() => {
        selectKernelParamsSchema.parse({
          kernelId: "new",
          durationMinutes: 0,
        });
      }, ZodError);
    });

    test("rejects negative durationMinutes", () => {
      assert.throws(() => {
        selectKernelParamsSchema.parse({
          kernelId: "new",
          durationMinutes: -5,
        });
      }, ZodError);
    });

    test("rejects non-number durationMinutes", () => {
      assert.throws(() => {
        selectKernelParamsSchema.parse({
          kernelId: "new",
          durationMinutes: "ten",
        });
      }, ZodError);
    });

    test("accepts kernel alias values", () => {
      for (const alias of ["pyodide", "new", "active", "local"]) {
        const result = selectKernelParamsSchema.parse({ kernelId: alias });
        assert.strictEqual(result.kernelId, alias);
      }
    });

    test("accepts specific kernel ID format", () => {
      const result = selectKernelParamsSchema.parse({
        kernelId: "python-env-/usr/bin/python3",
      });
      assert.strictEqual(result.kernelId, "python-env-/usr/bin/python3");
    });
  });
});
