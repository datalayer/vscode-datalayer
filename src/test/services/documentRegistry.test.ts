/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import * as assert from "assert";

import { DocumentRegistry } from "../../services/documents/documentRegistry";
import { LoggerManager } from "../../services/logging/loggerManager";
import { ServiceLoggers } from "../../services/logging/loggers";
import { createMockExtensionContext } from "../utils/mockFactory";

suite("DocumentRegistry Tests", () => {
  let registry: DocumentRegistry;

  setup(() => {
    // DocumentRegistry uses ServiceLoggers.main.debug internally,
    // so we need to initialize the loggers.
    const context = createMockExtensionContext();
    const loggerManager = LoggerManager.getInstance(context);
    ServiceLoggers.initialize(loggerManager);

    registry = new DocumentRegistry();
  });

  teardown(() => {
    registry.clear();
    // Reset static state
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ServiceLoggers as any).loggerManager = undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (LoggerManager as any)._instance = undefined;
  });

  suite("register", () => {
    test("registers a notebook document", () => {
      registry.register("doc-1", "file:///test.ipynb", "notebook");
      assert.strictEqual(registry.has("doc-1"), true);
    });

    test("registers a lexical document", () => {
      registry.register("doc-2", "file:///test.lexical", "lexical");
      assert.strictEqual(registry.has("doc-2"), true);
    });

    test("registers multiple documents", () => {
      registry.register("doc-1", "file:///a.ipynb", "notebook");
      registry.register("doc-2", "file:///b.lexical", "lexical");

      assert.strictEqual(registry.has("doc-1"), true);
      assert.strictEqual(registry.has("doc-2"), true);
    });

    test("overwrites existing registration with same id", () => {
      registry.register("doc-1", "file:///old.ipynb", "notebook");
      registry.register("doc-1", "file:///new.ipynb", "notebook");

      const uri = registry.getUriFromId("doc-1");
      assert.strictEqual(uri, "file:///new.ipynb");
    });
  });

  suite("has", () => {
    test("returns false for unregistered document", () => {
      assert.strictEqual(registry.has("nonexistent"), false);
    });

    test("returns true for registered document", () => {
      registry.register("doc-1", "file:///test.ipynb", "notebook");
      assert.strictEqual(registry.has("doc-1"), true);
    });
  });

  suite("getUriFromId", () => {
    test("returns URI for registered document", () => {
      registry.register("doc-1", "file:///test.ipynb", "notebook");
      assert.strictEqual(registry.getUriFromId("doc-1"), "file:///test.ipynb");
    });

    test("throws for unregistered document ID", () => {
      assert.throws(
        () => registry.getUriFromId("nonexistent"),
        /not registered/,
      );
    });

    test("error message includes available IDs", () => {
      registry.register("doc-1", "file:///test.ipynb", "notebook");
      try {
        registry.getUriFromId("bad-id");
        assert.fail("Should have thrown");
      } catch (e) {
        assert.ok((e as Error).message.includes("doc-1"));
      }
    });

    test("error message shows (none) when registry is empty", () => {
      try {
        registry.getUriFromId("bad-id");
        assert.fail("Should have thrown");
      } catch (e) {
        assert.ok((e as Error).message.includes("(none)"));
      }
    });
  });

  suite("getIdFromUri", () => {
    test("returns ID for registered document URI", () => {
      registry.register("doc-1", "file:///test.ipynb", "notebook");
      assert.strictEqual(registry.getIdFromUri("file:///test.ipynb"), "doc-1");
    });

    test("throws for unregistered URI", () => {
      assert.throws(
        () => registry.getIdFromUri("file:///unknown.ipynb"),
        /not registered/,
      );
    });
  });

  suite("getType", () => {
    test("returns notebook for notebook documents", () => {
      registry.register("doc-1", "file:///test.ipynb", "notebook");
      assert.strictEqual(registry.getType("doc-1"), "notebook");
    });

    test("returns lexical for lexical documents", () => {
      registry.register("doc-2", "file:///test.lexical", "lexical");
      assert.strictEqual(registry.getType("doc-2"), "lexical");
    });

    test("throws for unregistered document", () => {
      assert.throws(() => registry.getType("nonexistent"), /not registered/);
    });
  });

  suite("getEntry", () => {
    test("returns full entry for registered document", () => {
      registry.register("doc-1", "file:///test.ipynb", "notebook");
      const entry = registry.getEntry("doc-1");

      assert.strictEqual(entry.documentId, "doc-1");
      assert.strictEqual(entry.documentUri, "file:///test.ipynb");
      assert.strictEqual(entry.type, "notebook");
    });

    test("throws for unregistered document", () => {
      assert.throws(() => registry.getEntry("nonexistent"), /not registered/);
    });
  });

  suite("getByType", () => {
    test("returns empty array when no documents registered", () => {
      const result = registry.getByType("notebook");
      assert.deepStrictEqual(result, []);
    });

    test("returns only notebooks", () => {
      registry.register("nb-1", "file:///a.ipynb", "notebook");
      registry.register("lex-1", "file:///b.lexical", "lexical");
      registry.register("nb-2", "file:///c.ipynb", "notebook");

      const notebooks = registry.getByType("notebook");
      assert.strictEqual(notebooks.length, 2);
      assert.ok(notebooks.every((e) => e.type === "notebook"));
    });

    test("returns only lexical documents", () => {
      registry.register("nb-1", "file:///a.ipynb", "notebook");
      registry.register("lex-1", "file:///b.lexical", "lexical");

      const lexicals = registry.getByType("lexical");
      assert.strictEqual(lexicals.length, 1);
      assert.strictEqual(lexicals[0].type, "lexical");
    });
  });

  suite("getAllIds", () => {
    test("returns empty array when no documents registered", () => {
      assert.deepStrictEqual(registry.getAllIds(), []);
    });

    test("returns all registered IDs", () => {
      registry.register("doc-1", "file:///a.ipynb", "notebook");
      registry.register("doc-2", "file:///b.lexical", "lexical");

      const ids = registry.getAllIds();
      assert.strictEqual(ids.length, 2);
      assert.ok(ids.includes("doc-1"));
      assert.ok(ids.includes("doc-2"));
    });
  });

  suite("unregisterByUri", () => {
    test("removes document by URI", () => {
      registry.register("doc-1", "file:///test.ipynb", "notebook");
      registry.unregisterByUri("file:///test.ipynb");

      assert.strictEqual(registry.has("doc-1"), false);
    });

    test("URI lookup also removed after unregister", () => {
      registry.register("doc-1", "file:///test.ipynb", "notebook");
      registry.unregisterByUri("file:///test.ipynb");

      assert.throws(
        () => registry.getIdFromUri("file:///test.ipynb"),
        /not registered/,
      );
    });

    test("does nothing for unknown URI", () => {
      registry.register("doc-1", "file:///test.ipynb", "notebook");
      registry.unregisterByUri("file:///unknown.ipynb");

      assert.strictEqual(registry.has("doc-1"), true);
    });

    test("only removes the specified document", () => {
      registry.register("doc-1", "file:///a.ipynb", "notebook");
      registry.register("doc-2", "file:///b.ipynb", "notebook");

      registry.unregisterByUri("file:///a.ipynb");

      assert.strictEqual(registry.has("doc-1"), false);
      assert.strictEqual(registry.has("doc-2"), true);
    });
  });

  suite("clear", () => {
    test("removes all registrations", () => {
      registry.register("doc-1", "file:///a.ipynb", "notebook");
      registry.register("doc-2", "file:///b.lexical", "lexical");

      registry.clear();

      assert.strictEqual(registry.has("doc-1"), false);
      assert.strictEqual(registry.has("doc-2"), false);
      assert.deepStrictEqual(registry.getAllIds(), []);
    });

    test("clear on empty registry does not throw", () => {
      assert.doesNotThrow(() => registry.clear());
    });
  });

  suite("getStats", () => {
    test("returns zeros for empty registry", () => {
      const stats = registry.getStats();
      assert.strictEqual(stats.total, 0);
      assert.strictEqual(stats.notebooks, 0);
      assert.strictEqual(stats.lexicals, 0);
    });

    test("counts notebooks and lexicals separately", () => {
      registry.register("nb-1", "file:///a.ipynb", "notebook");
      registry.register("nb-2", "file:///b.ipynb", "notebook");
      registry.register("lex-1", "file:///c.lexical", "lexical");

      const stats = registry.getStats();
      assert.strictEqual(stats.total, 3);
      assert.strictEqual(stats.notebooks, 2);
      assert.strictEqual(stats.lexicals, 1);
    });

    test("updates after unregister", () => {
      registry.register("nb-1", "file:///a.ipynb", "notebook");
      registry.register("lex-1", "file:///b.lexical", "lexical");

      registry.unregisterByUri("file:///a.ipynb");

      const stats = registry.getStats();
      assert.strictEqual(stats.total, 1);
      assert.strictEqual(stats.notebooks, 0);
      assert.strictEqual(stats.lexicals, 1);
    });
  });

  suite("getWebviewPanel", () => {
    test("returns undefined for unregistered document", () => {
      assert.strictEqual(
        registry.getWebviewPanel("file:///unknown.ipynb"),
        undefined,
      );
    });

    test("returns undefined when registered without webview panel", () => {
      registry.register("doc-1", "file:///test.ipynb", "notebook");
      assert.strictEqual(
        registry.getWebviewPanel("file:///test.ipynb"),
        undefined,
      );
    });
  });

  suite("bidirectional mapping", () => {
    test("ID to URI and URI to ID are consistent", () => {
      const docId = "remote-uid-123";
      const docUri = "datalayer://Space/notebook.ipynb";

      registry.register(docId, docUri, "notebook");

      assert.strictEqual(registry.getUriFromId(docId), docUri);
      assert.strictEqual(registry.getIdFromUri(docUri), docId);
    });

    test("local documents where ID equals URI", () => {
      const localUri = "file:///path/to/notebook.ipynb";

      registry.register(localUri, localUri, "notebook");

      assert.strictEqual(registry.getUriFromId(localUri), localUri);
      assert.strictEqual(registry.getIdFromUri(localUri), localUri);
    });
  });
});
