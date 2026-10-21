/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * The harness on this machine (VS-03): before a coding agent starts in a
 * folder, what `agent-shield setup --harness <id>` checks is checked here —
 * the binaries the register names (node and its version, git), the pinned
 * adapter in the Shield's prefix, the credential the harness declares
 * (`ANTHROPIC_API_KEY` for Claude Code) in the person's environment or in the
 * extension's secret storage — each missing part a sentence, and `setup`
 * offered for the part it fixes. A harness whose terms refuse the person's
 * credential (a subscription login where the terms serve third parties with
 * an API key only) is refused in the register's words.
 *
 * The catalogue comes from the local runtime's `GET /api/v1/harnesses`
 * (`harnessesOf`); until the installed release serves it, from the table
 * `loop harnesses` prints (`parseLoopHarnesses`, boxed to be replaced).
 *
 * Pure: no `vscode`, no child process, no file system.
 *
 * @module services/localRuntime/harnessCheck
 */

/** One harness of the catalogue, as the check reads it. */
export interface HarnessFacts {
  /** `claude-code`, `codex`, … */
  id: string;
  /** *Claude Code*. */
  name: string;
  /** The adapter pinned (`@agentclientprotocol/claude-agent-acp`). */
  adapter: string;
  /** Its version (`0.91.0`). */
  adapterVersion: string;
  /** The credential it takes, the register's words. */
  credential: string;
  /** The credential names it declares (`ANTHROPIC_API_KEY`). */
  secrets: string[];
  /** The executables it needs on the path (`node`, `git`). */
  binaries: string[];
  /** The register's line on binaries (*Node 22 (engines.node >=22 on npm), git*). */
  registeredBinaries: string;
  /** `api_key_only`, `permitted`, `organizations_own`. */
  servedToThirdParties: string;
  /** The licence, the register's words. */
  licence: string;
  /** Tier restrictions, or empty. */
  tierRestrictions: string;
  /** The capabilities table (MH-20). */
  capabilities: {
    resume: string;
    forkHistory: string;
    interrupt: boolean;
    steering: boolean;
    images: boolean;
    compaction: string;
  };
  /** How it is launched: the executable. */
  command: string;
  /** The executable's arguments. */
  args: string[];
  /** Whether its ACP adapter loads a session again. */
  loadSession: boolean;
  /** The modes it offers. */
  modes: string[];
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function list(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * The catalogue as `GET /api/v1/harnesses` answers it (`{harnesses: [...]}`,
 * each the harness spec whole).
 *
 * @param body - The route's answer.
 *
 * @returns The harnesses, in the route's order.
 *
 * @throws Error when the answer is not a list of harnesses.
 */
export function harnessesOf(body: unknown): HarnessFacts[] {
  const harnesses = record(body).harnesses;
  if (!Array.isArray(harnesses)) {
    throw new Error(
      "The runtime's answer for /api/v1/harnesses names no harnesses.",
    );
  }
  return harnesses.map((raw) => {
    const spec = record(raw);
    const acp = record(spec.acp);
    const requires = record(spec.requires);
    const registered = record(spec.registered);
    const terms = record(spec.terms);
    const capabilities = record(spec.capabilities);
    const id = text(spec.id);
    if (!id) {
      throw new Error("A harness of /api/v1/harnesses names no id.");
    }
    return {
      id,
      name: text(spec.name) || id,
      adapter: text(registered.adapter),
      adapterVersion: text(registered.version),
      credential: text(registered.credential),
      secrets: list(requires.secrets),
      binaries: list(requires.binaries),
      registeredBinaries: text(registered.binaries),
      servedToThirdParties: text(terms.served_to_third_parties),
      licence: text(terms.licence),
      tierRestrictions: text(terms.tier_restrictions),
      capabilities: {
        resume: text(capabilities.resume),
        forkHistory: text(capabilities.fork_history),
        interrupt: capabilities.interrupt === true,
        steering: capabilities.steering === true,
        images: capabilities.images === true,
        compaction: text(capabilities.compaction),
      },
      command: text(acp.command),
      args: list(acp.args),
      loadSession: acp.load_session === true,
      modes: list(acp.modes),
    };
  });
}

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;

/**
 * The credential names a register line names: *An Anthropic API key
 * (ANTHROPIC_API_KEY), the person's own* → `["ANTHROPIC_API_KEY"]`.
 *
 * @param credential - The register's credential line.
 *
 * @returns The upper-case names in it, in order, once each.
 */
export function credentialNamesOf(credential: string): string[] {
  return [
    ...new Set(credential.match(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g) ?? []),
  ];
}

/**
 * The table `loop harnesses` prints, read back (boxed: replaced by
 * `harnessesOf` once the installed release serves `GET /api/v1/harnesses`).
 * Each entry starts with the name and `loop --harness <id>`, then the
 * *Adapter:*, *Credential:*, *Serving others:*, *Licence:* and
 * *Capabilities:* lines. The binaries are not printed: the check reads
 * `node` and `git` for a harness launched with `npx`.
 *
 * @param output - What the command printed.
 *
 * @returns The harnesses it listed.
 */
export function parseLoopHarnesses(output: string): HarnessFacts[] {
  const harnesses: HarnessFacts[] = [];
  let current: HarnessFacts | null = null;
  for (const raw of output.replace(ANSI, "").split("\n")) {
    const line = raw.trim();
    const head = line.match(/^•\s+(.+?)\s+loop --harness (\S+)$/);
    if (head) {
      current = {
        id: head[2] ?? "",
        name: head[1] ?? "",
        adapter: "",
        adapterVersion: "",
        credential: "",
        secrets: [],
        binaries: [],
        registeredBinaries: "",
        servedToThirdParties: "",
        licence: "",
        tierRestrictions: "",
        capabilities: {
          resume: "",
          forkHistory: "",
          interrupt: false,
          steering: false,
          images: false,
          compaction: "",
        },
        command: "",
        args: [],
        loadSession: false,
        modes: [],
      };
      harnesses.push(current);
      continue;
    }
    if (!current) {
      continue;
    }
    const field = line.match(/^([A-Za-z ]+):\s*(.*)$/);
    if (!field) {
      continue;
    }
    const value = field[2] ?? "";
    switch (field[1]) {
      case "Adapter": {
        const [adapter, version] = value.split(/\s+/);
        current.adapter = adapter ?? "";
        current.adapterVersion = version ?? "";
        current.command = current.adapter.startsWith("@")
          ? "npx"
          : current.adapter;
        current.binaries = current.command === "npx" ? ["node", "git"] : [];
        break;
      }
      case "Credential":
        current.credential = value;
        current.secrets = credentialNamesOf(value);
        break;
      case "Serving others": {
        const [served, tiers] = value.split(" — ");
        current.servedToThirdParties = (served ?? "").trim().replace(/ /g, "_");
        current.tierRestrictions = (tiers ?? "").trim();
        break;
      }
      case "Licence":
        current.licence = value;
        break;
      case "Capabilities": {
        const said = (name: string): string =>
          value.match(new RegExp(`${name} ([^,\\s]+)`))?.[1] ?? "";
        current.capabilities = {
          resume: said("resume"),
          forkHistory: said("fork history"),
          interrupt: said("interrupt") === "yes",
          steering: said("steering") === "yes",
          images: said("images") === "yes",
          compaction: said("compaction"),
        };
        current.loadSession = current.capabilities.resume === "load";
        break;
      }
      default:
        break;
    }
  }
  return harnesses;
}

/**
 * The Node major the register asks for (*Node 22 (engines.node >=22 on npm), git*).
 *
 * @param registeredBinaries - The register's binaries line.
 *
 * @returns The major, or null when the line names no Node version.
 */
export function requiredNodeMajor(registeredBinaries: string): number | null {
  const match = registeredBinaries.match(/\bnode\s+v?(\d+)/i);
  return match ? Number(match[1]) : null;
}

/**
 * The major of a `node --version` answer (`v22.11.0` → 22).
 *
 * @param output - What `node --version` printed.
 *
 * @returns The major, or null when none is in it.
 */
export function nodeMajorOf(output: string): number | null {
  const match = output.match(/v?(\d+)\.\d+\.\d+/);
  return match ? Number(match[1]) : null;
}

/**
 * Where `agent-shield setup` pins an adapter: `~/.agent-shield/harnesses/<id>@<version>`.
 *
 * @param home - The person's home folder.
 * @param facts - The harness.
 *
 * @returns The prefix path.
 */
export function shieldPrefixOf(home: string, facts: HarnessFacts): string {
  return `${home.replace(/[\\/]+$/, "")}/.agent-shield/harnesses/${facts.id}@${facts.adapterVersion}`;
}

/**
 * The command that installs what a harness needs, shown whole before it runs.
 *
 * @param id - The harness.
 *
 * @returns `agent-shield setup --harness <id>`.
 */
export function setupCommandOf(id: string): string {
  return `agent-shield setup --harness ${id}`;
}

/** What the machine has, read by the service, judged here. */
export interface HarnessMachine {
  /** Each binary the harness needs: what `<binary> --version` printed, or null when it is absent. */
  binaries: Record<string, string | null>;
  /** The person's environment. */
  environment: Record<string, string | undefined>;
  /** What the extension's secret storage holds. */
  secrets: Record<string, string | undefined>;
  /** Whether the pinned adapter is in the Shield's prefix. */
  adapterInstalled: boolean;
  /** Whether a subscription login of the vendor's is what the machine has (no API key). */
  subscriptionLogin: boolean;
}

/** One part of the check that is not met. */
export interface HarnessCheckPart {
  part: "binary" | "node" | "adapter" | "credential" | "terms";
  sentence: string;
  /** Whether `agent-shield setup` fixes it. */
  setup: boolean;
  /** Whether it stops the start. */
  blocking: boolean;
}

/** The check's verdict. */
export interface HarnessCheck {
  ok: boolean;
  parts: HarnessCheckPart[];
  /** Where the credential was found, when it was. */
  credentialSource: "environment" | "secrets" | null;
  setupCommand: string;
}

/**
 * The register's sentence when the harness's terms refuse what the person has.
 *
 * @param facts - The harness.
 * @param machine - What the machine has.
 *
 * @returns The sentence, or null when the terms admit the person's credential.
 */
export function termsRefusal(
  facts: HarnessFacts,
  machine: Pick<HarnessMachine, "subscriptionLogin">,
): string | null {
  if (facts.servedToThirdParties === "organizations_own") {
    return `${facts.name} is served to an organization's own applications only (${facts.servedToThirdParties.replace(/_/g, " ")}): it does not run from this extension.`;
  }
  if (
    facts.servedToThirdParties === "api_key_only" &&
    machine.subscriptionLogin
  ) {
    return (
      `${facts.name}'s terms serve third parties with an API key only (${facts.credential || facts.secrets.join(", ")}): ` +
      `a subscription login is not served here. Set ${facts.secrets.join(" or ") || "its key"} instead.`
    );
  }
  return null;
}

/**
 * Checks a harness against the machine: binaries and Node's version, the
 * adapter in the Shield's prefix, the credential, the terms.
 *
 * @param facts - The harness.
 * @param machine - What the machine has.
 *
 * @returns The verdict, each unmet part a sentence.
 */
export function harnessCheck(
  facts: HarnessFacts,
  machine: HarnessMachine,
): HarnessCheck {
  const parts: HarnessCheckPart[] = [];
  const setupCommand = setupCommandOf(facts.id);
  const terms = termsRefusal(facts, machine);
  if (terms) {
    parts.push({
      part: "terms",
      sentence: terms,
      setup: false,
      blocking: true,
    });
  }
  for (const binary of facts.binaries) {
    const found = machine.binaries[binary];
    if (found === null || found === undefined) {
      parts.push({
        part: "binary",
        sentence: `${facts.name} needs \`${binary}\` on this machine, and it was not found: install it, or run \`${setupCommand}\` in a terminal.`,
        setup: true,
        blocking: true,
      });
      continue;
    }
    if (binary === "node") {
      const required = requiredNodeMajor(facts.registeredBinaries);
      const major = nodeMajorOf(found);
      if (required !== null && major !== null && major < required) {
        parts.push({
          part: "node",
          sentence: `${facts.name} needs Node ${required} or later (${facts.registeredBinaries}), and this machine has ${found.trim()}: update Node, or run \`${setupCommand}\` in a terminal.`,
          setup: true,
          blocking: true,
        });
      }
    }
  }
  if (facts.adapter && !machine.adapterInstalled) {
    const fetched = facts.command === "npx";
    parts.push({
      part: "adapter",
      sentence: fetched
        ? `${facts.name}'s adapter ${facts.adapter}@${facts.adapterVersion} is not pinned in the Shield's prefix: the first start fetches it with npx, or run \`${setupCommand}\` to pin it first.`
        : `${facts.name}'s adapter ${facts.adapter} ${facts.adapterVersion} is not installed: run \`${setupCommand}\` in a terminal.`,
      setup: true,
      blocking: !fetched,
    });
  }
  let credentialSource: HarnessCheck["credentialSource"] = null;
  for (const name of facts.secrets) {
    if (machine.environment[name]) {
      credentialSource = "environment";
      continue;
    }
    if (machine.secrets[name]) {
      credentialSource = "secrets";
      continue;
    }
    parts.push({
      part: "credential",
      sentence: `${facts.name} takes ${facts.credential || name}: set ${name} in your environment, or give it to the extension once (Datalayer: Set a harness credential) — it is kept in VS Code's secret storage, never in settings, and never shown.`,
      setup: false,
      blocking: true,
    });
  }
  return {
    ok: parts.every((part) => !part.blocking),
    parts,
    credentialSource,
    setupCommand,
  };
}

/**
 * The sentence that says where a credential came from (decision O-1).
 *
 * @param name - The credential's name.
 * @param source - Where it was found.
 *
 * @returns The sentence.
 */
export function credentialSourceSaid(
  name: string,
  source: "environment" | "secrets",
): string {
  return source === "environment"
    ? `${name} is taken from your environment.`
    : `${name} is taken from the extension's secret storage.`;
}

/** The key under which a credential is kept in the extension's secret storage. */
export function credentialSecretKey(name: string): string {
  return `datalayer.harness.credential.${name}`;
}
