/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Core interfaces for platform-agnostic tool operations.
 * These interfaces enable the 3-tier architecture by abstracting
 * document access and tool execution from specific platforms.
 *
 * @module tools/core/interfaces
 */

import type {
  CellData,
  NotebookMetadata,
  ExecutionResult,
  RuntimeInfo,
} from "./types";

// Re-export types for platform adapters
export type { CellData, NotebookMetadata, ExecutionResult, RuntimeInfo };

/**
 * Document handle abstraction - implemented differently per platform.
 *
 * This interface provides a unified API for notebook operations that works
 * identically across VS Code (webview messages), SaaS (direct DOM), and
 * ag-ui (CopilotKit integration).
 *
 * Platform implementations:
 * - VS Code: VSCodeDocumentHandle (uses vscode.commands.executeCommand)
 * - SaaS: SaaSDocumentHandle (uses JupyterLab widget APIs)
 * - ag-ui: Reuses SaaSDocumentHandle
 */
export interface DocumentHandle {
  /**
   * Get total number of cells in the notebook
   */
  getCellCount(): Promise<number>;

  /**
   * Get a specific cell by index
   * @param index - 0-based cell index
   * @returns Cell data
   * @throws Error if index is out of bounds
   */
  getCell(index: number): Promise<CellData>;

  /**
   * Get all cells from the notebook
   * @returns Array of cell data
   */
  getAllCells(): Promise<CellData[]>;

  /**
   * Get notebook metadata (path, cell counts, kernel info)
   * @returns Notebook metadata
   */
  getMetadata(): Promise<NotebookMetadata>;

  /**
   * Insert a cell at the specified index
   * @param index - 0-based index where cell should be inserted
   * @param cell - Cell data to insert
   * @throws Error if index is out of bounds
   */
  insertCell(index: number, cell: CellData): Promise<void>;

  /**
   * Delete a cell at the specified index
   * @param index - 0-based cell index
   * @throws Error if index is out of bounds
   */
  deleteCell(index: number): Promise<void>;

  /**
   * Update a cell's source code at the specified index
   * @param index - 0-based cell index
   * @param source - New source code
   * @throws Error if index is out of bounds
   */
  updateCell(index: number, source: string): Promise<void>;

  /**
   * Execute a cell at the specified index
   * @param index - 0-based cell index
   * @returns Execution result with outputs
   * @throws Error if index is out of bounds or cell is not a code cell
   */
  executeCell(index: number): Promise<ExecutionResult>;

  /**
   * Save the notebook (optional - not all platforms support explicit save)
   */
  save?(): Promise<void>;

  /**
   * Close the notebook (optional)
   */
  close?(): Promise<void>;
}

/**
 * Tool execution context - injected by platform adapters.
 *
 * This context provides access to:
 * - Document being operated on (via DocumentHandle abstraction)
 * - SDK for API calls (creating notebooks, runtimes, etc.)
 * - Authentication state
 * - Platform-specific extras (escape hatch)
 */
export interface ToolExecutionContext {
  /**
   * Document handle for notebook operations
   * (Only present for cell manipulation tools)
   */
  document?: DocumentHandle;

  /**
   * Datalayer SDK for API operations
   * (Required for notebook/runtime creation tools)
   */
  sdk?: unknown; // DatalayerClient (avoid circular import)

  /**
   * Authentication provider
   * (Required for authenticated operations)
   */
  auth?: unknown; // AuthProvider (avoid circular import)

  /**
   * Platform-specific extras (escape hatch for special cases)
   *
   * Examples:
   * - VS Code: { extensionContext, outputChannel }
   * - SaaS: { router, toast }
   * - ag-ui: { copilotApi, confirmation }
   */
  extras?: Record<string, unknown>;
}

/**
 * Core tool operation interface - platform agnostic.
 *
 * All tool operations implement this interface, enabling them to work
 * identically across VS Code, SaaS, and ag-ui platforms.
 *
 * @template TParams - Tool parameter type (input)
 * @template TResult - Tool result type (output)
 */
export interface ToolOperation<TParams, TResult> {
  /**
   * Unique operation name (used for registry lookup)
   */
  name: string;

  /**
   * Human-readable description of what the operation does
   */
  description: string;

  /**
   * Execute the operation with given parameters and context
   *
   * @param params - Tool-specific parameters
   * @param context - Execution context (document, SDK, auth)
   * @returns Operation result
   * @throws Error if operation fails
   */
  execute(params: TParams, context: ToolExecutionContext): Promise<TResult>;
}

/**
 * Tool operation registry interface
 *
 * Provides centralized access to all available operations.
 */
export interface ToolOperationRegistry {
  /**
   * Register a tool operation
   */
  register<TParams, TResult>(operation: ToolOperation<TParams, TResult>): void;

  /**
   * Get a tool operation by name
   */
  get<TParams, TResult>(
    name: string,
  ): ToolOperation<TParams, TResult> | undefined;

  /**
   * Check if an operation is registered
   */
  has(name: string): boolean;

  /**
   * Get all registered operation names
   */
  getAllNames(): string[];

  /**
   * Get all registered operations
   */
  getAll(): Array<ToolOperation<unknown, unknown>>;
}
