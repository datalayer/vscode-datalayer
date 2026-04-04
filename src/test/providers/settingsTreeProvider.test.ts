/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import * as assert from "assert";
import * as vscode from "vscode";

import { TreeSectionItem } from "../../models/treeSectionItem";
import { SettingsTreeProvider } from "../../providers/settingsTreeProvider";
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

suite("SettingsTreeProvider Tests", () => {
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
      const provider = new SettingsTreeProvider(authProvider);
      assert.ok(provider);
    });
  });

  suite("getTreeItem", () => {
    test("returns the element itself", () => {
      const authProvider = createMockAuthProvider(true);
      const provider = new SettingsTreeProvider(authProvider);
      const section = new TreeSectionItem("Secrets", "secrets-section", "key");
      const result = provider.getTreeItem(section);
      assert.strictEqual(result, section);
    });
  });

  suite("getChildren - root level", () => {
    test("returns empty array when not authenticated", async () => {
      const authProvider = createMockAuthProvider(false);
      const provider = new SettingsTreeProvider(authProvider);

      const children = await provider.getChildren();
      assert.strictEqual(children.length, 0);
    });

    test("returns two sections when authenticated", async () => {
      const authProvider = createMockAuthProvider(true);
      const provider = new SettingsTreeProvider(authProvider);

      const children = await provider.getChildren();
      assert.strictEqual(children.length, 2);

      assert.ok(children[0] instanceof TreeSectionItem);
      assert.ok(children[1] instanceof TreeSectionItem);

      const section0 = children[0] as TreeSectionItem;
      const section1 = children[1] as TreeSectionItem;
      assert.strictEqual(section0.label, "Secrets");
      assert.strictEqual(section0.sectionType, "secrets-section");
      assert.strictEqual(section1.label, "Datasources");
      assert.strictEqual(section1.sectionType, "datasources-section");
    });
  });

  suite("getChildren - non-section element", () => {
    test("returns empty array for non-section items", async () => {
      const authProvider = createMockAuthProvider(true);
      const provider = new SettingsTreeProvider(authProvider);

      // Pass a generic TreeItem that is not a TreeSectionItem
      const genericItem = new vscode.TreeItem("generic");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const children = await provider.getChildren(genericItem as any);
      assert.strictEqual(children.length, 0);
    });
  });

  suite("refresh", () => {
    test("fires onDidChangeTreeData event", () => {
      const authProvider = createMockAuthProvider(true);
      const provider = new SettingsTreeProvider(authProvider);
      let eventFired = false;

      provider.onDidChangeTreeData(() => {
        eventFired = true;
      });

      provider.refresh();
      assert.ok(eventFired, "onDidChangeTreeData should fire on refresh");
    });
  });

  suite("dispose", () => {
    test("does not throw", () => {
      const authProvider = createMockAuthProvider(true);
      const provider = new SettingsTreeProvider(authProvider);
      assert.doesNotThrow(() => provider.dispose());
    });
  });

  suite("onDidChangeTreeData", () => {
    test("event is defined", () => {
      const authProvider = createMockAuthProvider(true);
      const provider = new SettingsTreeProvider(authProvider);
      assert.ok(provider.onDidChangeTreeData);
    });
  });
});
