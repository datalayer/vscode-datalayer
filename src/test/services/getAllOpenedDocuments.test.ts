/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import * as assert from "assert";

import type {
  DocumentType,
  EditorType,
} from "../../utils/getAllOpenedDocuments";
import { getAllOpenedDocuments } from "../../utils/getAllOpenedDocuments";

/**
 * We test the public getAllOpenedDocuments function and verify structure.
 * The classifyDocumentType and classifyEditorType functions are private,
 * so we test them indirectly through the public API, and also verify
 * the interface structure of the result.
 */

suite("getAllOpenedDocuments Tests", () => {
  suite("getAllOpenedDocuments function", () => {
    test("returns an AllOpenedDocumentsContext", () => {
      const context = getAllOpenedDocuments();

      assert.ok(context);
      assert.ok("allDocuments" in context);
      assert.ok("totalCount" in context);
      assert.ok("counts" in context);
      assert.ok("activeDocument" in context);
    });

    test("allDocuments is an array", () => {
      const context = getAllOpenedDocuments();

      assert.ok(Array.isArray(context.allDocuments));
    });

    test("totalCount matches allDocuments length", () => {
      const context = getAllOpenedDocuments();

      assert.strictEqual(context.totalCount, context.allDocuments.length);
    });

    test("counts has all expected keys", () => {
      const context = getAllOpenedDocuments();

      assert.ok("notebook" in context.counts);
      assert.ok("lexical" in context.counts);
      assert.ok("text" in context.counts);
      assert.ok("other" in context.counts);
      assert.ok("unknown" in context.counts);
    });

    test("counts sum equals totalCount", () => {
      const context = getAllOpenedDocuments();
      const sum =
        context.counts.notebook +
        context.counts.lexical +
        context.counts.text +
        context.counts.other +
        context.counts.unknown;

      assert.strictEqual(sum, context.totalCount);
    });

    test("all counts are non-negative", () => {
      const context = getAllOpenedDocuments();

      assert.ok(context.counts.notebook >= 0);
      assert.ok(context.counts.lexical >= 0);
      assert.ok(context.counts.text >= 0);
      assert.ok(context.counts.other >= 0);
      assert.ok(context.counts.unknown >= 0);
    });

    test("each document has required fields", () => {
      const context = getAllOpenedDocuments();

      for (const doc of context.allDocuments) {
        assert.ok("uri" in doc, "Document missing uri");
        assert.ok("type" in doc, "Document missing type");
        assert.ok("editorType" in doc, "Document missing editorType");
        assert.ok("fileName" in doc, "Document missing fileName");
        assert.ok("isActive" in doc, "Document missing isActive");
        assert.ok("scheme" in doc, "Document missing scheme");
      }
    });

    test("document types are valid", () => {
      const validTypes: DocumentType[] = [
        "notebook",
        "lexical",
        "text",
        "other",
        "unknown",
      ];
      const context = getAllOpenedDocuments();

      for (const doc of context.allDocuments) {
        assert.ok(
          validTypes.includes(doc.type),
          `Invalid document type: ${doc.type}`,
        );
      }
    });

    test("editor types are valid", () => {
      const validTypes: EditorType[] = [
        "datalayer-notebook",
        "datalayer-lexical",
        "native-notebook",
        "text-editor",
        "other",
        "unknown",
      ];
      const context = getAllOpenedDocuments();

      for (const doc of context.allDocuments) {
        assert.ok(
          validTypes.includes(doc.editorType),
          `Invalid editor type: ${doc.editorType}`,
        );
      }
    });

    test("at most one document is active", () => {
      const context = getAllOpenedDocuments();
      const activeCount = context.allDocuments.filter((d) => d.isActive).length;

      assert.ok(
        activeCount <= 1,
        `Expected at most 1 active document, found ${activeCount}`,
      );
    });

    test("activeDocument is undefined or matches an active document", () => {
      const context = getAllOpenedDocuments();

      if (context.activeDocument) {
        assert.strictEqual(context.activeDocument.isActive, true);
        const found = context.allDocuments.find(
          (d) => d.uri === context.activeDocument!.uri,
        );
        assert.ok(found, "Active document not found in allDocuments");
      }
    });
  });

  suite("DocumentType classification", () => {
    test("type includes expected values as constants", () => {
      // Verify the type literals exist
      const types: DocumentType[] = [
        "notebook",
        "lexical",
        "text",
        "other",
        "unknown",
      ];
      assert.strictEqual(types.length, 5);
    });
  });

  suite("EditorType classification", () => {
    test("type includes expected values as constants", () => {
      const types: EditorType[] = [
        "datalayer-notebook",
        "datalayer-lexical",
        "native-notebook",
        "text-editor",
        "other",
        "unknown",
      ];
      assert.strictEqual(types.length, 6);
    });
  });
});
