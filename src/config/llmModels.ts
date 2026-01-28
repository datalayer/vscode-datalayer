/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 * MIT License
 */

/**
 * Centralized LLM model configuration for inline completions.
 * Used by both notebook and lexical providers.
 *
 * @module config/llmModels
 */

import * as vscode from "vscode";

/**
 * Model selection strategy for inline completions.
 * Tries models in order of preference until one is available.
 */
export interface ModelSelectionStrategy {
  /** Strategy name for logging */
  name: string;
  /** Vendor preference (e.g., "copilot") */
  vendor?: string;
  /** Model family preference (e.g., "gpt-4", "gpt-3.5-turbo") */
  family?: string;
}

/**
 * Default model selection strategies in order of preference.
 *
 * 1. GPT-4 family from Copilot (best for code completions)
 * 2. Any Copilot model (fallback if GPT-4 unavailable)
 * 3. Any available model (final fallback)
 */
export const DEFAULT_MODEL_STRATEGIES: readonly ModelSelectionStrategy[] = [
  {
    name: "Copilot GPT-4",
    vendor: "copilot",
    family: "gpt-4",
  },
  {
    name: "Copilot (any family)",
    vendor: "copilot",
  },
  {
    name: "Any available model",
  },
] as const;

/**
 * Select the best available language model based on configured strategies.
 *
 * Tries each strategy in order until a model is found.
 * Logs detailed information about model selection process.
 *
 * @param context - Context string for logging (e.g., "LexicalProvider", "NotebookProvider")
 * @param strategies - Model selection strategies (defaults to DEFAULT_MODEL_STRATEGIES)
 * @returns Selected language model or undefined if none available
 */
export async function selectBestLanguageModel(
  context: string,
  strategies: readonly ModelSelectionStrategy[] = DEFAULT_MODEL_STRATEGIES,
): Promise<vscode.LanguageModelChat | undefined> {
  console.log(`[${context}] 🔍 Selecting language model...`);

  for (const strategy of strategies) {
    console.log(
      `[${context}] Trying strategy: ${strategy.name}${strategy.vendor ? ` (vendor: ${strategy.vendor})` : ""}${strategy.family ? ` (family: ${strategy.family})` : ""}`,
    );

    // Build selector
    const selector: {
      vendor?: string;
      family?: string;
    } = {};

    if (strategy.vendor) {
      selector.vendor = strategy.vendor;
    }

    if (strategy.family) {
      selector.family = strategy.family;
    }

    // Try to select models
    const models = await vscode.lm.selectChatModels(selector);

    console.log(
      `[${context}] Found ${models.length} model(s) for ${strategy.name}`,
    );

    if (models.length > 0) {
      // Log available models
      models.forEach((m, i) => {
        console.log(
          `[${context}]   Model ${i + 1}: ${m.id} (vendor: ${m.vendor}, family: ${m.family})`,
        );
      });

      // Use first model
      const selectedModel = models[0];
      console.log(
        `[${context}] ✅ Selected model: ${selectedModel.id} (vendor: ${selectedModel.vendor}, family: ${selectedModel.family})`,
      );

      return selectedModel;
    }
  }

  // No models found
  console.warn(`[${context}] ❌ No language models available!`);
  return undefined;
}

/**
 * Model selection options for fine-tuning the selection process.
 */
export interface ModelSelectionOptions {
  /** Custom strategies (overrides defaults) */
  strategies?: readonly ModelSelectionStrategy[];
  /** Enable verbose logging */
  verbose?: boolean;
}

/**
 * Check if language model API is available.
 * Returns false if vscode.lm is not available (older VS Code versions).
 */
export function isLanguageModelAPIAvailable(): boolean {
  return (
    typeof vscode.lm !== "undefined" &&
    typeof vscode.lm.selectChatModels === "function"
  );
}
