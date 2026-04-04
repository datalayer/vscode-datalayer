/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import type { DatasourceDTO } from "@datalayer/core/lib/models/Datasource";
import * as assert from "assert";
import * as vscode from "vscode";

import { DatasourceTreeItem } from "../../models/datasourceTreeItem";

/**
 * Creates a mock DatasourceDTO with the given overrides.
 */
function createDatasourceDTO(
  overrides: Record<string, unknown> = {},
): DatasourceDTO {
  return {
    uid: "ds-001",
    name: "my-athena-ds",
    type: "Amazon Athena",
    variant: "athena",
    description: "Production Athena datasource",
    database: "analytics_db",
    outputBucket: "s3://output-bucket/",
    createdAt: new Date("2025-01-15T10:00:00Z"),
    ...overrides,
  } as DatasourceDTO;
}

suite("DatasourceTreeItem Tests", () => {
  test("uses datasource name as label", () => {
    const ds = createDatasourceDTO({ name: "prod-bigquery" });
    const item = new DatasourceTreeItem(ds);

    assert.strictEqual(item.label, "prod-bigquery");
  });

  test("is not collapsible", () => {
    const ds = createDatasourceDTO();
    const item = new DatasourceTreeItem(ds);

    assert.strictEqual(
      item.collapsibleState,
      vscode.TreeItemCollapsibleState.None,
    );
  });

  test("description shows variant when available", () => {
    const ds = createDatasourceDTO({ variant: "bigquery" });
    const item = new DatasourceTreeItem(ds);

    assert.strictEqual(item.description, "bigquery");
  });

  test("description falls back to type when variant is undefined", () => {
    const ds = createDatasourceDTO({
      variant: undefined,
      type: "Amazon Athena",
    });
    const item = new DatasourceTreeItem(ds);

    assert.strictEqual(item.description, "Amazon Athena");
  });

  test("tooltip is a MarkdownString", () => {
    const ds = createDatasourceDTO();
    const item = new DatasourceTreeItem(ds);

    assert.ok(item.tooltip instanceof vscode.MarkdownString);
  });

  test("tooltip contains datasource name", () => {
    const ds = createDatasourceDTO({ name: "test-ds" });
    const item = new DatasourceTreeItem(ds);

    const md = item.tooltip as vscode.MarkdownString;
    assert.ok(md.value.includes("test-ds"));
  });

  test("tooltip contains type", () => {
    const ds = createDatasourceDTO({ type: "Google BigQuery" });
    const item = new DatasourceTreeItem(ds);

    const md = item.tooltip as vscode.MarkdownString;
    assert.ok(md.value.includes("Google BigQuery"));
  });

  test("tooltip contains description when available", () => {
    const ds = createDatasourceDTO({
      description: "Staging data warehouse",
    });
    const item = new DatasourceTreeItem(ds);

    const md = item.tooltip as vscode.MarkdownString;
    assert.ok(md.value.includes("Staging data warehouse"));
  });

  test("tooltip omits description when empty", () => {
    const ds = createDatasourceDTO({ description: "" });
    const item = new DatasourceTreeItem(ds);

    const md = item.tooltip as vscode.MarkdownString;
    assert.ok(!md.value.includes("**Description:**"));
  });

  test("tooltip contains database when available", () => {
    const ds = createDatasourceDTO({ database: "prod_db" });
    const item = new DatasourceTreeItem(ds);

    const md = item.tooltip as vscode.MarkdownString;
    assert.ok(md.value.includes("prod_db"));
  });

  test("tooltip omits database when undefined", () => {
    const ds = createDatasourceDTO({ database: undefined });
    const item = new DatasourceTreeItem(ds);

    const md = item.tooltip as vscode.MarkdownString;
    assert.ok(!md.value.includes("**Database:**"));
  });

  test("tooltip contains outputBucket when available", () => {
    const ds = createDatasourceDTO({
      outputBucket: "s3://my-bucket/results/",
    });
    const item = new DatasourceTreeItem(ds);

    const md = item.tooltip as vscode.MarkdownString;
    assert.ok(md.value.includes("s3://my-bucket/results/"));
  });

  test("tooltip omits outputBucket when undefined", () => {
    const ds = createDatasourceDTO({ outputBucket: undefined });
    const item = new DatasourceTreeItem(ds);

    const md = item.tooltip as vscode.MarkdownString;
    assert.ok(!md.value.includes("**Output Bucket:**"));
  });

  test("tooltip contains createdAt when available", () => {
    const ds = createDatasourceDTO({
      createdAt: new Date("2025-06-01T12:00:00Z"),
    });
    const item = new DatasourceTreeItem(ds);

    const md = item.tooltip as vscode.MarkdownString;
    assert.ok(md.value.includes("**Created:**"));
  });

  test("tooltip omits createdAt when undefined", () => {
    const ds = createDatasourceDTO({ createdAt: undefined });
    const item = new DatasourceTreeItem(ds);

    const md = item.tooltip as vscode.MarkdownString;
    assert.ok(!md.value.includes("**Created:**"));
  });

  test("tooltip contains UID", () => {
    const ds = createDatasourceDTO({ uid: "ds-xyz-789" });
    const item = new DatasourceTreeItem(ds);

    const md = item.tooltip as vscode.MarkdownString;
    assert.ok(md.value.includes("ds-xyz-789"));
  });

  test("uses database icon", () => {
    const ds = createDatasourceDTO();
    const item = new DatasourceTreeItem(ds);

    assert.ok(item.iconPath instanceof vscode.ThemeIcon);
    assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, "database");
  });

  test("contextValue is 'datasource'", () => {
    const ds = createDatasourceDTO();
    const item = new DatasourceTreeItem(ds);

    assert.strictEqual(item.contextValue, "datasource");
  });

  test("has editDatasource click command", () => {
    const ds = createDatasourceDTO();
    const item = new DatasourceTreeItem(ds);

    assert.ok(item.command);
    assert.strictEqual(item.command!.command, "datalayer.editDatasource");
    assert.strictEqual(item.command!.title, "Edit Datasource");
  });

  test("command passes the tree item as argument", () => {
    const ds = createDatasourceDTO();
    const item = new DatasourceTreeItem(ds);

    assert.ok(item.command!.arguments);
    assert.strictEqual(item.command!.arguments![0], item);
  });

  test("stores the datasource reference", () => {
    const ds = createDatasourceDTO({ uid: "ds-ref-id" });
    const item = new DatasourceTreeItem(ds);

    assert.strictEqual(item.datasource.uid, "ds-ref-id");
  });
});
