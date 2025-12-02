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

  const capitalizedAction = action.charAt(0).toUpperCase() + action.slice(1);
  const consequencesList = consequences.map((c) => `  ${c}`).join("\n");

  console.log("[DEBUG confirmationDialog] Showing QuickPick confirmation");
  console.log("[DEBUG confirmationDialog] Item:", itemName);
  console.log("[DEBUG confirmationDialog] Action:", action);

  // Use QuickPick for reliable UI interaction (VS Code notifications are broken)
  const selected = await vscode.window.showQuickPick(
    [
      {
        label: `$(warning) ${actionButton}`,
        description: `${capitalizedAction} ${itemName}`,
        detail: `This will:\n${consequencesList}`,
        action: "confirm",
      },
      {
        label: "$(x) Cancel",
        description: "Do not proceed",
        detail: "No changes will be made",
        action: "cancel",
      },
    ],
    {
      placeHolder: `${capitalizedAction} "${itemName}"?`,
      ignoreFocusOut: false,
      title: `Confirm ${capitalizedAction}`,
    },
  );

  console.log(
    "[DEBUG confirmationDialog] QuickPick selection:",
    selected?.action,
  );

  return selected?.action === "confirm";
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
   * Terminate all runtimes confirmation.
   */
  terminateAllRuntimes: (count: number): TwoStepConfirmationConfig => ({
    itemName: `all ${count} runtime${count !== 1 ? "s" : ""}`,
    action: "terminate",
    consequences: [
      `Stop ${count} running runtime${count !== 1 ? "s" : ""}`,
      "Stop all notebooks using these runtimes",
      "Clear all runtime states",
      "Potentially lose unsaved work across all notebooks",
    ],
    actionButton: "Terminate All",
    finalActionButton: "Yes, Terminate All",
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
};
