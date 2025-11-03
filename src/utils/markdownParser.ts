/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * @module utils/markdownParser
 * Utility functions for parsing markdown text and extracting heading structures.
 * Used by symbol providers to generate outline views.
 */

/**
 * Represents a markdown heading with metadata.
 */
export interface MarkdownHeading {
  /** Heading text content */
  text: string;
  /** Heading level (1-6 for H1-H6) */
  level: number;
  /** Character offset in the source text */
  offset: number;
  /** Length of the heading text */
  length: number;
  /** Line number (0-indexed) */
  line: number;
  /** Child headings (hierarchical structure) */
  children: MarkdownHeading[];
}

/**
 * Extracts all markdown headings from text using regex.
 *
 * @param text - Markdown text to parse
 * @returns Flat array of headings with metadata
 *
 * @example
 * ```typescript
 * const headings = extractMarkdownHeadings("# Title\n## Subtitle");
 * // Returns: [
 * //   { text: "Title", level: 1, offset: 0, ... },
 * //   { text: "Subtitle", level: 2, offset: 8, ... }
 * // ]
 * ```
 */
export function extractMarkdownHeadings(text: string): MarkdownHeading[] {
  const headings: MarkdownHeading[] = [];
  const headingRegex = /^(#{1,6})\s+(.+)$/gm;

  let match: RegExpExecArray | null;
  while ((match = headingRegex.exec(text)) !== null) {
    const level = match[1].length;
    const headingText = match[2].trim();
    const offset = match.index;
    const length = match[0].length;

    // Calculate line number
    const textUpToMatch = text.substring(0, offset);
    const line = (textUpToMatch.match(/\n/g) || []).length;

    headings.push({
      text: headingText,
      level,
      offset,
      length,
      line,
      children: [],
    });
  }

  return headings;
}

/**
 * Builds a hierarchical tree from flat heading list based on levels.
 * Lower level headings (H2) become children of higher level headings (H1).
 *
 * @param flatHeadings - Flat array of headings
 * @returns Hierarchical tree of headings
 *
 * @example
 * ```typescript
 * const flat = [
 *   { text: "Main", level: 1, ... },
 *   { text: "Sub1", level: 2, ... },
 *   { text: "Sub2", level: 2, ... }
 * ];
 * const tree = buildHeadingHierarchy(flat);
 * // Returns: [{ text: "Main", level: 1, children: [
 * //   { text: "Sub1", level: 2, children: [] },
 * //   { text: "Sub2", level: 2, children: [] }
 * // ]}]
 * ```
 */
export function buildHeadingHierarchy(
  flatHeadings: MarkdownHeading[],
): MarkdownHeading[] {
  if (flatHeadings.length === 0) {
    return [];
  }

  const root: MarkdownHeading[] = [];
  const stack: MarkdownHeading[] = [];

  for (const heading of flatHeadings) {
    // Create a copy to avoid mutating the original
    const headingCopy: MarkdownHeading = {
      ...heading,
      children: [],
    };

    // Pop from stack until we find a heading with lower level (higher in hierarchy)
    while (stack.length > 0 && stack[stack.length - 1].level >= heading.level) {
      stack.pop();
    }

    // If stack is empty, this is a root-level heading
    if (stack.length === 0) {
      root.push(headingCopy);
    } else {
      // Otherwise, add as child to the heading at top of stack
      const parent = stack[stack.length - 1];
      parent.children.push(headingCopy);
    }

    // Push current heading onto stack
    stack.push(headingCopy);
  }

  return root;
}

/**
 * Extracts and builds hierarchical heading structure in one step.
 *
 * @param text - Markdown text to parse
 * @returns Hierarchical tree of headings
 *
 * @example
 * ```typescript
 * const tree = parseMarkdownStructure("# Main\n## Sub\n# Another");
 * // Returns hierarchical structure with "Sub" as child of "Main"
 * ```
 */
export function parseMarkdownStructure(text: string): MarkdownHeading[] {
  const flatHeadings = extractMarkdownHeadings(text);
  return buildHeadingHierarchy(flatHeadings);
}

/**
 * Converts heading level (1-6) to a display string.
 *
 * @param level - Heading level (1-6)
 * @returns Display string (e.g., "H1", "H2")
 */
export function headingLevelToString(level: number): string {
  return `H${level}`;
}
