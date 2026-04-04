/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Tests for datasource creation dialog HTML template generation.
 * Validates CSP, nonce injection, Primer theme CSS, and script tags.
 */

import * as assert from "assert";
import * as vscode from "vscode";

import { getDatasourceDialogHtml } from "../../ui/templates/datasourceTemplate";

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

suite("Datasource Template Tests", () => {
  let webview: vscode.Webview;
  let extensionUri: vscode.Uri;

  setup(() => {
    webview = createMockWebview();
    extensionUri = vscode.Uri.file("/mock/extension");
  });

  test("returns a non-empty HTML string", () => {
    const html = getDatasourceDialogHtml(webview, extensionUri);

    assert.ok(html.length > 0);
    assert.ok(typeof html === "string");
  });

  test("includes DOCTYPE and html tag", () => {
    const html = getDatasourceDialogHtml(webview, extensionUri);

    assert.ok(html.includes("<!DOCTYPE html>"));
    assert.ok(html.includes('<html lang="en">'));
    assert.ok(html.includes("</html>"));
  });

  test("includes title Datasource", () => {
    const html = getDatasourceDialogHtml(webview, extensionUri);

    assert.ok(html.includes("<title>Datasource</title>"));
  });

  test("includes root div for React mount", () => {
    const html = getDatasourceDialogHtml(webview, extensionUri);

    assert.ok(html.includes('id="root"'));
  });

  test("includes CSP meta tag with webview cspSource", () => {
    const html = getDatasourceDialogHtml(webview, extensionUri);

    assert.ok(html.includes("Content-Security-Policy"));
    assert.ok(html.includes("https://mock.csp.source"));
  });

  test("includes nonce in script tag", () => {
    const html = getDatasourceDialogHtml(webview, extensionUri);

    const nonceMatches = html.match(/nonce="([^"]+)"/g);
    assert.ok(nonceMatches, "Should have nonce attributes");
    assert.ok(
      nonceMatches!.length >= 1,
      "Should have at least 1 nonce attribute",
    );
  });

  test("references datasourceDialog.js script", () => {
    const html = getDatasourceDialogHtml(webview, extensionUri);

    assert.ok(
      html.includes("datasourceDialog.js"),
      "Should reference datasourceDialog.js",
    );
  });

  test("includes Primer VS Code theme CSS", () => {
    const html = getDatasourceDialogHtml(webview, extensionUri);

    // The Primer theme CSS includes VS Code variable mappings
    assert.ok(
      html.includes("--bgColor-default"),
      "Should include Primer CSS variable overrides",
    );
    assert.ok(
      html.includes("--vscode-editor-background"),
      "Should reference VS Code CSS variables",
    );
  });

  test("includes inline style block for body", () => {
    const html = getDatasourceDialogHtml(webview, extensionUri);

    assert.ok(html.includes("var(--vscode-font-family)"));
    assert.ok(html.includes("var(--vscode-font-size)"));
    assert.ok(html.includes("var(--vscode-foreground)"));
  });

  test("includes favicon with database icon SVG", () => {
    const html = getDatasourceDialogHtml(webview, extensionUri);

    assert.ok(html.includes('rel="icon"'), "Should include favicon link");
    assert.ok(
      html.includes("data:image/svg+xml"),
      "Should use inline SVG favicon",
    );
  });

  test("CSP allows unsafe-inline for styles", () => {
    const html = getDatasourceDialogHtml(webview, extensionUri);

    assert.ok(
      html.includes("'unsafe-inline'"),
      "Should allow unsafe-inline for Primer styles",
    );
  });

  test("CSP default-src is none", () => {
    const html = getDatasourceDialogHtml(webview, extensionUri);

    assert.ok(
      html.includes("default-src 'none'"),
      "Should deny all by default",
    );
  });

  test("generates different nonces on each call", () => {
    const html1 = getDatasourceDialogHtml(webview, extensionUri);
    const html2 = getDatasourceDialogHtml(webview, extensionUri);

    const nonce1 = html1.match(/nonce="([^"]+)"/)?.[1];
    const nonce2 = html2.match(/nonce="([^"]+)"/)?.[1];

    assert.ok(nonce1, "First HTML should have a nonce");
    assert.ok(nonce2, "Second HTML should have a nonce");
    assert.notStrictEqual(nonce1, nonce2, "Nonces should differ between calls");
  });
});
