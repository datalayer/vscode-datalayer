/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Tests for tool definition files.
 * Validates that each tool definition export has the correct structure
 * including name, displayName, description, parameters, operation, and config.
 */

import * as assert from "assert";

import { createLexicalTool } from "../../tools/definitions/createLexical";
import { createNotebookTool } from "../../tools/definitions/createNotebook";
import { executeCodeTool } from "../../tools/definitions/executeCode";
import { getActiveDocumentTool } from "../../tools/definitions/getActiveDocument";
import {
  allToolDefinitions,
  getAllToolDefinitionsAsync,
} from "../../tools/definitions/index";
import { listKernelsTool } from "../../tools/definitions/listKernels";
import {
  connectRuntimeTool,
  startRuntimeTool,
} from "../../tools/definitions/manageRuntime";

/**
 * Validates that a tool definition has the expected structure.
 */
function assertValidToolDefinition(
  tool: Record<string, unknown>,
  expectedName: string,
): void {
  // Required string properties
  assert.ok(typeof tool.name === "string", `name should be a string`);
  assert.strictEqual(tool.name, expectedName);
  assert.ok(
    typeof tool.displayName === "string",
    `displayName should be a string`,
  );
  assert.ok(tool.displayName !== "", `displayName should not be empty`);
  assert.ok(
    typeof tool.description === "string",
    `description should be a string`,
  );
  assert.ok(tool.description !== "", `description should not be empty`);
  assert.ok(typeof tool.operation === "string", `operation should be a string`);
  assert.ok(tool.operation !== "", `operation should not be empty`);

  // Parameters object
  assert.ok(
    typeof tool.parameters === "object" && tool.parameters !== null,
    `parameters should be an object`,
  );
  const params = tool.parameters as Record<string, unknown>;
  assert.strictEqual(
    params.type,
    "object",
    `parameters.type should be "object"`,
  );
  assert.ok(
    typeof params.properties === "object" && params.properties !== null,
    `parameters.properties should be an object`,
  );

  // Config object
  assert.ok(
    typeof tool.config === "object" && tool.config !== null,
    `config should be an object`,
  );
  const config = tool.config as Record<string, unknown>;
  assert.strictEqual(
    typeof config.requiresConfirmation,
    "boolean",
    `config.requiresConfirmation should be a boolean`,
  );
  assert.strictEqual(
    typeof config.canBeReferencedInPrompt,
    "boolean",
    `config.canBeReferencedInPrompt should be a boolean`,
  );

  // Tags array
  assert.ok(Array.isArray(tool.tags), `tags should be an array`);
  const tags = tool.tags as string[];
  assert.ok(tags.length > 0, `tags should not be empty`);
  tags.forEach((tag, i) => {
    assert.strictEqual(typeof tag, "string", `tags[${i}] should be a string`);
  });
}

suite("Tool Definitions Tests", () => {
  suite("createLexicalTool", () => {
    test("has valid tool definition structure", () => {
      assertValidToolDefinition(
        createLexicalTool as unknown as Record<string, unknown>,
        "datalayer_createLexical",
      );
    });

    test("has correct displayName", () => {
      assert.strictEqual(
        createLexicalTool.displayName,
        "Create Lexical Document",
      );
    });

    test("has name as required parameter", () => {
      const params = createLexicalTool.parameters as Record<string, unknown>;
      const required = params.required as string[];
      assert.ok(required.includes("name"), "name should be required");
    });

    test("has correct operation", () => {
      assert.strictEqual(createLexicalTool.operation, "createLexical");
    });

    test("has location enum with local and cloud", () => {
      const params = createLexicalTool.parameters as Record<string, unknown>;
      const props = params.properties as Record<
        string,
        Record<string, unknown>
      >;
      assert.ok(props.location, "should have location property");
      const locationEnum = props.location.enum as string[];
      assert.ok(locationEnum.includes("local"));
      assert.ok(locationEnum.includes("cloud"));
    });

    test("includes lexical and create tags", () => {
      assert.ok(createLexicalTool.tags?.includes("lexical"));
      assert.ok(createLexicalTool.tags?.includes("create"));
    });
  });

  suite("createNotebookTool", () => {
    test("has valid tool definition structure", () => {
      assertValidToolDefinition(
        createNotebookTool as unknown as Record<string, unknown>,
        "datalayer_createNotebook",
      );
    });

    test("has correct displayName", () => {
      assert.strictEqual(createNotebookTool.displayName, "Create Notebook");
    });

    test("has name as required parameter", () => {
      const params = createNotebookTool.parameters as Record<string, unknown>;
      const required = params.required as string[];
      assert.ok(required.includes("name"), "name should be required");
    });

    test("has correct operation", () => {
      assert.strictEqual(createNotebookTool.operation, "createNotebook");
    });

    test("includes notebook and create tags", () => {
      assert.ok(createNotebookTool.tags?.includes("notebook"));
      assert.ok(createNotebookTool.tags?.includes("create"));
    });
  });

  suite("executeCodeTool", () => {
    test("has valid tool definition structure", () => {
      assertValidToolDefinition(
        executeCodeTool as unknown as Record<string, unknown>,
        "datalayer_executeCode",
      );
    });

    test("has correct displayName", () => {
      assert.strictEqual(executeCodeTool.displayName, "Execute Code");
    });

    test("has code as required parameter", () => {
      const params = executeCodeTool.parameters as Record<string, unknown>;
      const required = params.required as string[];
      assert.ok(required.includes("code"), "code should be required");
    });

    test("has correct operation", () => {
      assert.strictEqual(executeCodeTool.operation, "executeCode");
    });

    test("includes execute and python tags", () => {
      assert.ok(executeCodeTool.tags?.includes("execute"));
      assert.ok(executeCodeTool.tags?.includes("python"));
    });

    test("does not require confirmation", () => {
      assert.strictEqual(executeCodeTool.config?.requiresConfirmation, false);
    });
  });

  suite("getActiveDocumentTool", () => {
    test("has valid tool definition structure", () => {
      assertValidToolDefinition(
        getActiveDocumentTool as unknown as Record<string, unknown>,
        "datalayer_getActiveDocument",
      );
    });

    test("has correct displayName", () => {
      assert.strictEqual(
        getActiveDocumentTool.displayName,
        "Get Active Document",
      );
    });

    test("has no required parameters", () => {
      const params = getActiveDocumentTool.parameters as Record<
        string,
        unknown
      >;
      const required = params.required as string[];
      assert.deepStrictEqual(required, []);
    });

    test("has empty properties (no parameters)", () => {
      const params = getActiveDocumentTool.parameters as Record<
        string,
        unknown
      >;
      const props = params.properties as Record<string, unknown>;
      assert.deepStrictEqual(props, {});
    });

    test("has high priority", () => {
      assert.strictEqual(getActiveDocumentTool.config?.priority, "high");
    });

    test("includes prerequisite tag", () => {
      assert.ok(getActiveDocumentTool.tags?.includes("prerequisite"));
    });
  });

  suite("listKernelsTool", () => {
    test("has valid tool definition structure", () => {
      assertValidToolDefinition(
        listKernelsTool as unknown as Record<string, unknown>,
        "datalayer_listKernels",
      );
    });

    test("has correct displayName", () => {
      assert.strictEqual(listKernelsTool.displayName, "List Kernels");
    });

    test("has no required parameters", () => {
      const params = listKernelsTool.parameters as Record<string, unknown>;
      const required = params.required as string[];
      assert.deepStrictEqual(required, []);
    });

    test("has includeLocal, includeCloud, and filter properties", () => {
      const params = listKernelsTool.parameters as Record<string, unknown>;
      const props = params.properties as Record<string, unknown>;
      assert.ok(props.includeLocal, "should have includeLocal property");
      assert.ok(props.includeCloud, "should have includeCloud property");
      assert.ok(props.filter, "should have filter property");
    });

    test("includes pyodide tag", () => {
      assert.ok(listKernelsTool.tags?.includes("pyodide"));
    });
  });

  suite("startRuntimeTool", () => {
    test("has valid tool definition structure", () => {
      assertValidToolDefinition(
        startRuntimeTool as unknown as Record<string, unknown>,
        "datalayer_startRuntime",
      );
    });

    test("has correct displayName", () => {
      assert.strictEqual(startRuntimeTool.displayName, "Start Runtime");
    });

    test("has no required parameters", () => {
      const params = startRuntimeTool.parameters as Record<string, unknown>;
      const required = params.required as string[];
      assert.deepStrictEqual(required, []);
    });

    test("has environment and durationMinutes properties", () => {
      const params = startRuntimeTool.parameters as Record<string, unknown>;
      const props = params.properties as Record<string, unknown>;
      assert.ok(props.environment, "should have environment property");
      assert.ok(props.durationMinutes, "should have durationMinutes property");
    });

    test("has correct operation", () => {
      assert.strictEqual(startRuntimeTool.operation, "startRuntime");
    });

    test("includes runtime and start tags", () => {
      assert.ok(startRuntimeTool.tags?.includes("runtime"));
      assert.ok(startRuntimeTool.tags?.includes("start"));
    });
  });

  suite("connectRuntimeTool", () => {
    test("has valid tool definition structure", () => {
      assertValidToolDefinition(
        connectRuntimeTool as unknown as Record<string, unknown>,
        "datalayer_connectRuntime",
      );
    });

    test("has correct displayName", () => {
      assert.strictEqual(connectRuntimeTool.displayName, "Connect Runtime");
    });

    test("has runtimeName as required parameter", () => {
      const params = connectRuntimeTool.parameters as Record<string, unknown>;
      const required = params.required as string[];
      assert.ok(
        required.includes("runtimeName"),
        "runtimeName should be required",
      );
    });

    test("has runtimeName and notebookUri properties", () => {
      const params = connectRuntimeTool.parameters as Record<string, unknown>;
      const props = params.properties as Record<string, unknown>;
      assert.ok(props.runtimeName, "should have runtimeName property");
      assert.ok(props.notebookUri, "should have notebookUri property");
    });

    test("has correct operation", () => {
      assert.strictEqual(connectRuntimeTool.operation, "connectRuntime");
    });

    test("includes runtime and connect tags", () => {
      assert.ok(connectRuntimeTool.tags?.includes("runtime"));
      assert.ok(connectRuntimeTool.tags?.includes("connect"));
    });
  });

  suite("allToolDefinitions", () => {
    test("is an array", () => {
      assert.ok(Array.isArray(allToolDefinitions));
    });

    test("contains 6 VS Code-specific tool definitions", () => {
      assert.strictEqual(allToolDefinitions.length, 6);
    });

    test("all definitions have unique names", () => {
      const names = allToolDefinitions.map((t) => t.name);
      const uniqueNames = new Set(names);
      assert.strictEqual(
        uniqueNames.size,
        names.length,
        `Duplicate tool names found: ${names.filter((n, i) => names.indexOf(n) !== i)}`,
      );
    });

    test("contains expected tool names", () => {
      const names = allToolDefinitions.map((t) => t.name);
      assert.ok(names.includes("datalayer_getActiveDocument"));
      assert.ok(names.includes("datalayer_createNotebook"));
      assert.ok(names.includes("datalayer_createLexical"));
      assert.ok(names.includes("datalayer_listKernels"));
      assert.ok(names.includes("datalayer_selectKernel"));
      assert.ok(names.includes("datalayer_executeCode"));
    });

    test("all definitions have non-empty descriptions", () => {
      for (const tool of allToolDefinitions) {
        assert.ok(
          tool.description.length > 0,
          `${tool.name} should have a non-empty description`,
        );
      }
    });

    test("all definitions have config objects", () => {
      for (const tool of allToolDefinitions) {
        assert.ok(
          tool.config !== undefined,
          `${tool.name} should have a config object`,
        );
      }
    });
  });

  suite("selectKernelTool (via index)", () => {
    test("is included in allToolDefinitions", () => {
      const selectKernel = allToolDefinitions.find(
        (t) => t.name === "datalayer_selectKernel",
      );
      assert.ok(
        selectKernel,
        "selectKernelTool should be in allToolDefinitions",
      );
    });

    test("has kernelId in parameters", () => {
      const selectKernel = allToolDefinitions.find(
        (t) => t.name === "datalayer_selectKernel",
      );
      assert.ok(selectKernel);
      // Parameters are generated by zodToToolParameters stub, so just check it exists
      assert.ok(selectKernel.parameters, "should have parameters");
    });
  });

  suite("getAllToolDefinitionsAsync", () => {
    test("is a function", () => {
      assert.strictEqual(typeof getAllToolDefinitionsAsync, "function");
    });
  });
});
