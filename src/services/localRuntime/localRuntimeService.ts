/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * The local runtime (VS-02) and the harness on this machine (VS-03): one
 * `loop serve` per workspace folder, started by the extension when a
 * session or a Try asks for it (never at activation), its port read from its
 * first line that names one, its output in the *Datalayer: Local runtime*
 * channel, stopped on deactivation, on *Datalayer: Stop the local runtime*
 * and when the folder closes. `loop` is found and judged by `detect.ts`;
 * the harness catalogue is read from the runtime's `GET /api/v1/harnesses`
 * or, until the installed release serves it, from `loop harnesses`; what
 * the machine has for a harness is read here and judged by `harnessCheck.ts`.
 *
 * @module services/localRuntime/localRuntimeService
 */

import { type ChildProcess, execFile, spawn } from "child_process";
import { promises as fs } from "fs";
import * as os from "os";
import * as readline from "readline";
import * as vscode from "vscode";

import { getValidatedSettingsGroup } from "../config/settingsValidator";
import { BaseService } from "../core/baseService";
import type { ILogger } from "../interfaces/ILogger";
import {
  candidateLoopPaths,
  type CredentialSource,
  DISABLED_SENTENCE,
  INSTALL_LINE,
  type LocalRuntimeHandle,
  localRuntimeHandle,
  LOOP_SERVE_ARGUMENTS,
  type LoopDetection,
  loopDetection,
  type LoopRefusalReason,
  portOf,
  runtimeEnvironment,
} from "./detect";
import {
  credentialSecretKey,
  harnessesOf,
  type HarnessFacts,
  type HarnessMachine,
  parseLoopHarnesses,
  shieldPrefixOf,
} from "./harnessCheck";

/** A sign-in the service reads from: the token, when there is one. */
export interface TokenSource {
  getToken(): string;
  isAuthenticated(): boolean;
}

/** A local runtime running for one folder. */
export interface LocalRuntime {
  folder: vscode.WorkspaceFolder;
  /** `http://127.0.0.1:<port>`. */
  url: string;
  port: number;
  pid: number;
  loopPath: string;
  /** agent-runtimes' version, as `loop --version` said it. */
  version: string;
  /** Where each declared credential came from. */
  credentials: Record<string, CredentialSource>;
}

/** The local runtime is not started: the sentence says why and what to do. */
export class LocalRuntimeRefused extends Error {
  /**
   * @param reason - Why.
   * @param sentence - The sentence shown.
   */
  constructor(
    public readonly reason: LoopRefusalReason | "failed",
    sentence: string,
  ) {
    super(sentence);
    this.name = "LocalRuntimeRefused";
  }
}

/** How long the runtime has to name its port and answer `/health`. */
const START_TIMEOUT_MS = 90_000;

/** How long a command (`loop --version`, `loop harnesses`, `node --version`) has. */
const COMMAND_TIMEOUT_MS = 30_000;

interface Running {
  runtime: LocalRuntime;
  child: ChildProcess;
}

/**
 * Starts, lists and stops the local runtimes, one per workspace folder, and
 * reads what the machine has for a harness.
 */
export class LocalRuntimeService extends BaseService {
  private readonly running = new Map<string, Running>();
  private readonly starting = new Map<string, Promise<LocalRuntime>>();
  private readonly changed = new vscode.EventEmitter<void>();
  private readonly subscriptions: vscode.Disposable[] = [];
  private channel: vscode.OutputChannel | undefined;
  private harnessCache: HarnessFacts[] | null = null;

  /** Fires when a local runtime starts or stops. */
  readonly onDidChange: vscode.Event<void> = this.changed.event;

  /**
   * @param context - The extension context (secret storage).
   * @param auth - The sign-in, for the token handed to the runtime.
   * @param logger - Where the service's lines go.
   */
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly auth: TokenSource,
    logger: ILogger,
  ) {
    super("LocalRuntimeService", logger);
  }

  /** @inheritdoc */
  protected async onInitialize(): Promise<void> {
    this.subscriptions.push(
      vscode.workspace.onDidChangeWorkspaceFolders((event) => {
        for (const folder of event.removed) {
          void this.stop(folder);
        }
      }),
    );
  }

  /** @inheritdoc */
  protected async onDispose(): Promise<void> {
    for (const subscription of this.subscriptions) {
      subscription.dispose();
    }
    await this.stop();
    this.channel?.dispose();
    this.changed.dispose();
  }

  /**
   * The local runtimes running now.
   *
   * @returns One per folder started.
   */
  list(): LocalRuntime[] {
    return [...this.running.values()].map((entry) => entry.runtime);
  }

  /**
   * The chat's handles for the running local runtimes: a place beside Datalayer's runtimes.
   *
   * @returns One handle per runtime, no token.
   */
  handles(): LocalRuntimeHandle[] {
    return this.list().map((runtime) =>
      localRuntimeHandle(
        runtime.folder.name,
        runtime.folder.uri.fsPath,
        runtime.url,
      ),
    );
  }

  /**
   * The runtime of a folder, when one runs.
   *
   * @param folder - The workspace folder.
   *
   * @returns The runtime, or undefined.
   */
  runtimeOf(folder: vscode.WorkspaceFolder): LocalRuntime | undefined {
    return this.running.get(folder.uri.fsPath)?.runtime;
  }

  /**
   * Finds `loop` and judges it: the configured path, `PATH`, uv tool's and pipx's bins.
   *
   * @returns The detection, with the refusal's sentence when it is refused.
   */
  async detect(): Promise<LoopDetection> {
    const settings = getValidatedSettingsGroup("local");
    if (!settings.enabled) {
      return { ok: false, reason: "disabled", sentence: DISABLED_SENTENCE };
    }
    const candidates = candidateLoopPaths({
      platform: process.platform,
      home: os.homedir(),
      pathVariable: process.env.PATH,
      configured: settings.loopPath,
    });
    let found: string | null = null;
    for (const candidate of candidates) {
      if (await exists(candidate)) {
        found = candidate;
        break;
      }
    }
    if (!found) {
      return loopDetection(null);
    }
    const answer = await run(found, ["--version"]);
    return loopDetection({
      path: found,
      versionOutput: answer.ok ? answer.output : null,
      failure: answer.ok ? undefined : answer.output,
    });
  }

  /**
   * The local runtime of a folder, started when it is not running.
   *
   * @param folder - The workspace folder: the harness's workspace.
   *
   * @returns The running local runtime of that folder.
   *
   * @throws LocalRuntimeRefused when `loop` is absent, too old, unanswered, turned off, or the start fails.
   */
  async ensureRunning(folder: vscode.WorkspaceFolder): Promise<LocalRuntime> {
    const key = folder.uri.fsPath;
    const already = this.running.get(key);
    if (already) {
      return already.runtime;
    }
    const pending = this.starting.get(key);
    if (pending) {
      return pending;
    }
    const start = this.start(folder).finally(() => this.starting.delete(key));
    this.starting.set(key, start);
    return start;
  }

  /**
   * Stops a folder's runtime, or every runtime when no folder is named.
   *
   * @param folder - The workspace folder, or nothing for all.
   */
  async stop(folder?: vscode.WorkspaceFolder): Promise<void> {
    const keys = folder ? [folder.uri.fsPath] : [...this.running.keys()];
    for (const key of keys) {
      const entry = this.running.get(key);
      if (!entry) {
        continue;
      }
      this.running.delete(key);
      this.log(
        `Stopping the local runtime of ${entry.runtime.folder.name} (pid ${entry.runtime.pid}).`,
      );
      await terminate(entry.child);
    }
    if (keys.length > 0) {
      this.changed.fire();
    }
  }

  /**
   * The harness catalogue: the runtime's `GET /api/v1/harnesses` when one
   * runs and serves it; else, boxed to be replaced, `loop harnesses`'s table.
   *
   * @returns The harnesses, with their terms, register entries and capabilities.
   *
   * @throws LocalRuntimeRefused when `loop` is refused and no runtime runs.
   */
  async harnesses(): Promise<HarnessFacts[]> {
    const runtime = this.list()[0];
    if (runtime) {
      try {
        const response = await fetch(`${runtime.url}/api/v1/harnesses`);
        if (response.ok) {
          this.harnessCache = harnessesOf(await response.json());
          return this.harnessCache;
        }
        if (response.status !== 404) {
          throw new Error(
            `the runtime answered ${response.status} for /api/v1/harnesses`,
          );
        }
        // The installed release does not serve the route yet: the table.
      } catch (error) {
        this.log(
          `Reading the catalogue from the runtime failed: ${message(error)}`,
        );
      }
    }
    if (this.harnessCache) {
      return this.harnessCache;
    }
    const detection = await this.detect();
    if (!detection.ok) {
      throw new LocalRuntimeRefused(detection.reason, detection.sentence);
    }
    const answer = await run(detection.path, ["harnesses"], { NO_COLOR: "1" });
    if (!answer.ok) {
      throw new LocalRuntimeRefused(
        "failed",
        `\`loop harnesses\` did not answer: ${firstLine(answer.output)} — reinstall it with \`${INSTALL_LINE}\`.`,
      );
    }
    this.harnessCache = parseLoopHarnesses(answer.output);
    return this.harnessCache;
  }

  /**
   * What the machine has for a harness: its binaries and their versions,
   * the environment, the secret storage, the adapter in the Shield's prefix,
   * a subscription login of the vendor's.
   *
   * @param facts - The harness.
   *
   * @returns What `harnessCheck` judges.
   */
  async machineOf(facts: HarnessFacts): Promise<HarnessMachine> {
    const binaries: Record<string, string | null> = {};
    for (const binary of facts.binaries) {
      const answer = await run(binary, ["--version"]);
      binaries[binary] = answer.ok ? answer.output.trim() : null;
    }
    const secrets: Record<string, string | undefined> = {};
    for (const name of facts.secrets) {
      secrets[name] = await this.credential(name);
    }
    return {
      binaries,
      environment: process.env,
      secrets,
      adapterInstalled: await exists(shieldPrefixOf(os.homedir(), facts)),
      subscriptionLogin:
        facts.id === "claude-code" &&
        !process.env.ANTHROPIC_API_KEY &&
        !secrets.ANTHROPIC_API_KEY &&
        (Boolean(process.env.CLAUDE_CODE_OAUTH_TOKEN) ||
          (await exists(`${os.homedir()}/.claude/.credentials.json`))),
    };
  }

  /**
   * A credential from the extension's secret storage.
   *
   * @param name - Its name (`ANTHROPIC_API_KEY`).
   *
   * @returns The value, or undefined.
   */
  async credential(name: string): Promise<string | undefined> {
    return this.context.secrets.get(credentialSecretKey(name));
  }

  /**
   * Keeps a credential in the extension's secret storage — never in settings, never logged.
   *
   * @param name - Its name.
   * @param value - Its value; empty forgets it.
   */
  async storeCredential(name: string, value: string): Promise<void> {
    const key = credentialSecretKey(name);
    if (value) {
      await this.context.secrets.store(key, value);
    } else {
      await this.context.secrets.delete(key);
    }
  }

  /**
   * Starts `loop serve` for a folder and waits until it answers.
   *
   * @param folder - The workspace folder it serves.
   *
   * @returns The running local runtime.
   */
  private async start(folder: vscode.WorkspaceFolder): Promise<LocalRuntime> {
    const detection = await this.detect();
    if (!detection.ok) {
      throw new LocalRuntimeRefused(detection.reason, detection.sentence);
    }
    const declared = new Set<string>();
    try {
      for (const harness of await this.harnesses()) {
        for (const name of harness.secrets) {
          declared.add(name);
        }
      }
    } catch (error) {
      // No catalogue read: no credential handed, said in the channel.
      this.log(`No harness catalogue before the start: ${message(error)}`);
    }
    const secrets: Record<string, string | undefined> = {};
    for (const name of declared) {
      secrets[name] = await this.credential(name);
    }
    const token = this.auth.isAuthenticated() ? this.auth.getToken() : "";
    const { environment, credentials } = runtimeEnvironment({
      host: process.env,
      folder: folder.uri.fsPath,
      declared: [...declared],
      secrets,
      signedIn: token
        ? { token, iamUrl: getValidatedSettingsGroup("services").iamUrl }
        : undefined,
      sessionsPath: process.env.AGENT_RUNTIMES_SESSIONS_PATH,
    });
    this.log(
      `Starting \`loop ${LOOP_SERVE_ARGUMENTS.join(" ")}\` (${detection.path}, agent-runtimes ${detection.version}) in ${folder.uri.fsPath}` +
        (token ? ", signed in" : ", signed out") +
        `; credentials handed: ${Object.keys(credentials).join(", ") || "none"}.`,
    );
    const child = spawn(detection.path, [...LOOP_SERVE_ARGUMENTS], {
      cwd: folder.uri.fsPath,
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32" && /\.cmd$/i.test(detection.path),
    });
    const port = await this.portOf(child, folder);
    const url = `http://127.0.0.1:${port}`;
    await this.awaitHealth(url, child, folder);
    const runtime: LocalRuntime = {
      folder,
      url,
      port,
      pid: child.pid ?? 0,
      loopPath: detection.path,
      version: detection.version,
      credentials,
    };
    this.running.set(folder.uri.fsPath, { runtime, child });
    child.on("exit", (code, signal) => {
      const entry = this.running.get(folder.uri.fsPath);
      if (entry && entry.child === child) {
        this.running.delete(folder.uri.fsPath);
        this.log(
          `The local runtime of ${folder.name} exited (${signal ?? code}).`,
        );
        this.changed.fire();
      }
    });
    this.log(
      `The local runtime of ${folder.name} is at ${url} (pid ${runtime.pid}).`,
    );
    this.changed.fire();
    return runtime;
  }

  /**
   * Reads the port `loop serve` prints, logging its lines meanwhile.
   *
   * @param child - The `loop serve` process.
   * @param folder - The folder it serves, named in the refusal.
   *
   * @returns The port, once printed.
   */
  private portOf(
    child: ChildProcess,
    folder: vscode.WorkspaceFolder,
  ): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      const lastLines: string[] = [];
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          void terminate(child);
          reject(
            new LocalRuntimeRefused(
              "failed",
              `The local runtime of ${folder.name} did not say its port within ${START_TIMEOUT_MS / 1000} s: its output is in the Datalayer: Local runtime channel.`,
            ),
          );
        }
      }, START_TIMEOUT_MS);
      const onLine = (line: string): void => {
        this.log(`[${folder.name}] ${line}`);
        lastLines.push(line);
        if (lastLines.length > 5) {
          lastLines.shift();
        }
        const port = settled ? null : portOf(line);
        if (port !== null) {
          settled = true;
          clearTimeout(timer);
          resolve(port);
        }
      };
      for (const stream of [child.stdout, child.stderr]) {
        if (stream) {
          readline.createInterface({ input: stream }).on("line", onLine);
        }
      }
      child.on("error", (error) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(
            new LocalRuntimeRefused(
              "failed",
              `The local runtime of ${folder.name} could not start: ${error.message}`,
            ),
          );
        }
      });
      child.on("exit", (code, signal) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(
            new LocalRuntimeRefused(
              "failed",
              `The local runtime of ${folder.name} exited (${signal ?? code}) before it said its port: ${lastLines.join(" | ") || "nothing was written"}.`,
            ),
          );
        }
      });
    });
  }

  /**
   * Waits until the runtime answers `/health`, or refuses in a sentence.
   *
   * @param url - The runtime's address.
   * @param child - The `loop serve` process, watched for an early exit.
   * @param folder - The folder it serves, named in the refusal.
   */
  private async awaitHealth(
    url: string,
    child: ChildProcess,
    folder: vscode.WorkspaceFolder,
  ): Promise<void> {
    const until = Date.now() + START_TIMEOUT_MS;
    while (Date.now() < until) {
      if (child.exitCode !== null) {
        throw new LocalRuntimeRefused(
          "failed",
          `The local runtime of ${folder.name} exited (${child.exitCode}) before it answered /health.`,
        );
      }
      try {
        const response = await fetch(`${url}/health`);
        if (response.ok) {
          return;
        }
      } catch {
        // Not up yet.
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    await terminate(child);
    throw new LocalRuntimeRefused(
      "failed",
      `The local runtime of ${folder.name} did not answer /health at ${url} within ${START_TIMEOUT_MS / 1000} s.`,
    );
  }

  /**
   * Writes a line to the *Datalayer: Local runtime* channel, made on first use.
   *
   * @param line - What to write.
   */
  private log(line: string): void {
    if (!this.channel) {
      this.channel = vscode.window.createOutputChannel(
        "Datalayer: Local runtime",
      );
    }
    this.channel.appendLine(line);
  }
}

/**
 * Whether a path exists.
 *
 * @param path - The path looked for.
 *
 * @returns Whether it is there.
 */
async function exists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * What went wrong, in words.
 *
 * @param error - What was thrown.
 *
 * @returns Its message, or the value as a string.
 */
function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The first non-empty line of a command's output.
 *
 * @param output - What the command printed.
 *
 * @returns That line, trimmed, or `""`.
 */
function firstLine(output: string): string {
  return (
    output
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? "nothing was written"
  );
}

/**
 * Runs a command to completion, stdout and stderr together.
 *
 * @param command - The executable.
 * @param args - Its arguments.
 * @param extraEnv - Variables added to the host's.
 *
 * @returns Whether it exited 0, and what it wrote.
 */
function run(
  command: string,
  args: string[],
  extraEnv: Record<string, string> = {},
): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      {
        timeout: COMMAND_TIMEOUT_MS,
        env: { ...process.env, ...extraEnv },
        shell: process.platform === "win32",
        maxBuffer: 4 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        const output = `${stdout}${stderr ? `\n${stderr}` : ""}`;
        resolve({
          ok: !error,
          output: error && !output.trim() ? error.message : output,
        });
      },
    );
  });
}

/**
 * Stops a process: SIGTERM, then SIGKILL when it lingers.
 *
 * @param child - The process stopped.
 */
async function terminate(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  await new Promise<void>((resolve) => {
    const hard = setTimeout(() => {
      child.kill("SIGKILL");
    }, 5_000);
    child.once("exit", () => {
      clearTimeout(hard);
      resolve();
    });
    child.kill("SIGTERM");
  });
}
