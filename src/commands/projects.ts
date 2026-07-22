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

import type { ProjectDTO } from "@datalayer/agent-runtimes/lib/models/ProjectDTO";
import * as vscode from "vscode";

import { getServiceContainer } from "../extension";
import { ProjectTreeItem } from "../models/projectTreeItem";
import { SpaceItem } from "../models/spaceItem";
import type { ProjectsTreeProvider } from "../providers/projectsTreeProvider";
import type { RuntimesTreeProvider } from "../providers/runtimesTreeProvider";
import type { SettingsTreeProvider } from "../providers/settingsTreeProvider";
import type { SpacesTreeProvider } from "../providers/spacesTreeProvider";

/**
 * Extracts a project from either the legacy Projects view item or a project
 * space item in the Spaces view.
 *
 * @param item - Selected tree item from Projects or Spaces.
 *
 * @returns Resolved project DTO or undefined when selection is not a project.
 */
function getProjectFromItem(
  item: ProjectTreeItem | SpaceItem | undefined,
): ProjectDTO | undefined {
  if (!item) {
    return undefined;
  }
  if (item instanceof ProjectTreeItem) {
    return item.project;
  }
  if (item instanceof SpaceItem) {
    return item.data.project;
  }
  return undefined;
}

/**
 * Generates a safe space handle from a display name.
 *
 * @param name - Space name entered by the user.
 *
 * @returns Kebab-case handle suitable for space creation.
 */
function generateSpaceHandle(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return base.length > 0 ? base : "space";
}

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

  const specs = datalayer.listAgentspecs();
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
      const requiredVars = datalayer.getAgentspecRequiredEnvVars(spec);
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
 * @param spacesTreeProvider - The Spaces tree view provider for refresh.
 *
 */
export function registerProjectsCommands(
  context: vscode.ExtensionContext,
  projectsTreeProvider?: ProjectsTreeProvider,
  runtimesTreeProvider?: RuntimesTreeProvider,
  settingsTreeProvider?: SettingsTreeProvider,
  spacesTreeProvider?: SpacesTreeProvider,
): void {
  /**
   * Command: datalayer.projects.refresh
   * Refreshes the projects tree view.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand("datalayer.projects.refresh", () => {
      projectsTreeProvider?.refresh();
      spacesTreeProvider?.refresh();
    }),
  );

  /**
   * Command: datalayer.spaces.create
   * Creates a new space via multi-step input dialog.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand("datalayer.spaces.create", async () => {
      try {
        const datalayer = getServiceContainer().datalayer;

        // Step 1: Enter space name
        const name = await vscode.window.showInputBox({
          title: "Create Space - Step 1 of 3",
          prompt: "Enter space name",
          placeHolder: "my-space",
          validateInput: (value) => {
            const trimmed = value?.trim() ?? "";
            if (!trimmed) {
              return "Space name cannot be empty";
            }
            if (trimmed.length < 3) {
              return "Space name must be at least 3 characters";
            }
            if (trimmed.length > 50) {
              return "Space name must be 50 characters or less";
            }
            return undefined;
          },
        });

        if (!name) {
          return;
        }

        // Step 2: Enter description (optional)
        const description = await vscode.window.showInputBox({
          title: "Create Space - Step 2 of 3",
          prompt: "Enter description (optional)",
          placeHolder: "Description of the space...",
          validateInput: (value) => {
            if (value && value.length > 500) {
              return "Description must be 500 characters or less";
            }
            return undefined;
          },
        });

        // Step 3: Select variant
        const variantChoice = await vscode.window.showQuickPick(
          [
            {
              label: "default",
              description: "Default space for general work",
              value: "default",
            },
            {
              label: "project",
              description: "Project-oriented collaborative space",
              value: "project",
            },
            {
              label: "course",
              description: "Course/training oriented space",
              value: "course",
            },
          ],
          {
            title: "Create Space - Step 3 of 3",
            placeHolder: "Select space variant",
            matchOnDescription: true,
          },
        );

        if (!variantChoice) {
          return;
        }

        const spaceName = name.trim();
        const spaceDescription = description?.trim() ?? "";
        const spaceVariant = variantChoice.value;
        const spaceHandle = generateSpaceHandle(spaceName);

        // Create the space
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Creating ${spaceVariant} space "${spaceName}"...`,
            cancellable: false,
          },
          async () => {
            await datalayer.createSpace(
              spaceName,
              spaceDescription,
              spaceVariant,
              spaceHandle,
              "",
              "",
              false,
            );

            vscode.window.showInformationMessage(
              `Space "${spaceName}" (${spaceVariant}) created successfully`,
            );

            projectsTreeProvider?.refresh();
            spacesTreeProvider?.refresh();
          },
        );
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to create space: ${error instanceof Error ? error.message : error}`,
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
      async (item: ProjectTreeItem | SpaceItem) => {
        const project = getProjectFromItem(item);
        if (!project) {
          vscode.window.showErrorMessage("No project selected");
          return;
        }
        const oldName = project.name;

        const newName = await vscode.window.showInputBox({
          title: `Rename Project: ${oldName}`,
          prompt: "Enter new name",
          value: oldName,
          placeHolder: oldName,
          validateInput: (value) => {
            const trimmed = value?.trim() ?? "";
            if (!trimmed) {
              return "Project name cannot be empty";
            }
            if (trimmed.length < 3) {
              return "Project name must be at least 3 characters";
            }
            if (trimmed.length > 50) {
              return "Project name must be 50 characters or less";
            }
            if (trimmed === oldName.trim()) {
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
              spacesTreeProvider?.refresh();
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
      async (item: ProjectTreeItem | SpaceItem) => {
        const project = getProjectFromItem(item);
        if (!project) {
          vscode.window.showErrorMessage("No project selected");
          return;
        }
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
              spacesTreeProvider?.refresh();
              runtimesTreeProvider?.refresh();
              await vscode.commands.executeCommand(
                "datalayer.internal.agentChat.refresh",
              );
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
   * Creates a new agent. When called with an explicit `presetSpecId`
   * argument the picker is skipped and the runtime is provisioned
   * directly with that spec — the Agent Chat sidebar uses this path so
   * the user-configured `datalayer.agentChat.agentSpecId` setting
   * actually drives sidebar creation. When invoked with no argument
   * (e.g. from the command palette) the spec picker still runs.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.createAgent",
      async (presetSpecId?: string) => {
        const specId =
          typeof presetSpecId === "string" && presetSpecId.length > 0
            ? presetSpecId
            : await showAgentSpecPicker(
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
              await vscode.commands.executeCommand(
                "datalayer.internal.agentChat.refresh",
              );
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
   * Command: datalayer.projects.unassignAgent
   * Removes the agent assignment from a project.
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "datalayer.projects.unassignAgent",
      async (item: ProjectTreeItem | SpaceItem) => {
        const project = getProjectFromItem(item);
        if (!project) {
          vscode.window.showErrorMessage("No project selected");
          return;
        }

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
              spacesTreeProvider?.refresh();
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
      async (item: ProjectTreeItem | SpaceItem) => {
        const project = getProjectFromItem(item);
        if (!project) {
          vscode.window.showErrorMessage("No project selected");
          return;
        }

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
