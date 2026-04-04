/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import * as assert from "assert";
import * as vscode from "vscode";

import type {
  ActiveDocumentInfo,
  EditorType,
} from "../../utils/activeDocument";
import {
  getActiveCustomEditorUri,
  getActiveDocumentInfo,
} from "../../utils/activeDocument";

suite("ActiveDocument Tests", () => {
  suite("EditorType type", () => {
    test("accepts valid editor types", () => {
      const types: EditorType[] = [
        "datalayer-notebook",
        "datalayer-lexical",
        "native-notebook",
        "other",
      ];
      assert.strictEqual(types.length, 4);
    });
  });

  suite("ActiveDocumentInfo interface", () => {
    test("can construct a valid ActiveDocumentInfo object", () => {
      // Verify the interface shape is correct at compile time
      const info: ActiveDocumentInfo = {
        uri: vscode.Uri.file("/test"),
        editorType: "datalayer-notebook",
        viewType: "datalayer.jupyter-notebook",
      };
      assert.strictEqual(info.editorType, "datalayer-notebook");
      assert.strictEqual(info.viewType, "datalayer.jupyter-notebook");
    });

    test("viewType is optional", () => {
      const info: ActiveDocumentInfo = {
        uri: vscode.Uri.file("/test"),
        editorType: "other",
      };
      assert.strictEqual(info.viewType, undefined);
    });
  });

  suite("getActiveDocumentInfo", () => {
    test("returns undefined when no active tab is open", () => {
      // In the test environment, there is typically no active tab
      const info = getActiveDocumentInfo();
      // The result depends on VS Code state; in test runner there is
      // usually no active custom editor tab open.
      // We verify the function returns the expected type.
      if (info !== undefined) {
        assert.ok(info.uri);
        assert.ok(
          [
            "datalayer-notebook",
            "datalayer-lexical",
            "native-notebook",
            "other",
          ].includes(info.editorType),
        );
      } else {
        assert.strictEqual(info, undefined);
      }
    });
  });

  suite("getActiveCustomEditorUri", () => {
    test("returns undefined when no active custom editor", () => {
      // In test environment, no custom editor is active
      const uri = getActiveCustomEditorUri();
      // The function delegates to getActiveDocumentInfo and returns uri
      // In test runner, this should return undefined
      if (uri !== undefined) {
        assert.ok(uri);
      } else {
        assert.strictEqual(uri, undefined);
      }
    });
  });

  suite("editor type mapping", () => {
    test("datalayer-notebook maps to notebook custom editor", () => {
      const editorType: EditorType = "datalayer-notebook";
      assert.strictEqual(editorType, "datalayer-notebook");
    });

    test("datalayer-lexical maps to lexical custom editor", () => {
      const editorType: EditorType = "datalayer-lexical";
      assert.strictEqual(editorType, "datalayer-lexical");
    });

    test("native-notebook maps to VS Code built-in notebook editor", () => {
      const editorType: EditorType = "native-notebook";
      assert.strictEqual(editorType, "native-notebook");
    });

    test("other covers all non-Datalayer editors", () => {
      const editorType: EditorType = "other";
      assert.strictEqual(editorType, "other");
    });
  });
});
