/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * LLM prompt templates for inline completions.
 * Provides different prompts for code vs prose content types.
 *
 * @module providers/completionPrompts
 */

/**
 * Variables for code completion prompts.
 */
export interface CodeCompletionVars {
  /** Programming language (e.g., 'python', 'javascript') */
  language: string;
  /** Code before cursor */
  prefix: string;
  /** Code after cursor */
  suffix: string;
}

/**
 * Variables for prose completion prompts.
 */
export interface ProseCompletionVars {
  /** Text before cursor */
  prefix: string;
  /** Text after cursor */
  suffix: string;
}

/**
 * Generates a prompt for code completions at the cursor position.
 *
 * @param vars - Code context variables including language and surrounding code.
 *
 * @returns Formatted prompt string for the language model.
 *
 */
export function getCodeCompletionPrompt(vars: CodeCompletionVars): string {
  return `Complete the following ${vars.language} code. Only return the completion, no explanations or markdown.

\`\`\`${vars.language}
${vars.prefix}<CURSOR>${vars.suffix}
\`\`\`

Complete the code at <CURSOR>:`;
}

/**
 * Generates a prompt for prose and writing completions.
 * Focuses on natural language continuation matching the existing tone and style.
 *
 * @param vars - Prose context variables including surrounding text.
 *
 * @returns Formatted prompt string for the language model.
 *
 */
export function getProseCompletionPrompt(vars: ProseCompletionVars): string {
  return `You are a writing assistant. Continue the following text naturally at <CURSOR>.

Your response should:
- Flow naturally from the existing text
- Match the tone and style of the context
- Be concise (1-3 sentences maximum)
- Only provide the text to insert (no explanations, no markdown formatting, no code blocks)

Context:
${vars.prefix}<CURSOR>${vars.suffix}

Suggested completion:`;
}

/**
 * Selects and generates the appropriate prompt based on content type.
 *
 * @param contentType - Whether to generate a code or prose completion prompt.
 * @param vars - Context variables including optional language and surrounding text.
 * @param vars.language - Programming language for code completions.
 * @param vars.prefix - Text before the cursor position.
 * @param vars.suffix - Text after the cursor position.
 *
 * @returns Formatted prompt string for the language model.
 *
 */
export function getPromptForContentType(
  contentType: "code" | "prose",
  vars: { language?: string; prefix: string; suffix: string },
): string {
  if (contentType === "code") {
    return getCodeCompletionPrompt({
      language: vars.language || "python",
      prefix: vars.prefix,
      suffix: vars.suffix,
    });
  } else {
    return getProseCompletionPrompt({
      prefix: vars.prefix,
      suffix: vars.suffix,
    });
  }
}
