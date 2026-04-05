/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Tests for notebook HTML template generation.
 * Validates CSP, nonce injection, script tags, and Pyodide configuration.
 */

import * as assert from "assert";
import * as vscode from "vscode";

import { getNotebookHtml } from "../../ui/templates/notebookTemplate";

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

suite("Notebook Template Tests", () => {
  let webview: vscode.Webview;
  let extensionUri: vscode.Uri;

  setup(() => {
    webview = createMockWebview();
    extensionUri = vscode.Uri.file("/mock/extension");
  });

  test("returns a non-empty HTML string", () => {
    const html = getNotebookHtml(webview, extensionUri);

    assert.ok(html.length > 0);
    assert.ok(typeof html === "string");
  });

  test("includes DOCTYPE and html tag", () => {
    const html = getNotebookHtml(webview, extensionUri);

    assert.ok(html.includes("<!DOCTYPE html>"));
    assert.ok(html.includes("<html lang="));
    assert.ok(html.includes("</html>"));
  });

  test("includes notebook-editor div", () => {
    const html = getNotebookHtml(webview, extensionUri);

    assert.ok(html.includes('id="notebook-editor"'));
  });

  test("includes title Datalayer Notebook", () => {
    const html = getNotebookHtml(webview, extensionUri);

    assert.ok(html.includes("<title>Datalayer Notebook</title>"));
  });

  test("includes CSP meta tag with webview cspSource", () => {
    const html = getNotebookHtml(webview, extensionUri);

    assert.ok(html.includes("Content-Security-Policy"));
    assert.ok(html.includes("https://mock.csp.source"));
  });

  test("includes nonce in script tags", () => {
    const html = getNotebookHtml(webview, extensionUri);

    const nonceMatches = html.match(/nonce="([^"]+)"/g);
    assert.ok(nonceMatches, "Should have nonce attributes");
    assert.ok(
      nonceMatches!.length >= 2,
      "Should have at least 2 nonce attributes",
    );

    // All nonces should be the same value
    const nonces = nonceMatches!.map((m) =>
      m.replace('nonce="', "").replace('"', ""),
    );
    const uniqueNonces = new Set(nonces);
    assert.strictEqual(uniqueNonces.size, 1, "All nonces should be identical");
  });

  test("includes webview.js script URI", () => {
    const html = getNotebookHtml(webview, extensionUri);

    assert.ok(html.includes("webview.js"), "Should reference webview.js");
  });

  test("includes codicon CSS link", () => {
    const html = getNotebookHtml(webview, extensionUri);

    assert.ok(html.includes("codicon.css"), "Should reference codicon.css");
  });

  test("includes completion theme CSS link", () => {
    const html = getNotebookHtml(webview, extensionUri);

    assert.ok(
      html.includes("vscode-completion-theme.css"),
      "Should reference vscode-completion-theme.css",
    );
  });

  test("includes default Pyodide version 0.27.3", () => {
    const html = getNotebookHtml(webview, extensionUri);

    assert.ok(html.includes("v0.27.3"), "Should use default Pyodide version");
    assert.ok(
      html.includes("__PYODIDE_BASE_URI__"),
      "Should set Pyodide base URI",
    );
  });

  test("uses custom Pyodide version when provided", () => {
    const html = getNotebookHtml(webview, extensionUri, "0.26.0");

    assert.ok(html.includes("v0.26.0"), "Should use custom Pyodide version");
    assert.ok(!html.includes("v0.27.3"), "Should not contain default version");
  });

  test("includes cache busting query parameter", () => {
    const html = getNotebookHtml(webview, extensionUri);

    assert.ok(html.includes("?v="), "Should include cache busting parameter");
  });

  test("includes typestyle stylesheet element", () => {
    const html = getNotebookHtml(webview, extensionUri);

    assert.ok(
      html.includes('id="typestyle-stylesheet"'),
      "Should include typestyle stylesheet",
    );
  });

  test("includes csp-nonce meta property", () => {
    const html = getNotebookHtml(webview, extensionUri);

    assert.ok(
      html.includes('property="csp-nonce"'),
      "Should include csp-nonce meta property",
    );
  });

  test("includes CSP worker-src blob directive", () => {
    const html = getNotebookHtml(webview, extensionUri);

    assert.ok(
      html.includes("worker-src blob:"),
      "Should allow blob workers for Jupyter kernels",
    );
  });

  test("generates different nonces on each call", () => {
    const html1 = getNotebookHtml(webview, extensionUri);
    const html2 = getNotebookHtml(webview, extensionUri);

    const nonce1 = html1.match(/nonce="([^"]+)"/)?.[1];
    const nonce2 = html2.match(/nonce="([^"]+)"/)?.[1];

    assert.ok(nonce1, "First HTML should have a nonce");
    assert.ok(nonce2, "Second HTML should have a nonce");
    assert.notStrictEqual(nonce1, nonce2, "Nonces should differ between calls");
  });
});
