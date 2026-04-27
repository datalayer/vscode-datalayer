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
      return services.documentRegistry.getIdFromUri(uriStr);
    } catch {
      return uriStr;
    }
  }

  // Fall back to registry — covers the case where Cascade panel has focus
  const notebookEntries = services.documentRegistry.getByType("notebook");
  if (notebookEntries.length > 0) {
    return notebookEntries[0]!.documentId;
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

  const needsCellDocument = definition.tags?.includes("cell");
  const needsBlockDocument = definition.tags?.includes("lexical");
  const isCreateOperation = definition.tags?.includes("create");

  // Build the webview executor — same postMessage bridge as Copilot path.
  const executor = {
    execute: async (operationName: string, args: unknown): Promise<unknown> => {
      // Use getBestWebviewPanel() rather than getActiveWebviewPanel() so that
      // operations succeed even when VS Code focus is on the Cascade chat panel
      // instead of the notebook tab.
      const webviewPanel = services.documentRegistry.getBestWebviewPanel();
      if (!webviewPanel) {
        throw new Error(
          `No Datalayer notebook or lexical document is open. ` +
            `Please open a Datalayer notebook or .dlex file, then retry.`,
        );
      }

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

  // Resolve documentId based on tool tags.
  let documentId: string | undefined;
  if (!isCreateOperation && needsCellDocument) {
    documentId = await resolveNotebookId(params, services);
  } else if (!isCreateOperation && needsBlockDocument) {
    documentId = await resolveLexicalId(params, services);
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
          const text =
            typeof formatted === "string"
              ? formatted
              : JSON.stringify(formatted, null, 2);
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
 * @param _context - VS Code extension context (reserved for future use).
 * @param services - Initialized service container providing auth and VS Code APIs.
 * @param _ui - Extension UI components (reserved for future use).
 *
 * @returns Promise resolving to the Node.js HTTP server for lifecycle management.
 *
 * @throws Error when no port in the default range is available.
 */
export async function startMcpServer(
  _context: import("vscode").ExtensionContext,
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

  return httpServer;
}
