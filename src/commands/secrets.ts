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

import { getServiceContainer } from "../extension";
import { SecretTreeItem } from "../models/secretTreeItem";
import { SettingsTreeProvider } from "../providers/settingsTreeProvider";
import { showTwoStepConfirmation } from "../ui/dialogs/confirmationDialog";

/**
 * Registers all secrets-related commands for CRUD operations with security-first approach.
 *
 * @param context - Extension context for command subscriptions.
 * @param settingsTreeProvider - The Settings tree view provider for refresh.
 *
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
        const datalayer = getServiceContainer().datalayer;

        // Step 1: Select variant
        const variant = await vscode.window.showQuickPick(
          [
            {
              label: vscode.l10n.t("Generic"),
              description: vscode.l10n.t("General-purpose secret"),
              value: "generic" as const,
            },
            {
              label: vscode.l10n.t("Password"),
              description: vscode.l10n.t(
                "User password or authentication credential",
              ),
              value: "password" as const,
            },
            {
              label: vscode.l10n.t("Key"),
              description: vscode.l10n.t(
                "API key, access key, or cryptographic key",
              ),
              value: "key" as const,
            },
            {
              label: vscode.l10n.t("Token"),
              description: vscode.l10n.t(
                "Bearer token, OAuth token, or session token",
              ),
              value: "token" as const,
            },
          ],
          {
            title: vscode.l10n.t("Create Secret - Step 1 of 4"),
            placeHolder: vscode.l10n.t("Select secret type"),
          },
        );

        if (!variant) {
          return; // User cancelled
        }

        // Step 2: Enter name
        const name = await vscode.window.showInputBox({
          title: vscode.l10n.t("Create Secret - Step 2 of 4"),
          prompt: vscode.l10n.t("Enter secret name"),
          placeHolder: vscode.l10n.t("my_secret"),
          validateInput: (value) => {
            if (!value || value.trim().length === 0) {
              return vscode.l10n.t("Secret name cannot be empty");
            }
            if (value.length < 3) {
              return vscode.l10n.t("Secret name must be at least 3 characters");
            }
            if (value.length > 50) {
              return vscode.l10n.t("Secret name must be 50 characters or less");
            }
            if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
              return vscode.l10n.t(
                "Secret name can only contain letters, numbers, hyphens, and underscores",
              );
            }
            return undefined;
          },
        });

        if (!name) {
          return; // User cancelled
        }

        // Step 3: Enter value (password input)
        const value = await vscode.window.showInputBox({
          title: vscode.l10n.t("Create Secret - Step 3 of 4"),
          prompt: vscode.l10n.t("Enter secret value"),
          placeHolder: vscode.l10n.t("Enter the secret value..."),
          password: true, // Mask input
          validateInput: (value) => {
            if (!value || value.trim().length === 0) {
              return vscode.l10n.t("Secret value cannot be empty");
            }
            if (value.length > 4096) {
              return vscode.l10n.t(
                "Secret value must be 4096 characters or less",
              );
            }
            return undefined;
          },
        });

        if (!value) {
          return; // User cancelled
        }

        // Step 4: Enter description (optional)
        const description = await vscode.window.showInputBox({
          title: vscode.l10n.t("Create Secret - Step 4 of 4"),
          prompt: vscode.l10n.t("Enter description (optional)"),
          placeHolder: vscode.l10n.t(
            "Description of what this secret is for...",
          ),
          validateInput: (value) => {
            if (value && value.length > 500) {
              return vscode.l10n.t(
                "Description must be 500 characters or less",
              );
            }
            return undefined;
          },
        });

        // Note: description can be undefined if user skips or cancels

        // Create the secret
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: vscode.l10n.t('Creating secret "{0}"...', name),
            cancellable: false,
          },
          async () => {
            await datalayer.createSecret({
              name: name.trim(),
              variant: variant.value,
              value: value,
              description: description?.trim() || undefined,
            });

            vscode.window.showInformationMessage(
              vscode.l10n.t('Secret "{0}" created successfully', name),
            );

            // Refresh the settings tree
            settingsTreeProvider?.refresh();
          },
        );
      } catch (error) {
        vscode.window.showErrorMessage(
          vscode.l10n.t(
            "Failed to create secret: {0}",
            error instanceof Error ? error.message : String(error),
          ),
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
          vscode.window.showErrorMessage(vscode.l10n.t("No secret selected"));
          return;
        }

        const secret = item.secret;

        // Show warning before displaying value
        const showSecretLabel = vscode.l10n.t("Show Secret Value");
        const proceed = await vscode.window.showWarningMessage(
          vscode.l10n.t(
            'You are about to view the value of secret "{0}". Make sure no one is looking over your shoulder and that screen sharing/recording is disabled.',
            secret.name,
          ),
          { modal: true },
          showSecretLabel,
        );

        if (proceed !== showSecretLabel) {
          return;
        }

        try {
          // Fetch full secret with value
          const datalayer = getServiceContainer().datalayer;
          const fullSecret = await datalayer.getSecret(secret.uid);

          if (!fullSecret || !fullSecret.value) {
            vscode.window.showErrorMessage(
              vscode.l10n.t("Failed to retrieve secret value"),
            );
            return;
          }

          // Show value in an information message
          const copyLabel = vscode.l10n.t("Copy to Clipboard");
          const closeLabel = vscode.l10n.t("Close");
          const action = await vscode.window.showInformationMessage(
            vscode.l10n.t("Secret: {0}", secret.name),
            {
              modal: true,
              detail: vscode.l10n.t(
                "Value: {0}\n\nType: {1}\nDescription: {2}",
                fullSecret.value,
                secret.variant,
                secret.description || vscode.l10n.t("None"),
              ),
            },
            copyLabel,
            closeLabel,
          );

          if (action === copyLabel) {
            await vscode.env.clipboard.writeText(fullSecret.value);
            vscode.window.showInformationMessage(
              vscode.l10n.t("Secret value copied to clipboard"),
            );
          }
        } catch (error) {
          vscode.window.showErrorMessage(
            vscode.l10n.t(
              "Failed to view secret: {0}",
              error instanceof Error ? error.message : String(error),
            ),
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
          vscode.window.showErrorMessage(vscode.l10n.t("No secret selected"));
          return;
        }

        const secret = item.secret;

        try {
          // Fetch full secret with value
          const datalayer = getServiceContainer().datalayer;
          const fullSecret = await datalayer.getSecret(secret.uid);

          if (!fullSecret || !fullSecret.value) {
            vscode.window.showErrorMessage(
              vscode.l10n.t("Failed to retrieve secret value"),
            );
            return;
          }

          // Copy to clipboard
          await vscode.env.clipboard.writeText(fullSecret.value);
          vscode.window.showInformationMessage(
            vscode.l10n.t(
              'Secret "{0}" value copied to clipboard',
              secret.name,
            ),
          );
        } catch (error) {
          vscode.window.showErrorMessage(
            vscode.l10n.t(
              "Failed to copy secret: {0}",
              error instanceof Error ? error.message : String(error),
            ),
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
          vscode.window.showErrorMessage(vscode.l10n.t("No secret selected"));
          return;
        }

        const secret = item.secret;
        const oldName = secret.name;

        // Prompt for new name
        const newName = await vscode.window.showInputBox({
          title: vscode.l10n.t("Rename Secret: {0}", oldName),
          prompt: vscode.l10n.t("Enter new name"),
          value: oldName,
          placeHolder: oldName,
          validateInput: (value) => {
            if (!value || value.trim().length === 0) {
              return vscode.l10n.t("Secret name cannot be empty");
            }
            if (value.length < 3) {
              return vscode.l10n.t("Secret name must be at least 3 characters");
            }
            if (value.length > 50) {
              return vscode.l10n.t("Secret name must be 50 characters or less");
            }
            if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
              return vscode.l10n.t(
                "Secret name can only contain letters, numbers, hyphens, and underscores",
              );
            }
            if (value === oldName) {
              return vscode.l10n.t(
                "New name must be different from current name",
              );
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
              title: vscode.l10n.t(
                'Renaming secret "{0}" to "{1}"...',
                oldName,
                newName,
              ),
              cancellable: false,
            },
            async () => {
              const datalayer = getServiceContainer().datalayer;

              // Fetch the full secret with value first
              const fullSecret = await datalayer.getSecret(secret.uid);

              // Send update with all fields including current value
              await datalayer.updateSecret(secret.uid, {
                variant: secret.variant,
                name: newName.trim(),
                description: secret.description || "",
                value: fullSecret.value, // Include current value
              });

              vscode.window.showInformationMessage(
                vscode.l10n.t(
                  'Secret renamed from "{0}" to "{1}"',
                  oldName,
                  newName,
                ),
              );

              // Refresh the settings tree
              settingsTreeProvider?.refresh();
            },
          );
        } catch (error) {
          vscode.window.showErrorMessage(
            vscode.l10n.t(
              "Failed to rename secret: {0}",
              error instanceof Error ? error.message : String(error),
            ),
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
          vscode.window.showErrorMessage(vscode.l10n.t("No secret selected"));
          return;
        }

        const secret = item.secret;
        const secretName = secret.name;

        // Show two-step confirmation dialog
        const confirmed = await showTwoStepConfirmation({
          itemName: secretName,
          consequences: [
            vscode.l10n.t("This secret will be permanently deleted"),
            vscode.l10n.t(
              "Any applications or services using this secret will lose access",
            ),
            vscode.l10n.t("This action cannot be undone"),
          ],
          actionButton: vscode.l10n.t("Delete Secret"),
        });

        if (!confirmed) {
          return;
        }

        try {
          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: vscode.l10n.t('Deleting secret "{0}"...', secretName),
              cancellable: false,
            },
            async () => {
              const datalayer = getServiceContainer().datalayer;
              await datalayer.deleteSecret(secret.uid);

              vscode.window.showInformationMessage(
                vscode.l10n.t('Secret "{0}" deleted successfully', secretName),
              );

              // Refresh the settings tree
              settingsTreeProvider?.refresh();
            },
          );
        } catch (error) {
          vscode.window.showErrorMessage(
            vscode.l10n.t(
              "Failed to delete secret: {0}",
              error instanceof Error ? error.message : String(error),
            ),
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
