/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Shared types for platform-agnostic tool operations.
 * These types represent the core data structures used across all platforms.
 *
 * @module tools/core/types
 */

/**
 * Cell type enumeration
 */
export type CellType = "code" | "markdown" | "raw";

/**
 * Cell output data structure
 */
export interface CellOutput {
  output_type: "stream" | "display_data" | "execute_result" | "error";
  // Stream output
  name?: "stdout" | "stderr";
  text?: string | string[];
  // Display data / execute result
  data?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  execution_count?: number;
  // Error output
  ename?: string;
  evalue?: string;
  traceback?: string[];
}

/**
 * Cell data structure (platform-agnostic representation)
 */
export interface CellData {
  /** Cell type */
  type: CellType;

  /** Cell source code or markdown content */
  source: string | string[];

  /** Cell outputs (for code cells) */
  outputs?: CellOutput[];

  /** Cell metadata */
  metadata?: Record<string, unknown>;

  /** Execution count (for code cells) */
  execution_count?: number | null;
}

/**
 * Notebook metadata
 */
export interface NotebookMetadata {
  /** Notebook path or URI */
  path?: string;

  /** Total number of cells */
  cellCount: number;

  /** Breakdown by cell type */
  cellTypes: {
    code: number;
    markdown: number;
    raw: number;
  };

  /** Kernel information */
  kernelspec?: {
    name: string;
    display_name: string;
    language?: string;
  };

  /** Language info */
  language_info?: {
    name: string;
    version?: string;
    mimetype?: string;
    file_extension?: string;
  };

  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Cell execution result
 */
export interface ExecutionResult {
  /** Whether execution succeeded */
  success: boolean;

  /** Execution order number */
  executionOrder?: number;

  /** Output data */
  outputs: CellOutput[];

  /** Error message if execution failed */
  error?: string;

  /** Execution duration in milliseconds */
  duration?: number;
}

/**
 * Runtime information (for runtime management operations)
 */
export interface RuntimeInfo {
  /** Runtime unique identifier */
  id: string;

  /** Runtime name (pod name) */
  name: string;

  /** Environment name */
  environment?: string;

  /** Runtime status */
  status: "creating" | "running" | "terminating" | "terminated" | "error";

  /** Creation timestamp */
  createdAt?: Date;

  /** Duration in minutes */
  durationMinutes?: number;

  /** Additional runtime metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Notebook creation parameters
 */
export interface NotebookCreationParams {
  /** Notebook name */
  name: string;

  /** Optional description */
  description?: string;

  /** Space identifier (for remote notebooks) */
  spaceId?: string;

  /** Space name (for remote notebooks) */
  spaceName?: string;

  /** Initial cells (optional) */
  initialCells?: CellData[];
}

/**
 * Notebook creation result
 */
export interface NotebookCreationResult {
  /** Success status */
  success: boolean;

  /** Notebook unique identifier */
  notebookId?: string;

  /** Notebook URI or path */
  uri: string;

  /** Error message if creation failed */
  error?: string;
}

/**
 * Lexical document creation parameters
 */
export interface LexicalCreationParams {
  /** Document name */
  name: string;

  /** Optional description */
  description?: string;

  /** Space identifier (for remote documents) */
  spaceId?: string;

  /** Space name (for remote documents) */
  spaceName?: string;
}

/**
 * Lexical document creation result
 */
export interface LexicalCreationResult {
  /** Success status */
  success: boolean;

  /** Document unique identifier */
  documentId?: string;

  /** Document URI or path */
  uri: string;

  /** Error message if creation failed */
  error?: string;
}

/**
 * Runtime creation parameters
 */
export interface RuntimeCreationParams {
  /** Optional environment name */
  environment?: string;

  /** Optional duration in minutes */
  durationMinutes?: number;
}

/**
 * Runtime creation result
 */
export interface RuntimeCreationResult {
  /** Success status */
  success: boolean;

  /** Runtime information */
  runtime?: RuntimeInfo;

  /** Error message if creation failed */
  error?: string;
}

/**
 * Runtime connection parameters
 */
export interface RuntimeConnectionParams {
  /** Optional runtime name to connect */
  runtimeName?: string;

  /** Optional notebook URI */
  notebookUri?: string;
}

/**
 * Runtime connection result
 */
export interface RuntimeConnectionResult {
  /** Success status */
  success: boolean;

  /** Connected runtime information */
  runtime?: RuntimeInfo;

  /** Error message if connection failed */
  error?: string;
}
