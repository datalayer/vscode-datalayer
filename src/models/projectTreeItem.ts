/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Tree item for displaying projects in the Projects tree view.
 *
 * @module models/projectTreeItem
 */

import type { ProjectDTO } from "@datalayer/core/lib/models/ProjectDTO";
import * as vscode from "vscode";

/**
 * Tree item for displaying a project with visibility and agent status.
 *
 */
export class ProjectTreeItem extends vscode.TreeItem {
  /**
   * Creates a new ProjectTreeItem with dynamic context value for conditional menus.
   *
   * @param project - Project DTO from the Datalayer platform.
   * @param runtimeGivenName - Human-readable name of the attached runtime, if known.
   */
  constructor(
    public readonly project: ProjectDTO,
    runtimeGivenName?: string,
  ) {
    super(project.name, vscode.TreeItemCollapsibleState.Collapsed);

    // Description: visibility + agent info
    const visibility = project.isPublic ? "public" : "private";
    const agentDisplayName =
      runtimeGivenName ||
      project.attachedAgentGivenName ||
      project.attachedAgentSpecId ||
      project.attachedAgentPodName;
    const agentInfo = project.hasAgent
      ? `agent: ${agentDisplayName}`
      : "no agent";
    this.description = `${visibility} - ${agentInfo}`;

    // Tooltip with project details
    this.tooltip = new vscode.MarkdownString();
    this.tooltip.appendMarkdown(`**${project.name}**\n\n`);
    if (project.description) {
      this.tooltip.appendMarkdown(`${project.description}\n\n`);
    }
    this.tooltip.appendMarkdown(`- **Handle:** ${project.handle}\n`);
    this.tooltip.appendMarkdown(`- **Visibility:** ${visibility}\n`);
    if (project.hasAgent) {
      if (runtimeGivenName || project.attachedAgentGivenName) {
        this.tooltip.appendMarkdown(
          `- **Agent:** ${runtimeGivenName || project.attachedAgentGivenName}\n`,
        );
      }
      if (project.attachedAgentSpecId) {
        this.tooltip.appendMarkdown(
          `- **Agent Spec:** ${project.attachedAgentSpecId}\n`,
        );
      }
      this.tooltip.appendMarkdown(
        `- **Agent Pod:** ${project.attachedAgentPodName}\n`,
      );
    }
    this.tooltip.appendMarkdown(
      `- **Created:** ${project.createdAt.toLocaleString()}\n`,
    );
    this.tooltip.appendMarkdown(`- **ID:** ${project.uid}\n`);

    // Use project icon
    this.iconPath = new vscode.ThemeIcon("project");

    // Dynamic context value for conditional menu items
    // Format: project-{public|private}-{withAgent|noAgent}
    const visibilityPart = project.isPublic ? "public" : "private";
    const agentPart = project.hasAgent ? "withAgent" : "noAgent";
    this.contextValue = `project-${visibilityPart}-${agentPart}`;
  }
}
