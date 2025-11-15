/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Embedded MCP Tools for Datalayer VS Code Extension
 *
 * These tools implement the VS Code LanguageModelTool interface,
 * allowing GitHub Copilot to interact with Datalayer notebooks
 * and documents via natural language.
 *
 * ⚠️ IMPORTANT: All cell manipulation tools (insert, execute, read, delete, etc.)
 * ONLY work with Datalayer custom editor notebooks, NOT native VS Code notebooks.
 *
 * @module tools
 */

// Notebook creation tools
export { CreateDatalayerRemoteNotebookTool } from "./createDatalayerRemoteNotebook";
export { CreateDatalayerLocalNotebookTool } from "./createDatalayerLocalNotebook";

// Lexical creation tools
export { CreateRemoteLexicalTool } from "./createRemoteLexical";
export { CreateLocalLexicalTool } from "./createLocalLexical";

// Runtime management tools
export { StartRuntimeTool } from "./startRuntime";
export { ConnectRuntimeTool } from "./connectRuntime";

// Datalayer cell manipulation tools (only work with Datalayer notebooks)
export { InsertDatalayerCellTool } from "./insertDatalayerCell";
export { ExecuteDatalayerCellTool } from "./executeDatalayerCell";

// Datalayer cell read tools (jupyter-mcp-server parity)
export { ReadAllDatalayerCellsTool } from "./readAllDatalayerCells";
export { ReadDatalayerCellTool } from "./readDatalayerCell";
export { GetDatalayerNotebookInfoTool } from "./getDatalayerNotebookInfo";

// Datalayer cell modification tools (jupyter-mcp-server parity)
export { DeleteDatalayerCellTool } from "./deleteDatalayerCell";
export { OverwriteDatalayerCellTool } from "./overwriteDatalayerCell";

// Datalayer cell append tools (jupyter-mcp-server parity)
export { AppendDatalayerMarkdownCellTool } from "./appendDatalayerMarkdownCell";
export { AppendExecuteDatalayerCodeCellTool } from "./appendExecuteDatalayerCodeCell";

// Datalayer cell insert tools (jupyter-mcp-server parity)
export { InsertDatalayerMarkdownCellTool } from "./insertDatalayerMarkdownCell";
