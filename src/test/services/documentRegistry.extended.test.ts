/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Extended tests for DocumentRegistry.
 * Covers edge cases: duplicate registrations, concurrent operations,
 * URI encoding, special characters, and boundary conditions.
 */

import * as assert from "assert";

import { DocumentRegistry } from "../../services/documents/documentRegistry";
import { LoggerManager } from "../../services/logging/loggerManager";
import { ServiceLoggers } from "../../services/logging/loggers";
import { createMockExtensionContext } from "../utils/mockFactory";

suite("DocumentRegistry Extended Tests", () => {
  let registry: DocumentRegistry;

  setup(() => {
    const context = createMockExtensionContext();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (LoggerManager as any).instance = undefined;
    const loggerManager = LoggerManager.getInstance(context);
    ServiceLoggers.initialize(loggerManager);

    registry = new DocumentRegistry();
  });

  teardown(() => {
    registry.clear();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ServiceLoggers as any).loggerManager = undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (LoggerManager as any).instance = undefined;
  });

  suite("Duplicate Registrations", () => {
    test("re-registering same ID updates URI", () => {
      registry.register("doc-1", "file:///old.ipynb", "notebook");
      registry.register("doc-1", "file:///new.ipynb", "notebook");

      assert.strictEqual(registry.getUriFromId("doc-1"), "file:///new.ipynb");
    });

    test("re-registering same ID updates type", () => {
      registry.register("doc-1", "file:///doc.ipynb", "notebook");
      registry.register("doc-1", "file:///doc.lexical", "lexical");

      assert.strictEqual(registry.getType("doc-1"), "lexical");
    });

    test("re-registering same ID leaves old URI mapping stale", () => {
      registry.register("doc-1", "file:///old.ipynb", "notebook");
      registry.register("doc-1", "file:///new.ipynb", "notebook");

      // Old URI still maps to doc-1 (stale mapping)
      // This is a known behavior of the current implementation
      assert.strictEqual(registry.getIdFromUri("file:///old.ipynb"), "doc-1");
    });

    test("registering same URI with different IDs updates mapping", () => {
      registry.register("id-1", "file:///shared.ipynb", "notebook");
      registry.register("id-2", "file:///shared.ipynb", "notebook");

      // URI now maps to latest ID
      assert.strictEqual(registry.getIdFromUri("file:///shared.ipynb"), "id-2");

      // Both IDs are registered
      assert.strictEqual(registry.has("id-1"), true);
      assert.strictEqual(registry.has("id-2"), true);
    });

    test("total count reflects unique IDs after re-registration", () => {
      registry.register("doc-1", "file:///a.ipynb", "notebook");
      registry.register("doc-1", "file:///b.ipynb", "notebook");

      const stats = registry.getStats();
      assert.strictEqual(stats.total, 1);
    });
  });

  suite("URI Encoding Edge Cases", () => {
    test("handles URI with spaces (percent-encoded)", () => {
      const uri = "file:///path/to/my%20notebook.ipynb";
      registry.register("doc-1", uri, "notebook");

      assert.strictEqual(registry.getUriFromId("doc-1"), uri);
      assert.strictEqual(registry.getIdFromUri(uri), "doc-1");
    });

    test("handles URI with unicode characters", () => {
      const uri = "file:///path/to/\u00e9\u00e8\u00ea.ipynb";
      registry.register("doc-1", uri, "notebook");

      assert.strictEqual(registry.getUriFromId("doc-1"), uri);
      assert.strictEqual(registry.getIdFromUri(uri), "doc-1");
    });

    test("handles datalayer:// scheme URI", () => {
      const uri = "datalayer://MySpace/Analysis%20Notebook.ipynb";
      registry.register("remote-uid-123", uri, "notebook");

      assert.strictEqual(registry.getUriFromId("remote-uid-123"), uri);
      assert.strictEqual(registry.getIdFromUri(uri), "remote-uid-123");
    });

    test("handles untitled:// scheme URI", () => {
      const uri = "untitled:Untitled-1.ipynb";
      registry.register(uri, uri, "notebook");

      assert.strictEqual(registry.getUriFromId(uri), uri);
      assert.strictEqual(registry.getIdFromUri(uri), uri);
    });

    test("handles very long URI", () => {
      const longPath = "a".repeat(5000);
      const uri = `file:///${longPath}.ipynb`;
      registry.register("doc-1", uri, "notebook");

      assert.strictEqual(registry.getUriFromId("doc-1"), uri);
    });

    test("handles URI with query parameters", () => {
      const uri = "file:///notebook.ipynb?version=2&format=json";
      registry.register("doc-1", uri, "notebook");

      assert.strictEqual(registry.getUriFromId("doc-1"), uri);
      assert.strictEqual(registry.getIdFromUri(uri), "doc-1");
    });

    test("handles URI with fragment", () => {
      const uri = "file:///notebook.ipynb#cell-3";
      registry.register("doc-1", uri, "notebook");

      assert.strictEqual(registry.getUriFromId("doc-1"), uri);
    });

    test("treats encoded and unencoded URIs as different", () => {
      const encoded = "file:///my%20file.ipynb";
      const unencoded = "file:///my file.ipynb";

      registry.register("doc-1", encoded, "notebook");
      registry.register("doc-2", unencoded, "notebook");

      assert.strictEqual(registry.getIdFromUri(encoded), "doc-1");
      assert.strictEqual(registry.getIdFromUri(unencoded), "doc-2");
    });
  });

  suite("Error Messages", () => {
    test("getUriFromId error shows available IDs", () => {
      registry.register("alpha", "file:///a.ipynb", "notebook");
      registry.register("beta", "file:///b.ipynb", "notebook");

      try {
        registry.getUriFromId("gamma");
        assert.fail("Should have thrown");
      } catch (e) {
        const msg = (e as Error).message;
        assert.ok(msg.includes("alpha"));
        assert.ok(msg.includes("beta"));
        assert.ok(msg.includes("gamma"));
      }
    });

    test("getIdFromUri error shows available URIs", () => {
      registry.register("doc-1", "file:///exists.ipynb", "notebook");

      try {
        registry.getIdFromUri("file:///missing.ipynb");
        assert.fail("Should have thrown");
      } catch (e) {
        const msg = (e as Error).message;
        assert.ok(msg.includes("file:///exists.ipynb"));
        assert.ok(msg.includes("file:///missing.ipynb"));
      }
    });

    test("getEntry error includes document ID", () => {
      try {
        registry.getEntry("nonexistent-id");
        assert.fail("Should have thrown");
      } catch (e) {
        const msg = (e as Error).message;
        assert.ok(msg.includes("nonexistent-id"));
        assert.ok(msg.includes("not registered"));
      }
    });
  });

  suite("Concurrent-like Operations", () => {
    test("many rapid register/unregister cycles", () => {
      for (let i = 0; i < 100; i++) {
        const uri = `file:///doc-${i}.ipynb`;
        registry.register(`id-${i}`, uri, "notebook");
      }

      assert.strictEqual(registry.getStats().total, 100);

      for (let i = 0; i < 50; i++) {
        registry.unregisterByUri(`file:///doc-${i}.ipynb`);
      }

      assert.strictEqual(registry.getStats().total, 50);

      // Verify remaining are correct
      for (let i = 50; i < 100; i++) {
        assert.strictEqual(registry.has(`id-${i}`), true);
      }
    });

    test("register and clear cycle", () => {
      for (let round = 0; round < 10; round++) {
        for (let i = 0; i < 10; i++) {
          registry.register(
            `r${round}-${i}`,
            `file:///r${round}-${i}.ipynb`,
            "notebook",
          );
        }
        assert.strictEqual(registry.getStats().total, 10);
        registry.clear();
        assert.strictEqual(registry.getStats().total, 0);
      }
    });
  });

  suite("getByType Edge Cases", () => {
    test("returns empty for type with no entries", () => {
      registry.register("nb-1", "file:///a.ipynb", "notebook");
      assert.deepStrictEqual(registry.getByType("lexical"), []);
    });

    test("filters correctly with mixed types", () => {
      for (let i = 0; i < 20; i++) {
        const type = i % 3 === 0 ? "lexical" : "notebook";
        const ext = type === "lexical" ? ".lexical" : ".ipynb";
        registry.register(`doc-${i}`, `file:///doc-${i}${ext}`, type);
      }

      const notebooks = registry.getByType("notebook");
      const lexicals = registry.getByType("lexical");

      assert.ok(notebooks.every((e) => e.type === "notebook"));
      assert.ok(lexicals.every((e) => e.type === "lexical"));
      assert.strictEqual(
        notebooks.length + lexicals.length,
        registry.getStats().total,
      );
    });
  });

  suite("getAllIds", () => {
    test("returns IDs in insertion order", () => {
      registry.register("first", "file:///1.ipynb", "notebook");
      registry.register("second", "file:///2.ipynb", "notebook");
      registry.register("third", "file:///3.ipynb", "notebook");

      const ids = registry.getAllIds();
      assert.strictEqual(ids[0], "first");
      assert.strictEqual(ids[1], "second");
      assert.strictEqual(ids[2], "third");
    });
  });

  suite("Webview Panel", () => {
    test("getWebviewPanel returns undefined for unregistered URI", () => {
      assert.strictEqual(
        registry.getWebviewPanel("file:///no-such.ipynb"),
        undefined,
      );
    });

    test("getWebviewPanel returns undefined when no panel registered", () => {
      registry.register("doc-1", "file:///test.ipynb", "notebook");
      assert.strictEqual(
        registry.getWebviewPanel("file:///test.ipynb"),
        undefined,
      );
    });

    test("getWebviewPanel returns panel when registered with one", () => {
      const mockPanel = { webview: {} } as never;
      registry.register("doc-1", "file:///test.ipynb", "notebook", mockPanel);

      const panel = registry.getWebviewPanel("file:///test.ipynb");
      assert.strictEqual(panel, mockPanel);
    });
  });

  suite("getStats edge cases", () => {
    test("accurate after mixed operations", () => {
      registry.register("nb-1", "file:///a.ipynb", "notebook");
      registry.register("nb-2", "file:///b.ipynb", "notebook");
      registry.register("lex-1", "file:///c.lexical", "lexical");
      registry.register("lex-2", "file:///d.lexical", "lexical");
      registry.register("lex-3", "file:///e.lexical", "lexical");

      registry.unregisterByUri("file:///b.ipynb");
      registry.unregisterByUri("file:///d.lexical");

      const stats = registry.getStats();
      assert.strictEqual(stats.total, 3);
      assert.strictEqual(stats.notebooks, 1);
      assert.strictEqual(stats.lexicals, 2);
    });
  });
});
