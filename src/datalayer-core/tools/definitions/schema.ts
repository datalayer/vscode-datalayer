/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Unified tool definition schema compatible across VS Code, SaaS, and ag-ui platforms.
 * Uses JSON Schema for parameter definitions.
 *
 * @module tools/definitions/schema
 */

/**
 * JSON Schema property with optional platform-specific hints
 */
export interface JSONSchemaProperty {
  type: "string" | "number" | "boolean" | "object" | "array";
  description: string;
  enum?: string[] | number[];
  items?: JSONSchemaProperty;
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
  default?: unknown;
  /** Hint that this parameter is platform-specific (e.g., notebook_uri) */
  platformSpecific?: boolean;
}

/**
 * Platform-agnostic tool configuration.
 * Platforms can use these defaults or override specific values as needed.
 */
export interface ToolConfig<TParams = unknown> {
  /**
   * Confirmation message function.
   * Receives tool parameters and returns formatted message (supports markdown).
   */
  confirmationMessage?: (params: TParams) => string;

  /**
   * Invocation message function.
   * Receives tool parameters and returns formatted message.
   */
  invocationMessage?: (params: TParams) => string;

  /** Require explicit user confirmation (default: true for safety) */
  requiresConfirmation?: boolean;

  /** Whether this tool can be referenced in prompts */
  canBeReferencedInPrompt?: boolean;

  /** Tool priority for suggestion ranking */
  priority?: "low" | "medium" | "high";

  /** Extensible config - platforms can add custom properties */
  [key: string]: unknown;
}

/**
 * Unified tool definition compatible across all platforms (VS Code, SaaS, ag-ui).
 * Single source of truth for tool metadata, parameters (JSON Schema), and platform-specific configuration.
 *
 * @example
 * ```typescript
 * const insertCellTool: ToolDefinition = {
 *   name: 'datalayer_insertCell',
 *   displayName: 'Insert Notebook Cell',
 *   description: 'Inserts a code or markdown cell',
 *   toolReferenceName: 'insertCell',
 *   parameters: {
 *     type: 'object',
 *     properties: {
 *       cell_type: { type: 'string', enum: ['code', 'markdown'] },
 *       cell_source: { type: 'string', description: 'Cell content' }
 *     },
 *     required: ['cell_type', 'cell_source']
 *   },
 *   operation: 'insertCell'
 * };
 * ```
 */
export interface ToolDefinition {
  /** Unique tool identifier (e.g., "datalayer_insertCell") */
  name: string;

  /** Human-readable display name (e.g., "Insert Notebook Cell") */
  displayName: string;

  /** Description for AI models to understand when to use this tool */
  description: string;

  /** Short reference name for Copilot (e.g., "insertCell") */
  toolReferenceName?: string;

  /** JSON Schema definition for tool parameters */
  parameters: {
    type: "object";
    properties: Record<string, JSONSchemaProperty>;
    required?: string[];
  };

  /** Core operation name (references tools/core/operations) */
  operation: string;

  /** Platform-agnostic configuration with sensible defaults */
  config?: ToolConfig;

  /** Platform-specific configuration (vscode, saas, agui) */
  platformConfig?: Record<string, unknown>;

  /** Tags for categorization and filtering */
  tags?: string[];

  /** Whether this tool is experimental/beta */
  experimental?: boolean;

  /** Minimum required version (for deprecation/migration) */
  minVersion?: string;
}

/**
 * Tool registry for managing tool definitions
 */
export interface ToolRegistry {
  /** Register a tool definition */
  register(tool: ToolDefinition): void;

  /** Get a tool definition by name */
  get(name: string): ToolDefinition | undefined;

  /** Get all registered tools */
  getAll(): ToolDefinition[];

  /** Get tools by tag */
  getByTag(tag: string): ToolDefinition[];

  /** Get tools by operation */
  getByOperation(operation: string): ToolDefinition[];
}
