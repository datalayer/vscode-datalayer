/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Projects management commands for the Datalayer VS Code extension.
 * Handles CRUD operations, agent management, and visibility toggling for projects.
 *
 * @module commands/projects
 */

import * as vscode from "vscode";

import { getServiceContainer } from "../extension";
import { ProjectTreeItem } from "../models/projectTreeItem";
import { ProjectsTreeProvider } from "../providers/projectsTreeProvider";
import { RuntimesTreeProvider } from "../providers/runtimesTreeProvider";
import { SettingsTreeProvider } from "../providers/settingsTreeProvider";

/**
 * Shows the agent spec picker and handles missing secret creation.
 *
 * @param title - Title for the QuickPick dialog.
 * @param settingsTreeProvider - Optional settings tree provider to refresh after secret creation.
 *
 * @returns The selected agent spec ID, or undefined if cancelled.
 */
async function showAgentSpecPicker(
  title: string,
  settingsTreeProvider?: SettingsTreeProvider,
): Promise<string | undefined> {
  const datalayer = getServiceContainer().datalayer;

  const specs = datalayer.listAgentSpecs();
  if (specs.length === 0) {
    vscode.window.showWarningMessage("No agent specifications available");
    return undefined;
  }

  let existingSecretNames: Set<string>;
  try {
    const secrets = await datalayer.listSecrets();
    existingSecretNames = new Set(secrets.map((s) => s.name));
  } catch {
    existingSecretNames = new Set();
  }

  // Build QuickPick items — ready agents first, then those needing secrets
  const items = specs
    .map((spec) => {
      const requiredVars = datalayer.getAgentSpecRequiredEnvVars(spec);
      const missingVars = requiredVars.filter(
        (v) => !existingSecretNames.has(v),
      );
      let label: string;
      let detail: string;
      if (missingVars.length > 0) {
        label = `$(warning) ${spec.name}`;
        detail = `$(key) Needs: ${missingVars.join(", ")}`;
      } else if (requiredVars.length > 0) {
        label = `$(check) ${spec.name}`;
        detail = `$(key) All secrets configured`;
      } else {
        label = `$(check) ${spec.name}`;
        detail = `$(info) No secrets required`;
      }
      return {
        label,
        description: spec.description,
        detail,
        specId: spec.id,
        missingVars,
        isReady: missingVars.length === 0,
      };
    })
    .sort((a, b) => {
      if (a.isReady !== b.isReady) {
        return a.isReady ? -1 : 1;
      }
      return a.label.localeCompare(b.label);
    });

  const selected = await vscode.window.showQuickPick(items, {
    title,
    placeHolder: "Select an agent specification",
    matchOnDescription: true,
    matchOnDetail: true,
  });

  if (!selected) {
    return undefined;
  }

  // Prompt user to create each missing secret
  if (selected.missingVars.length > 0) {
    const cleanName = selected.label
      .replace("$(warning) ", "")
      .replace("$(check) ", "");
    const proceed = await vscode.window.showWarningMessage(
      `"${cleanName}" requires ${selected.missingVars.length} missing secret(s): ${selected.missingVars.join(", ")}`,
      { modal: true },
      "Create Secrets",
    );

    if (proceed !== "Create Secrets") {
      return undefined;
    }

    for (let i = 0; i < selected.missingVars.length; i++) {
      const varName = selected.missingVars[i]!;
      const value = await vscode.window.showInputBox({
        title: `Create Secret (${i + 1}/${selected.missingVars.length})`,
        prompt: `Enter value for "${varName}"`,
        placeHolder: `Value for ${varName}`,
        password: true,
        validateInput: (v) => {
          if (!v || v.trim().length === 0) {
            return "Secret value cannot be empty";
          }
          return undefined;
        },
      });

      if (value === undefined) {
        vscode.window.showInformationMessage("Agent creation cancelled");
        return undefined;
      }

      try {
        await datalayer.createSecret({
          name: varName,
          value: value.trim(),
          description: `Required by agent: ${selected.specId}`,
        });
        vscode.window.showInformationMessage(`Secret "${varName}" created`);
        settingsTreeProvider?.refresh();
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to create secret "${varName}": ${error instanceof Error ? error.message : error}`,
        );
        return undefined;
      }
    }
  }

  return selected.specId;
}

/**
 * Registers all project-related commands for CRUD, agent, and visibility operations.
 *
 * @param context - Extension context for command subscriptions.
 * @param projectsTreeProvider - The Projects tree view provider for refresh.
 * @param runtimesTreeProvider - The Runtimes tree view provider for refresh.
 * @param settingsTreeProvider - The Settings tree view provider for refresh.
 *
 */
export function registerProjectsCommands(
  context: vscode.ExtensionContext,
  projectsTreeProvider?: ProjectsTreeProvider,
  runtimesTreeProvider?: RuntimesTreeProvider,
  settingsTreeProvider?: SettingsTreeProvider,
): void {
  /**
   * Command: datalayer.projects.refresh
   * Refreshes the projects tree view.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand("datalayer.projects.refresh", () => {
      if (projectsTreeProvider) {
        projectsTreeProvider.refresh();
      }
    }),
  );

  /**
   * Command: datalayer.projects.create
   * Creates a new project via multi-step input dialog.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand("datalayer.projects.create", async () => {
      try {
        const datalayer = getServiceContainer().datalayer;

        // Step 1: Enter project name
        const name = await vscode.window.showInputBox({
          title: "Create Project - Step 1 of 2",
          prompt: "Enter project name",
          placeHolder: "my-project",
          validateInput: (value) => {
            if (!value || value.trim().length === 0) {
              return "Project name cannot be empty";
            }
            if (value.length < 3) {
              return "Project name must be at least 3 characters";
            }
            if (value.length > 50) {
              return "Project name must be 50 characters or less";
            }
            return undefined;
          },
        });

        if (!name) {
          return;
        }

        // Step 2: Enter description (optional)
        const description = await vscode.window.showInputBox({
          title: "Create Project - Step 2 of 2",
          prompt: "Enter description (optional)",
          placeHolder: "Description of the project...",
          validateInput: (value) => {
            if (value && value.length > 500) {
              return "Description must be 500 characters or less";
            }
            return undefined;
          },
        });

        // Create the project
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Creating project "${name}"...`,
            cancellable: false,
          },
          async () => {
            await datalayer.createProject(name.trim(), description?.trim());

            vscode.window.showInformationMessage(
              `Project "${name}" created successfully`,
            );

            projectsTreeProvider?.refresh();
          },
        );
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to create project: ${error instanceof Error ? error.message : error}`,
        );
      }
    }),
  );

  /**
   * Command: datalayer.projects.rename
   * Renames an existing project.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.projects.rename",
      async (item: ProjectTreeItem) => {
        if (!item || !item.project) {
          vscode.window.showErrorMessage("No project selected");
          return;
        }

        const project = item.project;
        const oldName = project.name;

        const newName = await vscode.window.showInputBox({
          title: `Rename Project: ${oldName}`,
          prompt: "Enter new name",
          value: oldName,
          placeHolder: oldName,
          validateInput: (value) => {
            if (!value || value.trim().length === 0) {
              return "Project name cannot be empty";
            }
            if (value.length < 3) {
              return "Project name must be at least 3 characters";
            }
            if (value.length > 50) {
              return "Project name must be 50 characters or less";
            }
            if (value === oldName) {
              return "New name must be different from current name";
            }
            return undefined;
          },
        });

        if (!newName) {
          return;
        }

        try {
          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: `Renaming project "${oldName}" to "${newName}"...`,
              cancellable: false,
            },
            async () => {
              const datalayer = getServiceContainer().datalayer;
              await datalayer.renameProject(
                project.uid,
                newName.trim(),
                project.description,
              );

              vscode.window.showInformationMessage(
                `Project renamed from "${oldName}" to "${newName}"`,
              );

              projectsTreeProvider?.refresh();
            },
          );
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to rename project: ${error instanceof Error ? error.message : error}`,
          );
        }
      },
    ),
  );

  /**
   * Command: datalayer.projects.assignAgent
   * Assigns an agent runtime to a project via agent spec picker.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.projects.assignAgent",
      async (item: ProjectTreeItem) => {
        if (!item || !item.project) {
          vscode.window.showErrorMessage("No project selected");
          return;
        }

        const project = item.project;
        const specId = await showAgentSpecPicker(
          `Assign Agent to "${project.name}"`,
          settingsTreeProvider,
        );

        if (!specId) {
          return;
        }

        try {
          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: `Creating agent runtime for "${project.name}"...`,
              cancellable: false,
            },
            async () => {
              const datalayer = getServiceContainer().datalayer;
              await datalayer.createAgentRuntimeForProject(project.uid, {
                agentSpecId: specId,
                givenName: `${project.name}-agent`,
              });

              vscode.window.showInformationMessage(
                `Agent "${specId}" created and assigned to "${project.name}"`,
              );

              projectsTreeProvider?.refresh();
              runtimesTreeProvider?.refresh();
            },
          );
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to create agent: ${error instanceof Error ? error.message : error}`,
          );
        }
      },
    ),
  );

  /**
   * Command: datalayer.createAgent
   * Creates a new agent via agent spec picker (standalone, no project context).
   */
  context.subscriptions.push(
    vscode.commands.registerCommand("datalayer.createAgent", async () => {
      const specId = await showAgentSpecPicker(
        "Create New Agent",
        settingsTreeProvider,
      );

      if (!specId) {
        return;
      }

      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Creating agent runtime "${specId}"...`,
            cancellable: false,
          },
          async () => {
            const datalayer = getServiceContainer().datalayer;
            await datalayer.createAgentRuntime({
              agentSpecId: specId,
              givenName: specId,
            });

            vscode.window.showInformationMessage(
              `Agent runtime "${specId}" created successfully`,
            );

            runtimesTreeProvider?.refresh();
          },
        );
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to create agent: ${error instanceof Error ? error.message : error}`,
        );
      }
    }),
  );

  /**
   * Command: datalayer.projects.unassignAgent
   * Removes the agent assignment from a project.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.projects.unassignAgent",
      async (item: ProjectTreeItem) => {
        if (!item || !item.project) {
          vscode.window.showErrorMessage("No project selected");
          return;
        }

        const project = item.project;

        const confirmation = await vscode.window.showWarningMessage(
          `Remove agent "${project.attachedAgentPodName}" from project "${project.name}"?`,
          { modal: true },
          "Unassign Agent",
        );

        if (confirmation !== "Unassign Agent") {
          return;
        }

        try {
          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: `Removing agent from "${project.name}"...`,
              cancellable: false,
            },
            async () => {
              const datalayer = getServiceContainer().datalayer;
              await datalayer.unassignAgentFromProject(project.uid);

              vscode.window.showInformationMessage(
                `Agent removed from project "${project.name}"`,
              );

              projectsTreeProvider?.refresh();
            },
          );
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to unassign agent: ${error instanceof Error ? error.message : error}`,
          );
        }
      },
    ),
  );

  /**
   * Command: datalayer.projects.viewDetails
   * Shows project details in a modal dialog.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.projects.viewDetails",
      async (item: ProjectTreeItem) => {
        if (!item || !item.project) {
          vscode.window.showErrorMessage("No project selected");
          return;
        }

        const project = item.project;

        const details = [
          `Name: ${project.name}`,
          `Handle: ${project.handle}`,
          `UID: ${project.uid}`,
          `Visibility: ${project.isPublic ? "Public" : "Private"}`,
          `Description: ${project.description || "None"}`,
          `Agent: ${project.hasAgent ? `${project.attachedAgentPodName}${project.attachedAgentSpecId ? ` (${project.attachedAgentSpecId})` : ""}` : "None"}`,
          `Created: ${project.createdAt.toLocaleString()}`,
        ].join("\n");

        await vscode.window.showInformationMessage(
          `Project: ${project.name}`,
          {
            modal: true,
            detail: details,
          },
          "OK",
        );
      },
    ),
  );
}
