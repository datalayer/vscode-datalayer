/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Reusable confirmation dialog utilities for consistent user experience
 * across all destructive and important actions in the extension.
 *
 * @module utils/confirmationDialog
 */

import * as vscode from "vscode";

/**
 * Configuration for simple confirmation dialogs.
 */
export interface SimpleConfirmationConfig {
  /** The main message to display */
  message: string;
  /** The action button text (e.g., "Delete", "Terminate") */
  actionButton: string;
  /** The cancel button text (defaults to "Cancel") */
  cancelButton?: string;
  /** Whether to use modal dialog (defaults to false for non-intrusive) */
  modal?: boolean;
}

/**
 * Configuration for two-step destructive action confirmations.
 */
export interface TwoStepConfirmationConfig {
  /** The item/resource name being acted upon */
  itemName: string;
  /** The action being performed (e.g., "delete", "terminate") */
  action: string;
  /** The consequences of the action (array of bullet points) */
  consequences: string[];
  /** The action button text for step 1 (e.g., "Delete", "Terminate") */
  actionButton: string;
  /** The final confirmation button text (e.g., "Yes, Delete", "Yes, Terminate") */
  finalActionButton: string;
}

/**
 * Shows a simple confirmation dialog.
 * Non-intrusive by default but can be made modal for critical actions.
 *
 * @param config - Configuration for the confirmation dialog
 * @returns Promise that resolves to true if user confirmed, false if cancelled
 *
 * @example
 * ```typescript
 * const confirmed = await showSimpleConfirmation({
 *   message: "Refresh runtime controllers? This will update available runtimes.",
 *   actionButton: "Refresh"
 * });
 * ```
 */
export async function showSimpleConfirmation(
  config: SimpleConfirmationConfig,
): Promise<boolean> {
  const {
    message,
    actionButton,
    cancelButton = "Cancel",
    modal = false,
  } = config;

  const options = modal ? { modal: true } : {};

  const action = await vscode.window.showWarningMessage(
    message,
    options,
    actionButton,
    cancelButton,
  );

  return action === actionButton;
}

/**
 * Shows a single confirmation for destructive actions.
 * Uses a non-intrusive notification with clear consequences listed.
 *
 * @param config - Configuration for the confirmation
 * @returns Promise that resolves to true if user confirmed, false otherwise
 *
 * @example
 * ```typescript
 * const confirmed = await showTwoStepConfirmation({
 *   itemName: "My Runtime",
 *   action: "terminate",
 *   consequences: [
 *     "Stop all running notebooks",
 *     "Clear runtime state",
 *     "Potentially lose unsaved work"
 *   ],
 *   actionButton: "Terminate",
 *   finalActionButton: "Terminate"  // Not used anymore but kept for compatibility
 * });
 * ```
 */
export async function showTwoStepConfirmation(
  config: TwoStepConfirmationConfig,
): Promise<boolean> {
  const { itemName, action, consequences, actionButton } = config;

  // Single step: Use error message for delete actions to show red/danger styling
  const capitalizedAction = action.charAt(0).toUpperCase() + action.slice(1);
  const consequencesList = consequences.map((c) => `• ${c}`).join(" ");
  const message = `${capitalizedAction} "${itemName}"? This will: ${consequencesList}`;

  // Use error message for delete actions to get red/danger button styling
  const messageFunction =
    action === "delete"
      ? vscode.window.showErrorMessage
      : vscode.window.showWarningMessage;

  const selection = await messageFunction(message, actionButton, "Cancel");

  return selection === actionButton;
}

/**
 * Shows a simple information-style confirmation for non-destructive actions.
 * Uses information message instead of warning for less alarming appearance.
 *
 * @param message - The message to display
 * @param actionButton - The action button text
 * @param cancelButton - The cancel button text (defaults to "Cancel")
 * @returns Promise that resolves to true if user confirmed, false if cancelled
 *
 * @example
 * ```typescript
 * const confirmed = await showInfoConfirmation(
 *   "Create a new runtime? This will use your credits.",
 *   "Create"
 * );
 * ```
 */
export async function showInfoConfirmation(
  message: string,
  actionButton: string,
  cancelButton: string = "Cancel",
): Promise<boolean> {
  const action = await vscode.window.showInformationMessage(
    message,
    actionButton,
    cancelButton,
  );

  return action === actionButton;
}

/**
 * Predefined configurations for common confirmation scenarios.
 */
export const CommonConfirmations = {
  /**
   * Runtime termination confirmation.
   */
  terminateRuntime: (runtimeName: string): TwoStepConfirmationConfig => ({
    itemName: runtimeName,
    action: "terminate",
    consequences: [
      "Stop all running notebooks",
      "Clear runtime state",
      "Potentially lose unsaved work",
    ],
    actionButton: "Terminate",
    finalActionButton: "Yes, Terminate",
  }),

  /**
   * Document deletion confirmation.
   */
  deleteDocument: (documentName: string): TwoStepConfirmationConfig => ({
    itemName: documentName,
    action: "delete",
    consequences: [
      "Permanently remove the document",
      "Cannot be recovered",
      "Any unsaved work will be lost",
    ],
    actionButton: "Delete",
    finalActionButton: "Yes, Delete",
  }),

  /**
   * Runtime refresh confirmation.
   */
  refreshRuntimes: (): SimpleConfirmationConfig => ({
    message:
      "Refresh runtime controllers? This will update the available runtimes in the kernel picker.",
    actionButton: "Refresh",
  }),
};
