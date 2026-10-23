/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * The Home view's *Profile* row and the Profile page's host: the row only
 * while signed in, running `datalayer.profile.open`; the page given the
 * signed-in user on `ready`, *Edit on Datalayer* opening the web's profile
 * settings, a new user redrawn, a sign-out closing it, and signed out the
 * command asking to sign in instead of opening.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const host = vi.hoisted(() => ({
  commands: new Map<string, (...args: unknown[]) => unknown>(),
  executed: [] as string[],
  opened: [] as string[],
  infos: [] as string[],
  trees: new Map<
    string,
    {
      getChildren: () => Array<{ label: string }>;
      onDidChangeTreeData?: (listener: () => void) => unknown;
    }
  >(),
  panels: [] as Array<{
    posted: Array<Record<string, unknown>>;
    receive: (message: unknown) => unknown;
    disposed: boolean;
    revealed: number;
  }>,
}));

vi.mock("vscode", () => {
  class EventEmitter<T> {
    listeners: Array<(value: T) => void> = [];
    event = (listener: (value: T) => void) => {
      this.listeners.push(listener);
      return { dispose: () => undefined };
    };
    fire(value: T) {
      for (const listener of this.listeners) {
        listener(value);
      }
    }
    dispose() {
      return undefined;
    }
  }
  return {
    EventEmitter,
    TreeItem: class {
      constructor(public readonly label: string) {}
    },
    ThemeIcon: class {
      constructor(public readonly id: string) {}
    },
    ColorThemeKind: { Light: 1, Dark: 2, HighContrast: 3 },
    ViewColumn: { One: 1 },
    Uri: {
      joinPath: (...parts: unknown[]) => parts.join("/"),
      parse: (value: string) => ({ toString: () => value }),
    },
    env: {
      openExternal: async (uri: { toString(): string }) => {
        host.opened.push(uri.toString());
        return true;
      },
    },
    commands: {
      registerCommand: (id: string, run: (...args: unknown[]) => unknown) => {
        host.commands.set(id, run);
        return { dispose: () => undefined };
      },
      executeCommand: async (id: string) => {
        host.executed.push(id);
        return undefined;
      },
    },
    window: {
      activeColorTheme: { kind: 2 },
      registerTreeDataProvider: (
        id: string,
        provider: {
          getChildren: () => Array<{ label: string }>;
          onDidChangeTreeData?: (listener: () => void) => unknown;
        },
      ) => {
        host.trees.set(id, provider);
        return { dispose: () => undefined };
      },
      onDidChangeActiveColorTheme: () => ({ dispose: () => undefined }),
      showInformationMessage: async (message: string) => {
        host.infos.push(message);
        return undefined;
      },
      createWebviewPanel: () => {
        let receive: (message: unknown) => unknown = () => undefined;
        let onDispose: () => void = () => undefined;
        const record = {
          posted: [] as Array<Record<string, unknown>>,
          receive: (message: unknown) => receive(message),
          disposed: false,
          revealed: 0,
        };
        host.panels.push(record);
        return {
          webview: {
            html: "",
            cspSource: "vscode-resource:",
            asWebviewUri: (uri: unknown) => uri,
            postMessage: async (message: Record<string, unknown>) => {
              record.posted.push(message);
              return true;
            },
            onDidReceiveMessage: (listener: (message: unknown) => unknown) => {
              receive = listener;
              return { dispose: () => undefined };
            },
          },
          reveal: () => {
            record.revealed += 1;
          },
          onDidDispose: (listener: () => void) => {
            onDispose = listener;
            return { dispose: () => undefined };
          },
          dispose: () => {
            record.disposed = true;
            onDispose();
          },
        };
      },
    },
  };
});

import { EventEmitter } from "vscode";

import {
  HOME_BUTTON_VIEW,
  homeRowItems,
  registerHomeCommands,
} from "../../src/commands/home";
import {
  PROFILE_COMMAND,
  registerProfileCommands,
} from "../../src/commands/profile";

/** A sign-in whose state the test changes. */
function makeAuth(user: Record<string, unknown> | null) {
  const changed = new EventEmitter<{
    isAuthenticated: boolean;
    user: Record<string, unknown> | null;
  }>();
  const auth = {
    state: { isAuthenticated: user !== null, user, error: null },
    isAuthenticated: () => auth.state.isAuthenticated,
    getAuthState: () => auth.state,
    onAuthStateChanged: changed.event,
    sign(next: Record<string, unknown> | null) {
      auth.state = { isAuthenticated: next !== null, user: next, error: null };
      changed.fire(auth.state);
    },
  };
  return auth;
}

const ada = {
  uid: "u-1",
  handle: "ada",
  firstName: "Ada",
  lastName: "Lovelace",
  avatarUrl: "",
};

/** Lets the page's message handlers settle. */
const settle = () => new Promise((done) => setTimeout(done, 0));

describe("the Home view's rows", () => {
  it("signed out: Open Datalayer only", () => {
    expect(homeRowItems(false).map((item) => item.label)).toEqual([
      "Open Datalayer",
    ]);
  });

  it("signed in: Open Datalayer, then Profile, which opens the Profile page", () => {
    const rows = homeRowItems(true);
    expect(rows.map((item) => item.label)).toEqual([
      "Open Datalayer",
      "Profile",
    ]);
    expect(rows[1]!.command).toEqual({
      command: PROFILE_COMMAND,
      title: "Profile",
    });
    expect((rows[1]!.iconPath as unknown as { id: string }).id).toBe("account");
  });
});

describe("the Home view", () => {
  it("shows Profile once signed in, and is read again on each sign-in and sign-out", () => {
    const auth = makeAuth(null);
    registerHomeCommands({ subscriptions: [] } as never, {
      authProvider: auth as never,
      sections: [],
    });
    const tree = host.trees.get(HOME_BUTTON_VIEW)!;
    let changes = 0;
    tree.onDidChangeTreeData!(() => {
      changes += 1;
    });
    expect(tree.getChildren().map((item) => item.label)).toEqual([
      "Open Datalayer",
    ]);
    auth.sign(ada);
    expect(changes).toBe(1);
    expect(tree.getChildren().map((item) => item.label)).toEqual([
      "Open Datalayer",
      "Profile",
    ]);
    auth.sign(null);
    expect(changes).toBe(2);
    expect(tree.getChildren()).toHaveLength(1);
  });
});

describe("the Profile page", () => {
  beforeEach(() => {
    host.commands.clear();
    host.executed.length = 0;
    host.opened.length = 0;
    host.infos.length = 0;
    host.panels.length = 0;
  });

  /** Registers the command over a sign-in; returns both. */
  function register(user: Record<string, unknown> | null) {
    const auth = makeAuth(user);
    registerProfileCommands(
      { subscriptions: [], extensionUri: "file:///ext" } as never,
      auth as never,
    );
    return { auth, open: () => host.commands.get(PROFILE_COMMAND)!() };
  }

  it("is given the signed-in user on ready, and Edit opens the web's profile settings", async () => {
    const { open } = register(ada);
    await open();
    const page = host.panels[0]!;
    page.receive({ type: "ready" });
    await settle();
    expect(page.posted).toContainEqual({
      type: "profile",
      body: {
        id: "u-1",
        username: "ada",
        display_name: "Ada Lovelace",
        initials: "AL",
      },
    });
    expect(page.posted).toContainEqual({
      type: "theme-changed",
      theme: "dark",
    });

    page.receive({ type: "edit" });
    await settle();
    expect(host.opened).toEqual(["https://datalayer.ai/settings/profile"]);
  });

  it("opened again, is revealed, not opened twice", async () => {
    const { open } = register(ada);
    await open();
    await open();
    expect(host.panels).toHaveLength(1);
    expect(host.panels[0]!.revealed).toBe(1);
  });

  it("redraws another user, and closes on sign-out", async () => {
    const { auth, open } = register(ada);
    await open();
    const page = host.panels[0]!;
    auth.sign({
      ...ada,
      uid: "u-2",
      handle: "grace",
      firstName: "Grace",
      lastName: "Hopper",
    });
    expect(page.posted.at(-1)).toMatchObject({
      type: "profile",
      body: { id: "u-2", username: "grace", initials: "GH" },
    });
    auth.sign(null);
    expect(page.disposed).toBe(true);
  });

  it("signed out, asks to sign in instead of opening", async () => {
    const { open } = register(null);
    await open();
    expect(host.panels).toHaveLength(0);
    expect(host.infos).toEqual(["Sign in to Datalayer to see your profile."]);
  });
});
