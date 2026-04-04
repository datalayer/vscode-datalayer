/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import * as assert from "assert";
import * as vscode from "vscode";

import type { TreeSectionType } from "../../models/treeSectionItem";
import { TreeSectionItem } from "../../models/treeSectionItem";

suite("TreeSectionItem Tests", () => {
  test("sets label correctly", () => {
    const item = new TreeSectionItem("Runtimes", "runtimes-section");

    assert.strictEqual(item.label, "Runtimes");
  });

  test("is expanded by default", () => {
    const item = new TreeSectionItem("Snapshots", "snapshots-section");

    assert.strictEqual(
      item.collapsibleState,
      vscode.TreeItemCollapsibleState.Expanded,
    );
  });

  test("stores sectionType", () => {
    const item = new TreeSectionItem("Secrets", "secrets-section");

    assert.strictEqual(item.sectionType, "secrets-section");
  });

  test("contextValue matches sectionType", () => {
    const item = new TreeSectionItem("Datasources", "datasources-section");

    assert.strictEqual(item.contextValue, "datasources-section");
  });

  test("sets icon when iconId is provided", () => {
    const item = new TreeSectionItem("Runtimes", "runtimes-section", "vm");

    assert.ok(item.iconPath instanceof vscode.ThemeIcon);
    assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, "vm");
  });

  test("does not set icon when iconId is not provided", () => {
    const item = new TreeSectionItem("Runtimes", "runtimes-section");

    assert.strictEqual(item.iconPath, undefined);
  });

  test("sets icon with archive id", () => {
    const item = new TreeSectionItem(
      "Snapshots",
      "snapshots-section",
      "archive",
    );

    assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, "archive");
  });

  test("tooltip equals label", () => {
    const item = new TreeSectionItem("My Section", "runtimes-section");

    assert.strictEqual(item.tooltip, "My Section");
  });

  test("all section types are valid", () => {
    const types: TreeSectionType[] = [
      "runtimes-section",
      "snapshots-section",
      "secrets-section",
      "datasources-section",
    ];

    for (const sectionType of types) {
      const item = new TreeSectionItem("Section", sectionType);
      assert.strictEqual(item.contextValue, sectionType);
    }
  });
});
