/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Secrets management commands for the Datalayer VS Code extension.
 * Handles CRUD operations for secrets with security-first approach.
 *
 * @module commands/secrets
 */

import * as vscode from "vscode";
import { SettingsTreeProvider } from "../providers/settingsTreeProvider";
import { SecretTreeItem } from "../models/secretTreeItem";
import { showTwoStepConfirmation } from "../ui/dialogs/confirmationDialog";
import { getServiceContainer } from "../extension";

/**
 * Registers all secrets-related commands.
 *
 * @param context - Extension context for command subscriptions
 * @param settingsTreeProvider - The Settings tree view provider for refresh
 */
export function registerSecretsCommands(
  context: vscode.ExtensionContext,
  settingsTreeProvider?: SettingsTreeProvider,
): void {
  /**
   * Command: datalayer.createSecret
   * Creates a new secret via multi-step input dialog.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand("datalayer.createSecret", async () => {
      try {
        const sdk = getServiceContainer().sdk;

        // Step 1: Select variant
        const variant = await vscode.window.showQuickPick(
          [
            {
              label: "Generic",
              description: "General-purpose secret",
              value: "generic" as const,
            },
            {
              label: "Password",
              description: "User password or authentication credential",
              value: "password" as const,
            },
            {
              label: "Key",
              description: "API key, access key, or cryptographic key",
              value: "key" as const,
            },
            {
              label: "Token",
              description: "Bearer token, OAuth token, or session token",
              value: "token" as const,
            },
          ],
          {
            title: "Create Secret - Step 1 of 4",
            placeHolder: "Select secret type",
          },
        );

        if (!variant) {
          return; // User cancelled
        }

        // Step 2: Enter name
        const name = await vscode.window.showInputBox({
          title: "Create Secret - Step 2 of 4",
          prompt: "Enter secret name",
          placeHolder: "my_secret",
          validateInput: (value) => {
            if (!value || value.trim().length === 0) {
              return "Secret name cannot be empty";
            }
            if (value.length < 3) {
              return "Secret name must be at least 3 characters";
            }
            if (value.length > 50) {
              return "Secret name must be 50 characters or less";
            }
            if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
              return "Secret name can only contain letters, numbers, hyphens, and underscores";
            }
            return undefined;
          },
        });

        if (!name) {
          return; // User cancelled
        }

        // Step 3: Enter value (password input)
        const value = await vscode.window.showInputBox({
          title: "Create Secret - Step 3 of 4",
          prompt: "Enter secret value",
          placeHolder: "Enter the secret value...",
          password: true, // Mask input
          validateInput: (value) => {
            if (!value || value.trim().length === 0) {
              return "Secret value cannot be empty";
            }
            if (value.length > 4096) {
              return "Secret value must be 4096 characters or less";
            }
            return undefined;
          },
        });

        if (!value) {
          return; // User cancelled
        }

        // Step 4: Enter description (optional)
        const description = await vscode.window.showInputBox({
          title: "Create Secret - Step 4 of 4",
          prompt: "Enter description (optional)",
          placeHolder: "Description of what this secret is for...",
          validateInput: (value) => {
            if (value && value.length > 500) {
              return "Description must be 500 characters or less";
            }
            return undefined;
          },
        });

        // Note: description can be undefined if user skips or cancels

        // Create the secret
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Creating secret "${name}"...`,
            cancellable: false,
          },
          async () => {
            await sdk.createSecret({
              name: name.trim(),
              variant: variant.value,
              value: value,
              description: description?.trim() || undefined,
            });

            vscode.window.showInformationMessage(
              `Secret "${name}" created successfully`,
            );

            // Refresh the settings tree
            settingsTreeProvider?.refresh();
          },
        );
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to create secret: ${error instanceof Error ? error.message : error}`,
        );
      }
    }),
  );

  /**
   * Command: datalayer.viewSecret
   * Shows the secret value with a warning.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.viewSecret",
      async (item: SecretTreeItem) => {
        if (!item || !item.secret) {
          vscode.window.showErrorMessage("No secret selected");
          return;
        }

        const secret = item.secret;

        // Show warning before displaying value
        const proceed = await vscode.window.showWarningMessage(
          `You are about to view the value of secret "${secret.name}". ` +
            `Make sure no one is looking over your shoulder and that ` +
            `screen sharing/recording is disabled.`,
          { modal: true },
          "Show Secret Value",
        );

        if (proceed !== "Show Secret Value") {
          return;
        }

        try {
          // Fetch full secret with value
          const sdk = getServiceContainer().sdk;
          const fullSecret = await sdk.getSecret(secret.uid);

          if (!fullSecret || !fullSecret.value) {
            vscode.window.showErrorMessage("Failed to retrieve secret value");
            return;
          }

          // Show value in an information message
          const action = await vscode.window.showInformationMessage(
            `Secret: ${secret.name}`,
            {
              modal: true,
              detail: `Value: ${fullSecret.value}\n\nType: ${secret.variant}\nDescription: ${secret.description || "None"}`,
            },
            "Copy to Clipboard",
            "Close",
          );

          if (action === "Copy to Clipboard") {
            await vscode.env.clipboard.writeText(fullSecret.value);
            vscode.window.showInformationMessage(
              "Secret value copied to clipboard",
            );
          }
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to view secret: ${error instanceof Error ? error.message : error}`,
          );
        }
      },
    ),
  );

  /**
   * Command: datalayer.copySecretValue
   * Copies the secret value to clipboard.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.copySecretValue",
      async (item: SecretTreeItem) => {
        if (!item || !item.secret) {
          vscode.window.showErrorMessage("No secret selected");
          return;
        }

        const secret = item.secret;

        try {
          // Fetch full secret with value
          const sdk = getServiceContainer().sdk;
          const fullSecret = await sdk.getSecret(secret.uid);

          if (!fullSecret || !fullSecret.value) {
            vscode.window.showErrorMessage("Failed to retrieve secret value");
            return;
          }

          // Copy to clipboard
          await vscode.env.clipboard.writeText(fullSecret.value);
          vscode.window.showInformationMessage(
            `Secret "${secret.name}" value copied to clipboard`,
          );
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to copy secret: ${error instanceof Error ? error.message : error}`,
          );
        }
      },
    ),
  );

  /**
   * Command: datalayer.renameSecret
   * Renames an existing secret.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.renameSecret",
      async (item: SecretTreeItem) => {
        if (!item || !item.secret) {
          vscode.window.showErrorMessage("No secret selected");
          return;
        }

        const secret = item.secret;
        const oldName = secret.name;

        // Prompt for new name
        const newName = await vscode.window.showInputBox({
          title: `Rename Secret: ${oldName}`,
          prompt: "Enter new name",
          value: oldName,
          placeHolder: oldName,
          validateInput: (value) => {
            if (!value || value.trim().length === 0) {
              return "Secret name cannot be empty";
            }
            if (value.length < 3) {
              return "Secret name must be at least 3 characters";
            }
            if (value.length > 50) {
              return "Secret name must be 50 characters or less";
            }
            if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
              return "Secret name can only contain letters, numbers, hyphens, and underscores";
            }
            if (value === oldName) {
              return "New name must be different from current name";
            }
            return undefined;
          },
        });

        if (!newName) {
          return; // User cancelled
        }

        try {
          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: `Renaming secret "${oldName}" to "${newName}"...`,
              cancellable: false,
            },
            async () => {
              const sdk = getServiceContainer().sdk;

              // Fetch the full secret with value first
              const fullSecret = await sdk.getSecret(secret.uid);

              // Send update with all fields including current value
              await sdk.updateSecret(secret.uid, {
                variant: secret.variant,
                name: newName.trim(),
                description: secret.description || "",
                value: fullSecret.value, // Include current value
              });

              vscode.window.showInformationMessage(
                `Secret renamed from "${oldName}" to "${newName}"`,
              );

              // Refresh the settings tree
              settingsTreeProvider?.refresh();
            },
          );
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to rename secret: ${error instanceof Error ? error.message : error}`,
          );
        }
      },
    ),
  );

  /**
   * Command: datalayer.deleteSecret
   * Deletes a secret permanently with two-step confirmation.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.deleteSecret",
      async (item: SecretTreeItem) => {
        if (!item || !item.secret) {
          vscode.window.showErrorMessage("No secret selected");
          return;
        }

        const secret = item.secret;
        const secretName = secret.name;

        // Show two-step confirmation dialog
        const confirmed = await showTwoStepConfirmation({
          itemName: secretName,
          action: "delete",
          consequences: [
            "This secret will be permanently deleted",
            "Any applications or services using this secret will lose access",
            "This action cannot be undone",
          ],
          actionButton: "Delete Secret",
          finalActionButton: "Delete Secret",
        });

        if (!confirmed) {
          return;
        }

        try {
          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: `Deleting secret "${secretName}"...`,
              cancellable: false,
            },
            async () => {
              const sdk = getServiceContainer().sdk;
              await sdk.deleteSecret(secret.uid);

              vscode.window.showInformationMessage(
                `Secret "${secretName}" deleted successfully`,
              );

              // Refresh the settings tree
              settingsTreeProvider?.refresh();
            },
          );
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to delete secret: ${error instanceof Error ? error.message : error}`,
          );
        }
      },
    ),
  );

  /**
   * Command: datalayer.refreshSecrets
   * Refreshes the secrets section in the settings tree.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand("datalayer.refreshSecrets", () => {
      if (settingsTreeProvider) {
        settingsTreeProvider.refresh();
      }
    }),
  );
}
