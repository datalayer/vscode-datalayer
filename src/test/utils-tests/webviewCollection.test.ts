/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Tests for WebviewCollection utility.
 * Validates add, get, iteration, and auto-cleanup on dispose.
 */

import * as assert from "assert";
import * as vscode from "vscode";

import { WebviewCollection } from "../../utils/webviewCollection";

/**
 * Creates a minimal mock WebviewPanel for testing.
 * Tracks dispose listeners so tests can simulate panel disposal.
 */
function createMockWebviewPanel(): {
  panel: vscode.WebviewPanel;
  triggerDispose: () => void;
} {
  const disposeListeners: Array<() => void> = [];

  const panel = {
    onDidDispose: (listener: () => void) => {
      disposeListeners.push(listener);
      return { dispose: () => {} };
    },
    viewType: "test",
    title: "Test Panel",
    webview: {} as vscode.Webview,
    dispose: () => {},
  } as unknown as vscode.WebviewPanel;

  return {
    panel,
    triggerDispose: () => {
      for (const listener of disposeListeners) {
        listener();
      }
    },
  };
}

/** Collects all items from an iterable into an array. */
function collectIterable<T>(iterable: Iterable<T>): T[] {
  const items: T[] = [];
  for (const item of iterable) {
    items.push(item);
  }
  return items;
}

suite("WebviewCollection Tests", () => {
  let collection: WebviewCollection;

  setup(() => {
    collection = new WebviewCollection();
  });

  suite("add and get", () => {
    test("returns empty iterable for unknown URI", () => {
      const uri = vscode.Uri.file("/path/to/unknown.ipynb");
      const panels = collectIterable(collection.get(uri));

      assert.strictEqual(panels.length, 0);
    });

    test("returns added webview panel for matching URI", () => {
      const uri = vscode.Uri.file("/path/to/notebook.ipynb");
      const { panel } = createMockWebviewPanel();

      collection.add(uri, panel);

      const panels = collectIterable(collection.get(uri));
      assert.strictEqual(panels.length, 1);
      assert.strictEqual(panels[0], panel);
    });

    test("returns multiple panels for same URI", () => {
      const uri = vscode.Uri.file("/path/to/notebook.ipynb");
      const { panel: panel1 } = createMockWebviewPanel();
      const { panel: panel2 } = createMockWebviewPanel();

      collection.add(uri, panel1);
      collection.add(uri, panel2);

      const panels = collectIterable(collection.get(uri));
      assert.strictEqual(panels.length, 2);
      assert.ok(panels.includes(panel1));
      assert.ok(panels.includes(panel2));
    });

    test("does not return panels for different URI", () => {
      const uri1 = vscode.Uri.file("/path/to/notebook1.ipynb");
      const uri2 = vscode.Uri.file("/path/to/notebook2.ipynb");
      const { panel } = createMockWebviewPanel();

      collection.add(uri1, panel);

      const panels = collectIterable(collection.get(uri2));
      assert.strictEqual(panels.length, 0);
    });

    test("handles datalayer:// scheme URIs", () => {
      const uri = vscode.Uri.parse("datalayer://space/doc.ipynb");
      const { panel } = createMockWebviewPanel();

      collection.add(uri, panel);

      const panels = collectIterable(collection.get(uri));
      assert.strictEqual(panels.length, 1);
      assert.strictEqual(panels[0], panel);
    });
  });

  suite("auto-cleanup on dispose", () => {
    test("removes panel when it is disposed", () => {
      const uri = vscode.Uri.file("/path/to/notebook.ipynb");
      const { panel, triggerDispose } = createMockWebviewPanel();

      collection.add(uri, panel);

      // Verify panel is present before dispose.
      let panels = collectIterable(collection.get(uri));
      assert.strictEqual(panels.length, 1);

      // Simulate disposal.
      triggerDispose();

      // Verify panel is removed after dispose.
      panels = collectIterable(collection.get(uri));
      assert.strictEqual(panels.length, 0);
    });

    test("only removes the disposed panel, leaves others", () => {
      const uri = vscode.Uri.file("/path/to/notebook.ipynb");
      const { panel: panel1, triggerDispose: dispose1 } =
        createMockWebviewPanel();
      const { panel: panel2 } = createMockWebviewPanel();

      collection.add(uri, panel1);
      collection.add(uri, panel2);

      dispose1();

      const panels = collectIterable(collection.get(uri));
      assert.strictEqual(panels.length, 1);
      assert.strictEqual(panels[0], panel2);
    });

    test("handles disposing panels from different URIs independently", () => {
      const uri1 = vscode.Uri.file("/path/to/notebook1.ipynb");
      const uri2 = vscode.Uri.file("/path/to/notebook2.ipynb");
      const { panel: panel1, triggerDispose: dispose1 } =
        createMockWebviewPanel();
      const { panel: panel2 } = createMockWebviewPanel();

      collection.add(uri1, panel1);
      collection.add(uri2, panel2);

      dispose1();

      const panels1 = collectIterable(collection.get(uri1));
      const panels2 = collectIterable(collection.get(uri2));
      assert.strictEqual(panels1.length, 0);
      assert.strictEqual(panels2.length, 1);
      assert.strictEqual(panels2[0], panel2);
    });
  });

  suite("iteration", () => {
    test("get returns a generator that can be iterated with for-of", () => {
      const uri = vscode.Uri.file("/path/to/notebook.ipynb");
      const { panel } = createMockWebviewPanel();

      collection.add(uri, panel);

      const visited: vscode.WebviewPanel[] = [];
      for (const p of collection.get(uri)) {
        visited.push(p);
      }

      assert.strictEqual(visited.length, 1);
      assert.strictEqual(visited[0], panel);
    });

    test("get can be spread into an array", () => {
      const uri = vscode.Uri.file("/path/to/notebook.ipynb");
      const { panel } = createMockWebviewPanel();

      collection.add(uri, panel);

      const panels = [...collection.get(uri)];
      assert.strictEqual(panels.length, 1);
    });
  });
});
