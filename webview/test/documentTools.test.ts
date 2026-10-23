/// <reference types="vitest/globals" />

/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * The editor's tools of the Datalayer Chat's agents (`chat/documentTools`,
 * `webview/agentChat/documentTools`): which registered tools the chat
 * gives, what reads and what writes, how a call is decided (the
 * application's rules, else read runs and write is asked), which editor a
 * tool may run on, and the hook that asks in the chat's approval banner.
 */

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

import type { AppChatFrontendTool } from "../../src/chat/appChat";
import {
  DOCUMENT_TOOL_WORDS,
  documentToolArgsOf,
  documentToolDecision,
  type DocumentToolSpec,
  documentToolSpecsOf,
  documentToolTargetOf,
  editorNameOf,
  isDocumentToolAsk,
} from "../../src/chat/documentTools";
import {
  type DocumentTools,
  useDocumentTools,
} from "../agentChat/documentTools";

const definitions = [
  {
    name: "datalayer_getActiveDocument",
    description: "Active document",
    parameters: { type: "object", properties: {} },
    tags: ["document", "active", "notebook", "lexical"],
  },
  {
    name: "datalayer_createNotebook",
    description: "Create",
    parameters: { type: "object", properties: {} },
    tags: ["notebook", "create"],
  },
  {
    name: "datalayer_selectKernel",
    description: "Select",
    parameters: { type: "object", properties: {} },
    tags: ["kernel", "notebook", "lexical"],
  },
  {
    name: "datalayer_insertCell",
    description: "Insert a cell",
    parameters: { type: "object", properties: { source: { type: "string" } } },
    tags: ["cell", "notebook", "manipulation", "insert"],
  },
  {
    name: "datalayer_readAllCells",
    description: "Read cells",
    parameters: { type: "object", properties: {} },
    tags: ["cell", "notebook", "read", "inspect", "all"],
  },
  {
    name: "datalayer_listAvailableBlocks",
    description: "Blocks",
    parameters: { type: "object", properties: {} },
    tags: ["lexical", "schema", "discovery", "blocks"],
  },
  {
    name: "datalayer_updateBlock",
    description: "Update a block",
    parameters: { type: "object", properties: {} },
    tags: ["lexical", "update", "edit", "block", "modify"],
  },
  {
    name: "datalayer_executeCode",
    description: "Execute",
    parameters: { type: "object", properties: {} },
    tags: ["execute", "code", "kernel", "runtime", "notebook", "lexical"],
  },
  {
    name: "other_tool",
    description: "Not an editor's",
    parameters: { type: "object", properties: {} },
    tags: ["misc"],
  },
];

describe("the chat's tools among the registered ones", () => {
  const specs = documentToolSpecsOf(definitions);

  it("gives the notebook and document tools, not creating or picking kernels", () => {
    expect(specs.map((spec) => spec.name)).toEqual([
      "datalayer_getActiveDocument",
      "datalayer_insertCell",
      "datalayer_readAllCells",
      "datalayer_listAvailableBlocks",
      "datalayer_updateBlock",
      "datalayer_executeCode",
    ]);
  });

  it("says what reads, what writes and which editor each needs", () => {
    const of = (name: string) => specs.find((spec) => spec.name === name)!;
    expect(of("datalayer_getActiveDocument")).toMatchObject({
      writes: false,
      target: "any",
    });
    expect(of("datalayer_insertCell")).toMatchObject({
      writes: true,
      target: "notebook",
      description: "Insert a cell",
    });
    expect(of("datalayer_readAllCells").writes).toBe(false);
    expect(of("datalayer_listAvailableBlocks")).toMatchObject({
      writes: false,
      target: "lexical",
    });
    expect(of("datalayer_updateBlock")).toMatchObject({
      writes: true,
      target: "lexical",
    });
    expect(of("datalayer_executeCode")).toMatchObject({
      writes: true,
      target: "any",
    });
  });
});

describe("how a call is decided", () => {
  const read = { name: "datalayer_readAllCells", writes: false };
  const write = { name: "datalayer_insertCell", writes: true };

  it("with no rule, reading runs and writing is asked", () => {
    expect(documentToolDecision(read)).toBe("do_it");
    expect(documentToolDecision(write)).toBe("ask_first");
    expect(documentToolDecision(write, { rules: [] })).toBe("ask_first");
  });

  it("follows the rule naming the tool before the rule of its class", () => {
    const host = {
      rules: [
        { appliesTo: ["write"], behaviour: "leave_to_me" },
        { appliesTo: ["datalayer_insertCell"], behaviour: "do_it" },
      ],
    };
    expect(documentToolDecision(write, host)).toBe("do_it");
    expect(
      documentToolDecision(
        { name: "datalayer_deleteCells", writes: true },
        host,
      ),
    ).toBe("leave_to_me");
  });

  it("asks for if_asked and ask_first, refuses leave_to_me", () => {
    const rule = (behaviour: string) => ({
      rules: [{ appliesTo: ["read"], behaviour }],
    });
    expect(documentToolDecision(read, rule("if_asked"))).toBe("ask_first");
    expect(documentToolDecision(read, rule("ask_first"))).toBe("ask_first");
    expect(documentToolDecision(read, rule("leave_to_me"))).toBe("leave_to_me");
  });
});

describe("which editor a tool runs on", () => {
  const notebook = {
    kind: "notebook" as const,
    uri: "file:///work/My%20Analysis.ipynb",
    name: "My Analysis.ipynb",
  };
  const lexical = {
    kind: "lexical" as const,
    uri: "datalayer://space/notes.dlex",
    name: "notes.dlex",
  };

  const open = (
    editor: typeof notebook | typeof lexical,
    focusedAt: number,
  ) => ({ ...editor, focusedAt });
  const other = { kind: "other" as const, uri: "file:///x.py", name: "x.py" };

  it("runs on the active tab when it is a Datalayer editor of the tool's kind", () => {
    expect(
      documentToolTargetOf("notebook", notebook, [open(notebook, 1)]),
    ).toEqual({ editor: notebook });
    expect(documentToolTargetOf("any", lexical, [])).toEqual({
      editor: lexical,
    });
  });

  it("falls back to the one of its kind focused last, and says so", () => {
    const older = {
      kind: "notebook" as const,
      uri: "file:///work/old.ipynb",
      name: "old.ipynb",
    };
    // The chat sidebar or a Python file in front: the active tab is no target.
    const located = documentToolTargetOf("notebook", other, [
      open(older, 3),
      open(notebook, 7),
      open(lexical, 9),
    ]);
    expect(located.editor).toEqual(notebook);
    expect(located.note).toBe(DOCUMENT_TOOL_WORDS.lastFocused(notebook, 2));
    expect(located.note).toContain("My Analysis.ipynb");
    expect(located.note).toContain("of 2 open");
    // A document active, a notebook's tool: the notebook focused last.
    expect(
      documentToolTargetOf("notebook", lexical, [open(notebook, 1)]).editor,
    ).toEqual(notebook);
    // Either kind for a tool of either: the editor focused last.
    expect(
      documentToolTargetOf("any", undefined, [
        open(notebook, 1),
        open(lexical, 2),
      ]).editor,
    ).toEqual(lexical);
  });

  it("never runs on an editor of the other kind", () => {
    expect(
      documentToolTargetOf("lexical", notebook, [open(notebook, 5)]),
    ).toEqual({ error: DOCUMENT_TOOL_WORDS.noEditor("lexical") });
  });

  it("tells the agent to ask for one when none of its kind is open", () => {
    const located = documentToolTargetOf("notebook", undefined, []);
    expect(located).toEqual({
      error: DOCUMENT_TOOL_WORDS.noEditor("notebook"),
    });
    expect(located.error).toContain("ask the person to open one");
    expect(documentToolTargetOf("lexical", other, []).error).toContain(".dlex");
  });

  it("runs on the editor located before while it is open, never another", () => {
    expect(
      documentToolTargetOf(
        "notebook",
        lexical,
        [open(notebook, 1)],
        notebook.uri,
      ),
    ).toEqual({ editor: notebook });
    // Closed meanwhile, with another notebook active: refused.
    const elsewhere = {
      kind: "notebook" as const,
      uri: "file:///work/b.ipynb",
      name: "b.ipynb",
    };
    expect(
      documentToolTargetOf(
        "notebook",
        elsewhere,
        [open(elsewhere, 4)],
        notebook.uri,
      ),
    ).toEqual({ error: DOCUMENT_TOOL_WORDS.closed(notebook.uri) });
  });

  it("names the editor by its file name", () => {
    expect(editorNameOf(notebook.uri)).toBe("My Analysis.ipynb");
    expect(editorNameOf(lexical.uri)).toBe("notes.dlex");
  });

  it("parses nested arguments the model wrote as JSON text", () => {
    expect(
      documentToolArgsOf({ cells: '[{"source":"1"}]', index: 2, text: "{x" }),
    ).toEqual({ cells: [{ source: "1" }], index: 2, text: "{x" });
  });
});

describe("useDocumentTools", () => {
  const specs: DocumentToolSpec[] = documentToolSpecsOf(definitions);
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let latest: DocumentTools;

  function Probe(props: {
    call: Parameters<typeof useDocumentTools>[1];
    host?: Parameters<typeof useDocumentTools>[3];
    onTarget?: Parameters<typeof useDocumentTools>[4];
  }): null {
    latest = useDocumentTools(
      specs,
      props.call,
      "agent-1",
      props.host,
      props.onTarget,
    );
    return null;
  }

  const editor = {
    kind: "notebook" as const,
    name: "a.ipynb",
    uri: "file:///work/a.ipynb",
  };

  const tool = (name: string): AppChatFrontendTool =>
    latest.frontendTools.find((entry) => entry.name === name)!;

  beforeEach(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("gives every tool as a frontend tool", () => {
    const call = vi.fn();
    act(() => root.render(React.createElement(Probe, { call })));
    expect(latest.frontendTools.map((entry) => entry.name)).toEqual(
      specs.map((spec) => spec.name),
    );
    expect(tool("datalayer_insertCell")).toMatchObject({
      location: "frontend",
      description: "Insert a cell",
    });
  });

  it("runs a tool that reads at once, on the editor located, naming it", async () => {
    const call = vi.fn(async () => ({ editor, result: "cells" }));
    const onTarget = vi.fn();
    act(() => root.render(React.createElement(Probe, { call, onTarget })));
    const answer = await tool("datalayer_readAllCells").handler({});
    expect(call.mock.calls).toEqual([
      ["datalayer_readAllCells", {}, { locate: true }],
      ["datalayer_readAllCells", {}, { target: editor.uri }],
    ]);
    expect(onTarget).toHaveBeenCalledWith("datalayer_readAllCells", editor);
    expect(answer).toEqual({ success: true, editor, result: "cells" });
    expect(latest.asks).toEqual([]);
  });

  it("passes on why the editor is not the active tab", async () => {
    const note = DOCUMENT_TOOL_WORDS.lastFocused(editor, 2);
    const call = vi.fn(
      async (_name: string, _args: unknown, options?: { locate?: boolean }) =>
        options?.locate ? { editor, note } : { editor, result: "cells" },
    );
    act(() => root.render(React.createElement(Probe, { call })));
    expect(await tool("datalayer_readAllCells").handler({})).toEqual({
      success: true,
      editor,
      note,
      result: "cells",
    });
  });

  it("runs nothing and asks nothing when no editor of its kind is open", async () => {
    const error = DOCUMENT_TOOL_WORDS.noEditor("notebook");
    const call = vi.fn(async () => ({ error }));
    act(() => root.render(React.createElement(Probe, { call })));
    expect(await tool("datalayer_insertCell").handler({})).toEqual({
      success: false,
      error,
    });
    expect(call).toHaveBeenCalledTimes(1);
    expect(latest.asks).toEqual([]);
  });

  it("asks before a tool that writes, naming the file, and runs it there once approved", async () => {
    const call = vi.fn(async () => ({ editor, result: "inserted" }));
    act(() => root.render(React.createElement(Probe, { call })));
    let answered: unknown;
    await act(async () => {
      void tool("datalayer_insertCell")
        .handler({ source: "1+1" })
        .then((value) => {
          answered = value;
        });
    });
    // Located only: nothing ran yet.
    expect(call.mock.calls).toEqual([
      ["datalayer_insertCell", {}, { locate: true }],
    ]);
    expect(latest.asks).toHaveLength(1);
    const ask = latest.asks[0]!;
    expect(isDocumentToolAsk(ask.id)).toBe(true);
    expect(ask).toMatchObject({
      toolName: "datalayer_insertCell",
      toolDescription: DOCUMENT_TOOL_WORDS.asked(
        "datalayer_insertCell",
        "a.ipynb",
      ),
      args: { source: "1+1" },
      agentId: "agent-1",
    });
    expect(ask.toolDescription).toContain("a.ipynb");
    await act(async () => {
      expect(latest.decide(ask.id, true)).toBe(true);
    });
    expect(call).toHaveBeenLastCalledWith(
      "datalayer_insertCell",
      { source: "1+1" },
      { target: editor.uri },
    );
    expect(answered).toMatchObject({ success: true, result: "inserted" });
    expect(latest.asks).toEqual([]);
  });

  it("changes nothing when the person declines", async () => {
    const call = vi.fn(async () => ({ editor }));
    act(() => root.render(React.createElement(Probe, { call })));
    let answered: unknown;
    await act(async () => {
      void tool("datalayer_updateBlock")
        .handler({})
        .then((value) => {
          answered = value;
        });
    });
    await act(async () => {
      latest.decide(latest.asks[0]!.id, false);
    });
    expect(call).toHaveBeenCalledTimes(1);
    expect(answered).toEqual({
      success: false,
      editor,
      error: DOCUMENT_TOOL_WORDS.refused("datalayer_updateBlock"),
    });
  });

  it("declines what was asked when another agent is talked to", async () => {
    const call = vi.fn(async () => ({ editor }));
    function Switch(props: { agentId: string }): null {
      latest = useDocumentTools(specs, call, props.agentId);
      return null;
    }
    act(() => root.render(React.createElement(Switch, { agentId: "a" })));
    let answered: unknown;
    await act(async () => {
      void tool("datalayer_insertCell")
        .handler({})
        .then((value) => {
          answered = value;
        });
    });
    expect(latest.asks).toHaveLength(1);
    await act(async () => {
      root.render(React.createElement(Switch, { agentId: "b" }));
    });
    expect(latest.asks).toEqual([]);
    expect(answered).toMatchObject({ success: false });
    // Located only, never run.
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("leaves another approval to its own route", () => {
    act(() => root.render(React.createElement(Probe, { call: vi.fn() })));
    expect(latest.decide("approval-at-ai-agents", true)).toBe(false);
  });

  it("follows the application's rules: do_it runs, leave_to_me refuses", async () => {
    const call = vi.fn(async () => ({ editor, result: "ok" }));
    const host = {
      rules: [
        { appliesTo: ["datalayer_insertCell"], behaviour: "do_it" },
        { appliesTo: ["read"], behaviour: "leave_to_me" },
      ],
    };
    act(() => root.render(React.createElement(Probe, { call, host })));
    expect(await tool("datalayer_insertCell").handler({})).toMatchObject({
      success: true,
    });
    expect(await tool("datalayer_readAllCells").handler({})).toEqual({
      success: false,
      error: DOCUMENT_TOOL_WORDS.leftToPerson("datalayer_readAllCells"),
    });
    // Located, then run: the read refused never asked VS Code.
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("says a failure as the tool's answer, never throws", async () => {
    const call = vi.fn(async () => {
      throw new Error("bridge gone");
    });
    act(() => root.render(React.createElement(Probe, { call })));
    expect(await tool("datalayer_getActiveDocument").handler({})).toEqual({
      success: false,
      error: "bridge gone",
    });
  });
});
