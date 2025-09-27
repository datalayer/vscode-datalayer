/*
 * Copyright (c) 2021-2023 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Security utilities for VS Code webview panels.
 * Provides functions for Content Security Policy (CSP) and webview security.
 *
 * @see https://code.visualstudio.com/api/extension-guides/webview#content-security-policy
 * @module utils/webviewSecurity
 */

/**
 * Generates a cryptographically random nonce string for Content Security Policy headers.
 * Used to allow specific inline scripts in webviews while maintaining security.
 *
 * @returns A 32-character random string suitable for CSP nonce attribute
 *
 * @example
 * ```typescript
 * const nonce = getNonce();
 * const csp = `default-src 'none'; script-src 'nonce-${nonce}'`;
 * ```
 */
export function getNonce() {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
