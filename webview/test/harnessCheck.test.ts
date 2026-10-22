/// <reference types="vitest/globals" />

/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * The harness on this machine (VS-03): the catalogue read from
 * `GET /api/v1/harnesses` and from `loop harnesses`'s table, each check's
 * sentence (a binary, Node's version, the adapter, the credential, the
 * terms), `setup` offered for the part it fixes, the credential read from
 * the secret storage second and never written anywhere else.
 */

import {
  credentialNamesOf,
  credentialSecretKey,
  credentialSourceSaid,
  harnessCheck,
  harnessesOf,
  type HarnessFacts,
  type HarnessMachine,
  nodeMajorOf,
  parseLoopHarnesses,
  requiredNodeMajor,
  setupCommandOf,
  shieldPrefixOf,
  termsRefusal,
} from "../../src/services/localRuntime/harnessCheck";

const CLAUDE_CODE_SPEC = {
  id: "claude-code",
  name: "Claude Code",
  acp: {
    command: "npx",
    args: ["-y", "@agentclientprotocol/claude-agent-acp@0.91.0"],
    load_session: true,
    modes: ["default", "plan"],
  },
  requires: { secrets: ["ANTHROPIC_API_KEY"], binaries: ["node", "git"] },
  registered: {
    adapter: "@agentclientprotocol/claude-agent-acp",
    version: "0.91.0",
    credential: "An Anthropic API key (ANTHROPIC_API_KEY), the person's own",
    binaries: "Node 22 (engines.node >=22 on npm), git",
  },
  terms: {
    served_to_third_parties: "api_key_only",
    licence:
      "Apache-2.0 (adapter); Anthropic Commercial Terms of Service (the agent)",
    tier_restrictions: null,
  },
  capabilities: {
    resume: "load",
    fork_history: "replay",
    interrupt: true,
    steering: false,
    images: true,
    compaction: "own",
  },
  contributed_by: "agent-runtimes.sessions",
};

const LOOP_HARNESSES_TABLE = `
  \u001b[32m•\u001b[0m \u001b[1mClaude Code\u001b[0m  \u001b[90m loop --harness claude-code\u001b[0m
    Adapter: @agentclientprotocol/claude-agent-acp 0.91.0
    Credential: An Anthropic API key (ANTHROPIC_API_KEY), the person's own
    Serving others: api key only
    Licence: Apache-2.0 (adapter); Anthropic Commercial Terms of Service (the agent)
    Capabilities: resume load, fork history replay, interrupt yes, steering no, images yes, compaction own, vendor session id none

  • Codex  loop --harness codex
    Adapter: @agentclientprotocol/codex-acp 2.2.2
    Credential: An OpenAI API key (OPENAI_API_KEY or CODEX_API_KEY), the person's own
    Serving others: api key only — Pro and Enterprise plans only
    Licence: Apache-2.0
    Capabilities: resume load, fork history replay, interrupt yes, steering no, images yes, compaction own, vendor session id none
`;

function claudeCode(): HarnessFacts {
  return harnessesOf({ harnesses: [CLAUDE_CODE_SPEC] })[0]!;
}

function machine(overrides: Partial<HarnessMachine> = {}): HarnessMachine {
  return {
    binaries: { node: "v22.11.0", git: "git version 2.43.0" },
    environment: { ANTHROPIC_API_KEY: "sk-shell" },
    secrets: {},
    adapterInstalled: true,
    subscriptionLogin: false,
    ...overrides,
  };
}

describe("the catalogue read", () => {
  it("reads the route's answer whole", () => {
    const facts = claudeCode();
    expect(facts.id).toBe("claude-code");
    expect(facts.secrets).toEqual(["ANTHROPIC_API_KEY"]);
    expect(facts.binaries).toEqual(["node", "git"]);
    expect(facts.adapter).toBe("@agentclientprotocol/claude-agent-acp");
    expect(facts.adapterVersion).toBe("0.91.0");
    expect(facts.servedToThirdParties).toBe("api_key_only");
    expect(facts.capabilities).toEqual({
      resume: "load",
      forkHistory: "replay",
      interrupt: true,
      steering: false,
      images: true,
      compaction: "own",
    });
    expect(facts.command).toBe("npx");
    expect(facts.loadSession).toBe(true);
  });

  it("refuses an answer that names no harnesses", () => {
    expect(() => harnessesOf({})).toThrow(/names no harnesses/);
  });

  it("reads loop harnesses's table the same way (boxed until the route is released)", () => {
    const [claude, codex] = parseLoopHarnesses(LOOP_HARNESSES_TABLE);
    expect(claude?.id).toBe("claude-code");
    expect(claude?.name).toBe("Claude Code");
    expect(claude?.adapter).toBe("@agentclientprotocol/claude-agent-acp");
    expect(claude?.adapterVersion).toBe("0.91.0");
    expect(claude?.secrets).toEqual(["ANTHROPIC_API_KEY"]);
    expect(claude?.binaries).toEqual(["node", "git"]);
    expect(claude?.command).toBe("npx");
    expect(claude?.servedToThirdParties).toBe("api_key_only");
    expect(claude?.capabilities.resume).toBe("load");
    expect(claude?.capabilities.interrupt).toBe(true);
    expect(claude?.capabilities.steering).toBe(false);
    expect(codex?.id).toBe("codex");
    expect(codex?.secrets).toEqual(["OPENAI_API_KEY", "CODEX_API_KEY"]);
    expect(codex?.tierRestrictions).toBe("Pro and Enterprise plans only");
  });

  it("names the credentials of a register line", () => {
    expect(
      credentialNamesOf(
        "An OpenAI API key (OPENAI_API_KEY or CODEX_API_KEY), the person's own",
      ),
    ).toEqual(["OPENAI_API_KEY", "CODEX_API_KEY"]);
    expect(credentialNamesOf("None: it runs without a key")).toEqual([]);
  });
});

describe("each check's sentence", () => {
  it("passes a machine that has everything, the credential from the environment", () => {
    const check = harnessCheck(claudeCode(), machine());
    expect(check.ok).toBe(true);
    expect(check.parts).toEqual([]);
    expect(check.credentialSource).toBe("environment");
    expect(check.setupCommand).toBe("agent-shield setup --harness claude-code");
  });

  it("says a missing binary and offers setup", () => {
    const check = harnessCheck(
      claudeCode(),
      machine({ binaries: { node: "v22.1.0", git: null } }),
    );
    expect(check.ok).toBe(false);
    expect(check.parts).toHaveLength(1);
    expect(check.parts[0]).toMatchObject({
      part: "binary",
      setup: true,
      blocking: true,
    });
    expect(check.parts[0]?.sentence).toContain("`git`");
    expect(check.parts[0]?.sentence).toContain(
      "agent-shield setup --harness claude-code",
    );
  });

  it("checks node's version against the register", () => {
    expect(requiredNodeMajor("Node 22 (engines.node >=22 on npm), git")).toBe(
      22,
    );
    expect(requiredNodeMajor("git")).toBeNull();
    expect(nodeMajorOf("v20.18.0\n")).toBe(20);
    const check = harnessCheck(
      claudeCode(),
      machine({ binaries: { node: "v20.18.0", git: "git version 2.43.0" } }),
    );
    expect(check.ok).toBe(false);
    expect(check.parts[0]).toMatchObject({
      part: "node",
      setup: true,
      blocking: true,
    });
    expect(check.parts[0]?.sentence).toContain("Node 22 or later");
    expect(check.parts[0]?.sentence).toContain("v20.18.0");
  });

  it("says an adapter not pinned, fetched by npx on the first start, and offers setup without blocking", () => {
    const check = harnessCheck(
      claudeCode(),
      machine({ adapterInstalled: false }),
    );
    expect(check.ok).toBe(true);
    expect(check.parts[0]).toMatchObject({
      part: "adapter",
      setup: true,
      blocking: false,
    });
    expect(check.parts[0]?.sentence).toContain(
      "@agentclientprotocol/claude-agent-acp@0.91.0",
    );
    expect(shieldPrefixOf("/home/ada/", claudeCode())).toBe(
      "/home/ada/.agent-shield/harnesses/claude-code@0.91.0",
    );
  });

  it("says the credential missing, where to put it, and that it is never written to settings", () => {
    const check = harnessCheck(
      claudeCode(),
      machine({ environment: {}, secrets: {} }),
    );
    expect(check.ok).toBe(false);
    expect(check.credentialSource).toBeNull();
    expect(check.parts[0]).toMatchObject({
      part: "credential",
      setup: false,
      blocking: true,
    });
    expect(check.parts[0]?.sentence).toContain("ANTHROPIC_API_KEY");
    expect(check.parts[0]?.sentence).toContain("never in settings");
  });

  it("reads the credential from the secret storage second, and says which it used", () => {
    const check = harnessCheck(
      claudeCode(),
      machine({ environment: {}, secrets: { ANTHROPIC_API_KEY: "sk-kept" } }),
    );
    expect(check.ok).toBe(true);
    expect(check.credentialSource).toBe("secrets");
    expect(credentialSourceSaid("ANTHROPIC_API_KEY", "secrets")).toBe(
      "ANTHROPIC_API_KEY is taken from the extension's secret storage.",
    );
    expect(credentialSourceSaid("ANTHROPIC_API_KEY", "environment")).toBe(
      "ANTHROPIC_API_KEY is taken from your environment.",
    );
    expect(credentialSecretKey("ANTHROPIC_API_KEY")).toBe(
      "datalayer.harness.credential.ANTHROPIC_API_KEY",
    );
  });

  it("refuses a subscription login where the terms serve third parties with an API key only", () => {
    const facts = claudeCode();
    expect(termsRefusal(facts, { subscriptionLogin: false })).toBeNull();
    const sentence = termsRefusal(facts, { subscriptionLogin: true });
    expect(sentence).toContain("API key only");
    expect(sentence).toContain("Set ANTHROPIC_API_KEY instead");
    const check = harnessCheck(
      facts,
      machine({ environment: {}, subscriptionLogin: true }),
    );
    expect(check.ok).toBe(false);
    expect(check.parts.map((part) => part.part)).toEqual([
      "terms",
      "credential",
    ]);
  });

  it("refuses an organization's own harness from the extension", () => {
    const facts = {
      ...claudeCode(),
      servedToThirdParties: "organizations_own",
    };
    expect(termsRefusal(facts, { subscriptionLogin: false })).toContain(
      "organization's own applications only",
    );
  });

  it("shows setup whole", () => {
    expect(setupCommandOf("codex")).toBe("agent-shield setup --harness codex");
  });
});
