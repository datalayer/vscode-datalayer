/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Tests for datasource edit dialog HTML template generation.
 * Validates CSP, nonce injection, Primer theme CSS, and script tags.
 */

import * as assert from "assert";
import * as vscode from "vscode";

import { getDatasourceEditDialogHtml } from "../../ui/templates/datasourceEditTemplate";

/**
 * Creates a mock Webview for template testing.
 */
function createMockWebview(): vscode.Webview {
  return {
    options: {},
    html: "",
    cspSource: "https://mock.csp.source",
    onDidReceiveMessage: new vscode.EventEmitter<unknown>().event,
    postMessage: async () => true,
    asWebviewUri: (uri: vscode.Uri) =>
      vscode.Uri.parse(`https://webview.mock${uri.path}`),
  } as unknown as vscode.Webview;
}

suite("Datasource Edit Template Tests", () => {
  let webview: vscode.Webview;
  let extensionUri: vscode.Uri;

  setup(() => {
    webview = createMockWebview();
    extensionUri = vscode.Uri.file("/mock/extension");
  });

  test("returns a non-empty HTML string", () => {
    const html = getDatasourceEditDialogHtml(webview, extensionUri);

    assert.ok(html.length > 0);
    assert.ok(typeof html === "string");
  });

  test("includes DOCTYPE and html tag", () => {
    const html = getDatasourceEditDialogHtml(webview, extensionUri);

    assert.ok(html.includes("<!DOCTYPE html>"));
    assert.ok(html.includes('<html lang="en">'));
    assert.ok(html.includes("</html>"));
  });

  test("includes title Edit Datasource", () => {
    const html = getDatasourceEditDialogHtml(webview, extensionUri);

    assert.ok(html.includes("<title>Edit Datasource</title>"));
  });

  test("includes root div for React mount", () => {
    const html = getDatasourceEditDialogHtml(webview, extensionUri);

    assert.ok(html.includes('id="root"'));
  });

  test("includes CSP meta tag with webview cspSource", () => {
    const html = getDatasourceEditDialogHtml(webview, extensionUri);

    assert.ok(html.includes("Content-Security-Policy"));
    assert.ok(html.includes("https://mock.csp.source"));
  });

  test("references datasourceEditDialog.js script", () => {
    const html = getDatasourceEditDialogHtml(webview, extensionUri);

    assert.ok(
      html.includes("datasourceEditDialog.js"),
      "Should reference datasourceEditDialog.js",
    );
  });

  test("includes Primer VS Code theme CSS", () => {
    const html = getDatasourceEditDialogHtml(webview, extensionUri);

    assert.ok(
      html.includes("--bgColor-default"),
      "Should include Primer CSS variable overrides",
    );
    assert.ok(
      html.includes("--vscode-editor-background"),
      "Should reference VS Code CSS variables",
    );
  });

  test("includes nonce in script tag", () => {
    const html = getDatasourceEditDialogHtml(webview, extensionUri);

    const nonceMatches = html.match(/nonce="([^"]+)"/g);
    assert.ok(nonceMatches, "Should have nonce attributes");
  });

  test("CSP default-src is none", () => {
    const html = getDatasourceEditDialogHtml(webview, extensionUri);

    assert.ok(
      html.includes("default-src 'none'"),
      "Should deny all by default",
    );
  });

  test("CSP allows images from https and data URIs", () => {
    const html = getDatasourceEditDialogHtml(webview, extensionUri);

    assert.ok(html.includes("img-src"), "Should have img-src directive");
    assert.ok(html.includes("data:"), "Should allow data URIs for images");
  });

  test("generates different nonces on each call", () => {
    const html1 = getDatasourceEditDialogHtml(webview, extensionUri);
    const html2 = getDatasourceEditDialogHtml(webview, extensionUri);

    const nonce1 = html1.match(/nonce="([^"]+)"/)?.[1];
    const nonce2 = html2.match(/nonce="([^"]+)"/)?.[1];

    assert.ok(nonce1, "First HTML should have a nonce");
    assert.ok(nonce2, "Second HTML should have a nonce");
    assert.notStrictEqual(nonce1, nonce2, "Nonces should differ between calls");
  });

  test("edit template differs from create template title", () => {
    const html = getDatasourceEditDialogHtml(webview, extensionUri);

    assert.ok(
      html.includes("Edit Datasource"),
      "Should have Edit Datasource title",
    );
    assert.ok(
      !html.includes("<title>Datasource</title>"),
      "Should not have the create dialog title",
    );
  });
});
