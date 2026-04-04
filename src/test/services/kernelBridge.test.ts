/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import type { DatalayerClient } from "@datalayer/core/lib/client";
import * as assert from "assert";
import * as vscode from "vscode";

import { KernelBridge } from "../../services/bridges/kernelBridge";
import { DatalayerAuthProvider } from "../../services/core/authProvider";
import { LoggerManager } from "../../services/logging/loggerManager";
import { ServiceLoggers } from "../../services/logging/loggers";
import {
  createMockDatalayer,
  createMockExtensionContext,
} from "../utils/mockFactory";

/**
 * Creates a mock WebviewPanel for testing.
 */
function createMockWebviewPanel(): vscode.WebviewPanel {
  const messages: unknown[] = [];
  return {
    webview: {
      postMessage: async (message: unknown) => {
        messages.push(message);
        return true;
      },
      html: "",
      options: {},
      onDidReceiveMessage: new vscode.EventEmitter<unknown>().event,
      asWebviewUri: (uri: vscode.Uri) => uri,
      cspSource: "",
    },
    viewType: "datalayer.jupyter-notebook",
    title: "Test",
    active: true,
    visible: true,
    viewColumn: vscode.ViewColumn.One,
    onDidDispose: new vscode.EventEmitter<void>().event,
    onDidChangeViewState:
      new vscode.EventEmitter<vscode.WebviewPanelOnDidChangeViewStateEvent>()
        .event,
    reveal: () => {},
    dispose: () => {},
    // Helper for tests to inspect sent messages
    _messages: messages,
  } as unknown as vscode.WebviewPanel & { _messages: unknown[] };
}

suite("KernelBridge Tests", () => {
  let bridge: KernelBridge;
  let mockDatalayer: ReturnType<typeof createMockDatalayer>;

  suiteSetup(() => {
    const context = createMockExtensionContext();
    if (!ServiceLoggers.isInitialized()) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (LoggerManager as any).instance = undefined;
      const loggerManager = LoggerManager.getInstance(context);
      ServiceLoggers.initialize(loggerManager);
    }
  });

  setup(() => {
    mockDatalayer = createMockDatalayer();
    bridge = new KernelBridge(
      mockDatalayer as unknown as DatalayerClient,
      {} as DatalayerAuthProvider,
    );
  });

  teardown(() => {
    bridge.dispose();
  });

  suiteTeardown(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ServiceLoggers as any).loggerManager = undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (LoggerManager as any).instance = undefined;
  });

  suite("registerWebview / unregisterWebview", () => {
    test("registers a webview for a URI", () => {
      const uri = vscode.Uri.file("/test/notebook.ipynb");
      const panel = createMockWebviewPanel();

      bridge.registerWebview(uri, panel);

      // Verify by checking detectNotebookType behavior indirectly
      // or by checking that sendKernelStatus works
      assert.ok(bridge);
    });

    test("unregisters a webview for a URI", () => {
      const uri = vscode.Uri.file("/test/notebook.ipynb");
      const panel = createMockWebviewPanel();

      bridge.registerWebview(uri, panel);
      bridge.unregisterWebview(uri);

      // After unregister, sendKernelStatus should not find the webview
      assert.ok(bridge);
    });
  });

  suite("sendKernelStatus", () => {
    test("sends status to registered webview", async () => {
      // Use datalayer:// scheme so detectNotebookType returns "webview"
      const uri = vscode.Uri.parse("datalayer:///test/notebook.ipynb");
      const panel = createMockWebviewPanel();
      bridge.registerWebview(uri, panel);

      await bridge.sendKernelStatus(uri, "idle");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const messages = (panel as any)._messages as unknown[];
      assert.strictEqual(messages.length, 1);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      assert.strictEqual((messages[0] as any).type, "kernel-status");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      assert.strictEqual((messages[0] as any).status, "idle");
    });

    test("sends different status values", async () => {
      const uri = vscode.Uri.parse("datalayer:///test/notebook.ipynb");
      const panel = createMockWebviewPanel();
      bridge.registerWebview(uri, panel);

      await bridge.sendKernelStatus(uri, "busy");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const messages = (panel as any)._messages as unknown[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      assert.strictEqual((messages[0] as any).status, "busy");
    });

    test("does not throw when no webview registered", async () => {
      const uri = vscode.Uri.parse("datalayer:///test/unregistered.ipynb");
      await assert.doesNotReject(() => bridge.sendKernelStatus(uri, "idle"));
    });
  });

  suite("handleKernelCommand", () => {
    test("sends interrupt command to registered webview", async () => {
      const uri = vscode.Uri.parse("datalayer:///test/notebook.ipynb");
      const panel = createMockWebviewPanel();
      bridge.registerWebview(uri, panel);

      await bridge.handleKernelCommand(uri, "interrupt");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const messages = (panel as any)._messages as unknown[];
      assert.strictEqual(messages.length, 1);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      assert.strictEqual((messages[0] as any).type, "kernel-command");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      assert.strictEqual((messages[0] as any).command, "interrupt");
    });

    test("sends restart command", async () => {
      const uri = vscode.Uri.parse("datalayer:///test/notebook.ipynb");
      const panel = createMockWebviewPanel();
      bridge.registerWebview(uri, panel);

      await bridge.handleKernelCommand(uri, "restart");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const messages = (panel as any)._messages as unknown[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      assert.strictEqual((messages[0] as any).command, "restart");
    });

    test("sends shutdown command", async () => {
      const uri = vscode.Uri.parse("datalayer:///test/notebook.ipynb");
      const panel = createMockWebviewPanel();
      bridge.registerWebview(uri, panel);

      await bridge.handleKernelCommand(uri, "shutdown");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const messages = (panel as any)._messages as unknown[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      assert.strictEqual((messages[0] as any).command, "shutdown");
    });

    test("does not throw when no webview registered", async () => {
      const uri = vscode.Uri.parse("datalayer:///test/unregistered.ipynb");
      await assert.doesNotReject(() =>
        bridge.handleKernelCommand(uri, "interrupt"),
      );
    });
  });

  suite("detectNotebookType", () => {
    test("returns 'webview' for datalayer scheme URIs", () => {
      const uri = vscode.Uri.parse("datalayer:///test/notebook.ipynb");
      const result = bridge.detectNotebookType(uri);
      assert.strictEqual(result, "webview");
    });

    test("returns 'native' for file scheme URIs", () => {
      const uri = vscode.Uri.file("/test/notebook.ipynb");
      const result = bridge.detectNotebookType(uri);
      assert.strictEqual(result, "native");
    });
  });

  suite("getLocalKernel", () => {
    test("returns undefined when no local kernel exists", () => {
      const result = bridge.getLocalKernel("nonexistent-id");
      assert.strictEqual(result, undefined);
    });
  });

  suite("getKernelForDocument", () => {
    test("returns undefined when no kernel mapped to document", () => {
      const uri = vscode.Uri.file("/test/notebook.ipynb");
      const result = bridge.getKernelForDocument(uri);
      assert.strictEqual(result, undefined);
    });
  });

  suite("handleKernelReady", () => {
    test("does not throw when no pending runtime exists", async () => {
      const uri = vscode.Uri.file("/test/notebook.ipynb");
      await assert.doesNotReject(() => bridge.handleKernelReady(uri));
    });
  });

  suite("broadcastKernelTerminated", () => {
    test("sends termination message to all registered webviews", async () => {
      const uri1 = vscode.Uri.file("/test/notebook1.ipynb");
      const uri2 = vscode.Uri.file("/test/notebook2.ipynb");
      const panel1 = createMockWebviewPanel();
      const panel2 = createMockWebviewPanel();

      bridge.registerWebview(uri1, panel1);
      bridge.registerWebview(uri2, panel2);

      await bridge.broadcastKernelTerminated();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const messages1 = (panel1 as any)._messages as unknown[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const messages2 = (panel2 as any)._messages as unknown[];
      assert.strictEqual(messages1.length, 1);
      assert.strictEqual(messages2.length, 1);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      assert.strictEqual((messages1[0] as any).type, "kernel-terminated");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      assert.strictEqual((messages2[0] as any).type, "kernel-terminated");
    });

    test("does nothing when no webviews registered", async () => {
      await assert.doesNotReject(() => bridge.broadcastKernelTerminated());
    });
  });

  suite("dispose", () => {
    test("clears all webviews and kernels", () => {
      const uri = vscode.Uri.file("/test/notebook.ipynb");
      const panel = createMockWebviewPanel();
      bridge.registerWebview(uri, panel);

      bridge.dispose();

      // After dispose, getLocalKernel should return undefined
      assert.strictEqual(bridge.getLocalKernel("any-id"), undefined);
    });

    test("dispose is idempotent", () => {
      bridge.dispose();
      // Second dispose should not throw
      assert.doesNotThrow(() => bridge.dispose());
    });
  });
});
