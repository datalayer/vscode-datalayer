/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import type { SecretDTO } from "@datalayer/core/lib/models/Secret";
import * as assert from "assert";
import * as vscode from "vscode";

import { SecretTreeItem } from "../../models/secretTreeItem";

/**
 * Creates a mock SecretDTO with the given overrides.
 */
function createSecretDTO(overrides: Record<string, unknown> = {}): SecretDTO {
  return {
    uid: "secret-001",
    name: "my-api-key",
    variant: "token",
    description: "API key for external service",
    value: "super-secret-value",
    ...overrides,
  } as SecretDTO;
}

suite("SecretTreeItem Tests", () => {
  test("uses secret name as label", () => {
    const secret = createSecretDTO({ name: "db-password" });
    const item = new SecretTreeItem(secret);

    assert.strictEqual(item.label, "db-password");
  });

  test("is not collapsible", () => {
    const secret = createSecretDTO();
    const item = new SecretTreeItem(secret);

    assert.strictEqual(
      item.collapsibleState,
      vscode.TreeItemCollapsibleState.None,
    );
  });

  test("description shows variant with masked value", () => {
    const secret = createSecretDTO({ variant: "password" });
    const item = new SecretTreeItem(secret);

    const desc = item.description as string;
    assert.ok(desc.includes("password"), `Expected "password" in "${desc}"`);
    assert.ok(desc.includes("••••••••"), `Expected masked value in "${desc}"`);
  });

  test("description never shows actual value", () => {
    const secret = createSecretDTO({ value: "my-secret-123" });
    const item = new SecretTreeItem(secret);

    const desc = item.description as string;
    assert.ok(
      !desc.includes("my-secret-123"),
      "Description must not contain actual secret value",
    );
  });

  test("tooltip is a MarkdownString", () => {
    const secret = createSecretDTO();
    const item = new SecretTreeItem(secret);

    assert.ok(item.tooltip instanceof vscode.MarkdownString);
  });

  test("tooltip contains secret name", () => {
    const secret = createSecretDTO({ name: "my-key" });
    const item = new SecretTreeItem(secret);

    const md = item.tooltip as vscode.MarkdownString;
    assert.ok(md.value.includes("my-key"));
  });

  test("tooltip contains variant type", () => {
    const secret = createSecretDTO({ variant: "key" });
    const item = new SecretTreeItem(secret);

    const md = item.tooltip as vscode.MarkdownString;
    assert.ok(md.value.includes("key"));
  });

  test("tooltip contains description when available", () => {
    const secret = createSecretDTO({
      description: "Database credentials",
    });
    const item = new SecretTreeItem(secret);

    const md = item.tooltip as vscode.MarkdownString;
    assert.ok(md.value.includes("Database credentials"));
  });

  test("tooltip omits description section when empty", () => {
    const secret = createSecretDTO({ description: "" });
    const item = new SecretTreeItem(secret);

    const md = item.tooltip as vscode.MarkdownString;
    assert.ok(!md.value.includes("**Description:**"));
  });

  test("tooltip contains UID", () => {
    const secret = createSecretDTO({ uid: "sec-xyz-123" });
    const item = new SecretTreeItem(secret);

    const md = item.tooltip as vscode.MarkdownString;
    assert.ok(md.value.includes("sec-xyz-123"));
  });

  test("tooltip contains security notice", () => {
    const secret = createSecretDTO();
    const item = new SecretTreeItem(secret);

    const md = item.tooltip as vscode.MarkdownString;
    assert.ok(md.value.includes("Value is hidden for security"));
  });

  test("tooltip never shows actual value", () => {
    const secret = createSecretDTO({ value: "supersecret" });
    const item = new SecretTreeItem(secret);

    const md = item.tooltip as vscode.MarkdownString;
    assert.ok(
      !md.value.includes("supersecret"),
      "Tooltip must not contain actual secret value",
    );
  });

  test("uses key icon", () => {
    const secret = createSecretDTO();
    const item = new SecretTreeItem(secret);

    assert.ok(item.iconPath instanceof vscode.ThemeIcon);
    assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, "key");
  });

  test("contextValue is 'secret'", () => {
    const secret = createSecretDTO();
    const item = new SecretTreeItem(secret);

    assert.strictEqual(item.contextValue, "secret");
  });

  test("stores the secret reference", () => {
    const secret = createSecretDTO({ uid: "ref-id" });
    const item = new SecretTreeItem(secret);

    assert.strictEqual(item.secret.uid, "ref-id");
  });
});
