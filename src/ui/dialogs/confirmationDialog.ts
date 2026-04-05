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
  /** The item/resource name being acted upon. */
  itemName: string;
  /** The consequences of the action (array of bullet points). */
  consequences: string[];
  /** The action button text for step 1 (e.g., "Delete", "Terminate"). */
  actionButton: string;
}

/**
 * Shows a single confirmation for destructive actions.
 * Uses a non-intrusive notification with clear consequences listed.
 *
 * @param config - Configuration for the confirmation.
 *
 * @returns Promise that resolves to true if user confirmed, false otherwise.
 *
 */
export async function showTwoStepConfirmation(
  config: TwoStepConfirmationConfig,
): Promise<boolean> {
  const { itemName, consequences, actionButton } = config;

  const consequencesList = consequences.map((c) => `  ${c}`).join("\n");

  // Use QuickPick for reliable UI interaction (VS Code notifications are broken)
  const selected = await vscode.window.showQuickPick(
    [
      {
        label: `$(warning) ${actionButton}`,
        description: vscode.l10n.t("{0} {1}", actionButton, itemName),
        detail: vscode.l10n.t("This will:\n{0}", consequencesList),
        action: "confirm",
      },
      {
        label: `$(x) ${vscode.l10n.t("Cancel")}`,
        description: vscode.l10n.t("Do not proceed"),
        detail: vscode.l10n.t("No changes will be made"),
        action: "cancel",
      },
    ],
    {
      placeHolder: vscode.l10n.t('Confirm {0} "{1}"?', actionButton, itemName),
      ignoreFocusOut: false,
      title: vscode.l10n.t("Confirm {0}", actionButton),
    },
  );

  // eslint-disable-next-line no-console
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
   * @param runtimeName - Display name of the runtime to terminate.
   *
   * @returns Configuration for the termination confirmation dialog.
   */
  terminateRuntime: (runtimeName: string): TwoStepConfirmationConfig => ({
    itemName: runtimeName,
    consequences: [
      vscode.l10n.t("Stop all running notebooks"),
      vscode.l10n.t("Clear runtime state"),
      vscode.l10n.t("Potentially lose unsaved work"),
    ],
    actionButton: vscode.l10n.t("Terminate"),
  }),

  /**
   * Terminate all runtimes confirmation.
   * @param count - Number of active runtimes to terminate.
   *
   * @returns Configuration for the bulk termination confirmation dialog.
   */
  terminateAllRuntimes: (count: number): TwoStepConfirmationConfig => ({
    itemName:
      count === 1
        ? vscode.l10n.t("1 runtime")
        : vscode.l10n.t("{0} runtimes", count),
    consequences: [
      count === 1
        ? vscode.l10n.t("Stop {0} running runtime", count)
        : vscode.l10n.t("Stop {0} running runtimes", count),
      vscode.l10n.t("Stop all notebooks using these runtimes"),
      vscode.l10n.t("Clear all runtime states"),
      vscode.l10n.t("Potentially lose unsaved work across all notebooks"),
    ],
    actionButton: vscode.l10n.t("Terminate All"),
  }),

  /**
   * Document deletion confirmation.
   * @param documentName - Display name of the document to delete.
   *
   * @returns Configuration for the deletion confirmation dialog.
   */
  deleteDocument: (documentName: string): TwoStepConfirmationConfig => ({
    itemName: documentName,
    consequences: [
      vscode.l10n.t("Permanently remove the document"),
      vscode.l10n.t("Cannot be recovered"),
      vscode.l10n.t("Any unsaved work will be lost"),
    ],
    actionButton: vscode.l10n.t("Delete"),
  }),
};
