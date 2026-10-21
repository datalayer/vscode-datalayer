/// <reference types="vitest/globals" />

/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * A coding agent's displays in the editor: the display read from a tool's
 * result (an object or its JSON), the diff view's documents and title, the
 * *after* side's choice (the disk when it holds what the agent wrote), and
 * the terminal's writes from a sequence of displays.
 */

import {
  afterSideOf,
  bytesOf,
  DIFF_WORDS,
  diffDocumentPath,
  diffKeyOf,
  diffShownOf,
  diffTitle,
  displayOfToolCall,
  TERMINAL_WORDS,
  type TerminalShown,
  terminalShownOf,
  terminalWrites,
} from "../../src/chat/sessionDisplays";

const DIFF_TYPE = "application/vnd.datalayer.shield.diff+json";
const TERMINAL_TYPE = "application/vnd.datalayer.shield.terminal+json";

const diffResult = {
  ok: true,
  _meta: {
    "reactor.ui/display": {
      type: DIFF_TYPE,
      version: 1,
      id: "d-1",
      text: "Edited hello.py",
      data: { path: "src/hello.py", old_text: "a\n", new_text: "b\n" },
    },
  },
};

describe("the display of a tool call", () => {
  it("reads the diff a result carries, as an object or as its JSON", () => {
    const read = displayOfToolCall("Edit hello.py", diffResult);
    expect(read).toMatchObject({
      kind: "diff",
      path: "src/hello.py",
      oldText: "a\n",
      newText: "b\n",
      language: "python",
    });
    expect(
      displayOfToolCall("Edit hello.py", JSON.stringify(diffResult)),
    ).toEqual(read);
  });

  it("reads a terminal, running then released", () => {
    const running = displayOfToolCall("Run pytest", {
      _meta: {
        "reactor.ui/display": {
          type: TERMINAL_TYPE,
          version: 1,
          id: "t-1",
          data: {
            terminal_id: "term-1",
            command: "pytest",
            output: "..",
            exit_code: null,
          },
        },
      },
    });
    expect(running).toMatchObject({
      kind: "terminal",
      command: "pytest",
      exitCode: null,
    });
  });

  it("is null for a result without a display, or one that does not read", () => {
    expect(displayOfToolCall("read_file", { text: "hello" })).toBeNull();
    expect(displayOfToolCall("read_file", "not json")).toBeNull();
    expect(displayOfToolCall("read_file", 42)).toBeNull();
  });
});

describe("a display posted from the chat", () => {
  it("is read strictly as a diff", () => {
    expect(
      diffShownOf({
        kind: "diff",
        id: "d",
        path: " a.py ",
        oldText: null,
        newText: "x",
      }),
    ).toEqual({
      kind: "diff",
      id: "d",
      path: "a.py",
      oldText: null,
      newText: "x",
      language: "text",
    });
    expect(diffShownOf({ kind: "diff", path: "a.py" })).toBeNull();
    expect(diffShownOf({ kind: "terminal" })).toBeNull();
    expect(diffShownOf("diff")).toBeNull();
  });

  it("is read strictly as a terminal", () => {
    expect(
      terminalShownOf({
        kind: "terminal",
        terminalId: "t",
        command: "ls",
        output: "a",
        exitCode: 0,
      }),
    ).toMatchObject({
      terminalId: "t",
      command: "ls",
      output: "a",
      exitCode: 0,
      released: false,
    });
    expect(
      terminalShownOf({ kind: "terminal", terminalId: "t", exitCode: "0" })
        ?.exitCode,
    ).toBeNull();
    expect(terminalShownOf({ kind: "terminal" })).toBeNull();
  });
});

describe("the diff view", () => {
  it("names each side's document by the diff and the file, and reads it back", () => {
    const path = diffDocumentPath("d 1", "after", "src/hello.py");
    expect(path).toBe("/d%201/after/hello.py");
    expect(diffKeyOf(path)).toEqual({ id: "d 1", side: "after" });
    expect(diffKeyOf("/d/elsewhere/hello.py")).toBeNull();
    expect(diffKeyOf("/d/after")).toBeNull();
  });

  it("titles the view by the file, the harness and the turn", () => {
    expect(diffTitle({ path: "src/hello.py" }, "claude-code", 3)).toBe(
      "src/hello.py — before · after (claude-code, turn 3)",
    );
    expect(diffTitle({ path: "src/hello.py" })).toBe(
      "src/hello.py — before · after",
    );
    expect(diffTitle({ path: "src/hello.py" }, "", 2)).toBe(
      "src/hello.py — before · after (turn 2)",
    );
  });

  it("takes the disk as the after side only when it holds what the agent wrote", () => {
    const shown = { newText: "print('hi')\n" };
    expect(afterSideOf(shown, "print('hi')\n")).toEqual({
      text: "print('hi')\n",
      fromDisk: true,
      said: DIFF_WORDS.disk,
    });
    expect(afterSideOf(shown, "print('bye')\n")).toEqual({
      text: "print('hi')\n",
      fromDisk: false,
      said: DIFF_WORDS.differs(
        bytesOf("print('bye')\n"),
        bytesOf("print('hi')\n"),
      ),
    });
    expect(afterSideOf(shown, null)).toEqual({
      text: "print('hi')\n",
      fromDisk: false,
      said: DIFF_WORDS.notHere,
    });
    // On Datalayer the workspace is the runtime's: the disk is not read.
    expect(afterSideOf(shown, "print('hi')\n", false)).toEqual({
      text: "print('hi')\n",
      fromDisk: false,
      said: DIFF_WORDS.datalayer,
    });
  });

  it("counts bytes, not characters", () => {
    expect(bytesOf("é")).toBe(2);
    expect(bytesOf("")).toBe(0);
  });
});

describe("the session's terminal", () => {
  const terminal = (
    output: string,
    exitCode: number | null,
  ): TerminalShown => ({
    kind: "terminal",
    id: "t",
    terminalId: "term-1",
    command: "pytest -q",
    output,
    exitCode,
    released: exitCode !== null,
  });

  it("echoes the command once, streams the output, writes the exit", () => {
    const first = terminalWrites(undefined, terminal("..", null));
    expect(first.chunks).toEqual(["$ pytest -q\r\n", ".."]);
    const second = terminalWrites(first.next, terminal("..\n2 passed\n", null));
    expect(second.chunks).toEqual(["\r\n2 passed\r\n"]);
    const third = terminalWrites(second.next, terminal("..\n2 passed\n", 0));
    expect(third.chunks).toEqual(["[exit 0]\r\n"]);
    expect(third.next).toEqual({
      terminalId: "term-1",
      echoed: true,
      output: "..\n2 passed\n",
      ended: true,
    });
    // Nothing more once ended.
    expect(
      terminalWrites(third.next, terminal("..\n2 passed\n", 0)).chunks,
    ).toEqual([]);
  });

  it("writes the output whole again when it no longer continues what was written", () => {
    const first = terminalWrites(undefined, terminal("abc", null));
    const again = terminalWrites(first.next, terminal("xyz", 1));
    expect(again.chunks).toEqual(["\r\nxyz", "\r\n[exit 1]\r\n"]);
  });

  it("names the terminal and refuses typing in a sentence", () => {
    expect(TERMINAL_WORDS.name("Fix the tests")).toBe(
      "Datalayer: Fix the tests",
    );
    expect(TERMINAL_WORDS.readOnly).toBe(
      "This terminal shows what the agent ran; its commands are decided in the chat.",
    );
  });
});
