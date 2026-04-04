/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Tests for WebSocketKernelClient types and interfaces.
 * Since the class requires real WebSocket connections and a Datalayer client,
 * these tests focus on the exported types and basic construction validation.
 */

import * as assert from "assert";

import type {
  ExecutionOutput,
  ExecutionResult,
  JupyterMessage,
} from "../../kernel/clients/websocketKernelClient";

suite("WebSocketKernelClient Types Tests", () => {
  suite("JupyterMessage type", () => {
    test("can create a valid execute_request message", () => {
      const msg: JupyterMessage = {
        header: {
          msg_id: "test-msg-1",
          msg_type: "execute_request",
          username: "vscode",
          session: "test-session-123",
          date: new Date().toISOString(),
          version: "5.3",
        },
        parent_header: {},
        metadata: {},
        content: {
          code: "print('hello')",
          silent: false,
          store_history: true,
        },
        channel: "shell",
      };

      assert.strictEqual(msg.header.msg_id, "test-msg-1");
      assert.strictEqual(msg.header.msg_type, "execute_request");
      assert.strictEqual(msg.header.username, "vscode");
      assert.strictEqual(msg.header.version, "5.3");
      assert.strictEqual(msg.channel, "shell");
    });

    test("can create a kernel_info_reply message", () => {
      const msg: JupyterMessage = {
        header: {
          msg_id: "reply-1",
          msg_type: "kernel_info_reply",
          username: "kernel",
          session: "session-abc",
          date: "2025-01-15T10:00:00.000Z",
          version: "5.3",
        },
        parent_header: {
          msg_id: "request-1",
          msg_type: "kernel_info_request",
        },
        metadata: {},
        content: {
          protocol_version: "5.3",
          implementation: "ipython",
          language_info: { name: "python" },
        },
      };

      assert.strictEqual(msg.header.msg_type, "kernel_info_reply");
      assert.ok(msg.content);
    });

    test("supports optional buffers field", () => {
      const msg: JupyterMessage = {
        header: {
          msg_id: "buf-1",
          msg_type: "execute_result",
          username: "kernel",
          session: "session-1",
          date: "2025-01-15T10:00:00.000Z",
          version: "5.3",
        },
        parent_header: {},
        metadata: {},
        content: {},
        buffers: [Buffer.from("test")],
      };

      assert.ok(msg.buffers);
      assert.strictEqual(msg.buffers.length, 1);
    });

    test("channel field is optional", () => {
      const msg: JupyterMessage = {
        header: {
          msg_id: "no-channel",
          msg_type: "status",
          username: "kernel",
          session: "session-1",
          date: "2025-01-15T10:00:00.000Z",
          version: "5.3",
        },
        parent_header: {},
        metadata: {},
        content: { execution_state: "idle" },
      };

      assert.strictEqual(msg.channel, undefined);
    });
  });

  suite("ExecutionOutput type", () => {
    test("can create a stream output", () => {
      const output: ExecutionOutput = {
        type: "stream",
        name: "stdout",
        text: "Hello, World!\n",
      };

      assert.strictEqual(output.type, "stream");
      assert.strictEqual(output.name, "stdout");
      assert.strictEqual(output.text, "Hello, World!\n");
    });

    test("can create a stderr stream output", () => {
      const output: ExecutionOutput = {
        type: "stream",
        name: "stderr",
        text: "Warning: deprecated API\n",
      };

      assert.strictEqual(output.type, "stream");
      assert.strictEqual(output.name, "stderr");
    });

    test("can create an execute_result output", () => {
      const output: ExecutionOutput = {
        type: "execute_result",
        data: { "text/plain": "42" },
      };

      assert.strictEqual(output.type, "execute_result");
      assert.ok(output.data);
    });

    test("can create a display_data output", () => {
      const output: ExecutionOutput = {
        type: "display_data",
        data: { "text/html": "<b>bold</b>", "text/plain": "bold" },
      };

      assert.strictEqual(output.type, "display_data");
      const data = output.data as Record<string, string>;
      assert.strictEqual(data["text/html"], "<b>bold</b>");
    });

    test("can create an error output", () => {
      const output: ExecutionOutput = {
        type: "error",
        ename: "NameError",
        evalue: "name 'x' is not defined",
        traceback: [
          "Traceback (most recent call last):",
          '  File "<stdin>", line 1, in <module>',
          "NameError: name 'x' is not defined",
        ],
      };

      assert.strictEqual(output.type, "error");
      assert.strictEqual(output.ename, "NameError");
      assert.strictEqual(output.evalue, "name 'x' is not defined");
      assert.strictEqual(output.traceback!.length, 3);
    });

    test("error output with empty traceback", () => {
      const output: ExecutionOutput = {
        type: "error",
        ename: "SystemError",
        evalue: "unknown error",
        traceback: [],
      };

      assert.strictEqual(output.traceback!.length, 0);
    });
  });

  suite("ExecutionResult type", () => {
    test("can create a successful result with outputs", () => {
      const result: ExecutionResult = {
        outputs: [
          { type: "stream", name: "stdout", text: "hello\n" },
          { type: "execute_result", data: { "text/plain": "42" } },
        ],
        success: true,
      };

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.outputs.length, 2);
    });

    test("can create a failed result with error output", () => {
      const result: ExecutionResult = {
        outputs: [
          {
            type: "error",
            ename: "ValueError",
            evalue: "invalid literal",
            traceback: ["ValueError: invalid literal"],
          },
        ],
        success: false,
      };

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.outputs.length, 1);
      assert.strictEqual(result.outputs[0].type, "error");
    });

    test("can create a result with no outputs", () => {
      const result: ExecutionResult = {
        outputs: [],
        success: true,
      };

      assert.strictEqual(result.outputs.length, 0);
      assert.strictEqual(result.success, true);
    });

    test("can create a result with mixed output types", () => {
      const result: ExecutionResult = {
        outputs: [
          { type: "stream", name: "stdout", text: "loading...\n" },
          {
            type: "display_data",
            data: { "image/png": "base64data" },
          },
          { type: "stream", name: "stderr", text: "warning\n" },
          { type: "execute_result", data: { "text/plain": "done" } },
        ],
        success: true,
      };

      assert.strictEqual(result.outputs.length, 4);
      assert.strictEqual(result.outputs[0].type, "stream");
      assert.strictEqual(result.outputs[1].type, "display_data");
      assert.strictEqual(result.outputs[2].type, "stream");
      assert.strictEqual(result.outputs[3].type, "execute_result");
    });
  });
});
