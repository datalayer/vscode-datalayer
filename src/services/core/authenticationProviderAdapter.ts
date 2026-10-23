/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * The extension's Datalayer sign-in as a VS Code authentication provider,
 * so the Accounts menu (bottom left) lists the Datalayer account: signed in,
 * its handle with *Sign Out*; signed out, VS Code's badge and a *Sign in with
 * Datalayer* entry.
 *
 * An adapter only: `DatalayerAuthProvider` stays the source of truth — the
 * rest of the extension reads the user and the token from it, never through
 * `vscode.authentication`. The session follows its state, *Sign in* runs the
 * extension's own `datalayer.login`, *Sign Out* its `datalayer.logout`.
 *
 * @module services/core/authenticationProviderAdapter
 */

import * as vscode from "vscode";

/** The provider's id, as `vscode.authentication.getSession` names it. */
export const DATALAYER_AUTH_PROVIDER_ID = "datalayer";

/** The provider's label in the Accounts menu. */
export const DATALAYER_AUTH_PROVIDER_LABEL = "Datalayer";

/** What the adapter reads of the extension's sign-in. */
export interface AuthSource {
  /**
   * Who is signed in, if anyone.
   *
   * @returns Whether someone is, and their user.
   */
  getAuthState(): {
    isAuthenticated: boolean;
    user: {
      uid?: string;
      handle?: string;
      email?: string;
      displayName?: string;
    } | null;
  };
  onAuthStateChanged: vscode.Event<unknown>;
  /**
   * The signed-in user's token, for the session VS Code holds.
   *
   * @returns The token.
   */
  getToken(): string;
}

/**
 * The session of the signed-in user, or undefined when nobody is: its id and
 * account id are the user's uid, its label the handle (else the email, else
 * the display name).
 *
 * @param source - The extension's sign-in.
 *
 * @returns The session, or undefined.
 */
export function sessionOf(
  source: AuthSource,
): vscode.AuthenticationSession | undefined {
  const state = source.getAuthState();
  const user = state.user;
  if (!state.isAuthenticated || !user || !user.uid) {
    return undefined;
  }
  return {
    id: `datalayer-${user.uid}`,
    // The API's contract: a session carries its token. VS Code holds it in
    // memory for the extensions the person allows; nothing here logs it.
    accessToken: source.getToken(),
    account: {
      id: user.uid,
      label: user.handle || user.email || user.displayName || user.uid,
    },
    scopes: [],
  };
}

/**
 * The change between two sessions, as `onDidChangeSessions` says it; none
 * when the same account is still signed in.
 *
 * @param before - The session last said (none when signed out).
 * @param after - The session now (none when signed out).
 *
 * @returns The change, or undefined when there is none.
 */
export function sessionChangeOf(
  before: vscode.AuthenticationSession | undefined,
  after: vscode.AuthenticationSession | undefined,
): vscode.AuthenticationProviderAuthenticationSessionsChangeEvent | undefined {
  if (before?.id === after?.id) {
    return undefined;
  }
  return {
    added: after ? [after] : [],
    removed: before ? [before] : [],
    changed: [],
  };
}

/**
 * The Datalayer authentication provider: sessions from the extension's
 * sign-in, sign-in and sign-out through its commands.
 */
export class DatalayerAuthenticationProvider
  implements vscode.AuthenticationProvider, vscode.Disposable
{
  private readonly changed =
    new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
  /** Fired when the account signs in, out, or another signs in. */
  readonly onDidChangeSessions = this.changed.event;
  private current: vscode.AuthenticationSession | undefined;
  private readonly subscription: vscode.Disposable;

  /**
   * @param source - The extension's sign-in, the source of truth.
   * @param run - Runs a command (`datalayer.login`, `datalayer.logout`).
   */
  constructor(
    private readonly source: AuthSource,
    private readonly run: (command: string) => Thenable<unknown> = (command) =>
      vscode.commands.executeCommand(command),
  ) {
    this.current = sessionOf(source);
    this.subscription = source.onAuthStateChanged(() => {
      const next = sessionOf(this.source);
      const change = sessionChangeOf(this.current, next);
      this.current = next;
      if (change) {
        this.changed.fire(change);
      }
    });
  }

  /** @inheritdoc */
  async getSessions(): Promise<vscode.AuthenticationSession[]> {
    const session = sessionOf(this.source);
    return session ? [session] : [];
  }

  /**
   * Signs in with the extension's own flow (`datalayer.login`).
   *
   * @returns The session once signed in.
   *
   * @throws When the sign-in was cancelled or failed.
   */
  async createSession(): Promise<vscode.AuthenticationSession> {
    await this.run("datalayer.login");
    const session = sessionOf(this.source);
    if (!session) {
      throw new Error("Sign in with Datalayer was cancelled.");
    }
    return session;
  }

  /** Signs out with the extension's own flow (`datalayer.logout`). */
  async removeSession(): Promise<void> {
    await this.run("datalayer.logout");
  }

  /** @inheritdoc */
  dispose(): void {
    this.subscription.dispose();
    this.changed.dispose();
  }
}

/**
 * Registers the provider, and while signed out asks VS Code for a session
 * without prompting: the Accounts menu shows its badge and a *Sign in with
 * Datalayer* entry (`createIfNone: false`, not `silent`). Asked again on each
 * sign-out.
 *
 * @param context - Extension context for subscriptions.
 * @param source - The extension's sign-in.
 */
export function registerDatalayerAuthenticationProvider(
  context: vscode.ExtensionContext,
  source: AuthSource,
): void {
  const provider = new DatalayerAuthenticationProvider(source);
  const requestSignIn = (): void => {
    if (source.getAuthState().isAuthenticated) {
      return;
    }
    void Promise.resolve(
      vscode.authentication.getSession(DATALAYER_AUTH_PROVIDER_ID, [], {
        createIfNone: false,
      }),
    ).catch(() => {
      // Nothing to show: the status bar and the views still offer sign-in.
    });
  };
  context.subscriptions.push(
    provider,
    vscode.authentication.registerAuthenticationProvider(
      DATALAYER_AUTH_PROVIDER_ID,
      DATALAYER_AUTH_PROVIDER_LABEL,
      provider,
      { supportsMultipleAccounts: false },
    ),
    source.onAuthStateChanged(() => requestSignIn()),
  );
  requestSignIn();
}
