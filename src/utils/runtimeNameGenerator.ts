/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Runtime name generation utility using unique-names-generator.
 * Generates friendly, memorable names for Datalayer runtimes.
 *
 * @module utils/runtimeNameGenerator
 */

import {
  adjectives,
  animals,
  Config,
  uniqueNamesGenerator,
} from "unique-names-generator";

/**
 * Configuration for unique name generation.
 * Uses adjective + animal pattern for memorable runtime names.
 */
const nameConfig: Config = {
  dictionaries: [adjectives, animals],
  separator: "-",
  length: 2,
  style: "capital",
};

/**
 * Generates a unique, human-readable name for a runtime.
 * Uses the pattern: Adjective-Animal (e.g., "Brave-Tiger").
 *
 * @returns A generated runtime name with capitalized words separated by hyphens.
 *
 */
export function generateRuntimeName(): string {
  return uniqueNamesGenerator(nameConfig);
}
