/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Tool Definition Schema - Unified Format
 *
 * This module defines the unified tool definition format that is compatible
 * with VS Code, SaaS, and ag-ui platforms. It uses JSON Schema for parameter
 * definitions, matching ag-ui's requirements while supporting VS Code's needs.
 *
 * @module tools/definitions/schema
 */

/**
 * JSON Schema property definition
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
 * VS Code specific tool configuration
 */
export interface VSCodeToolConfig {
  /** Confirmation message template (supports {{variable}} interpolation) */
  confirmationMessage?: string;

  /** Invocation message template (supports {{variable}} interpolation) */
  invocationMessage?: string;

  /** Whether this tool can be referenced in prompts */
  canBeReferencedInPrompt?: boolean;
}

/**
 * SaaS specific tool configuration
 */
export interface SaaSToolConfig {
  /** Enable real-time preview before execution */
  enablePreview?: boolean;

  /** Require explicit user confirmation */
  requiresConfirmation?: boolean;

  /** Custom confirmation message for SaaS UI */
  confirmationMessage?: string;
}

/**
 * ag-ui specific tool configuration
 */
export interface AgUIToolConfig {
  /** Human-in-the-loop confirmation required */
  requiresConfirmation?: boolean;

  /** Tool priority for suggestion ranking */
  priority?: "low" | "medium" | "high";

  /** Custom rendering hints for ag-ui */
  renderingHints?: Record<string, unknown>;
}

/**
 * Unified Tool Definition
 *
 * This is the single source of truth for all tool metadata across all platforms.
 * The format is compatible with ag-ui's JSON Schema requirements while supporting
 * VS Code's languageModelTools format and SaaS-specific needs.
 *
 * @example
 * ```typescript
 * const insertCellTool: ToolDefinition = {
 *   name: 'datalayer_insertCell',
 *   displayName: 'Insert Notebook Cell',
 *   description: 'Inserts a code or markdown cell into a notebook',
 *   toolReferenceName: 'insertCell',
 *   parameters: {
 *     type: 'object',
 *     properties: {
 *       cell_type: {
 *         type: 'string',
 *         enum: ['code', 'markdown'],
 *         description: 'Type of cell to insert'
 *       },
 *       cell_source: {
 *         type: 'string',
 *         description: 'Content of the cell'
 *       }
 *     },
 *     required: ['cell_type', 'cell_source']
 *   },
 *   operation: 'insertCell',
 * };
 * ```
 */
export interface ToolDefinition {
  /**
   * Unique tool identifier (e.g., "datalayer_insertCell")
   * Used for tool registration across all platforms
   */
  name: string;

  /**
   * Human-readable display name (e.g., "Insert Notebook Cell")
   * Shown in VS Code UI and confirmation dialogs
   */
  displayName: string;

  /**
   * Detailed description of what the tool does
   * Used by AI models to understand when to use the tool
   */
  description: string;

  /**
   * Short reference name for Copilot (e.g., "insertCell")
   * Used in VS Code's toolReferenceName field
   */
  toolReferenceName?: string;

  /**
   * JSON Schema definition for tool parameters
   * Compatible with ag-ui and VS Code's inputSchema
   */
  parameters: {
    type: "object";
    properties: Record<string, JSONSchemaProperty>;
    required?: string[];
  };

  /**
   * Core operation name that this tool invokes
   * References an operation from tools/core/operations
   */
  operation: string;

  /**
   * Platform-specific configuration overrides
   * Allows customization per platform without duplicating core logic
   */
  platformConfig?: {
    vscode?: VSCodeToolConfig;
    saas?: SaaSToolConfig;
    agui?: AgUIToolConfig;
  };

  /**
   * Tags for categorization and filtering
   */
  tags?: string[];

  /**
   * Whether this tool is experimental/beta
   */
  experimental?: boolean;

  /**
   * Minimum required version (for deprecation/migration)
   */
  minVersion?: string;
}

/**
 * Tool registry interface
 */
export interface ToolRegistry {
  /**
   * Register a tool definition
   */
  register(tool: ToolDefinition): void;

  /**
   * Get a tool definition by name
   */
  get(name: string): ToolDefinition | undefined;

  /**
   * Get all registered tools
   */
  getAll(): ToolDefinition[];

  /**
   * Get tools by tag
   */
  getByTag(tag: string): ToolDefinition[];

  /**
   * Get tools by operation
   */
  getByOperation(operation: string): ToolDefinition[];
}
