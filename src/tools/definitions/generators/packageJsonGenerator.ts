/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Auto-generates VS Code package.json languageModelTools contributions
 * from unified tool definitions.
 *
 * This ensures the package.json is always in sync with tool definitions
 * and prevents drift between metadata and implementation.
 *
 * @module tools/definitions/generators/packageJsonGenerator
 */

import type { ToolDefinition } from "../schema";

/**
 * VS Code languageModelTool contribution format
 */
interface VSCodeLanguageModelTool {
  name: string;
  displayName: string;
  toolReferenceName?: string;
  modelDescription: string;
  canBeReferencedInPrompt?: boolean;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * Generates VS Code languageModelTools contribution from tool definition
 */
export function generateVSCodeToolContribution(
  tool: ToolDefinition,
): VSCodeLanguageModelTool {
  const vscodeConfig = tool.platformConfig?.vscode;

  return {
    name: tool.name,
    displayName: tool.displayName,
    toolReferenceName: tool.toolReferenceName || tool.name,
    modelDescription: tool.description,
    canBeReferencedInPrompt: vscodeConfig?.canBeReferencedInPrompt ?? true,
    inputSchema: {
      type: "object",
      properties: tool.parameters.properties,
      required: tool.parameters.required || [],
    },
  };
}

/**
 * Generates all languageModelTools contributions for package.json
 */
export function generateAllVSCodeToolContributions(
  tools: ToolDefinition[],
): VSCodeLanguageModelTool[] {
  return tools.map(generateVSCodeToolContribution);
}

/**
 * Generates the complete languageModelTools section for package.json
 */
export function generatePackageJsonSection(
  tools: ToolDefinition[],
): { languageModelTools: VSCodeLanguageModelTool[] } {
  return {
    languageModelTools: generateAllVSCodeToolContributions(tools),
  };
}

/**
 * Formats the output as JSON string for package.json
 */
export function generatePackageJsonString(
  tools: ToolDefinition[],
  indent = 2,
): string {
  const section = generatePackageJsonSection(tools);
  return JSON.stringify(section, null, indent);
}

/**
 * CLI utility to print package.json contributions
 * Usage: node -r ts-node/register generators/packageJsonGenerator.ts
 */
if (require.main === module) {
  // Import tool definitions
  const { allToolDefinitions } = require("../tools");

  console.log("// Auto-generated languageModelTools for package.json");
  console.log("// Generated from: src/tools/definitions/tools/");
  console.log("// Do not edit manually - run npm run generate:tools\n");
  console.log(generatePackageJsonString(allToolDefinitions, 2));
}
