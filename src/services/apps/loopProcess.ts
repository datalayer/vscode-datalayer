/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Running `loop` as a child of the extension host (VSCODE VS-11): spawning
 * it with a line reader over its output, and picking a free loopback port.
 * Where `loop` is and whether it answers is `LocalRuntimeService.detect`'s
 * (VS-02). No `vscode` import: the commands own the editor.
 *
 * @module services/apps/loopProcess
 */

import { type ChildProcess, spawn } from "child_process";
import { createServer } from "net";

/**
 * A free loopback port, picked by the OS.
 *
 * @returns The port number, free at the moment it was picked.
 */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

/** A running `loop` process, its lines read as they come. */
export interface LoopProcess {
  child: ChildProcess;
  /** Resolves with the exit code (null when killed) once the process ends. */
  exited: Promise<number | null>;
  /** Ends the process. */
  stop(): void;
}

/**
 * Spawns `loop` with its arguments, reading stdout and stderr line by line.
 *
 * @param loopPath - Where `loop` is.
 * @param args - Its arguments.
 * @param options - The working directory, the environment, the line reader.
 * @param options.cwd - The working directory.
 * @param options.env - The environment the process gets.
 * @param options.onLine - Told each line of stdout and stderr.
 *
 * @returns The process.
 */
export function spawnLoop(
  loopPath: string,
  args: readonly string[],
  options: {
    cwd: string;
    env: Record<string, string>;
    onLine: (line: string, stream: "stdout" | "stderr") => void;
  },
): LoopProcess {
  // A `.cmd` on Windows runs through the shell (Node refuses to spawn one
  // without it, EINVAL), as the local runtime's does; the shell joins the
  // command and its arguments, so one with a space is quoted.
  const viaShell =
    process.platform === "win32" && /\.(cmd|bat)$/i.test(loopPath);
  const quoted = (value: string): string =>
    /\s/.test(value) ? `"${value}"` : value;
  const child = spawn(
    viaShell ? quoted(loopPath) : loopPath,
    viaShell ? args.map(quoted) : [...args],
    {
      cwd: options.cwd,
      env: options.env,
      windowsHide: true,
      shell: viaShell,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const read = (
    stream: "stdout" | "stderr",
    chunkSource: NodeJS.ReadableStream | null,
  ) => {
    if (!chunkSource) {
      return;
    }
    let rest = "";
    chunkSource.setEncoding("utf8");
    chunkSource.on("data", (chunk: string) => {
      rest += chunk;
      const lines = rest.split(/\r?\n/);
      rest = lines.pop() ?? "";
      for (const line of lines) {
        options.onLine(line, stream);
      }
    });
    chunkSource.on("end", () => {
      if (rest) {
        options.onLine(rest, stream);
        rest = "";
      }
    });
  };
  read("stdout", child.stdout);
  read("stderr", child.stderr);
  const exited = new Promise<number | null>((resolve) => {
    child.on("exit", (code) => resolve(code));
    child.on("error", () => resolve(null));
  });
  return {
    child,
    exited,
    stop: () => {
      if (child.exitCode === null && !child.killed) {
        child.kill();
      }
    },
  };
}
