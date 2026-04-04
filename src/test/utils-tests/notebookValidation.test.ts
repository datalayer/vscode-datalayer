/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Tests for notebook validation utilities.
 * Validates URI scheme and viewType detection for Datalayer notebooks.
 */

import * as assert from "assert";
import * as vscode from "vscode";

import {
  isDatalayerNotebook,
  validateDatalayerNotebook,
} from "../../utils/notebookValidation";

suite("Notebook Validation Tests", () => {
  suite("isDatalayerNotebook", () => {
    test("returns true for datalayer:// scheme URI", () => {
      const uri = vscode.Uri.parse("datalayer://space/notebook.ipynb");
      assert.strictEqual(isDatalayerNotebook(uri), true);
    });

    test("returns true for datalayer:// scheme with lexical file", () => {
      const uri = vscode.Uri.parse("datalayer://space/doc.lexical");
      assert.strictEqual(isDatalayerNotebook(uri), true);
    });

    test("returns true for local .ipynb file with file:// scheme", () => {
      const uri = vscode.Uri.file("/path/to/notebook.ipynb");
      assert.strictEqual(isDatalayerNotebook(uri), true);
    });

    test("returns false for local non-ipynb file with file:// scheme", () => {
      const uri = vscode.Uri.file("/path/to/file.txt");
      assert.strictEqual(isDatalayerNotebook(uri), false);
    });

    test("returns false for local .py file with file:// scheme", () => {
      const uri = vscode.Uri.file("/path/to/script.py");
      assert.strictEqual(isDatalayerNotebook(uri), false);
    });

    test("returns false for untitled scheme without .ipynb", () => {
      const uri = vscode.Uri.parse("untitled:Untitled-1");
      assert.strictEqual(isDatalayerNotebook(uri), false);
    });

    test("returns false for vscode-notebook-cell scheme", () => {
      const uri = vscode.Uri.parse(
        "vscode-notebook-cell://notebook.ipynb#cell1",
      );
      assert.strictEqual(isDatalayerNotebook(uri), false);
    });

    test("returns false for https scheme", () => {
      const uri = vscode.Uri.parse("https://example.com/notebook.ipynb");
      assert.strictEqual(isDatalayerNotebook(uri), false);
    });

    test("returns true for datalayer:// scheme regardless of extension", () => {
      const uri = vscode.Uri.parse("datalayer://space/anyfile.txt");
      assert.strictEqual(isDatalayerNotebook(uri), true);
    });
  });

  suite("validateDatalayerNotebook", () => {
    test("does not throw for datalayer:// scheme URI", () => {
      const uri = vscode.Uri.parse("datalayer://space/notebook.ipynb");
      assert.doesNotThrow(() => validateDatalayerNotebook(uri));
    });

    test("does not throw for local .ipynb file", () => {
      const uri = vscode.Uri.file("/path/to/notebook.ipynb");
      assert.doesNotThrow(() => validateDatalayerNotebook(uri));
    });

    test("throws for non-Datalayer URI", () => {
      const uri = vscode.Uri.file("/path/to/file.txt");
      assert.throws(
        () => validateDatalayerNotebook(uri),
        (err: Error) => {
          assert.ok(
            err.message.includes("This tool only works with Datalayer"),
          );
          return true;
        },
      );
    });

    test("throws with URI details in error message", () => {
      const uri = vscode.Uri.parse("https://example.com/notebook.ipynb");
      assert.throws(
        () => validateDatalayerNotebook(uri),
        (err: Error) => {
          assert.ok(err.message.includes("Scheme: https"));
          return true;
        },
      );
    });

    test("throws with guidance to use Datalayer extension", () => {
      const uri = vscode.Uri.file("/path/to/readme.md");
      assert.throws(
        () => validateDatalayerNotebook(uri),
        (err: Error) => {
          assert.ok(
            err.message.includes("Please open the notebook with the Datalayer"),
          );
          return true;
        },
      );
    });
  });
});
