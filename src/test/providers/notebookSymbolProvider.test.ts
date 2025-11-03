/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import * as assert from "assert";
import * as vscode from "vscode";
import { NotebookSymbolProvider } from "../../providers/notebookSymbolProvider";

suite("NotebookSymbolProvider Tests", () => {
  let provider: NotebookSymbolProvider;

  setup(() => {
    provider = new NotebookSymbolProvider();
  });

  test("returns empty array for non-.ipynb files", async () => {
    const doc = await vscode.workspace.openTextDocument({
      content: "{}",
      language: "json",
    });

    const symbols = await provider.provideDocumentSymbols(
      doc,
      new vscode.CancellationTokenSource().token,
    );

    assert.strictEqual(symbols.length, 0);
  });

  test("extracts markdown heading from notebook cell", async () => {
    const notebookContent = JSON.stringify({
      cells: [
        {
          cell_type: "markdown",
          source: "# Main Title",
          metadata: {},
        },
      ],
      metadata: {},
      nbformat: 4,
      nbformat_minor: 5,
    });

    // Create a temporary file with .ipynb extension
    const uri = vscode.Uri.file("/tmp/test-notebook.ipynb");
    const doc = await vscode.workspace.openTextDocument(uri.with({
      scheme: "untitled",
    }));

    // Mock the document by creating a TextDocument-like object
    const mockDoc = {
      ...doc,
      fileName: "/tmp/test.ipynb",
      getText: () => notebookContent,
      lineCount: 10,
      positionAt: (offset: number) => new vscode.Position(0, offset),
    } as vscode.TextDocument;

    const symbols = await provider.provideDocumentSymbols(
      mockDoc,
      new vscode.CancellationTokenSource().token,
    );

    assert.ok(symbols.length > 0, "Should extract at least one symbol");
    const mainSymbol = symbols.find((s) => s.name === "Main Title");
    assert.ok(mainSymbol, "Should find Main Title symbol");
    assert.strictEqual(mainSymbol?.detail, "H1");
    assert.strictEqual(mainSymbol?.kind, vscode.SymbolKind.Module);
  });

  test("extracts hierarchical markdown headings", async () => {
    const notebookContent = JSON.stringify({
      cells: [
        {
          cell_type: "markdown",
          source: ["# Main\n", "## Sub1\n", "## Sub2"],
          metadata: {},
        },
      ],
      metadata: {},
      nbformat: 4,
      nbformat_minor: 5,
    });

    const uri = vscode.Uri.file("/tmp/test-notebook.ipynb");
    const doc = await vscode.workspace.openTextDocument(uri.with({
      scheme: "untitled",
    }));

    const mockDoc = {
      ...doc,
      fileName: "/tmp/test.ipynb",
      getText: () => notebookContent,
      lineCount: 10,
      positionAt: (offset: number) => new vscode.Position(0, offset),
    } as vscode.TextDocument;

    const symbols = await provider.provideDocumentSymbols(
      mockDoc,
      new vscode.CancellationTokenSource().token,
    );

    const mainSymbol = symbols.find((s) => s.name === "Main");
    assert.ok(mainSymbol, "Should find Main heading");
    assert.strictEqual(mainSymbol?.children.length, 2, "Should have 2 children");
    assert.strictEqual(mainSymbol?.children[0].name, "Sub1");
    assert.strictEqual(mainSymbol?.children[1].name, "Sub2");
  });

  test("extracts code cell with execution count", async () => {
    const notebookContent = JSON.stringify({
      cells: [
        {
          cell_type: "code",
          source: "print('hello')",
          execution_count: 1,
          metadata: {},
        },
      ],
      metadata: {},
      nbformat: 4,
      nbformat_minor: 5,
    });

    const uri = vscode.Uri.file("/tmp/test-notebook.ipynb");
    const doc = await vscode.workspace.openTextDocument(uri.with({
      scheme: "untitled",
    }));

    const mockDoc = {
      ...doc,
      fileName: "/tmp/test.ipynb",
      getText: () => notebookContent,
      lineCount: 10,
      positionAt: (offset: number) => new vscode.Position(0, offset),
    } as vscode.TextDocument;

    const symbols = await provider.provideDocumentSymbols(
      mockDoc,
      new vscode.CancellationTokenSource().token,
    );

    const codeSymbol = symbols.find((s) => s.name === "[1]");
    assert.ok(codeSymbol, "Should find code cell symbol");
    assert.strictEqual(codeSymbol?.kind, vscode.SymbolKind.Function);
    assert.ok(codeSymbol?.detail.includes("Code cell"));
  });

  test("extracts code cell without execution count", async () => {
    const notebookContent = JSON.stringify({
      cells: [
        {
          cell_type: "code",
          source: "print('hello')",
          execution_count: null,
          metadata: {},
        },
      ],
      metadata: {},
      nbformat: 4,
      nbformat_minor: 5,
    });

    const uri = vscode.Uri.file("/tmp/test-notebook.ipynb");
    const doc = await vscode.workspace.openTextDocument(uri.with({
      scheme: "untitled",
    }));

    const mockDoc = {
      ...doc,
      fileName: "/tmp/test.ipynb",
      getText: () => notebookContent,
      lineCount: 10,
      positionAt: (offset: number) => new vscode.Position(0, offset),
    } as vscode.TextDocument;

    const symbols = await provider.provideDocumentSymbols(
      mockDoc,
      new vscode.CancellationTokenSource().token,
    );

    const codeSymbol = symbols.find((s) => s.name.includes("["));
    assert.ok(codeSymbol, "Should find code cell symbol");
    assert.ok(
      codeSymbol?.name === "[ ]" || codeSymbol?.name.includes(" "),
      "Should show empty or space for no execution count",
    );
  });

  test("handles mixed markdown and code cells", async () => {
    const notebookContent = JSON.stringify({
      cells: [
        {
          cell_type: "markdown",
          source: "# Introduction",
          metadata: {},
        },
        {
          cell_type: "code",
          source: "import numpy",
          execution_count: 1,
          metadata: {},
        },
        {
          cell_type: "markdown",
          source: "## Analysis",
          metadata: {},
        },
        {
          cell_type: "code",
          source: "data = np.array([])",
          execution_count: 2,
          metadata: {},
        },
      ],
      metadata: {},
      nbformat: 4,
      nbformat_minor: 5,
    });

    const uri = vscode.Uri.file("/tmp/test-notebook.ipynb");
    const doc = await vscode.workspace.openTextDocument(uri.with({
      scheme: "untitled",
    }));

    const mockDoc = {
      ...doc,
      fileName: "/tmp/test.ipynb",
      getText: () => notebookContent,
      lineCount: 20,
      positionAt: (offset: number) => new vscode.Position(0, offset),
    } as vscode.TextDocument;

    const symbols = await provider.provideDocumentSymbols(
      mockDoc,
      new vscode.CancellationTokenSource().token,
    );

    assert.ok(symbols.length >= 2, "Should have at least 2 symbols");

    const introSymbol = symbols.find((s) => s.name === "Introduction");
    const code1Symbol = symbols.find((s) => s.name === "[1]");

    assert.ok(introSymbol, "Should find Introduction heading");
    assert.ok(code1Symbol, "Should find code cell [1]");
  });

  test("returns empty array for empty notebook", async () => {
    const notebookContent = JSON.stringify({
      cells: [],
      metadata: {},
      nbformat: 4,
      nbformat_minor: 5,
    });

    const uri = vscode.Uri.file("/tmp/test-notebook.ipynb");
    const doc = await vscode.workspace.openTextDocument(uri.with({
      scheme: "untitled",
    }));

    const mockDoc = {
      ...doc,
      fileName: "/tmp/test.ipynb",
      getText: () => notebookContent,
      lineCount: 5,
      positionAt: (offset: number) => new vscode.Position(0, offset),
    } as vscode.TextDocument;

    const symbols = await provider.provideDocumentSymbols(
      mockDoc,
      new vscode.CancellationTokenSource().token,
    );

    assert.strictEqual(symbols.length, 0);
  });

  test("handles malformed JSON gracefully", async () => {
    const notebookContent = "{ invalid json }";

    const uri = vscode.Uri.file("/tmp/test-notebook.ipynb");
    const doc = await vscode.workspace.openTextDocument(uri.with({
      scheme: "untitled",
    }));

    const mockDoc = {
      ...doc,
      fileName: "/tmp/test.ipynb",
      getText: () => notebookContent,
      lineCount: 1,
      positionAt: (offset: number) => new vscode.Position(0, offset),
    } as vscode.TextDocument;

    const symbols = await provider.provideDocumentSymbols(
      mockDoc,
      new vscode.CancellationTokenSource().token,
    );

    // Should return empty array on error, not throw
    assert.strictEqual(symbols.length, 0);
  });

  test("respects cancellation token", async () => {
    const notebookContent = JSON.stringify({
      cells: [
        {
          cell_type: "markdown",
          source: "# Test",
          metadata: {},
        },
      ],
      metadata: {},
      nbformat: 4,
      nbformat_minor: 5,
    });

    const uri = vscode.Uri.file("/tmp/test-notebook.ipynb");
    const doc = await vscode.workspace.openTextDocument(uri.with({
      scheme: "untitled",
    }));

    const mockDoc = {
      ...doc,
      fileName: "/tmp/test.ipynb",
      getText: () => notebookContent,
      lineCount: 10,
      positionAt: (offset: number) => new vscode.Position(0, offset),
    } as vscode.TextDocument;

    const tokenSource = new vscode.CancellationTokenSource();
    tokenSource.cancel(); // Cancel immediately

    const symbols = await provider.provideDocumentSymbols(
      mockDoc,
      tokenSource.token,
    );

    // Should return empty array when cancelled
    assert.strictEqual(symbols.length, 0);
  });
});
