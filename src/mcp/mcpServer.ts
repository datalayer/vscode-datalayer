/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * HTTP MCP server for Windsurf/Cascade integration.
 *
 * Exposes all Datalayer tools via the MCP Streamable HTTP transport so that
 * Cascade can invoke them the same way Copilot does through the VS Code LM API.
 *
 * @module mcp/mcpServer
 */

import type { ToolDefinition, ToolExecutionContext } from "@datalayer/jupyter-react";
import { formatResponse } from "@datalayer/jupyter-react";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import * as http from "http";
import * as net from "net";
import * as vscode from "vscode";
import { z } from "zod";

import type { Document } from "../models/spaceItem";
import { getValidatedSettingsGroup } from "../services/config/settingsValidator";
import type { ServiceContainer } from "../services/core/serviceContainer";
import type { ExtensionUI } from "../services/ui/uiSetup";
import {
  getCombinedOperations,
} from "../tools/core/registration";
import { getAllToolDefinitionsAsync } from "../tools/definitions";
import { analyzeOpenDocuments } from "../utils/documentAnalysis";
import { getAllOpenedDocuments } from "../utils/getAllOpenedDocuments";
import {
  getActiveDatalayerNotebook,
  validateDatalayerNotebook,
} from "../utils/notebookValidation";
import { CrossWindowRegistry } from "./crossWindowRegistry";

/**
 * Cross-window registry instance for this window.
 * Set once in startMcpServer(); read from the error path in the MCP executor.
 */
let crossWindowRegistry: CrossWindowRegistry | undefined;

/** Default MCP HTTP server port. */
const MCP_DEFAULT_PORT = 3333;
/** Maximum port to scan before giving up. */
const MCP_MAX_PORT = 3340;

/**
 * JSON Schema property descriptor used in tool input schemas.
 */
interface JsonSchemaProp {
  /** JSON Schema type string. */
  type?: string;
  /** Human-readable description. */
  description?: string;
  /** Nested properties for object types. */
  properties?: Record<string, JsonSchemaProp>;
  /** Array item schema. */
  items?: JsonSchemaProp;
  /** Enum values. */
  enum?: unknown[];
}

/**
 * JSON Schema object descriptor for a tool's input parameters.
 */
interface JsonSchemaObject {
  /** Must be "object". */
  type: string;
  /** Property definitions keyed by parameter name. */
  properties?: Record<string, JsonSchemaProp>;
  /** Array of required property names. */
  required?: string[];
}

/**
 * Converts a single JSON Schema property into a Zod schema.
 * @param prop - JSON Schema property descriptor.
 *
 * @returns A Zod schema that validates the property value.
 */
function propToZod(prop: JsonSchemaProp): z.ZodTypeAny {
  if (prop.enum) {
    const [first, ...rest] = prop.enum as [string, ...string[]];
    return z.enum([first, ...rest]);
  }
  switch (prop.type) {
    case "string":
      return z.string();
    case "number":
    case "integer":
      return z.number();
    case "boolean":
      return z.boolean();
    case "array":
      return z.array(prop.items ? propToZod(prop.items) : z.unknown());
    case "object": {
      if (prop.properties) {
        const shape: Record<string, z.ZodTypeAny> = {};
        for (const [k, v] of Object.entries(prop.properties)) {
          shape[k] = propToZod(v);
        }
        return z.object(shape).passthrough();
      }
      return z.record(z.string(), z.unknown());
    }
    default:
      return z.unknown();
  }
}

/**
 * Converts a JSON Schema object into a Zod raw shape (Record of Zod schemas).
 * Required fields are kept as-is; optional fields are wrapped in `.optional()`.
 *
 * @param schema - JSON Schema object with properties and required array.
 *
 * @returns Record mapping parameter names to their Zod schemas.
 */
function jsonSchemaToZodShape(
  schema: JsonSchemaObject,
): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {};
  const required = new Set(schema.required ?? []);

  for (const [key, prop] of Object.entries(schema.properties ?? {})) {
    const base = propToZod(prop);
    const withDesc = prop.description ? base.describe(prop.description) : base;
    shape[key] = required.has(key) ? withDesc : withDesc.optional();
  }

  return shape;
}

/**
 * Checks if a TCP port is available by attempting to bind to it briefly.
 * @param port - The port number to probe.
 *
 * @returns Promise resolving to true when the port is free, false otherwise.
 */
function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

/**
 * Scans from `startPort` to `MCP_MAX_PORT` and returns the first free port.
 * @param startPort - First port to try.
 *
 * @returns Promise resolving to the first available port number.
 *
 * @throws Error when no port in the range is available.
 */
async function findAvailablePort(startPort: number): Promise<number> {
  for (let port = startPort; port <= MCP_MAX_PORT; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(
    `No available port found in range ${startPort}–${MCP_MAX_PORT}`,
  );
}

/**
 * Reads the full request body from an IncomingMessage stream.
 * @param req - Node.js incoming HTTP request.
 *
 * @returns Promise resolving to the raw body string.
 */
function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

/**
 * Resolves a notebook document ID from tool params or the active Datalayer editor.
 *
 * Falls back to the document registry when the active tab is not a Datalayer
 * notebook (e.g. when VS Code focus is on the Cascade chat panel).
 *
 * @param params - Tool input parameters, potentially containing notebook_uri.
 * @param services - Extension service container for document registry access.
 *
 * @returns The resolved document ID or URI string.
 *
 * @throws Error when no Datalayer notebook is found.
 */
async function resolveNotebookId(
  params: Record<string, unknown>,
  services: ServiceContainer,
): Promise<string> {
  const uriString = params["notebook_uri"] as string | undefined;

  if (uriString) {
    const targetUri = vscode.Uri.parse(uriString);
    validateDatalayerNotebook(targetUri);
    const uriStr = targetUri.toString();
    try {
      return services.documentRegistry.getIdFromUri(uriStr);
    } catch {
      return uriStr;
    }
  }

  // Try active tab first (works when notebook tab is focused)
  const activeUri = getActiveDatalayerNotebook();
  if (activeUri) {
    const uriStr = activeUri.toString();
    try {
      const id = services.documentRegistry.getIdFromUri(uriStr);
      services.documentRegistry.touch(id);
      return id;
    } catch {
      return uriStr;
    }
  }

  // Fall back to registry sorted by most-recently-used — covers the case
  // where Cascade panel has focus or multiple notebooks are open.
  const notebookEntries = services.documentRegistry.getByType("notebook");
  if (notebookEntries.length > 0) {
    const entry = notebookEntries[0]!;
    services.documentRegistry.touch(entry.documentId);
    return entry.documentId;
  }

  throw new Error(
    "No Datalayer notebook is open. Please open a notebook with the Datalayer editor and try again.",
  );
}

/**
 * Resolves a Lexical document ID from tool params or the active custom editor tab.
 *
 * Falls back to the document registry when the active tab is not a Datalayer
 * lexical document (e.g. when VS Code focus is on the Cascade chat panel).
 *
 * @param params - Tool input parameters, potentially containing documentUri.
 * @param services - Extension service container for document registry access.
 *
 * @returns The resolved document ID or URI string.
 *
 * @throws Error when no Lexical document is found.
 */
async function resolveLexicalId(
  params: Record<string, unknown>,
  services: ServiceContainer,
): Promise<string> {
  const uriString = params["documentUri"] as string | undefined;
  let targetUri: vscode.Uri | undefined;

  if (uriString) {
    targetUri = vscode.Uri.parse(uriString);
  } else {
    // Try active tab first
    const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
    if (activeTab?.input && typeof activeTab.input === "object") {
      const tabInput = activeTab.input as { uri?: vscode.Uri; viewType?: string };
      if (tabInput.uri && tabInput.viewType === "datalayer.lexical-editor") {
        targetUri = tabInput.uri;
      }
    }
  }

  if (!targetUri) {
    // Fall back to registry — covers the case where Cascade panel has focus
    const lexicalEntries = services.documentRegistry.getByType("lexical");
    if (lexicalEntries.length > 0) {
      return lexicalEntries[0]!.documentId;
    }

    const activeEditor = vscode.window.activeTextEditor;
    const activeTab = vscode.window.tabGroups.activeTabGroup?.activeTab;
    const activeFileName =
      activeEditor?.document.fileName || activeTab?.label || "nothing";
    throw new Error(
      `No Lexical document is open. ` +
        `Currently active: "${activeFileName}". ` +
        `Please open a .dlex file and try again.`,
    );
  }

  const uriStr = targetUri.toString();
  try {
    return services.documentRegistry.getIdFromUri(uriStr);
  } catch {
    return uriStr;
  }
}

/**
 * Returns URIs of .ipynb files currently open in the native VS Code notebook
 * viewer (i.e. NOT in the Datalayer custom editor). Used to produce actionable
 * error messages and offer a one-click reopen when MCP tools can't find a
 * Datalayer webview.
 *
 * @returns Array of URIs for notebooks open in native VS Code viewer.
 */
function detectNativeNotebookTabs(): vscode.Uri[] {
  const datalayerViewType = "datalayer.jupyter-notebook";
  const found: vscode.Uri[] = [];
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      // TabInputNotebook → native VS Code notebook viewer
      if (tab.input instanceof vscode.TabInputNotebook) {
        found.push((tab.input as vscode.TabInputNotebook).uri);
      }
      // TabInputCustom with a non-Datalayer viewType and .ipynb extension
      if (
        tab.input instanceof vscode.TabInputCustom &&
        (tab.input as vscode.TabInputCustom).viewType !== datalayerViewType &&
        (tab.input as vscode.TabInputCustom).uri.path.endsWith(".ipynb")
      ) {
        found.push((tab.input as vscode.TabInputCustom).uri);
      }
    }
  }
  return found;
}

/**
 * Builds a ToolExecutionContext for use in the MCP handler.
 *
 * Mirrors VSCodeToolAdapter.buildExecutionContext but without VS Code Quick Pick
 * dialogs. The promptForLocation callback defaults to "cloud" when authenticated
 * and "local" otherwise.
 *
 * @param definition - Tool definition including tags and operation name.
 * @param params - Validated input parameters from the MCP request.
 * @param services - Extension service container.
 *
 * @returns Fully-constructed ToolExecutionContext ready for operation.execute().
 */
async function buildMcpExecutionContext(
  definition: ToolDefinition,
  params: Record<string, unknown>,
  services: ServiceContainer,
): Promise<ToolExecutionContext> {
  const responseFormat = getValidatedSettingsGroup("tools").responseFormat as
    | "json"
    | "toon";

  const documentsContext = getAllOpenedDocuments();

  const isPrerequisiteTool = definition.tags?.includes("prerequisite");
  const needsCellDocument = !isPrerequisiteTool && definition.tags?.includes("cell");
  // Use "block"/"blocks" as the discriminator, NOT "lexical". The "lexical" tag is a
  // domain descriptor shared by cross-domain tools (listKernels, selectKernel,
  // executeCode) that don't need a lexical document ID. Every actual block operation
  // tool carries "block" or "blocks" in its tags; none of the cross-domain tools do.
  const needsBlockDocument =
    !isPrerequisiteTool &&
    (definition.tags?.includes("block") || definition.tags?.includes("blocks"));
  const isCreateOperation = definition.tags?.includes("create");

  // Build the webview executor — same postMessage bridge as Copilot path.
  const executor = {
    execute: async (operationName: string, args: unknown): Promise<unknown> => {
      // Use getBestWebviewPanel() rather than getActiveWebviewPanel() so that
      // operations succeed even when VS Code focus is on the Cascade chat panel
      // instead of the notebook tab.
      const panelStatus = services.documentRegistry.getBestWebviewPanelWithStatus();
      if (!panelStatus) {
        // Detect .ipynb files open in the native VS Code notebook viewer.
        // When found, offer a one-click path to reopen in the Datalayer editor.
        const nativeNotebooks = detectNativeNotebookTabs();
        if (nativeNotebooks.length > 0) {
          const names = nativeNotebooks.map((u) => u.path.split("/").pop()).join(", ");
          // Fire-and-forget notification with an action button — don't block the error.
          vscode.window
            .showWarningMessage(
              `"${names}" is open in the native VS Code viewer. Reopen it in the Datalayer Notebook Editor for MCP tools to work.`,
              "Reopen in Datalayer Editor",
            )
            .then((choice) => {
              if (choice === "Reopen in Datalayer Editor") {
                for (const uri of nativeNotebooks) {
                  vscode.commands.executeCommand(
                    "vscode.openWith",
                    uri,
                    "datalayer.jupyter-notebook",
                  );
                }
              }
            });
          throw new Error(
            `"${names}" is open in the native VS Code notebook viewer, not the Datalayer editor. ` +
              `Right-click the file in the Explorer → "Open With…" → "Datalayer Notebook Editor", ` +
              `then retry. (A notification with a one-click button has also appeared in VS Code.)`,
          );
        }
        // Check whether the notebook is open in another VS Code window.
        const otherWindows = crossWindowRegistry?.getOtherWindowsSummary() ?? [];
        if (otherWindows.length > 0) {
          const lines = otherWindows.map(
            (w) =>
              `  • Port ${w.port}: ${w.documents.map((d) => d.filename).join(", ") || "(no documents open)"}`,
          );
          throw new Error(
            `No Datalayer notebook is open in THIS window's editor, but notebooks are open in other VS Code windows:\n` +
              lines.join("\n") +
              `\n\nTo fix: switch to the VS Code window with the notebook you want to use — ` +
              `Cascade there will connect to that window's MCP server automatically. ` +
              `Or open the notebook in this window via right-click → "Open With…" → "Datalayer Notebook Editor".`,
          );
        }
        throw new Error(
          `No notebook is open in the Datalayer editor. ` +
            `Right-click an .ipynb file in the Explorer → "Open With…" → "Datalayer Notebook Editor", then retry.`,
        );
      }
      if (!panelStatus.isReady) {
        throw new Error(
          `The Datalayer notebook is still loading (webview not ready yet). ` +
            `Please wait a few seconds for the notebook to fully open, then retry.`,
        );
      }
      const webviewPanel = panelStatus.panel;

      const requestId = `${Date.now()}-${Math.random()}`;

      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          listener.dispose();
          reject(new Error(`Tool execution timeout (30s): ${operationName}`));
        }, 30000);

        const listener = webviewPanel.webview.onDidReceiveMessage(
          (message) => {
            if (
              message.type === "tool-execution-response" &&
              message.requestId === requestId
            ) {
              clearTimeout(timeoutId);
              listener.dispose();
              if (message.error) {
                reject(new Error(message.error));
              } else {
                resolve(message.result);
              }
            }
          },
        );

        webviewPanel.webview
          .postMessage({
            type: "tool-execution",
            requestId,
            operationName,
            args,
            format: "json",
          })
          .then(
            () => {/* sent */},
            (err: Error) => {
              clearTimeout(timeoutId);
              listener.dispose();
              reject(new Error(`Failed to send tool-execution message: ${err.message}`));
            },
          );
      });
    },
  };

  // Resolve documentId based on tool tags, then touch it to update recency.
  let documentId: string | undefined;
  if (!isCreateOperation && needsCellDocument) {
    documentId = await resolveNotebookId(params, services);
    if (documentId) {
      services.documentRegistry.touch(documentId);
    }
  } else if (!isCreateOperation && needsBlockDocument) {
    documentId = await resolveLexicalId(params, services);
    if (documentId) {
      services.documentRegistry.touch(documentId);
    }
  }

  // Build extras — create operations get a different extras set.
  let extras: Record<string, unknown>;

  if (isCreateOperation) {
    const documentAnalysis = analyzeOpenDocuments();
    extras = {
      datalayer: services.datalayer,
      auth: services.authProvider,
      hasWorkspace: !!vscode.workspace.workspaceFolders,
      isAuthenticated: services.authProvider.isAuthenticated(),
      notebookAnalysis: {
        nativeCount: documentAnalysis.nativeNotebooks.length,
        localDatalayerCount: documentAnalysis.localDatalayerDocuments.length,
        cloudDatalayerCount: documentAnalysis.cloudDatalayerDocuments.length,
        totalCount: documentAnalysis.total,
        majorityType: documentAnalysis.majorityType,
      },
      activeNotebookUri:
        vscode.window.activeNotebookEditor?.notebook.uri.toString(),
      openNotebookUris: vscode.workspace.notebookDocuments.map((nb) =>
        nb.uri.toString(),
      ),
      // Non-interactive location selection: prefer cloud when authenticated.
      promptForLocation: async (
        _spaceName?: string,
      ): Promise<"local" | "cloud" | undefined> => {
        const hasWorkspace = !!vscode.workspace.workspaceFolders;
        const isAuthenticated = services.authProvider.isAuthenticated();
        if (isAuthenticated) {
          return "cloud";
        }
        if (hasWorkspace) {
          return "local";
        }
        throw new Error(
          "Cannot create document: not authenticated to Datalayer and no workspace folder is open.",
        );
      },
      createLocalFile: async (filename: string, content: unknown) => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
          throw new Error("No workspace folder open");
        }
        const uri = vscode.Uri.joinPath(workspaceFolder.uri, filename);
        await vscode.workspace.fs.writeFile(
          uri,
          Buffer.from(JSON.stringify(content, null, 2), "utf-8"),
        );
        return uri.toString();
      },
      openCloudDocument: async (
        document: Document,
        spaceName: string,
        documentType: "notebook" | "lexical",
      ) => {
        const uri = await services.documentBridge.openDocument(
          document,
          undefined,
          spaceName,
        );
        const editorId =
          documentType === "notebook"
            ? "datalayer.jupyter-notebook"
            : "datalayer.lexical-editor";
        await vscode.commands.executeCommand("vscode.openWith", uri, editorId);
        await vscode.commands.executeCommand("datalayer.refreshSpaces");
      },
      documentsContext,
    };
  } else {
    extras = {
      datalayer: services.datalayer,
      auth: services.authProvider,
      kernelBridge: services.kernelBridge,
      connectRuntimeCallback: async (
        runtimeName?: string,
        notebookUri?: string,
      ) => {
        await vscode.commands.executeCommand(
          "datalayer.connectRuntime",
          runtimeName,
          notebookUri,
        );
        return { podName: runtimeName ?? "default-runtime" };
      },
      defaultRuntimeDuration:
        getValidatedSettingsGroup("runtime").defaultMinutes,
      defaultRuntimeType: getValidatedSettingsGroup("runtime").defaultType,
      documentsContext,
    };
  }

  return {
    format: responseFormat,
    executor,
    documentId,
    extras,
  };
}

/**
 * Builds a compact open-documents context string appended to every MCP tool
 * response. This lets the LLM (Cascade) see all registered notebooks and
 * lexical documents — with their URIs and recency rank — so it can
 * intelligently select the correct target document based on the user's request
 * rather than relying solely on extension-side heuristics.
 *
 * @param services - Service container providing the document registry.
 *
 * @returns A markdown-formatted context block, or an empty string if no
 *   documents are registered.
 */
function buildOpenDocumentsContext(services: ServiceContainer): string {
  const notebooks = services.documentRegistry.getByType("notebook");
  const lexicals = services.documentRegistry.getByType("lexical");
  const allDocs = [...notebooks, ...lexicals];

  if (allDocs.length === 0) {
    return "";
  }

  // Sort all docs by lastUsed descending (most recent first).
  allDocs.sort((a, b) => b.lastUsed - a.lastUsed);

  const lines: string[] = [
    "",
    "---",
    "## Open Datalayer Documents",
    "Pass `notebook_uri` (for notebooks) or `documentUri` (for lexical docs) from this list to target a specific document.",
    "",
  ];

  allDocs.forEach((entry, idx) => {
    const filename = entry.documentUri.split("/").pop() ?? entry.documentUri;
    const recency = idx === 0 ? " ← most recent" : "";
    lines.push(
      `${idx + 1}. **${filename}** (${entry.type})${recency}`,
      `   URI: \`${entry.documentUri}\``,
    );
  });

  return lines.join("\n");
}

/**
 * Updates the Windsurf global MCP config (`~/.codeium/windsurf/mcp_config.json`)
 * with the port claimed by this extension instance, then writes a workspace-level
 * `.windsurf/mcp.json` for transparency/future compatibility.
 *
 * **Why global config:** Windsurf only reads `~/.codeium/windsurf/mcp_config.json`
 * — there is no workspace-level override. Windsurf also hot-reloads that file
 * when it changes, so no manual refresh is needed after this write.
 *
 * **Multi-window behaviour:** each VS Code window claims a different port
 * (3333-3340). The most-recently-started/reloaded window wins: its port overwrites
 * the `datalayer` entry in the global config and Windsurf reconnects immediately.
 * All other entries in `mcp_config.json` are preserved unchanged.
 *
 * @param port - The port this MCP server instance is listening on.
 * @param services - Service container used for logging.
 */
async function writeMcpConfig(
  port: number,
  services: ServiceContainer,
): Promise<void> {
  const os = await import("os");
  const fs = await import("fs/promises");
  const path = await import("path");

  const globalConfigPath = path.join(
    os.homedir(),
    ".codeium",
    "windsurf",
    "mcp_config.json",
  );

  // ── 1. Update ~/.codeium/windsurf/mcp_config.json ──────────────────────────
  // Read existing config first so we don't clobber other MCP servers.
  let existingConfig: { mcpServers?: Record<string, unknown> } = {};
  try {
    const raw = await fs.readFile(globalConfigPath, "utf-8");
    existingConfig = JSON.parse(raw) as typeof existingConfig;
  } catch {
    // File doesn't exist yet or is malformed — start with empty object.
  }

  existingConfig.mcpServers ??= {};
  existingConfig.mcpServers["datalayer"] = {
    serverUrl: `http://localhost:${port}/mcp`,
  };

  try {
    await fs.writeFile(
      globalConfigPath,
      JSON.stringify(existingConfig, null, 2),
      "utf-8",
    );
    services.logger.info(
      `[MCP] Global Windsurf config updated → ${globalConfigPath} (port ${port})`,
    );
  } catch (err) {
    services.logger.warn(
      `[MCP] Could not update global Windsurf config: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  // ── 2. Write workspace .windsurf/mcp.json (transparency / future compat) ──
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders?.length) {
    return;
  }
  const windSurfDir = vscode.Uri.joinPath(
    workspaceFolders[0]!.uri,
    ".windsurf",
  );
  const workspaceConfigPath = vscode.Uri.joinPath(windSurfDir, "mcp.json");
  const workspaceConfig = {
    mcpServers: { datalayer: { serverUrl: `http://localhost:${port}/mcp` } },
  };
  try {
    try { await vscode.workspace.fs.createDirectory(windSurfDir); } catch { /**/ }
    await vscode.workspace.fs.writeFile(
      workspaceConfigPath,
      Buffer.from(JSON.stringify(workspaceConfig, null, 2)),
    );
  } catch {
    // Workspace write is best-effort; global config is what matters.
  }
}

/**
 * Constructs and returns a configured McpServer with all Datalayer tools registered.
 *
 * A new McpServer instance is created for each HTTP request to ensure stateless
 * operation and avoid transport reuse issues.
 *
 * @param definitions - Array of tool definitions providing names, schemas, and tags.
 * @param operations - Map of operation names to their implementations.
 * @param services - Extension service container for VS Code API access.
 * @param version - Extension version string embedded in the server metadata.
 *
 * @returns Configured McpServer ready to be connected to a transport.
 */
function buildMcpServer(
  definitions: readonly ToolDefinition[],
  operations: Record<string, { execute: (params: unknown, ctx: ToolExecutionContext) => Promise<unknown> }>,
  services: ServiceContainer,
  version: string,
): McpServer {
  const server = new McpServer({ name: "datalayer", version });

  for (const definition of definitions) {
    // datalayer_batch is registered separately below with full closure access
    // to definitions, operations, and services — skip it in the standard loop.
    if (definition.name === "datalayer_batch") {
      continue;
    }

    const operation = operations[definition.operation];
    if (!operation) {
      continue;
    }

    const jsonSchema = definition.parameters as JsonSchemaObject | undefined;
    const zodShape = jsonSchema?.properties
      ? jsonSchemaToZodShape(jsonSchema)
      : {};

    server.registerTool(
      definition.name,
      {
        title: definition.displayName,
        description: definition.description,
        inputSchema: zodShape,
      },
      async (args) => {
        try {
          const params = args as Record<string, unknown>;
          const context = await buildMcpExecutionContext(
            definition,
            params,
            services,
          );
          const result = await operation.execute(params, context);
          const formatted = formatResponse(result, context.format ?? "toon");
          const resultText =
            typeof formatted === "string"
              ? formatted
              : JSON.stringify(formatted, null, 2);
          // Append the open-documents list only to getActiveDocument responses.
          // This is the mandatory orientation call, so Cascade gets the full
          // document context exactly once per session without polluting every
          // other tool's output.
          const openDocsContext =
            definition.name === "datalayer_getActiveDocument"
              ? buildOpenDocumentsContext(services)
              : "";
          const text = openDocsContext
            ? `${resultText}${openDocsContext}`
            : resultText;
          return { content: [{ type: "text" as const, text }] };
        } catch (error) {
          const msg =
            error instanceof Error ? error.message : String(error);
          return {
            isError: true,
            content: [{ type: "text" as const, text: `Error: ${msg}` }],
          };
        }
      },
    );
  }

  // ── Batch tool (Code Mode) ────────────────────────────────────────────────
  // Registered here rather than through the standard definition→operation loop
  // so it has closure access to `definitions`, `operations`, and `services`
  // needed for per-sub-op document resolution via buildMcpExecutionContext.
  server.registerTool(
    "datalayer_batch",
    {
      title: "Batch Execute Operations",
      description:
        "Execute a sequence of Datalayer operations in one call without LLM round-trips between steps. " +
        "Use this when you have already planned several mechanical steps (e.g. readAllCells → insertCell → runCell → readCell). " +
        "Each operation runs in order; results are returned as an array. " +
        "Pass `notebook_uri` or `documentUri` at the top level to target a specific document — these are forwarded to every sub-operation that supports them. " +
        "Set `stopOnError` to false to continue executing remaining steps after a failure.",
      inputSchema: {
        operations: z
          .array(
            z.object({
              tool: z
                .string()
                .describe(
                  "Full tool name, e.g. 'datalayer_insertCell', 'datalayer_runCell'.",
                ),
              params: z
                .record(z.string(), z.unknown())
                .optional()
                .describe("Parameters for this tool, identical to calling it directly."),
            }),
          )
          .describe(
            "Ordered list of operations to execute. Results from earlier steps are not automatically forwarded to later steps — if you need a value (e.g. cell count), retrieve it first with a single tool call, then batch the remaining steps.",
          ),
        notebook_uri: z
          .string()
          .optional()
          .describe(
            "Optional URI of the target notebook. Forwarded to every cell sub-operation. Obtain from datalayer_listOpenDocuments or datalayer_getActiveDocument.",
          ),
        documentUri: z
          .string()
          .optional()
          .describe(
            "Optional URI of the target Lexical document. Forwarded to every block sub-operation. Obtain from datalayer_listOpenDocuments or datalayer_getActiveDocument.",
          ),
        stopOnError: z
          .boolean()
          .optional()
          .describe(
            "If true (default), stop executing remaining steps when one fails. If false, continue and report all errors in results.",
          ),
      },
    },
    async (args) => {
      const {
        operations: subOps,
        notebook_uri: batchNotebookUri,
        documentUri: batchDocumentUri,
        stopOnError = true,
      } = args as {
        operations: Array<{ tool: string; params?: Record<string, unknown> }>;
        notebook_uri?: string;
        documentUri?: string;
        stopOnError?: boolean;
      };

      // Build a name→definition lookup for fast access.
      const defByName = new Map(definitions.map((d) => [d.name, d]));

      // Validate all tool names upfront — fail fast before executing anything.
      const unknownTools = subOps
        .map((op) => op.tool)
        .filter((name) => !defByName.has(name));
      if (unknownTools.length > 0) {
        const validNames = [...defByName.keys()].sort().join(", ");
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text:
                `Error: Unknown tool(s) in batch: ${unknownTools.join(", ")}.\n` +
                `Valid tool names: ${validNames}`,
            },
          ],
        };
      }

      const results: Array<{
        tool: string;
        index: number;
        success: boolean;
        result?: unknown;
        error?: string;
      }> = [];

      for (let i = 0; i < subOps.length; i++) {
        const subOp = subOps[i]!;
        const definition = defByName.get(subOp.tool)!;
        const operation = operations[definition.operation];

        if (!operation) {
          const errMsg = `No operation registered for tool '${subOp.tool}' (operation: '${definition.operation}')`;
          results.push({ tool: subOp.tool, index: i, success: false, error: errMsg });
          if (stopOnError) {
            break;
          }
          continue;
        }

        // Merge batch-level document URIs into sub-op params.
        // This enables the fast direct-URI path in resolveNotebookId /
        // resolveLexicalId (one lookup rather than a full tab/registry scan).
        const mergedParams: Record<string, unknown> = { ...(subOp.params ?? {}) };
        if (batchNotebookUri && !mergedParams["notebook_uri"]) {
          mergedParams["notebook_uri"] = batchNotebookUri;
        }
        if (batchDocumentUri && !mergedParams["documentUri"]) {
          mergedParams["documentUri"] = batchDocumentUri;
        }

        try {
          const context = await buildMcpExecutionContext(
            definition,
            mergedParams,
            services,
          );
          const result = await operation.execute(mergedParams, context);
          const formatted = formatResponse(result, context.format ?? "toon");
          results.push({ tool: subOp.tool, index: i, success: true, result: formatted });
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          results.push({ tool: subOp.tool, index: i, success: false, error: msg });
          if (stopOnError) {
            break;
          }
        }
      }

      const succeeded = results.filter((r) => r.success).length;
      const total = subOps.length;
      const executed = results.length;
      const summaryLine =
        executed < total
          ? `${succeeded}/${total} succeeded (stopped after step ${executed} due to error)`
          : `${succeeded}/${total} succeeded`;

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ summary: summaryLine, results }, null, 2),
          },
        ],
      };
    },
  );

  return server;
}

/**
 * Starts the Datalayer MCP HTTP server for Windsurf/Cascade.
 *
 * Loads the combined tool registry, scans for an available port starting at
 * MCP_DEFAULT_PORT, and starts a stateless Streamable HTTP MCP server.
 * Each POST to /mcp spins up a fresh McpServer+transport pair so no session
 * state leaks between Cascade requests.
 *
 * @param context - VS Code extension context (used for globalState cross-window registry).
 * @param services - Initialized service container providing auth and VS Code APIs.
 * @param _ui - Extension UI components (reserved for future use).
 *
 * @returns Promise resolving to the Node.js HTTP server for lifecycle management.
 *
 * @throws Error when no port in the default range is available.
 */
export async function startMcpServer(
  context: import("vscode").ExtensionContext,
  services: ServiceContainer,
  _ui: ExtensionUI,
): Promise<http.Server> {
  // Load tool registry — lazy to avoid browser-only imports at module load time.
  const [definitions, operations] = await Promise.all([
    getAllToolDefinitionsAsync(),
    getCombinedOperations(),
  ]);

  const version: string =
    (vscode.extensions.getExtension("datalayer.datalayer-jupyter-vscode")
      ?.packageJSON as { version?: string } | undefined)?.version ?? "0.0.0";

  const port = await findAvailablePort(MCP_DEFAULT_PORT);

  const httpServer = http.createServer(async (req, res) => {
    // Only serve the /mcp endpoint.
    if (req.url !== "/mcp") {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    // Add CORS headers for local HTTP clients.
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, DELETE, OPTIONS",
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, MCP-Session-Id",
    );

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // Stateless: new server + transport per request.
    const mcpServer = buildMcpServer(definitions, operations, services, version);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    res.on("close", () => {
      transport.close().catch(() => {/* ignore cleanup errors */});
      mcpServer.close().catch(() => {/* ignore cleanup errors */});
    });

    try {
      await mcpServer.connect(transport);
      const rawBody = await readBody(req);
      const parsedBody = rawBody ? (JSON.parse(rawBody) as unknown) : undefined;
      await transport.handleRequest(req, res, parsedBody);
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: err instanceof Error ? err.message : "Internal error",
          }),
        );
      }
    }
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(port, "127.0.0.1", () => {
      httpServer.removeListener("error", reject);
      resolve();
    });
  });

  services.logger.info(
    `Datalayer MCP HTTP server listening on http://127.0.0.1:${port}/mcp (${definitions.length} tools)`,
  );

  // Update ~/.codeium/windsurf/mcp_config.json (and workspace .windsurf/mcp.json)
  // with this window's port. Windsurf hot-reloads the global config on change,
  // so no manual refresh is needed after this write.
  await writeMcpConfig(port, services);

  // Start cross-window registry so other windows (and their Cascade sessions)
  // can see which notebooks are open here and receive helpful error messages
  // when they reference a document that lives in a different window.
  crossWindowRegistry = new CrossWindowRegistry(
    context,
    port,
    services.documentRegistry,
  );
  crossWindowRegistry.start();
  httpServer.on("close", () => {
    crossWindowRegistry?.dispose();
    crossWindowRegistry = undefined;
  });

  return httpServer;
}
