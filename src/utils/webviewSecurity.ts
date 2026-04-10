/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Security utilities for VS Code webview panels.
 * Provides functions for Content Security Policy (CSP) and webview security.
 *
 * @module utils/webviewSecurity
 *
 * @see https://code.visualstudio.com/api/extension-guides/webview#content-security-policy
 */

import * as crypto from "crypto";

/**
 * Generates a cryptographically random nonce string for Content Security
 * Policy headers. Used to allow specific inline scripts in webviews while
 * maintaining security.
 *
 * Uses `crypto.randomBytes` so the nonce is unpredictable to an attacker.
 * `Math.random` is NOT safe for security-sensitive values.
 *
 * @returns A 32-character random string suitable for CSP nonce attribute.
 *
 */
export function getNonce(): string {
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.randomBytes(32);
  let text = "";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(bytes[i]! % possible.length);
  }
  return text;
}
