/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Tool Definition Registry
 *
 * Central registry for all tool definitions, providing lookup
 * and filtering capabilities.
 *
 * @module tools/utils/registry
 */

import type { ToolDefinition } from "@datalayer/jupyter-react";
import { allToolDefinitions } from "../definitions";

/**
 * Central registry interface for storing, retrieving, and filtering tool definitions.
 */
export interface ToolRegistry {
  /** Registers a tool definition in the registry. */
  register(tool: ToolDefinition): void;
  /** Retrieves a tool by its unique name. */
  get(name: string): ToolDefinition | undefined;
  /** Returns all registered tools. */
  getAll(): ToolDefinition[];
  /** Checks whether a tool name exists in the registry. */
  has(name: string): boolean;
  /** Finds all tools using a given operation name. */
  getByOperation(operation: string): ToolDefinition[];
  /** Finds all tools tagged with a given tag. */
  getByTag(tag: string): ToolDefinition[];
}

/**
 * Concrete implementation of the ToolRegistry using an internal Map for O(1) lookups.
 */
export class ToolDefinitionRegistry implements ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  constructor(initialTools: readonly ToolDefinition[] = []) {
    initialTools.forEach((tool) => this.register(tool));
  }

  /**
   * Registers a tool definition, overwriting any existing entry with the same name.
   * @param tool - Tool definition to register.
   */
  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      console.warn(
        `Tool ${tool.name} is already registered. Overwriting existing definition.`,
      );
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * Retrieves a tool definition by its registered name.
   * @param name - Unique tool name to look up.
   *
   * @returns The tool definition, or undefined if not found.
   */
  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * Returns all registered tool definitions.
   * @returns Array of all tool definitions.
   */
  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Filters tool definitions by tag.
   * @param tag - Tag string to filter by.
   *
   * @returns Array of tool definitions containing the specified tag.
   */
  getByTag(tag: string): ToolDefinition[] {
    return this.getAll().filter((tool) => tool.tags?.includes(tag));
  }

  /**
   * Filters tool definitions by operation name.
   * @param operation - Operation name to filter by.
   *
   * @returns Array of tool definitions matching the operation.
   */
  getByOperation(operation: string): ToolDefinition[] {
    return this.getAll().filter((tool) => tool.operation === operation);
  }

  /**
   * Checks whether a tool with the given name is registered.
   * @param name - Tool name to check.
   *
   * @returns True if the tool is registered.
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Returns all registered tool names.
   * @returns Array of tool name strings.
   */
  getAllNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Removes all registered tool definitions.
   */
  clear(): void {
    this.tools.clear();
  }
}

/**
 * Global tool definition registry pre-populated with all built-in definitions.
 */
export const toolRegistry = new ToolDefinitionRegistry(allToolDefinitions);

/**
 * Gets a tool definition by name from the global registry.
 * @param name - Unique tool name to look up.
 *
 * @returns The tool definition, or undefined if not found.
 */
export function getToolDefinition(name: string): ToolDefinition | undefined {
  return toolRegistry.get(name);
}

/**
 * Gets all tool definitions from the global registry.
 * @returns Array of all registered tool definitions.
 */
export function getAllToolDefinitions(): ToolDefinition[] {
  return toolRegistry.getAll();
}

/**
 * Gets all tools matching a specific tag from the global registry.
 * @param tag - Tag string to filter by.
 *
 * @returns Array of matching tool definitions.
 */
export function getToolsByTag(tag: string): ToolDefinition[] {
  return toolRegistry.getByTag(tag);
}

/**
 * Gets all tools using a specific operation from the global registry.
 * @param operation - Operation name to filter by.
 *
 * @returns Array of matching tool definitions.
 */
export function getToolsByOperation(operation: string): ToolDefinition[] {
  return toolRegistry.getByOperation(operation);
}
