#!/usr/bin/env tsx
/*
 * Sync package.json languageModelTools with TypeScript tool definitions.
 *
 * Sources (3 packages):
 *   - Inline VS Code-specific tools (6 tools, including unified executeCode)
 *   - @datalayer/jupyter-react (7 notebook tools, excluding executeCode and insertCells)
 *   - @datalayer/jupyter-lexical (9 lexical tools, excluding executeCode)
 *
 * Total: 22 tools (6 + 7 + 9)
 *
 * The unified executeCode tool in VS Code automatically routes to the correct
 * document type (notebook or lexical), eliminating the need for separate
 * executeCode tools from each package.
 *
 * Note: insertCells is excluded because its operation doesn't exist in the package.
 *
 * Run: npm run sync:tools
 */

import {
  notebookToolDefinitions,
  type ToolDefinition,
} from "@datalayer/jupyter-react/tools";
import { lexicalToolDefinitions } from "@datalayer/jupyter-lexical/lib/tools";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

/** NLS JSON type for package.nls.json and package.nls.es.json files. */
type NlsJson = Record<string, string>;

// Get __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import VS Code-specific tool definitions from source (single source of truth)
import { getActiveDocumentTool } from "../src/tools/definitions/getActiveDocument.js";
import { createNotebookTool } from "../src/tools/definitions/createNotebook.js";
import { createLexicalTool } from "../src/tools/definitions/createLexical.js";
import { listKernelsTool } from "../src/tools/definitions/listKernels.js";
import { selectKernelTool } from "../src/tools/definitions/selectKernel.js";
import { executeCodeTool } from "../src/tools/definitions/executeCode.js";

// VS Code-specific tools (imported from definitions, not duplicated)
const vscodeTools: ToolDefinition[] = [
  getActiveDocumentTool,
  createNotebookTool,
  createLexicalTool,
  listKernelsTool,
  selectKernelTool,
  executeCodeTool,
];

// Combine all tool definitions from the 3 sources
const allToolDefinitions = [
  // VS Code-specific tools (6 tools including unified executeCode)
  ...vscodeTools,

  // Notebook tools from package (7 tools, EXCLUDE executeCode and insertCells)
  ...notebookToolDefinitions.filter(
    (tool: ToolDefinition) =>
      tool.name !== "datalayer_executeCode" &&
      tool.name !== "datalayer_insertCells", // Operation doesn't exist
  ),

  // Lexical tools from package (9 tools, EXCLUDE executeCode)
  ...lexicalToolDefinitions.filter(
    (tool: ToolDefinition) => tool.name !== "datalayer_executeCode_lexical",
  ),
] as const;

// VS Code package.json contribution format
interface VSCodeToolContribution {
  name: string;
  displayName: string;
  tags: string[];
  toolReferenceName: string;
  modelDescription: string;
  canBeReferencedInPrompt: boolean;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
  };
}

/**
 * Derive the NLS key prefix from a tool name.
 * Strips the "datalayer_" prefix to produce keys like "languageModelTools.getActiveDocument".
 */
function nlsKeyPrefix(toolName: string): string {
  const shortName = toolName.replace(/^datalayer_/, "");
  return `languageModelTools.${shortName}`;
}

/**
 * Transform tool definition to VS Code package.json format.
 * Writes %key% i18n references for displayName and modelDescription.
 * Collects actual English strings into the provided nlsEntries map.
 */
function toVSCodeContribution(
  tool: ToolDefinition,
  nlsEntries: NlsJson,
): VSCodeToolContribution {
  if (!tool.toolReferenceName) {
    throw new Error(
      `Tool "${tool.name}" missing required field "toolReferenceName"`,
    );
  }

  // Append instruction to always call getActiveDocument first
  // Exceptions: getActiveDocument itself, creation tools, global discovery tools, and executeCode (has runtime fallback)
  let modelDescription = tool.description;
  const noDocumentRequired = [
    "datalayer_getActiveDocument",
    "datalayer_createNotebook",
    "datalayer_createLexical",
    "datalayer_listKernels", // Global discovery - no document needed
    "datalayer_executeCode", // Has runtime fallback - can execute without document
  ];

  if (!noDocumentRequired.includes(tool.name)) {
    modelDescription = `${tool.description} **IMPORTANT: Always ensure you call getActiveDocument before running this operation.**`;
  }

  // Build NLS keys and store English strings
  const prefix = nlsKeyPrefix(tool.name);
  const displayNameKey = `${prefix}.displayName`;
  const modelDescriptionKey = `${prefix}.modelDescription`;

  nlsEntries[displayNameKey] = tool.displayName;
  nlsEntries[modelDescriptionKey] = modelDescription;

  return {
    name: tool.name,
    displayName: `%${displayNameKey}%`,
    tags: tool.tags || ["datalayer", "notebook", "lexical"],
    toolReferenceName: tool.toolReferenceName,
    modelDescription: `%${modelDescriptionKey}%`,
    canBeReferencedInPrompt: tool.config?.canBeReferencedInPrompt ?? true,
    inputSchema: {
      type: "object",
      properties: tool.parameters.properties,
      required: tool.parameters.required || [],
    },
  };
}

// Main execution
const rootDir = path.join(__dirname, "..");
const packageJsonPath = path.join(rootDir, "package.json");
const nlsPath = path.join(rootDir, "package.nls.json");
const nlsEsPath = path.join(rootDir, "package.nls.es.json");

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
const nlsJson: NlsJson = JSON.parse(fs.readFileSync(nlsPath, "utf-8"));
const nlsEsJson: NlsJson = JSON.parse(fs.readFileSync(nlsEsPath, "utf-8"));

// Save existing ES translations before removing old keys (preserve translations)
const existingEsTranslations: NlsJson = {};
for (const [key, value] of Object.entries(nlsEsJson)) {
  if (key.startsWith("languageModelTools.") && value !== "") {
    existingEsTranslations[key] = value;
  }
}

// Remove old languageModelTools.* keys from NLS files (tools may have been removed)
for (const key of Object.keys(nlsJson)) {
  if (key.startsWith("languageModelTools.")) {
    delete nlsJson[key];
  }
}
for (const key of Object.keys(nlsEsJson)) {
  if (key.startsWith("languageModelTools.")) {
    delete nlsEsJson[key];
  }
}

// Generate contributions from allToolDefinitions
console.log(`Syncing tools from TypeScript definitions...\n`);

const nlsEntries: NlsJson = {};
const contributions = allToolDefinitions.map((tool: ToolDefinition) => {
  const contrib = toVSCodeContribution(tool, nlsEntries);
  console.log(`  ${contrib.name}`);
  return contrib;
});

// Update package.json
if (!packageJson.contributes) {
  packageJson.contributes = {};
}
packageJson.contributes.languageModelTools = contributions;

// Add new languageModelTools.* keys to NLS files (preserve existing translations)
// modelDescription values are AI-facing instructions, NOT user-facing.
// Always write empty strings for modelDescription in ES so VS Code falls back to English.
for (const [key, value] of Object.entries(nlsEntries)) {
  nlsJson[key] = value;
  if (key.endsWith(".modelDescription")) {
    // AI-facing instructions must stay in English - force empty for fallback
    nlsEsJson[key] = "";
  } else {
    nlsEsJson[key] = existingEsTranslations[key] || "";
  }
}

// Write back all files
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + "\n");
fs.writeFileSync(nlsPath, JSON.stringify(nlsJson, null, 2) + "\n");
fs.writeFileSync(nlsEsPath, JSON.stringify(nlsEsJson, null, 2) + "\n");

console.log(`\nSynced ${contributions.length} tools to package.json`);
console.log(`  - VS Code-specific: 6 (including unified executeCode)`);
console.log(`  - Notebook: 7 (excluding executeCode and insertCells)`);
console.log(`  - Lexical: 9 (excluding executeCode)`);
console.log(
  `Updated package.nls.json and package.nls.es.json with ${Object.keys(nlsEntries).length} i18n keys`,
);
