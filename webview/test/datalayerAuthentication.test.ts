/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * The sign-in prompts while signed out: the Datalayer authentication
 * provider of the Accounts menu — an adapter over the extension's sign-in,
 * its sessions following its state, *Sign in* and *Sign Out* running the
 * extension's own commands, its changes said, a session asked quietly while
 * signed out — and the status bar's *Sign In with Datalayer*.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const host = vi.hoisted(() => ({
  requests: [] as Array<{ id: string; scopes: unknown; options: unknown }>,
  registered: [] as Array<{ id: string; label: string; options: unknown }>,
}));

vi.mock("vscode", () => {
  class EventEmitter<T> {
    listeners: Array<(value: T) => void> = [];
    event = (listener: (value: T) => void) => {
      this.listeners.push(listener);
      return {
        dispose: () => {
          this.listeners = this.listeners.filter((l) => l !== listener);
        },
      };
    };
    fire(value: T) {
      for (const listener of [...this.listeners]) {
        listener(value);
      }
    }
    dispose() {
      this.listeners = [];
    }
  }
  return {
    EventEmitter,
    commands: { executeCommand: async () => undefined },
    authentication: {
      registerAuthenticationProvider: (
        id: string,
        label: string,
        _provider: unknown,
        options: unknown,
      ) => {
        host.registered.push({ id, label, options });
        return { dispose: () => undefined };
      },
      getSession: async (id: string, scopes: unknown, options: unknown) => {
        host.requests.push({ id, scopes, options });
        return undefined;
      },
    },
  };
});

import { EventEmitter } from "vscode";

import {
  DATALAYER_AUTH_PROVIDER_ID,
  DatalayerAuthenticationProvider,
  registerDatalayerAuthenticationProvider,
  sessionOf,
} from "../../src/services/core/authenticationProviderAdapter";
import { statusBarLookOf } from "../../src/services/ui/statusBar";

type User = { uid: string; handle: string; email: string; displayName: string };

const ada: User = {
  uid: "u-1",
  handle: "ada",
  email: "ada@example.com",
  displayName: "Ada Lovelace",
};

/** The extension's sign-in, whose state the test changes. */
function makeSource(user: User | null) {
  const emitter = new EventEmitter<unknown>();
  const source = {
    user,
    getAuthState: () => ({
      isAuthenticated: source.user !== null,
      user: source.user,
    }),
    onAuthStateChanged: emitter.event,
    getToken: () => (source.user ? "token-1" : ""),
    sign(next: User | null) {
      source.user = next;
      emitter.fire(source.getAuthState());
    },
  };
  return source;
}

describe("the Datalayer authentication provider", () => {
  it("has the signed-in user's session, none signed out", async () => {
    const source = makeSource(ada);
    const provider = new DatalayerAuthenticationProvider(source);
    expect(await provider.getSessions()).toEqual([
      {
        id: "datalayer-u-1",
        accessToken: "token-1",
        account: { id: "u-1", label: "ada" },
        scopes: [],
      },
    ]);
    source.sign(null);
    expect(await provider.getSessions()).toEqual([]);
  });

  it("labels the account by its email, then its name, without a handle", () => {
    expect(sessionOf(makeSource({ ...ada, handle: "" }))?.account.label).toBe(
      "ada@example.com",
    );
    expect(
      sessionOf(makeSource({ ...ada, handle: "", email: "" }))?.account.label,
    ).toBe("Ada Lovelace");
  });

  it("says each sign-in, sign-out and change of account, nothing else", () => {
    const source = makeSource(null);
    const provider = new DatalayerAuthenticationProvider(source);
    const events: unknown[] = [];
    provider.onDidChangeSessions((event) => events.push(event));

    source.sign(ada);
    source.sign(ada);
    source.sign({ ...ada, uid: "u-2", handle: "grace" });
    source.sign(null);

    expect(events).toEqual([
      {
        added: [expect.objectContaining({ id: "datalayer-u-1" })],
        removed: [],
        changed: [],
      },
      {
        added: [expect.objectContaining({ id: "datalayer-u-2" })],
        removed: [expect.objectContaining({ id: "datalayer-u-1" })],
        changed: [],
      },
      {
        added: [],
        removed: [expect.objectContaining({ id: "datalayer-u-2" })],
        changed: [],
      },
    ]);
  });

  it("signs in with datalayer.login and gives the session", async () => {
    const source = makeSource(null);
    const run = vi.fn(async (command: string) => {
      if (command === "datalayer.login") {
        source.sign(ada);
      }
    });
    const provider = new DatalayerAuthenticationProvider(source, run);
    const session = await provider.createSession();
    expect(run).toHaveBeenCalledWith("datalayer.login");
    expect(session.account).toEqual({ id: "u-1", label: "ada" });
  });

  it("fails when the sign-in was cancelled", async () => {
    const run = vi.fn(async () => undefined);
    const provider = new DatalayerAuthenticationProvider(makeSource(null), run);
    await expect(provider.createSession()).rejects.toThrow(/cancelled/);
  });

  it("signs out with datalayer.logout", async () => {
    const run = vi.fn(async () => undefined);
    const provider = new DatalayerAuthenticationProvider(makeSource(ada), run);
    await provider.removeSession();
    expect(run).toHaveBeenCalledWith("datalayer.logout");
  });
});

describe("registering it", () => {
  beforeEach(() => {
    host.requests.length = 0;
    host.registered.length = 0;
  });

  it("asks quietly for a session while signed out, again on each sign-out", () => {
    const source = makeSource(null);
    registerDatalayerAuthenticationProvider(
      { subscriptions: [] } as never,
      source,
    );
    expect(host.registered).toEqual([
      {
        id: DATALAYER_AUTH_PROVIDER_ID,
        label: "Datalayer",
        options: { supportsMultipleAccounts: false },
      },
    ]);
    // `createIfNone: false`, never `silent`: the Accounts menu shows its
    // badge and a "Sign in with Datalayer" entry.
    expect(host.requests).toEqual([
      { id: "datalayer", scopes: [], options: { createIfNone: false } },
    ]);
    source.sign(ada);
    expect(host.requests).toHaveLength(1);
    source.sign(null);
    expect(host.requests).toHaveLength(2);
  });

  it("asks nothing while signed in", () => {
    registerDatalayerAuthenticationProvider(
      { subscriptions: [] } as never,
      makeSource(ada),
    );
    expect(host.requests).toEqual([]);
  });
});

describe("the status bar", () => {
  it("signed out: Sign In with Datalayer, running the sign-in", () => {
    expect(statusBarLookOf({ isAuthenticated: false, user: null })).toEqual({
      text: "$(sign-in) Sign In with Datalayer",
      tooltip: "Sign in to Datalayer",
      command: "datalayer.login",
    });
  });

  it("signed in: Datalayer, as before", () => {
    expect(statusBarLookOf({ isAuthenticated: true, user: ada })).toEqual({
      text: "$(datalayer-logo) Datalayer",
      tooltip: "Connected as Ada Lovelace",
      command: "datalayer.showAuthStatus",
    });
  });
});
