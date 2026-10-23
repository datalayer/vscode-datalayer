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
 * call back to the view, the view asks the extension host which Datalayer
 * notebook or document it would run on ({@link documentToolTargetOf}: the
 * active tab, else the one focused last), shows that file to the person,
 * has the host run it there, and the result goes back to the run, naming
 * the editor it was run on.
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

/** A Datalayer editor a tool runs on, as its result names it. */
export interface TargetEditor {
  /** `notebook` or `lexical`. */
  kind: "notebook" | "lexical";
  /** Its file name. */
  name: string;
  /** Its URI. */
  uri: string;
}

/** A Datalayer editor open in VS Code (its webview panel not disposed). */
export interface OpenEditor extends TargetEditor {
  /**
   * When it was last focused: a counter, larger is later; `0` when it was
   * never focused (opened in the background).
   */
  focusedAt: number;
}

/** What the extension host answers a call with. */
export interface DocumentToolOutcome {
  /** The editor it was run on (or, located only, would run on). */
  editor?: TargetEditor;
  /**
   * Why that editor, when it is not the active tab: the one of its kind
   * focused last, which the agent should name to the person.
   */
  note?: string;
  /** What the tool answered (formatted as the `tools.responseFormat` setting says). */
  result?: unknown;
  /** Why it did not run, in a sentence. */
  error?: string;
}

/** How the page asks the host about a call. */
export interface DocumentToolCallOptions {
  /** Only say which editor the call would run on; run nothing. */
  locate?: boolean;
  /**
   * The URI of the editor located (and shown to the person) before: the
   * call runs on that one, or is refused when it was closed meanwhile.
   */
  target?: string;
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
  /**
   * The approval banner's line of a call asked of the person.
   *
   * @param tool - The tool called.
   * @param editor - The editor it would run on, when known.
   *
   * @returns The line.
   */
  asked: (tool: string, editor: string) =>
    `The agent asks to run ${tool} on ${editor || "the active Datalayer editor"}.`,
  /**
   * Why the call runs on an editor that is not the active tab.
   *
   * @param editor - The editor chosen.
   * @param open - How many Datalayer editors of its kind are open.
   *
   * @returns The sentence, for the agent to tell the person.
   */
  lastFocused: (editor: TargetEditor, open: number) =>
    `${editor.name} is not the active tab: it is the Datalayer ${editor.kind === "notebook" ? "notebook" : "document"} focused last${open > 1 ? ` (of ${open} open)` : ""}. Tell the person which file you acted on.`,
  /**
   * The editor located before was closed before the call ran.
   *
   * @param uri - Its URI.
   *
   * @returns The sentence.
   */
  closed: (uri: string) =>
    `${editorNameOf(uri)} was closed before the tool ran: nothing was changed. Ask the person to open it again and call the tool again.`,
  /**
   * A call the person declined, as the run is answered.
   *
   * @param tool - The tool called.
   *
   * @returns The sentence.
   */
  refused: (tool: string) =>
    `The person declined ${tool}: nothing was changed.`,
  /**
   * A call an application's rule leaves to the person.
   *
   * @param tool - The tool called.
   *
   * @returns The sentence.
   */
  leftToPerson: (tool: string) =>
    `A rule of this application leaves ${tool} to the person: VS Code did not run it.`,
  /**
   * A call of a tool that is not one of the editors'.
   *
   * @param tool - The tool called.
   *
   * @returns The sentence.
   */
  unknown: (tool: string) => `${tool} is not a tool of VS Code's editors.`,
  /**
   * No Datalayer editor of the kind the tool needs is active.
   *
   * @param target - The editor the tool needs.
   *
   * @returns The sentence, which tells the agent what to ask the person.
   */
  noEditor: (target: DocumentToolTarget) =>
    target === "notebook"
      ? "No Datalayer notebook is open in VS Code: ask the person to open one and call the tool again."
      : target === "lexical"
        ? "No Datalayer document (.dlex) is open in VS Code: ask the person to open one and call the tool again."
        : "No Datalayer notebook or document is open in VS Code: ask the person to open one and call the tool again.",
  /** The extension host did not answer the call. */
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
 * Whether an editor is of the kind a tool needs.
 *
 * @param target - The editor the tool needs.
 * @param kind - The editor's kind.
 *
 * @returns Whether it fits.
 */
function fits(target: DocumentToolTarget, kind: ActiveEditor["kind"]): boolean {
  return kind !== "other" && (target === "any" || kind === target);
}

/**
 * The editor a tool runs on:
 *
 * 1. the one located before (`pinned`, shown to the person), while it is
 *    still open — else refused, never run on another;
 * 2. the active tab, when it is a Datalayer editor of the kind the tool
 *    needs;
 * 3. else the open one of that kind focused last (focus moves into the
 *    chat sidebar or another panel), with a note that names it;
 * 4. else none: the agent is told to ask the person to open one.
 *
 * @param target - The editor the tool needs.
 * @param active - The active tab, if any.
 * @param open - The Datalayer editors open (webview panels not disposed).
 * @param pinned - The URI of the editor located before, if any.
 *
 * @returns The editor (and a note when it is not the active tab), or why none.
 */
export function documentToolTargetOf(
  target: DocumentToolTarget,
  active: ActiveEditor | undefined,
  open: readonly OpenEditor[],
  pinned?: string,
): Pick<DocumentToolOutcome, "editor" | "note" | "error"> {
  const editorOf = ({ kind, name, uri }: TargetEditor): TargetEditor => ({
    kind,
    name,
    uri,
  });
  if (pinned) {
    const still = open.find(
      (editor) => editor.uri === pinned && fits(target, editor.kind),
    );
    return still
      ? { editor: editorOf(still) }
      : { error: DOCUMENT_TOOL_WORDS.closed(pinned) };
  }
  if (active && active.kind !== "other" && fits(target, active.kind)) {
    return { editor: editorOf({ ...active, kind: active.kind }) };
  }
  const candidates = open
    .filter((editor) => fits(target, editor.kind))
    .sort((a, b) => b.focusedAt - a.focusedAt);
  const last = candidates[0];
  if (!last) {
    return { error: DOCUMENT_TOOL_WORDS.noEditor(target) };
  }
  const editor = editorOf(last);
  return {
    editor,
    note: DOCUMENT_TOOL_WORDS.lastFocused(editor, candidates.length),
  };
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
