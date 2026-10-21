/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Finding `loop` on this machine and starting a local runtime (VS-02).
 *
 * The extension never bundles Python or agent-runtimes: `loop` is a
 * prerequisite, found where the person installed it (`datalayer.local.loopPath`,
 * else `PATH`, then `uv tool`'s and `pipx`'s bins), checked to be at least
 * the release the extension was built against, and refused in a sentence
 * naming the install line when it is absent, too old or does not answer.
 * A local runtime is `loop serve --host 127.0.0.1 --port 0` for one workspace
 * folder, its port read from the first line that names it; the process is
 * given a trimmed environment plus the credentials the harnesses declare by
 * name (from the environment first, the extension's secret storage second),
 * the folder as the harness's workspace and the file session store.
 *
 * Pure: no `vscode`, no child process, no file system. The service
 * (`localRuntimeService.ts`) does the I/O.
 *
 * @module services/localRuntime/detect
 */

/** The oldest agent-runtimes whose `loop` the extension starts. */
export const LOOP_MIN_VERSION = "1.5.66";

/** The one line that installs `loop` with the Shield. */
export const INSTALL_LINE = "uv tool install 'agent-runtimes[shield]'";

/** How a local runtime is started: loopback, a free port picked by the server. */
export const LOOP_SERVE_ARGUMENTS: readonly string[] = [
  "serve",
  "--host",
  "127.0.0.1",
  "--port",
  "0",
];

/** The variables of the person's shell a local runtime is given, and nothing else of it. */
export const TRIMMED_VARIABLES: readonly string[] = [
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "TERM",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TMPDIR",
  "TMP",
  "TEMP",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "XDG_CACHE_HOME",
  "XDG_RUNTIME_DIR",
  "SSL_CERT_FILE",
  "REQUESTS_CA_BUNDLE",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "SystemRoot",
  "SystemDrive",
  "ComSpec",
  "PATHEXT",
  "APPDATA",
  "LOCALAPPDATA",
  "USERPROFILE",
  "HOMEDRIVE",
  "HOMEPATH",
];

/** What the host says about itself, for the candidate paths. */
export interface DetectHost {
  /** `process.platform`. */
  platform: string;
  /** The person's home folder. */
  home: string;
  /** The `PATH` variable, or nothing. */
  pathVariable: string | undefined;
  /** `datalayer.local.loopPath`, empty when unset. */
  configured: string;
}

/**
 * Where `loop` may be, in the order it is looked for: the configured path,
 * each `PATH` entry, then `uv tool`'s and `pipx`'s bins under the home.
 *
 * @param host - The host's platform, home, `PATH` and configured path.
 *
 * @returns Candidate paths, the first that exists being `loop`.
 */
export function candidateLoopPaths(host: DetectHost): string[] {
  const windows = host.platform === "win32";
  const separator = windows ? ";" : ":";
  const slash = windows ? "\\" : "/";
  const names = windows ? ["loop.exe", "loop.cmd", "loop"] : ["loop"];
  const candidates: string[] = [];
  const configured = host.configured.trim();
  if (configured) {
    candidates.push(configured);
  }
  for (const entry of (host.pathVariable ?? "").split(separator)) {
    const dir = entry.trim();
    if (!dir) {
      continue;
    }
    for (const name of names) {
      candidates.push(`${dir.replace(/[\\/]+$/, "")}${slash}${name}`);
    }
  }
  const home = host.home.replace(/[\\/]+$/, "");
  const bins = windows
    ? [
        `${home}\\.local\\bin`,
        `${home}\\AppData\\Roaming\\uv\\tools\\agent-runtimes\\Scripts`,
        `${home}\\pipx\\venvs\\agent-runtimes\\Scripts`,
      ]
    : [
        `${home}/.local/bin`,
        `${home}/.local/share/uv/tools/agent-runtimes/bin`,
        `${home}/.local/pipx/venvs/agent-runtimes/bin`,
      ];
  for (const dir of bins) {
    for (const name of names) {
      candidates.push(`${dir}${slash}${name}`);
    }
  }
  return [...new Set(candidates)];
}

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;

/**
 * The version `loop --version` printed (`Agent Runtimes Chat v1.5.66`,
 * `agent_runtimes: 1.5.66`, colours stripped), or null when none is in it.
 *
 * @param output - What the command wrote, stdout and stderr together.
 *
 * @returns The first `major.minor.patch` found, or null.
 */
export function versionOf(output: string): string | null {
  const plain = output.replace(ANSI, "");
  const match = plain.match(/(?<![\d.])(\d+)\.(\d+)\.(\d+)(?![\d.])/);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : null;
}

/**
 * Orders two `major.minor.patch` versions.
 *
 * @param a - One version.
 * @param b - The other.
 *
 * @returns Negative when `a` is older, zero when equal, positive when newer.
 */
export function compareVersions(a: string, b: string): number {
  const left = a.split(".").map((part) => Number(part) || 0);
  const right = b.split(".").map((part) => Number(part) || 0);
  for (let index = 0; index < 3; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}

/** What was found on the machine, before it is judged. */
export interface LoopFound {
  /** The path that exists. */
  path: string;
  /** What `loop --version` wrote, or null when it could not be run. */
  versionOutput: string | null;
  /** Why it could not be run, when it could not. */
  failure?: string;
}

/** Why `loop` is not started. */
export type LoopRefusalReason =
  "absent" | "too-old" | "unanswered" | "disabled";

/** `loop` found and good, or the sentence that refuses it. */
export type LoopDetection =
  | { ok: true; path: string; version: string }
  | { ok: false; reason: LoopRefusalReason; sentence: string };

/**
 * Judges what was found: present, answering and at least the minimum.
 *
 * @param found - The first candidate that exists, with its version output; null when none does.
 * @param minimum - The oldest version accepted.
 *
 * @returns The path and version, or the refusal naming the install line.
 */
export function loopDetection(
  found: LoopFound | null,
  minimum: string = LOOP_MIN_VERSION,
): LoopDetection {
  if (!found) {
    return {
      ok: false,
      reason: "absent",
      sentence:
        "`loop` was not found on this machine (not on PATH, nor under uv tool's or pipx's bins): " +
        `install it with \`${INSTALL_LINE}\`, or set datalayer.local.loopPath to where it is.`,
    };
  }
  const version = found.versionOutput ? versionOf(found.versionOutput) : null;
  if (!version) {
    const why = (found.failure ?? found.versionOutput ?? "")
      .replace(ANSI, "")
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0);
    return {
      ok: false,
      reason: "unanswered",
      sentence:
        `\`loop\` at ${found.path} did not answer \`loop --version\`` +
        (why ? ` (${why})` : "") +
        `: its Python may be gone — reinstall it with \`${INSTALL_LINE}\`.`,
    };
  }
  if (compareVersions(version, minimum) < 0) {
    return {
      ok: false,
      reason: "too-old",
      sentence:
        `\`loop\` at ${found.path} is agent-runtimes ${version}, and this extension needs ${minimum} or later: ` +
        `update it with \`${INSTALL_LINE}\`.`,
    };
  }
  return { ok: true, path: found.path, version };
}

/** The sentence when the setting turns the local runtime off. */
export const DISABLED_SENTENCE =
  "The local runtime is turned off (datalayer.local.enabled): turn it on to start a coding agent in this folder.";

/**
 * The port a `loop serve` line names: `Auto-selected free port 41231`,
 * `Uvicorn running on http://127.0.0.1:41231`, `API docs available at http://127.0.0.1:41231/docs`.
 *
 * @param line - One line of the process's output.
 *
 * @returns The port, or null when the line names none.
 */
export function portOf(line: string): number | null {
  const plain = line.replace(ANSI, "");
  const picked = plain.match(/free port (\d{2,5})\b/);
  if (picked) {
    return Number(picked[1]);
  }
  const url = plain.match(
    /https?:\/\/(?:127\.0\.0\.1|localhost|0\.0\.0\.0):(\d{2,5})\b/,
  );
  return url ? Number(url[1]) : null;
}

/** What the environment of a local runtime is built from. */
export interface RuntimeEnvironmentInput {
  /** The host's environment (`process.env`). */
  host: Record<string, string | undefined>;
  /** The workspace folder: the harness's workspace. */
  folder: string;
  /** The credential names the harnesses declare (`requires.secrets`). */
  declared: readonly string[];
  /** What the extension's secret storage holds for those names. */
  secrets: Record<string, string | undefined>;
  /** The person's token and IAM, when signed in. */
  signedIn?: { token: string; iamUrl: string };
  /** `AGENT_RUNTIMES_SESSIONS_PATH`, when the person set one; else the runtime's default. */
  sessionsPath?: string;
}

/** Where each declared credential came from, said to the person (decision O-1). */
export type CredentialSource = "environment" | "secrets";

/** The environment a local runtime is started with, and where its credentials came from. */
export interface RuntimeEnvironment {
  environment: Record<string, string>;
  credentials: Record<string, CredentialSource>;
}

/**
 * The environment of a local runtime: the trimmed set of the person's
 * shell, the declared credentials by name (the environment first, the
 * secret storage second — nothing undeclared), the folder as the workspace,
 * the file session store, and the person's token and IAM when signed in.
 *
 * @param input - The host's environment, the folder, the declared names, the secrets, the sign-in.
 *
 * @returns The environment and the source of each credential handed.
 */
export function runtimeEnvironment(
  input: RuntimeEnvironmentInput,
): RuntimeEnvironment {
  const environment: Record<string, string> = {};
  for (const name of TRIMMED_VARIABLES) {
    const value = input.host[name];
    if (value !== undefined && value !== "") {
      environment[name] = value;
    }
  }
  const credentials: Record<string, CredentialSource> = {};
  for (const name of input.declared) {
    const fromHost = input.host[name];
    if (fromHost) {
      environment[name] = fromHost;
      credentials[name] = "environment";
      continue;
    }
    const fromSecrets = input.secrets[name];
    if (fromSecrets) {
      environment[name] = fromSecrets;
      credentials[name] = "secrets";
    }
  }
  environment.AGENT_RUNTIMES_WORKSPACE_ROOT = input.folder;
  environment.AGENT_RUNTIMES_SESSION_STORE = "file";
  if (input.sessionsPath) {
    environment.AGENT_RUNTIMES_SESSIONS_PATH = input.sessionsPath;
  }
  if (input.signedIn) {
    environment.DATALAYER_IAM_URL = input.signedIn.iamUrl;
    environment.DATALAYER_API_KEY = input.signedIn.token;
  }
  environment.PYTHONUNBUFFERED = "1";
  environment.NO_COLOR = "1";
  return { environment, credentials };
}

/** A local runtime as the chat lists it beside Datalayer's runtimes: a place of its own. */
export interface LocalRuntimeHandle {
  /** `local:<folder path>`: unique per folder. */
  runtimeName: string;
  /** `http://127.0.0.1:<port>`. */
  ingress: string;
  /** Nothing: no token is lent to loopback. */
  token: string;
  /** *This machine — <folder name>*. */
  givenName: string;
  /** `local`. */
  environmentName: string;
  /** The place, for the picker. */
  place: "local";
}

/**
 * The handle the chat's picker shows for a running local runtime.
 *
 * @param folderName - The workspace folder's name.
 * @param folderPath - Its path.
 * @param url - The runtime's address.
 *
 * @returns The handle, with no token.
 */
export function localRuntimeHandle(
  folderName: string,
  folderPath: string,
  url: string,
): LocalRuntimeHandle {
  return {
    runtimeName: `local:${folderPath}`,
    ingress: url.replace(/\/$/, ""),
    token: "",
    givenName: `This machine — ${folderName}`,
    environmentName: "local",
    place: "local",
  };
}
