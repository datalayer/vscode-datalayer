/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * *Try it here* (VSCODE VS-11), the pure part: what a file is, the command
 * built for it, what `loop` says, the Studio's tabs, the panel's page.
 */

import { describe, expect, it } from "vitest";

import {
  isAppUid,
  noUidSentence,
  panelTitle,
  previewHtml,
  previewUrlOf,
  pushLine,
  refusalLineOf,
  servedAddressOf,
  studioTabUrl,
  tryArguments,
  tryTargetOf,
} from "../../chat/apps";

describe("what the file is", () => {
  it("takes an Appspec with its name", () => {
    expect(
      tryTargetOf(
        "/w/apps/desk.yaml",
        "schema: loop.app/v1\nid: desk\nname: Support Desk\n",
      ),
    ).toEqual({
      kind: "appspec",
      path: "/w/apps/desk.yaml",
      name: "Support Desk",
    });
  });

  it("takes an app.py", () => {
    expect(
      tryTargetOf("C:\\w\\app.py", "from agent_runtimes import loop"),
    ).toEqual({
      kind: "python",
      path: "C:\\w\\app.py",
      name: "app.py",
    });
  });

  it("refuses a yaml that is not an Appspec, and any other file", () => {
    expect(tryTargetOf("/w/ci.yml", "jobs: {}")).toEqual({
      refused:
        "ci.yml is not an application: an Appspec starts with `schema: loop.app/v1`.",
    });
    expect(tryTargetOf("/w/notes.md", "# notes")).toEqual({
      refused:
        "notes.md is neither an Appspec (a .yaml with `schema: loop.app/v1`) nor an app.py: open one to try it.",
    });
  });
});

describe("the command and its lines", () => {
  it("runs the file on this machine with hot reload, headless, on the port picked", () => {
    expect(tryArguments("/w/apps/desk.yaml", 41231)).toEqual([
      "apps",
      "run",
      "/w/apps/desk.yaml",
      "--web",
      "--watch",
      "--headless",
      "--host",
      "127.0.0.1",
      "--port",
      "41231",
    ]);
    expect(previewUrlOf(41231)).toBe("http://127.0.0.1:41231/app");
  });

  it("reads the served address and the refusal from loop's lines", () => {
    expect(
      servedAddressOf(
        "🛎  Support Desk is served on this machine at http://127.0.0.1:41231/app, reloaded when a file of /w/apps changes. Ctrl-C stops it.",
      ),
    ).toBe("http://127.0.0.1:41231/app");
    expect(servedAddressOf("· Plugins: none off")).toBeNull();
    expect(
      refusalLineOf(
        "✗ --web serves it on this machine, in a page: not with --cloud.",
      ),
    ).toBe("--web serves it on this machine, in a page: not with --cloud.");
    expect(refusalLineOf("✓ built")).toBeNull();
  });
});

describe("Validate and Ship in the browser", () => {
  it("opens the application's tabs in the Studio", () => {
    expect(studioTabUrl("app-uid-0001", "validate")).toBe(
      "https://datalayer.ai/studio/apps/app-uid-0001?tab=validate",
    );
    expect(studioTabUrl("app uid", "ship")).toBe(
      "https://datalayer.ai/studio/apps/app%20uid?tab=ship",
    );
  });

  it("offers the push line when the file has no uid", () => {
    expect(pushLine("apps/desk.yaml")).toBe(
      "loop apps push apps/desk.yaml --app <uid>",
    );
    expect(noUidSentence("apps/desk.yaml")).toContain(
      "`loop apps push apps/desk.yaml --app <uid>`",
    );
    expect(isAppUid("a1b2c3d4")).toBe(true);
    expect(isAppUid("short")).toBe(false);
    expect(isAppUid("has space here")).toBe(false);
  });
});

describe("the panel", () => {
  it("is titled by the application and frames the preview under a CSP of its origin", () => {
    expect(panelTitle("Support Desk")).toBe("Try: Support Desk");
    const html = previewHtml("http://127.0.0.1:41231/app", "Desk & <co>");
    expect(html).toContain("frame-src http://127.0.0.1:41231;");
    expect(html).toContain('<iframe src="http://127.0.0.1:41231/app"');
    expect(html).toContain("Desk &#38; &#60;co&#62;");
    expect(html).not.toContain("<co>");
  });
});
