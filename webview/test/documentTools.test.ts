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
  documentToolRefusal,
  type DocumentToolSpec,
  documentToolSpecsOf,
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

  it("runs a notebook's tool only on a Datalayer notebook", () => {
    expect(documentToolRefusal("notebook", notebook)).toBe("");
    expect(documentToolRefusal("notebook", lexical)).toBe(
      DOCUMENT_TOOL_WORDS.noEditor("notebook"),
    );
    expect(documentToolRefusal("notebook", undefined)).toContain(
      "No Datalayer notebook",
    );
  });

  it("runs a document's tool only on a Datalayer document, either tool on either", () => {
    expect(documentToolRefusal("lexical", lexical)).toBe("");
    expect(documentToolRefusal("lexical", notebook)).toContain(".dlex");
    expect(documentToolRefusal("any", notebook)).toBe("");
    expect(
      documentToolRefusal("any", { kind: "other", uri: "x", name: "x" }),
    ).not.toBe("");
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
  }): null {
    latest = useDocumentTools(specs, props.call, "agent-1", props.host);
    return null;
  }

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

  it("runs a tool that reads at once, naming the editor", async () => {
    const editor = { kind: "notebook" as const, name: "a.ipynb", uri: "u" };
    const call = vi.fn(async () => ({ editor, result: "cells" }));
    act(() => root.render(React.createElement(Probe, { call })));
    const answer = await tool("datalayer_readAllCells").handler({});
    expect(call).toHaveBeenCalledWith("datalayer_readAllCells", {});
    expect(answer).toEqual({ success: true, editor, result: "cells" });
    expect(latest.asks).toEqual([]);
  });

  it("asks before a tool that writes, and runs it once approved", async () => {
    const call = vi.fn(async () => ({ result: "inserted" }));
    act(() => root.render(React.createElement(Probe, { call })));
    let answered: unknown;
    await act(async () => {
      void tool("datalayer_insertCell")
        .handler({ source: "1+1" })
        .then((value) => {
          answered = value;
        });
    });
    expect(call).not.toHaveBeenCalled();
    expect(latest.asks).toHaveLength(1);
    const ask = latest.asks[0]!;
    expect(isDocumentToolAsk(ask.id)).toBe(true);
    expect(ask).toMatchObject({
      toolName: "datalayer_insertCell",
      args: { source: "1+1" },
      agentId: "agent-1",
    });
    await act(async () => {
      expect(latest.decide(ask.id, true)).toBe(true);
    });
    expect(call).toHaveBeenCalledWith("datalayer_insertCell", {
      source: "1+1",
    });
    expect(answered).toMatchObject({ success: true, result: "inserted" });
    expect(latest.asks).toEqual([]);
  });

  it("changes nothing when the person declines", async () => {
    const call = vi.fn();
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
    expect(call).not.toHaveBeenCalled();
    expect(answered).toEqual({
      success: false,
      error: DOCUMENT_TOOL_WORDS.refused("datalayer_updateBlock"),
    });
  });

  it("declines what was asked when another agent is talked to", async () => {
    const call = vi.fn();
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
    expect(call).not.toHaveBeenCalled();
  });

  it("leaves another approval to its own route", () => {
    act(() => root.render(React.createElement(Probe, { call: vi.fn() })));
    expect(latest.decide("approval-at-ai-agents", true)).toBe(false);
  });

  it("follows the application's rules: do_it runs, leave_to_me refuses", async () => {
    const call = vi.fn(async () => ({ result: "ok" }));
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
    expect(call).toHaveBeenCalledTimes(1);
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
