/* Copyright (c) 2021-2025 Datalayer, Inc. MIT License */

import { ItemTypes } from "@datalayer/core/lib/client/constants";
import * as assert from "assert";

import type { Document } from "../../models/spaceItem";
import {
  detectDocumentType,
  getDocumentDisplayName,
} from "../../utils/documentUtils";

suite("Document Utils Tests", () => {
  suite("detectDocumentType", () => {
    test("detects notebook type from document with type property", () => {
      const document = {
        type: ItemTypes.NOTEBOOK,
        name: "test.ipynb",
      } as unknown as Document;
      const result = detectDocumentType(document);

      assert.strictEqual(result.isNotebook, true);
      assert.strictEqual(result.isLexical, false);
      assert.strictEqual(result.isCell, false);
      assert.strictEqual(result.type, ItemTypes.NOTEBOOK);
    });

    test("detects lexical type from document with type property", () => {
      const document = {
        type: ItemTypes.LEXICAL,
        name: "test.dlex",
      } as unknown as Document;
      const result = detectDocumentType(document);

      assert.strictEqual(result.isNotebook, false);
      assert.strictEqual(result.isLexical, true);
      assert.strictEqual(result.isCell, false);
      assert.strictEqual(result.type, ItemTypes.LEXICAL);
    });

    test("detects cell type from document with type property", () => {
      const document = {
        type: ItemTypes.CELL,
        name: "cell-1",
      } as unknown as Document;
      const result = detectDocumentType(document);

      assert.strictEqual(result.isNotebook, false);
      assert.strictEqual(result.isLexical, false);
      assert.strictEqual(result.isCell, true);
      assert.strictEqual(result.type, ItemTypes.CELL);
    });

    test("returns unknown for unrecognized document type", () => {
      const document = {
        type: "something-else",
        name: "file.txt",
      } as unknown as Document;
      const result = detectDocumentType(document);

      assert.strictEqual(result.isNotebook, false);
      assert.strictEqual(result.isLexical, false);
      assert.strictEqual(result.isCell, false);
      assert.strictEqual(result.type, ItemTypes.UNKNOWN);
    });

    test("returns unknown when type is the UNKNOWN constant", () => {
      const document = {
        type: ItemTypes.UNKNOWN,
        name: "file",
      } as unknown as Document;
      const result = detectDocumentType(document);

      assert.strictEqual(result.isNotebook, false);
      assert.strictEqual(result.isLexical, false);
      assert.strictEqual(result.isCell, false);
      assert.strictEqual(result.type, ItemTypes.UNKNOWN);
    });

    test("returns unknown for empty string type", () => {
      const document = { type: "", name: "file" } as unknown as Document;
      const result = detectDocumentType(document);

      assert.strictEqual(result.isNotebook, false);
      assert.strictEqual(result.isLexical, false);
      assert.strictEqual(result.isCell, false);
      assert.strictEqual(result.type, ItemTypes.UNKNOWN);
    });

    test("detection is case-sensitive", () => {
      const document = {
        type: "NOTEBOOK",
        name: "test.ipynb",
      } as unknown as Document;
      const result = detectDocumentType(document);

      // ItemTypes.NOTEBOOK is "notebook" (lowercase), so "NOTEBOOK" should not match
      assert.strictEqual(result.isNotebook, false);
      assert.strictEqual(result.type, ItemTypes.UNKNOWN);
    });

    test("only one boolean flag is true at a time", () => {
      const types = [ItemTypes.NOTEBOOK, ItemTypes.LEXICAL, ItemTypes.CELL];

      for (const t of types) {
        const doc = { type: t, name: "test" } as unknown as Document;
        const result = detectDocumentType(doc);

        const trueCount = [
          result.isNotebook,
          result.isLexical,
          result.isCell,
        ].filter(Boolean).length;
        assert.strictEqual(
          trueCount,
          1,
          `Expected exactly one true flag for type "${t}", got ${trueCount}`,
        );
      }
    });

    test("all flags are false for unknown type", () => {
      const document = { type: "random", name: "test" } as unknown as Document;
      const result = detectDocumentType(document);

      const trueCount = [
        result.isNotebook,
        result.isLexical,
        result.isCell,
      ].filter(Boolean).length;
      assert.strictEqual(trueCount, 0);
    });

    test("result object has all expected properties", () => {
      const document = {
        type: ItemTypes.NOTEBOOK,
        name: "n",
      } as unknown as Document;
      const result = detectDocumentType(document);

      assert.ok("isNotebook" in result);
      assert.ok("isLexical" in result);
      assert.ok("isCell" in result);
      assert.ok("type" in result);
    });

    test("name property does not affect type detection", () => {
      // A document with .ipynb in name but lexical type should be lexical
      const document = {
        type: ItemTypes.LEXICAL,
        name: "misleading.ipynb",
      } as unknown as Document;
      const result = detectDocumentType(document);

      assert.strictEqual(result.isLexical, true);
      assert.strictEqual(result.isNotebook, false);
      assert.strictEqual(result.type, ItemTypes.LEXICAL);
    });
  });

  suite("getDocumentDisplayName", () => {
    test("adds .ipynb extension to notebook without extension", () => {
      const document = {
        type: ItemTypes.NOTEBOOK,
        name: "my-notebook",
      } as unknown as Document;
      const result = getDocumentDisplayName(document);

      assert.strictEqual(result, "my-notebook.ipynb");
    });

    test("preserves existing .ipynb extension on notebook", () => {
      const document = {
        type: ItemTypes.NOTEBOOK,
        name: "my-notebook.ipynb",
      } as unknown as Document;
      const result = getDocumentDisplayName(document);

      assert.strictEqual(result, "my-notebook.ipynb");
    });

    test("adds .dlex extension to lexical document without extension", () => {
      const document = {
        type: ItemTypes.LEXICAL,
        name: "my-document",
      } as unknown as Document;
      const result = getDocumentDisplayName(document);

      assert.strictEqual(result, "my-document.dlex");
    });

    test("preserves existing .dlex extension on lexical document", () => {
      const document = {
        type: ItemTypes.LEXICAL,
        name: "my-document.dlex",
      } as unknown as Document;
      const result = getDocumentDisplayName(document);

      assert.strictEqual(result, "my-document.dlex");
    });

    test("preserves existing .lexical extension (legacy support)", () => {
      const document = {
        type: ItemTypes.LEXICAL,
        name: "my-document.lexical",
      } as unknown as Document;
      const result = getDocumentDisplayName(document);

      assert.strictEqual(result, "my-document.lexical");
    });

    test("returns name unchanged for cell type", () => {
      const document = {
        type: ItemTypes.CELL,
        name: "cell-42",
      } as unknown as Document;
      const result = getDocumentDisplayName(document);

      assert.strictEqual(result, "cell-42");
    });

    test("returns name unchanged for unknown type", () => {
      const document = {
        type: "other",
        name: "something.txt",
      } as unknown as Document;
      const result = getDocumentDisplayName(document);

      assert.strictEqual(result, "something.txt");
    });

    test("uses provided typeInfo instead of auto-detecting", () => {
      const document = { name: "report" } as unknown as Document;
      const typeInfo = {
        isNotebook: true,
        isLexical: false,
        isCell: false,
        type: ItemTypes.NOTEBOOK,
      };
      const result = getDocumentDisplayName(document, typeInfo);

      assert.strictEqual(result, "report.ipynb");
    });

    test("uses provided typeInfo for lexical", () => {
      const document = { name: "notes" } as unknown as Document;
      const typeInfo = {
        isNotebook: false,
        isLexical: true,
        isCell: false,
        type: ItemTypes.LEXICAL,
      };
      const result = getDocumentDisplayName(document, typeInfo);

      assert.strictEqual(result, "notes.dlex");
    });

    test("handles names with multiple dots", () => {
      const document = {
        type: ItemTypes.NOTEBOOK,
        name: "my.notebook.file",
      } as unknown as Document;
      const result = getDocumentDisplayName(document);

      assert.strictEqual(result, "my.notebook.file.ipynb");
    });

    test("extension check is case-sensitive for .ipynb", () => {
      const document = {
        type: ItemTypes.NOTEBOOK,
        name: "notebook.IPYNB",
      } as unknown as Document;
      const result = getDocumentDisplayName(document);

      // endsWith is case-sensitive so .IPYNB does not match .ipynb
      assert.strictEqual(result, "notebook.IPYNB.ipynb");
    });

    test("extension check is case-sensitive for .dlex", () => {
      const document = {
        type: ItemTypes.LEXICAL,
        name: "document.DLEX",
      } as unknown as Document;
      const result = getDocumentDisplayName(document);

      assert.strictEqual(result, "document.DLEX.dlex");
    });

    test("handles empty name for notebook", () => {
      const document = {
        type: ItemTypes.NOTEBOOK,
        name: "",
      } as unknown as Document;
      const result = getDocumentDisplayName(document);

      assert.strictEqual(result, ".ipynb");
    });

    test("handles empty name for lexical", () => {
      const document = {
        type: ItemTypes.LEXICAL,
        name: "",
      } as unknown as Document;
      const result = getDocumentDisplayName(document);

      assert.strictEqual(result, ".dlex");
    });

    test("handles empty name for unknown type", () => {
      const document = { type: "other", name: "" } as unknown as Document;
      const result = getDocumentDisplayName(document);

      assert.strictEqual(result, "");
    });
  });
});
