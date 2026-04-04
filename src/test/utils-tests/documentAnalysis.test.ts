/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Tests for document analysis utilities.
 * Validates URI classification and Datalayer document detection.
 */

import * as assert from "assert";
import * as vscode from "vscode";

import {
  isCloudNotebook,
  isDatalayerNotebook,
  isLocalNotebook,
} from "../../utils/documentAnalysis";

suite("Document Analysis Tests", () => {
  suite("isDatalayerNotebook", () => {
    test("returns true for datalayer:// scheme URI", () => {
      const uri = vscode.Uri.parse("datalayer://space/notebook.ipynb");
      assert.strictEqual(isDatalayerNotebook(uri), true);
    });

    test("returns true for datalayer:// scheme with any extension", () => {
      const uri = vscode.Uri.parse("datalayer://space/doc.lexical");
      assert.strictEqual(isDatalayerNotebook(uri), true);
    });

    test("returns true for local .ipynb file", () => {
      const uri = vscode.Uri.file("/path/to/notebook.ipynb");
      assert.strictEqual(isDatalayerNotebook(uri), true);
    });

    test("returns true for local .dlex file", () => {
      const uri = vscode.Uri.file("/path/to/doc.dlex");
      assert.strictEqual(isDatalayerNotebook(uri), true);
    });

    test("returns true for local .lexical file", () => {
      const uri = vscode.Uri.file("/path/to/doc.lexical");
      assert.strictEqual(isDatalayerNotebook(uri), true);
    });

    test("returns false for local .py file", () => {
      const uri = vscode.Uri.file("/path/to/script.py");
      assert.strictEqual(isDatalayerNotebook(uri), false);
    });

    test("returns false for local .txt file", () => {
      const uri = vscode.Uri.file("/path/to/readme.txt");
      assert.strictEqual(isDatalayerNotebook(uri), false);
    });

    test("returns false for https scheme", () => {
      const uri = vscode.Uri.parse("https://example.com/notebook.ipynb");
      assert.strictEqual(isDatalayerNotebook(uri), false);
    });

    test("returns false for vscode-notebook-cell scheme", () => {
      const uri = vscode.Uri.parse(
        "vscode-notebook-cell://notebook.ipynb#cell1",
      );
      assert.strictEqual(isDatalayerNotebook(uri), false);
    });

    test("returns false for local .md file", () => {
      const uri = vscode.Uri.file("/path/to/README.md");
      assert.strictEqual(isDatalayerNotebook(uri), false);
    });
  });

  suite("isCloudNotebook", () => {
    test("returns true for datalayer:// scheme", () => {
      const uri = vscode.Uri.parse("datalayer://space/doc.ipynb");
      assert.strictEqual(isCloudNotebook(uri), true);
    });

    test("returns false for file:// scheme", () => {
      const uri = vscode.Uri.file("/path/to/notebook.ipynb");
      assert.strictEqual(isCloudNotebook(uri), false);
    });

    test("returns false for https:// scheme", () => {
      const uri = vscode.Uri.parse("https://example.com/notebook.ipynb");
      assert.strictEqual(isCloudNotebook(uri), false);
    });
  });

  suite("isLocalNotebook", () => {
    test("returns true for file:// .ipynb", () => {
      const uri = vscode.Uri.file("/path/to/notebook.ipynb");
      assert.strictEqual(isLocalNotebook(uri), true);
    });

    test("returns true for file:// .dlex", () => {
      const uri = vscode.Uri.file("/path/to/doc.dlex");
      assert.strictEqual(isLocalNotebook(uri), true);
    });

    test("returns true for file:// .lexical", () => {
      const uri = vscode.Uri.file("/path/to/doc.lexical");
      assert.strictEqual(isLocalNotebook(uri), true);
    });

    test("returns false for file:// .py", () => {
      const uri = vscode.Uri.file("/path/to/script.py");
      assert.strictEqual(isLocalNotebook(uri), false);
    });

    test("returns false for file:// .txt", () => {
      const uri = vscode.Uri.file("/path/to/notes.txt");
      assert.strictEqual(isLocalNotebook(uri), false);
    });

    test("returns false for datalayer:// scheme even with .ipynb", () => {
      const uri = vscode.Uri.parse("datalayer://space/notebook.ipynb");
      assert.strictEqual(isLocalNotebook(uri), false);
    });

    test("returns false for https:// scheme with .ipynb", () => {
      const uri = vscode.Uri.parse("https://example.com/notebook.ipynb");
      assert.strictEqual(isLocalNotebook(uri), false);
    });
  });
});
