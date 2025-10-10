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
 * Tool Registry interface
 */
export interface ToolRegistry {
  register(tool: ToolDefinition): void;
  get(name: string): ToolDefinition | undefined;
  getAll(): ToolDefinition[];
  has(name: string): boolean;
  getByOperation(operation: string): ToolDefinition[];
  getByTag(tag: string): ToolDefinition[];
}

/**
 * Implementation of ToolRegistry interface
 */
class ToolDefinitionRegistry implements ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  constructor(initialTools: readonly ToolDefinition[] = []) {
    initialTools.forEach((tool) => this.register(tool));
  }

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      console.warn(
        `Tool ${tool.name} is already registered. Overwriting existing definition.`,
      );
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getByTag(tag: string): ToolDefinition[] {
    return this.getAll().filter((tool) => tool.tags?.includes(tag));
  }

  getByOperation(operation: string): ToolDefinition[] {
    return this.getAll().filter((tool) => tool.operation === operation);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  getAllNames(): string[] {
    return Array.from(this.tools.keys());
  }

  clear(): void {
    this.tools.clear();
  }
}

/**
 * Global tool definition registry
 */
export const toolRegistry = new ToolDefinitionRegistry(allToolDefinitions);

/**
 * Get tool definition by name
 */
export function getToolDefinition(name: string): ToolDefinition | undefined {
  return toolRegistry.get(name);
}

/**
 * Get all tool definitions
 */
export function getAllToolDefinitions(): ToolDefinition[] {
  return toolRegistry.getAll();
}

/**
 * Get tools by tag
 */
export function getToolsByTag(tag: string): ToolDefinition[] {
  return toolRegistry.getByTag(tag);
}

/**
 * Get tools by operation
 */
export function getToolsByOperation(operation: string): ToolDefinition[] {
  return toolRegistry.getByOperation(operation);
}
