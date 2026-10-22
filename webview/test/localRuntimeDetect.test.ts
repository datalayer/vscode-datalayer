/// <reference types="vitest/globals" />

/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * The local runtime (VS-02): where `loop` is looked for, the version read,
 * the refusals (absent, too old, unanswered) each naming the install line,
 * the port parsed from `loop serve`'s lines, the environment handed (the
 * trimmed set, the declared credentials by name and nothing undeclared, the
 * folder as the workspace, the file store, the token when signed in), and
 * the chat's handle for a local place.
 */

import {
  candidateLoopPaths,
  compareVersions,
  INSTALL_LINE,
  localRuntimeHandle,
  LOOP_MIN_VERSION,
  LOOP_SERVE_ARGUMENTS,
  loopDetection,
  portOf,
  runtimeEnvironment,
  versionOf,
} from "../../src/services/localRuntime/detect";

describe("where loop is looked for", () => {
  it("takes the configured path first, then PATH, then uv tool's and pipx's bins", () => {
    const paths = candidateLoopPaths({
      platform: "linux",
      home: "/home/ada",
      pathVariable: "/usr/bin:/home/ada/miniconda3/bin/",
      configured: "/opt/loop",
    });
    expect(paths).toEqual([
      "/opt/loop",
      "/usr/bin/loop",
      "/home/ada/miniconda3/bin/loop",
      "/home/ada/.local/bin/loop",
      "/home/ada/.local/share/uv/tools/agent-runtimes/bin/loop",
      "/home/ada/.local/pipx/venvs/agent-runtimes/bin/loop",
    ]);
  });

  it("looks for loop.exe on Windows", () => {
    const paths = candidateLoopPaths({
      platform: "win32",
      home: "C:\\Users\\ada",
      pathVariable: "C:\\Python\\Scripts",
      configured: "",
    });
    expect(paths[0]).toBe("C:\\Python\\Scripts\\loop.exe");
    expect(paths).toContain("C:\\Users\\ada\\.local\\bin\\loop.exe");
  });
});

describe("the version read", () => {
  it("reads loop --version in both of its shapes, colours stripped", () => {
    expect(versionOf("\u001b[32mAgent Runtimes Chat\u001b[0m v1.5.66\n")).toBe(
      "1.5.66",
    );
    expect(versionOf("agent_runtimes: 1.3.111")).toBe("1.3.111");
    expect(versionOf("Traceback (most recent call last)")).toBeNull();
  });

  it("orders versions numerically", () => {
    expect(compareVersions("1.5.66", "1.5.66")).toBe(0);
    expect(compareVersions("1.3.111", "1.5.66")).toBeLessThan(0);
    expect(compareVersions("1.10.0", "1.9.9")).toBeGreaterThan(0);
  });
});

describe("the refusals", () => {
  it("refuses an absent loop with the install line", () => {
    const detection = loopDetection(null);
    expect(detection.ok).toBe(false);
    if (!detection.ok) {
      expect(detection.reason).toBe("absent");
      expect(detection.sentence).toContain(INSTALL_LINE);
      expect(detection.sentence).toContain("datalayer.local.loopPath");
    }
  });

  it("refuses a loop older than the release the extension needs", () => {
    const detection = loopDetection({
      path: "/usr/bin/loop",
      versionOutput: "agent_runtimes: 1.3.111",
    });
    expect(detection.ok).toBe(false);
    if (!detection.ok) {
      expect(detection.reason).toBe("too-old");
      expect(detection.sentence).toContain("1.3.111");
      expect(detection.sentence).toContain(LOOP_MIN_VERSION);
      expect(detection.sentence).toContain(INSTALL_LINE);
    }
  });

  it("refuses a loop that does not answer, with the first line of why", () => {
    const detection = loopDetection({
      path: "/usr/bin/loop",
      versionOutput: null,
      failure: "\n/usr/bin/python3: No such file or directory\n",
    });
    expect(detection.ok).toBe(false);
    if (!detection.ok) {
      expect(detection.reason).toBe("unanswered");
      expect(detection.sentence).toContain("No such file or directory");
      expect(detection.sentence).toContain(INSTALL_LINE);
    }
  });

  it("accepts the minimum and anything newer", () => {
    expect(
      loopDetection({
        path: "/usr/bin/loop",
        versionOutput: "Agent Runtimes Chat v1.5.69",
      }),
    ).toEqual({ ok: true, path: "/usr/bin/loop", version: "1.5.69" });
    expect(
      loopDetection({
        path: "/usr/bin/loop",
        versionOutput: "agent_runtimes: 1.6.0",
      }).ok,
    ).toBe(true);
  });
});

describe("the port and the start", () => {
  it("starts loop serve on loopback with a free port", () => {
    expect(LOOP_SERVE_ARGUMENTS).toEqual([
      "serve",
      "--host",
      "127.0.0.1",
      "--port",
      "0",
    ]);
  });

  it("reads the port from the lines loop serve writes", () => {
    expect(
      portOf(
        "INFO agent_runtimes.commands.serve Auto-selected free port 41231",
      ),
    ).toBe(41231);
    expect(
      portOf(
        "INFO:     Uvicorn running on http://127.0.0.1:41231 (Press CTRL+C to quit)",
      ),
    ).toBe(41231);
    expect(portOf("API docs available at http://127.0.0.1:8000/docs")).toBe(
      8000,
    );
    expect(portOf("Found credentials in environment variables.")).toBeNull();
  });
});

describe("the environment handed", () => {
  const host = {
    PATH: "/usr/bin",
    HOME: "/home/ada",
    AWS_SECRET_ACCESS_KEY: "never",
    ANTHROPIC_API_KEY: "sk-from-shell",
    GITHUB_TOKEN: "not-declared",
  };

  it("hands the trimmed set, the declared credentials and nothing else", () => {
    const { environment, credentials } = runtimeEnvironment({
      host,
      folder: "/home/ada/project",
      declared: ["ANTHROPIC_API_KEY", "OPENAI_API_KEY"],
      secrets: { OPENAI_API_KEY: "sk-from-secrets", GITHUB_TOKEN: "nor-this" },
    });
    expect(environment.PATH).toBe("/usr/bin");
    expect(environment.HOME).toBe("/home/ada");
    expect(environment.AWS_SECRET_ACCESS_KEY).toBeUndefined();
    expect(environment.GITHUB_TOKEN).toBeUndefined();
    expect(environment.ANTHROPIC_API_KEY).toBe("sk-from-shell");
    expect(environment.OPENAI_API_KEY).toBe("sk-from-secrets");
    expect(credentials).toEqual({
      ANTHROPIC_API_KEY: "environment",
      OPENAI_API_KEY: "secrets",
    });
    expect(environment.AGENT_RUNTIMES_WORKSPACE_ROOT).toBe("/home/ada/project");
    expect(environment.AGENT_RUNTIMES_SESSION_STORE).toBe("file");
    expect(environment.AGENT_RUNTIMES_SESSIONS_PATH).toBeUndefined();
    expect(environment.DATALAYER_API_KEY).toBeUndefined();
    expect(environment.DATALAYER_IAM_URL).toBeUndefined();
  });

  it("takes the environment before the secret storage for the same name", () => {
    const { environment, credentials } = runtimeEnvironment({
      host,
      folder: "/p",
      declared: ["ANTHROPIC_API_KEY"],
      secrets: { ANTHROPIC_API_KEY: "sk-from-secrets" },
    });
    expect(environment.ANTHROPIC_API_KEY).toBe("sk-from-shell");
    expect(credentials.ANTHROPIC_API_KEY).toBe("environment");
  });

  it("hands the token and IAM when signed in, and the sessions path when set", () => {
    const { environment } = runtimeEnvironment({
      host,
      folder: "/p",
      declared: [],
      secrets: {},
      signedIn: { token: "jwt", iamUrl: "https://prod1.datalayer.run" },
      sessionsPath: "/tmp/sessions",
    });
    expect(environment.DATALAYER_API_KEY).toBe("jwt");
    expect(environment.DATALAYER_IAM_URL).toBe("https://prod1.datalayer.run");
    expect(environment.AGENT_RUNTIMES_SESSIONS_PATH).toBe("/tmp/sessions");
    expect(environment.AGENT_RUNTIMES_SESSION_STORE).toBe("file");
  });
});

describe("the chat's handle for a local place", () => {
  it("lends no token to loopback", () => {
    expect(
      localRuntimeHandle(
        "project",
        "/home/ada/project",
        "http://127.0.0.1:41231/",
      ),
    ).toEqual({
      runtimeName: "local:/home/ada/project",
      ingress: "http://127.0.0.1:41231",
      token: "",
      givenName: "This machine — project",
      environmentName: "local",
      place: "local",
    });
  });
});
