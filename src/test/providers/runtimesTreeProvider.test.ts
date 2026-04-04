/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import * as assert from "assert";
import * as vscode from "vscode";

import { TreeSectionItem } from "../../models/treeSectionItem";
import { RuntimesTreeProvider } from "../../providers/runtimesTreeProvider";
import { DatalayerAuthProvider } from "../../services/core/authProvider";
import { LoggerManager } from "../../services/logging/loggerManager";
import { ServiceLoggers } from "../../services/logging/loggers";
import { createMockExtensionContext } from "../utils/mockFactory";

/**
 * Creates a mock DatalayerAuthProvider for tree provider testing.
 */
function createMockAuthProvider(authenticated: boolean): DatalayerAuthProvider {
  const emitter = new vscode.EventEmitter<unknown>();
  return {
    isAuthenticated: () => authenticated,
    getAuthState: () => ({
      isAuthenticated: authenticated,
      user: authenticated ? { displayName: "Test User" } : null,
      error: null,
    }),
    onAuthStateChanged: emitter.event,
  } as unknown as DatalayerAuthProvider;
}

suite("RuntimesTreeProvider Tests", () => {
  suiteSetup(() => {
    if (!ServiceLoggers.isInitialized()) {
      const context = createMockExtensionContext();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (LoggerManager as any).instance = undefined;
      const loggerManager = LoggerManager.getInstance(context);
      ServiceLoggers.initialize(loggerManager);
    }
  });

  suiteTeardown(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ServiceLoggers as any).loggerManager = undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (LoggerManager as any).instance = undefined;
  });

  suite("constructor", () => {
    test("creates instance with auth provider", () => {
      const authProvider = createMockAuthProvider(false);
      const provider = new RuntimesTreeProvider(authProvider);
      assert.ok(provider);
      // Dispose timer immediately for test cleanup
      provider.dispose();
    });
  });

  suite("getTreeItem", () => {
    test("returns the element itself", () => {
      const authProvider = createMockAuthProvider(true);
      const provider = new RuntimesTreeProvider(authProvider);
      const section = new TreeSectionItem("Runtimes", "runtimes-section", "vm");
      const result = provider.getTreeItem(section);
      assert.strictEqual(result, section);
      provider.dispose();
    });
  });

  suite("getChildren - root level", () => {
    test("returns empty array when not authenticated", async () => {
      const authProvider = createMockAuthProvider(false);
      const provider = new RuntimesTreeProvider(authProvider);

      const children = await provider.getChildren();
      assert.strictEqual(children.length, 0);
      provider.dispose();
    });

    test("returns two sections when authenticated", async () => {
      const authProvider = createMockAuthProvider(true);
      const provider = new RuntimesTreeProvider(authProvider);

      const children = await provider.getChildren();
      assert.strictEqual(children.length, 2);

      assert.ok(children[0] instanceof TreeSectionItem);
      assert.ok(children[1] instanceof TreeSectionItem);

      const section0 = children[0] as TreeSectionItem;
      const section1 = children[1] as TreeSectionItem;
      assert.strictEqual(section0.label, "Runtimes");
      assert.strictEqual(section0.sectionType, "runtimes-section");
      assert.strictEqual(section1.label, "Snapshots");
      assert.strictEqual(section1.sectionType, "snapshots-section");
      provider.dispose();
    });
  });

  suite("getChildren - non-section element", () => {
    test("returns empty array for non-section items", async () => {
      const authProvider = createMockAuthProvider(true);
      const provider = new RuntimesTreeProvider(authProvider);

      const genericItem = new vscode.TreeItem("generic");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const children = await provider.getChildren(genericItem as any);
      assert.strictEqual(children.length, 0);
      provider.dispose();
    });
  });

  suite("getCachedRuntimes", () => {
    test("returns empty array initially", () => {
      const authProvider = createMockAuthProvider(true);
      const provider = new RuntimesTreeProvider(authProvider);

      const runtimes = provider.getCachedRuntimes();
      assert.ok(Array.isArray(runtimes));
      assert.strictEqual(runtimes.length, 0);
      provider.dispose();
    });
  });

  suite("refresh", () => {
    test("fires onDidChangeTreeData event", () => {
      const authProvider = createMockAuthProvider(true);
      const provider = new RuntimesTreeProvider(authProvider);
      let eventFired = false;

      provider.onDidChangeTreeData(() => {
        eventFired = true;
      });

      provider.refresh();
      assert.ok(eventFired, "onDidChangeTreeData should fire on refresh");
      provider.dispose();
    });

    test("clears caches on refresh", () => {
      const authProvider = createMockAuthProvider(true);
      const provider = new RuntimesTreeProvider(authProvider);

      provider.refresh();

      const runtimes = provider.getCachedRuntimes();
      assert.strictEqual(runtimes.length, 0);
      provider.dispose();
    });
  });

  suite("dispose", () => {
    test("clears refresh timer without error", () => {
      const authProvider = createMockAuthProvider(true);
      const provider = new RuntimesTreeProvider(authProvider);
      assert.doesNotThrow(() => provider.dispose());
    });

    test("can be called multiple times safely", () => {
      const authProvider = createMockAuthProvider(true);
      const provider = new RuntimesTreeProvider(authProvider);
      provider.dispose();
      assert.doesNotThrow(() => provider.dispose());
    });
  });

  suite("onDidChangeTreeData", () => {
    test("event is defined", () => {
      const authProvider = createMockAuthProvider(true);
      const provider = new RuntimesTreeProvider(authProvider);
      assert.ok(provider.onDidChangeTreeData);
      provider.dispose();
    });
  });
});
