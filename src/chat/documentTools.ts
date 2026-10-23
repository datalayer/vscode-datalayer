/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * The notebook and document tools a Datalayer agent is given in the
 * Datalayer Chat sidebar.
 *
 * The extension registers its tools once (`tools/core/registration`): the
 * cell operations of `@datalayer/jupyter-react`, the block operations of
 * `@datalayer/jupyter-lexical` and its own (`getActiveDocument`,
 * `executeCode`). GitHub Copilot calls them through VS Code's Language Model
 * Tools API; the agents talked to in the Datalayer Chat call the same ones
 * as frontend tools — the chat lists them in each run's `tools` (AG-UI
 * `RunAgentInput.tools`, the Vercel AI body's `tools`), the runtime hands a
 * call back to the view, the view asks the extension host to run it on the
 * active Datalayer notebook or document, and the result goes back to the
 * run, naming the editor it was run on.
 *
 * A call the runtime hands back never passes its own approvals (the runtime
 * never runs it), so the view decides it here: a rule of the application
 * naming the tool, else the rule of its class (`read` or `write`); with no
 * rule — and always for an agent of the person's own runtime — a tool that
 * only reads runs, and one that writes (inserts, updates, deletes, runs
 * code) is asked in the chat first.
 *
 * Pure: no `vscode`, no React, no network. Imported by the extension host
 * (`AgentChatViewProvider`) and by the webview (`webview/agentChat`).
 *
 * @module chat/documentTools
 */

import type { AppHost } from "./appChat";

/** Which editor a tool works on. */
export type DocumentToolTarget = "notebook" | "lexical" | "any";

/** A tool as the chat lists it: serializable, posted to the view. */
export interface DocumentToolSpec {
  /** Its name, as the model calls it (`datalayer_insertCell`). */
  name: string;
  /** What it does, for the model. */
  description: string;
  /** Its arguments, as a JSON Schema object. */
  parameters: Record<string, unknown>;
  /** Whether it changes the document or runs code. */
  writes: boolean;
  /** The editor it needs open. */
  target: DocumentToolTarget;
}

/** A tool definition, as the registry holds it (its parts read here). */
export interface DocumentToolDefinition {
  /** Its name. */
  name: string;
  /** Its description. */
  description: string;
  /** Its arguments. */
  parameters: Record<string, unknown>;
  /** Its tags (`cell`, `lexical`, `read`, …). */
  tags?: readonly string[];
}

/** The editor active in VS Code, as a tool's result names it. */
export interface ActiveEditor {
  /** `notebook` or `lexical` for a Datalayer editor, else `other`. */
  kind: "notebook" | "lexical" | "other";
  /** Its URI. */
  uri: string;
  /** Its file name. */
  name: string;
}

/** What the extension host answers a call with. */
export interface DocumentToolOutcome {
  /** The editor it was run on, when it ran on one. */
  editor?: { kind: "notebook" | "lexical"; name: string; uri: string };
  /** What the tool answered (formatted as the `tools.responseFormat` setting says). */
  result?: unknown;
  /** Why it did not run, in a sentence. */
  error?: string;
}

/** The prefix of an approval the chat asks for a tool of the editor. */
export const DOCUMENT_TOOL_ASK_PREFIX = "vscode-tool:";

/**
 * The registered tools that are not the chat's: creating a document,
 * listing and picking kernels open VS Code's own pickers and dialogs.
 */
const NOT_IN_CHAT = new Set([
  "datalayer_createNotebook",
  "datalayer_createLexical",
  "datalayer_listKernels",
  "datalayer_selectKernel",
]);

/** The tags of a tool that only reads. */
const READING_TAGS = ["read", "discovery"];

/** The tool that names the active document: reads, on any editor. */
const ACTIVE_DOCUMENT_TOOL = "datalayer_getActiveDocument";

/** The words the chat says, in one place. */
export const DOCUMENT_TOOL_WORDS = {
  asked: (tool: string, editor: string) =>
    `The agent asks to run ${tool} on ${editor || "the active Datalayer editor"}.`,
  refused: (tool: string) =>
    `The person declined ${tool}: nothing was changed.`,
  leftToPerson: (tool: string) =>
    `A rule of this application leaves ${tool} to the person: VS Code did not run it.`,
  unknown: (tool: string) => `${tool} is not a tool of VS Code's editors.`,
  noEditor: (target: DocumentToolTarget) =>
    target === "notebook"
      ? "No Datalayer notebook is the active editor in VS Code: ask the person to open one (or bring it to the front) and call the tool again."
      : target === "lexical"
        ? "No Datalayer document (.dlex) is the active editor in VS Code: ask the person to open one (or bring it to the front) and call the tool again."
        : "No Datalayer notebook or document is the active editor in VS Code.",
  notAnswered: "VS Code did not answer in time.",
} as const;

/**
 * Whether a registered tool is one of the chat's, and which editor it
 * needs: a notebook's (`cell`, `notebook`), a document's (`lexical`), or
 * either (`getActiveDocument`, `executeCode`).
 *
 * @param definition - What the registry holds of the tool: name, tags, schema.
 *
 * @returns Its spec, or `undefined` when it is not the chat's.
 */
export function documentToolSpecOf(
  definition: DocumentToolDefinition,
): DocumentToolSpec | undefined {
  if (NOT_IN_CHAT.has(definition.name)) {
    return undefined;
  }
  const tags = definition.tags ?? [];
  const notebook = tags.includes("notebook");
  const lexical = tags.includes("lexical");
  if (!notebook && !lexical) {
    return undefined;
  }
  const target: DocumentToolTarget =
    notebook && lexical ? "any" : notebook ? "notebook" : "lexical";
  return {
    name: definition.name,
    description: definition.description,
    parameters: definition.parameters,
    writes:
      definition.name !== ACTIVE_DOCUMENT_TOOL &&
      !READING_TAGS.some((tag) => tags.includes(tag)),
    target,
  };
}

/**
 * The chat's tools among the registered ones, in their order.
 *
 * @param definitions - The registered tool definitions.
 *
 * @returns Their specs.
 */
export function documentToolSpecsOf(
  definitions: readonly DocumentToolDefinition[],
): DocumentToolSpec[] {
  return definitions
    .map(documentToolSpecOf)
    .filter((spec): spec is DocumentToolSpec => spec !== undefined);
}

/**
 * What the chat does with a call: the rule of the application naming the
 * tool, else the rule of its class (`read` or `write`); with none, a tool
 * that reads runs and one that writes is asked first. `if_asked` is asked
 * too: the chat cannot tell whether the person asked for it.
 *
 * @param spec - The tool called.
 * @param host - What the application's Appspec says (its rules); none for
 *   an agent of the person's own runtime.
 *
 * @returns `do_it`, `ask_first` or `leave_to_me`.
 */
export function documentToolDecision(
  spec: Pick<DocumentToolSpec, "name" | "writes">,
  host?: Pick<AppHost, "rules">,
): "do_it" | "ask_first" | "leave_to_me" {
  const rules = host?.rules ?? [];
  const named = rules.find((rule) => rule.appliesTo.includes(spec.name));
  const toolClass = spec.writes ? "write" : "read";
  const classed = rules.find((rule) => rule.appliesTo.includes(toolClass));
  const said = (named ?? classed)?.behaviour;
  if (said === "leave_to_me") {
    return "leave_to_me";
  }
  if (said === "do_it") {
    return "do_it";
  }
  if (said === "ask_first" || said === "if_asked") {
    return "ask_first";
  }
  return spec.writes ? "ask_first" : "do_it";
}

/**
 * Why a tool cannot run on the active editor, or `""` when it can.
 *
 * @param target - The editor the tool needs.
 * @param active - The editor active in VS Code, if any.
 *
 * @returns The sentence, or `""`.
 */
export function documentToolRefusal(
  target: DocumentToolTarget,
  active: ActiveEditor | undefined,
): string {
  if (!active || active.kind === "other") {
    return DOCUMENT_TOOL_WORDS.noEditor(target);
  }
  if (target !== "any" && active.kind !== target) {
    return DOCUMENT_TOOL_WORDS.noEditor(target);
  }
  return "";
}

/**
 * The editor's name a tool's result gives: its file name, else its URI.
 *
 * @param uri - Where the editor's file is (`file:` or `datalayer:`).
 *
 * @returns The last segment of its path, decoded.
 */
export function editorNameOf(uri: string): string {
  let path = uri;
  try {
    path = new URL(uri).pathname;
  } catch {
    // Not a URL: its path as given.
  }
  const last = path.split("/").filter(Boolean).pop() ?? uri;
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

/**
 * The id of an approval the chat asks for a call.
 *
 * @param count - A counter of the view's asks.
 *
 * @returns The id, under {@link DOCUMENT_TOOL_ASK_PREFIX}.
 */
export function documentToolAskId(count: number): string {
  return `${DOCUMENT_TOOL_ASK_PREFIX}${count}`;
}

/**
 * Whether an approval is one the chat asked for a tool of the editor.
 *
 * @param approvalId - What the banner names the approval by.
 *
 * @returns Whether it is.
 */
export function isDocumentToolAsk(approvalId: string): boolean {
  return approvalId.startsWith(DOCUMENT_TOOL_ASK_PREFIX);
}

/**
 * Arguments as the model sent them, with a nested object or array it
 * wrote as JSON text parsed (models do; the operations take objects).
 *
 * @param args - The call's arguments.
 *
 * @returns The arguments, parsed where they could be.
 */
export function documentToolArgsOf(
  args: Record<string, unknown>,
): Record<string, unknown> {
  const parsed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args ?? {})) {
    if (
      typeof value === "string" &&
      (value.startsWith("{") || value.startsWith("["))
    ) {
      try {
        parsed[key] = JSON.parse(value);
        continue;
      } catch {
        // Text after all.
      }
    }
    parsed[key] = value;
  }
  return parsed;
}
