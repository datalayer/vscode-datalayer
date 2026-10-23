/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Which webview a tool's call runs in. The document registry tracks the
 * Datalayer editors open and the one focused last (their panels' view
 * state, their disposal), and `VSCodeToolAdapter.run` posts the
 * operation's `tool-execution` to the panel of the editor it was handed —
 * never to whichever one happens to be active.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const tabs = vi.hoisted(() => ({
  active: undefined as { input: unknown } | undefined,
}));

vi.mock("vscode", () => {
  class Uri {
    constructor(private readonly value: string) {}
    static parse(value: string): Uri {
      return new Uri(value);
    }
    get path(): string {
      return this.value.replace(/^[a-z]+:\/\//, "");
    }
    toString(): string {
      return this.value;
    }
  }
  return {
    Uri,
    window: {
      get tabGroups() {
        return { activeTabGroup: { activeTab: tabs.active } };
      },
    },
    workspace: { workspaceFolders: undefined, notebookDocuments: [] },
  };
});

const services = vi.hoisted(() => ({
  container: {} as Record<string, unknown>,
}));

vi.mock("../../src/extension", () => ({
  getServiceContainer: () => services.container,
}));

vi.mock("../../src/services/config/settingsValidator", () => ({
  getValidatedSettingsGroup: () => ({
    responseFormat: "json",
    defaultMinutes: 10,
    defaultType: "CPU",
  }),
}));

vi.mock("../../src/utils/documentAnalysis", () => ({
  analyzeOpenDocuments: () => ({}),
}));

vi.mock("../../src/utils/getAllOpenedDocuments", () => ({
  getAllOpenedDocuments: () => ({ documents: [] }),
}));

vi.mock("../../src/utils/notebookValidation", async () => {
  const { getActiveCustomEditorUri } =
    await import("../../src/utils/activeDocument");
  return {
    getActiveDatalayerNotebook: () => getActiveCustomEditorUri(),
    validateDatalayerNotebook: () => undefined,
  };
});

vi.mock("@datalayer/jupyter-react", () => ({
  formatResponse: (result: unknown) => result,
}));

vi.mock("../../src/services/logging/loggers", () => ({
  ServiceLoggers: {
    main: {
      debug: () => undefined,
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    },
  },
}));

import * as vscode from "vscode";

import { DocumentRegistry } from "../../src/services/documents/documentRegistry";
import { VSCodeToolAdapter } from "../../src/tools/core/toolAdapter";

/** A custom editor's webview panel whose webview answers each call. */
function makePanel(name: string, active = true) {
  const received: Array<Record<string, unknown>> = [];
  const listeners: Array<(message: unknown) => void> = [];
  const viewState: Array<(event: { webviewPanel: unknown }) => void> = [];
  const disposed: Array<() => void> = [];
  const panel = {
    active,
    received,
    webview: {
      onDidReceiveMessage: (listener: (message: unknown) => void) => {
        listeners.push(listener);
        return {
          dispose: () => listeners.splice(listeners.indexOf(listener), 1),
        };
      },
      postMessage: async (message: Record<string, unknown>) => {
        received.push(message);
        queueMicrotask(() => {
          for (const listener of [...listeners]) {
            listener({
              type: "tool-execution-response",
              requestId: message.requestId,
              result: `${name}'s cells`,
            });
          }
        });
        return true;
      },
    },
    onDidChangeViewState: (
      listener: (event: { webviewPanel: unknown }) => void,
    ) => {
      viewState.push(listener);
      return { dispose: () => undefined };
    },
    onDidDispose: (listener: () => void) => {
      disposed.push(listener);
      return { dispose: () => undefined };
    },
    /** The person focuses it (`true`) or moves away (`false`). */
    view(nowActive: boolean) {
      panel.active = nowActive;
      for (const listener of viewState) {
        listener({ webviewPanel: panel });
      }
    },
    /** The person closes it. */
    close() {
      for (const listener of disposed) {
        listener();
      }
    },
  };
  return panel;
}

/** Makes a Datalayer editor's tab the active one. */
function activate(uri: string, viewType = "datalayer.jupyter-notebook") {
  tabs.active = { input: { uri: vscode.Uri.parse(uri), viewType } };
}

const A = "file:///work/a.ipynb";
const B = "datalayer://space/b.ipynb";
const D = "file:///work/notes.dlex";

describe("the document registry's open editors", () => {
  let registry: DocumentRegistry;

  beforeEach(() => {
    registry = new DocumentRegistry();
  });

  const focusOf = (uri: string) =>
    registry.openEditors().find((entry) => entry.documentUri === uri)
      ?.focusedAt;

  it("orders the editors by when they were last focused", () => {
    const a = makePanel("a");
    const b = makePanel("b");
    registry.register(A, A, "notebook", a as never);
    registry.register("uid-b", B, "notebook", b as never);
    expect(focusOf(B)!).toBeGreaterThan(focusOf(A)!);
    a.view(true);
    expect(focusOf(A)!).toBeGreaterThan(focusOf(B)!);
    // Focus moving into the chat sidebar changes nothing.
    a.view(false);
    expect(focusOf(A)!).toBeGreaterThan(focusOf(B)!);
  });

  it("counts an editor opened in the background as never focused", () => {
    registry.register(D, D, "lexical", makePanel("d", false) as never);
    expect(registry.openEditors()).toEqual([
      { documentUri: D, type: "lexical", focusedAt: 0 },
    ]);
  });

  it("forgets an editor once closed, and never routes to its webview", () => {
    const a = makePanel("a");
    registry.register(A, A, "notebook", a as never);
    a.close();
    expect(registry.openEditors()).toEqual([]);
    expect(registry.getWebviewPanel(A)).toBeUndefined();
  });

  it("keeps a reopened editor when its old panel is disposed late", () => {
    const old = makePanel("old");
    const reopened = makePanel("new");
    registry.register(A, A, "notebook", old as never);
    registry.register(A, A, "notebook", reopened as never);
    old.close();
    expect(registry.getWebviewPanel(A)).toBe(reopened);
  });
});

describe("VSCodeToolAdapter's routing", () => {
  let registry: DocumentRegistry;
  let a: ReturnType<typeof makePanel>;
  let b: ReturnType<typeof makePanel>;
  const definition = {
    name: "datalayer_readAllCells",
    displayName: "Read all cells",
    description: "Read all cells",
    operation: "readAllCells",
    parameters: { type: "object", properties: {} },
    tags: ["cell", "notebook", "read"],
  };
  const operation = {
    name: "readAllCells",
    execute: async (
      _params: unknown,
      context: {
        documentId?: string;
        executor: { execute: (c: string, a: unknown) => Promise<unknown> };
      },
    ) => ({
      documentId: context.documentId,
      cells: await context.executor.execute("readAllCells", {}),
    }),
  };

  beforeEach(() => {
    registry = new DocumentRegistry();
    a = makePanel("a");
    b = makePanel("b");
    registry.register(A, A, "notebook", a as never);
    registry.register("uid-b", B, "notebook", b as never);
    services.container = {
      documentRegistry: registry,
      datalayer: {},
      authProvider: {},
      kernelBridge: {},
    };
  });

  it("posts the call to the panel of the editor it is handed, not the active one", async () => {
    activate(A);
    const adapter = new VSCodeToolAdapter(
      definition as never,
      operation as never,
    );
    const result = await adapter.run({} as never, { uri: B, kind: "notebook" });
    expect(result).toEqual({ documentId: "uid-b", cells: "b's cells" });
    expect(b.received).toHaveLength(1);
    expect(b.received[0]).toMatchObject({
      type: "tool-execution",
      operationName: "readAllCells",
    });
    expect(a.received).toEqual([]);
  });

  it("posts Copilot's call (no editor handed) to the active editor's panel", async () => {
    activate(B);
    const adapter = new VSCodeToolAdapter(
      definition as never,
      operation as never,
    );
    expect(await adapter.run({} as never)).toEqual({
      documentId: "uid-b",
      cells: "b's cells",
    });
    expect(a.received).toEqual([]);
  });

  it("refuses a call for an editor closed meanwhile, posting nothing", async () => {
    activate(A);
    b.close();
    const adapter = new VSCodeToolAdapter(
      definition as never,
      operation as never,
    );
    await expect(
      adapter.run({} as never, { uri: B, kind: "notebook" }),
    ).rejects.toThrow("b.ipynb is not open in a Datalayer editor");
    expect(a.received).toEqual([]);
  });
});
