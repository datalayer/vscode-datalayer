/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import * as assert from "assert";
import * as vscode from "vscode";
import { LexicalSymbolProvider } from "../../providers/lexicalSymbolProvider";

suite("LexicalSymbolProvider Tests", () => {
  let provider: LexicalSymbolProvider;

  setup(() => {
    provider = new LexicalSymbolProvider();
  });

  test("returns empty array for non-.lexical files", async () => {
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

  test("extracts single heading from Lexical document", async () => {
    const lexicalContent = JSON.stringify({
      root: {
        children: [
          {
            type: "heading",
            tag: "h1",
            children: [
              {
                type: "text",
                text: "Main Title",
              },
            ],
          },
        ],
        direction: null,
        format: "",
        indent: 0,
        type: "root",
        version: 1,
      },
    });

    const uri = vscode.Uri.file("/tmp/test-document.lexical");
    const doc = await vscode.workspace.openTextDocument(uri.with({
      scheme: "untitled",
    }));

    const mockDoc = {
      ...doc,
      fileName: "/tmp/test.lexical",
      getText: () => lexicalContent,
      lineCount: 10,
      positionAt: (offset: number) => new vscode.Position(0, offset),
    } as vscode.TextDocument;

    const symbols = await provider.provideDocumentSymbols(
      mockDoc,
      new vscode.CancellationTokenSource().token,
    );

    assert.strictEqual(symbols.length, 1);
    assert.strictEqual(symbols[0].name, "Main Title");
    assert.strictEqual(symbols[0].detail, "H1");
    assert.strictEqual(symbols[0].kind, vscode.SymbolKind.Module);
  });

  test("extracts hierarchical headings", async () => {
    const lexicalContent = JSON.stringify({
      root: {
        children: [
          {
            type: "heading",
            tag: "h1",
            children: [{ type: "text", text: "Main" }],
          },
          {
            type: "heading",
            tag: "h2",
            children: [{ type: "text", text: "Subsection 1" }],
          },
          {
            type: "heading",
            tag: "h2",
            children: [{ type: "text", text: "Subsection 2" }],
          },
          {
            type: "heading",
            tag: "h3",
            children: [{ type: "text", text: "Details" }],
          },
        ],
        direction: null,
        format: "",
        indent: 0,
        type: "root",
        version: 1,
      },
    });

    const uri = vscode.Uri.file("/tmp/test-document.lexical");
    const doc = await vscode.workspace.openTextDocument(uri.with({
      scheme: "untitled",
    }));

    const mockDoc = {
      ...doc,
      fileName: "/tmp/test.lexical",
      getText: () => lexicalContent,
      lineCount: 20,
      positionAt: (offset: number) => new vscode.Position(0, offset),
    } as vscode.TextDocument;

    const symbols = await provider.provideDocumentSymbols(
      mockDoc,
      new vscode.CancellationTokenSource().token,
    );

    assert.strictEqual(symbols.length, 1);
    assert.strictEqual(symbols[0].name, "Main");
    assert.strictEqual(symbols[0].children.length, 2);
    assert.strictEqual(symbols[0].children[0].name, "Subsection 1");
    assert.strictEqual(symbols[0].children[1].name, "Subsection 2");
    assert.strictEqual(symbols[0].children[1].children.length, 1);
    assert.strictEqual(symbols[0].children[1].children[0].name, "Details");
  });

  test("extracts all heading levels H1-H6", async () => {
    const lexicalContent = JSON.stringify({
      root: {
        children: [
          {
            type: "heading",
            tag: "h1",
            children: [{ type: "text", text: "H1 Heading" }],
          },
          {
            type: "heading",
            tag: "h2",
            children: [{ type: "text", text: "H2 Heading" }],
          },
          {
            type: "heading",
            tag: "h3",
            children: [{ type: "text", text: "H3 Heading" }],
          },
          {
            type: "heading",
            tag: "h4",
            children: [{ type: "text", text: "H4 Heading" }],
          },
          {
            type: "heading",
            tag: "h5",
            children: [{ type: "text", text: "H5 Heading" }],
          },
          {
            type: "heading",
            tag: "h6",
            children: [{ type: "text", text: "H6 Heading" }],
          },
        ],
        direction: null,
        format: "",
        indent: 0,
        type: "root",
        version: 1,
      },
    });

    const uri = vscode.Uri.file("/tmp/test-document.lexical");
    const doc = await vscode.workspace.openTextDocument(uri.with({
      scheme: "untitled",
    }));

    const mockDoc = {
      ...doc,
      fileName: "/tmp/test.lexical",
      getText: () => lexicalContent,
      lineCount: 30,
      positionAt: (offset: number) => new vscode.Position(0, offset),
    } as vscode.TextDocument;

    const symbols = await provider.provideDocumentSymbols(
      mockDoc,
      new vscode.CancellationTokenSource().token,
    );

    // H1 at root
    assert.strictEqual(symbols.length, 1);
    assert.strictEqual(symbols[0].detail, "H1");

    // H2-H6 nested
    let currentSymbol = symbols[0];
    for (let level = 2; level <= 6; level++) {
      assert.strictEqual(currentSymbol.children.length, 1);
      currentSymbol = currentSymbol.children[0];
      assert.strictEqual(currentSymbol.detail, `H${level}`);
    }
  });

  test("ignores non-heading nodes", async () => {
    const lexicalContent = JSON.stringify({
      root: {
        children: [
          {
            type: "paragraph",
            children: [{ type: "text", text: "Regular paragraph" }],
          },
          {
            type: "heading",
            tag: "h1",
            children: [{ type: "text", text: "Only Heading" }],
          },
          {
            type: "list",
            children: [{ type: "text", text: "List item" }],
          },
        ],
        direction: null,
        format: "",
        indent: 0,
        type: "root",
        version: 1,
      },
    });

    const uri = vscode.Uri.file("/tmp/test-document.lexical");
    const doc = await vscode.workspace.openTextDocument(uri.with({
      scheme: "untitled",
    }));

    const mockDoc = {
      ...doc,
      fileName: "/tmp/test.lexical",
      getText: () => lexicalContent,
      lineCount: 15,
      positionAt: (offset: number) => new vscode.Position(0, offset),
    } as vscode.TextDocument;

    const symbols = await provider.provideDocumentSymbols(
      mockDoc,
      new vscode.CancellationTokenSource().token,
    );

    assert.strictEqual(symbols.length, 1);
    assert.strictEqual(symbols[0].name, "Only Heading");
  });

  test("extracts text from nested children", async () => {
    const lexicalContent = JSON.stringify({
      root: {
        children: [
          {
            type: "heading",
            tag: "h1",
            children: [
              {
                type: "text",
                text: "Part 1 ",
              },
              {
                type: "text",
                text: "Part 2",
              },
            ],
          },
        ],
        direction: null,
        format: "",
        indent: 0,
        type: "root",
        version: 1,
      },
    });

    const uri = vscode.Uri.file("/tmp/test-document.lexical");
    const doc = await vscode.workspace.openTextDocument(uri.with({
      scheme: "untitled",
    }));

    const mockDoc = {
      ...doc,
      fileName: "/tmp/test.lexical",
      getText: () => lexicalContent,
      lineCount: 10,
      positionAt: (offset: number) => new vscode.Position(0, offset),
    } as vscode.TextDocument;

    const symbols = await provider.provideDocumentSymbols(
      mockDoc,
      new vscode.CancellationTokenSource().token,
    );

    assert.strictEqual(symbols.length, 1);
    assert.strictEqual(symbols[0].name, "Part 1 Part 2");
  });

  test("returns empty array for empty document", async () => {
    const lexicalContent = JSON.stringify({
      root: {
        children: [],
        direction: null,
        format: "",
        indent: 0,
        type: "root",
        version: 1,
      },
    });

    const uri = vscode.Uri.file("/tmp/test-document.lexical");
    const doc = await vscode.workspace.openTextDocument(uri.with({
      scheme: "untitled",
    }));

    const mockDoc = {
      ...doc,
      fileName: "/tmp/test.lexical",
      getText: () => lexicalContent,
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
    const lexicalContent = "{ invalid json }";

    const uri = vscode.Uri.file("/tmp/test-document.lexical");
    const doc = await vscode.workspace.openTextDocument(uri.with({
      scheme: "untitled",
    }));

    const mockDoc = {
      ...doc,
      fileName: "/tmp/test.lexical",
      getText: () => lexicalContent,
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
    const lexicalContent = JSON.stringify({
      root: {
        children: [
          {
            type: "heading",
            tag: "h1",
            children: [{ type: "text", text: "Test" }],
          },
        ],
        direction: null,
        format: "",
        indent: 0,
        type: "root",
        version: 1,
      },
    });

    const uri = vscode.Uri.file("/tmp/test-document.lexical");
    const doc = await vscode.workspace.openTextDocument(uri.with({
      scheme: "untitled",
    }));

    const mockDoc = {
      ...doc,
      fileName: "/tmp/test.lexical",
      getText: () => lexicalContent,
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

  test("ignores headings with empty text", async () => {
    const lexicalContent = JSON.stringify({
      root: {
        children: [
          {
            type: "heading",
            tag: "h1",
            children: [{ type: "text", text: "" }],
          },
          {
            type: "heading",
            tag: "h2",
            children: [{ type: "text", text: "Valid Heading" }],
          },
        ],
        direction: null,
        format: "",
        indent: 0,
        type: "root",
        version: 1,
      },
    });

    const uri = vscode.Uri.file("/tmp/test-document.lexical");
    const doc = await vscode.workspace.openTextDocument(uri.with({
      scheme: "untitled",
    }));

    const mockDoc = {
      ...doc,
      fileName: "/tmp/test.lexical",
      getText: () => lexicalContent,
      lineCount: 10,
      positionAt: (offset: number) => new vscode.Position(0, offset),
    } as vscode.TextDocument;

    const symbols = await provider.provideDocumentSymbols(
      mockDoc,
      new vscode.CancellationTokenSource().token,
    );

    assert.strictEqual(symbols.length, 1);
    assert.strictEqual(symbols[0].name, "Valid Heading");
  });
});
