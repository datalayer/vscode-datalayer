/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Credentials input dialogs for handle/password authentication.
 * Provides two-step input with validation for handle and password.
 *
 * @module ui/dialogs/credentialsInput
 */

import * as vscode from "vscode";

/**
 * Credentials captured from user input for handle/password authentication.
 */
export interface CredentialsInput {
  /** User's handle (username, email, or identifier). */
  handle: string;
  /** User's password. */
  password: string;
}

/**
 * Validates that the handle is not empty.
 *
 * @param handle - Handle to validate.
 *
 * @returns Error message if invalid, null if valid.
 */
function validateHandle(handle: string): string | null {
  if (!handle || handle.trim().length === 0) {
    return "Handle cannot be empty";
  }

  return null;
}

/**
 * Validates that the password is not empty.
 *
 * @param password - Password to validate.
 *
 * @returns Error message if invalid, null if valid.
 */
function validatePassword(password: string): string | null {
  if (!password || password.trim().length === 0) {
    return "Password cannot be empty";
  }

  return null;
}

/**
 * Prompts user for their handle via an input box.
 *
 * @returns Handle, or undefined if cancelled.
 */
async function promptForHandle(): Promise<string | undefined> {
  const handle = await vscode.window.showInputBox({
    title: "Datalayer Authentication",
    prompt: "Enter your handle (username or email)",
    placeHolder: "username or email@example.com",
    ignoreFocusOut: true,
    validateInput: (value: string) => {
      return validateHandle(value);
    },
  });

  return handle?.trim();
}

/**
 * Prompts user for their password via a masked input box.
 *
 * @returns Password, or undefined if cancelled.
 */
async function promptForPassword(): Promise<string | undefined> {
  const password = await vscode.window.showInputBox({
    title: "Datalayer Authentication",
    prompt: "Enter your password",
    placeHolder: "Password",
    password: true, // Mask input
    ignoreFocusOut: true,
    validateInput: (value: string) => {
      return validatePassword(value);
    },
  });

  return password?.trim();
}

/**
 * Prompt user for credentials (handle and password).
 *
 * Uses two-step input process:
 * 1. Prompt for handle with validation
 * 2. Prompt for password with validation
 *
 * Either step can be cancelled, which cancels the entire flow.
 *
 * @returns Credentials object, or undefined if cancelled.
 *
 */
export async function promptForCredentials(): Promise<
  CredentialsInput | undefined
> {
  // Step 1: Get handle
  const handle = await promptForHandle();
  if (!handle) {
    return undefined; // User cancelled
  }

  // Step 2: Get password
  const password = await promptForPassword();
  if (!password) {
    return undefined; // User cancelled
  }

  return {
    handle,
    password,
  };
}
