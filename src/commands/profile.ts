/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * The Profile page (`datalayer.profile.open`): the signed-in user, read-only,
 * drawn by core's `UserIdentity` as the web's profile page draws it, with
 * *Edit on Datalayer* opening the web's profile settings. The *Profile* row
 * of the sidebar's Home view, shown while signed in, runs it. The page is
 * given the user the extension holds and fetches nothing; signing out closes
 * it, another user signing in redraws it.
 *
 * @module commands/profile
 */

import * as vscode from "vscode";

import type { DatalayerAuthProvider } from "../services/core/authProvider";
import {
  identityOf,
  PROFILE_EDIT_URL,
  PROFILE_WORDS,
  type ProfileHostMessage,
  profilePageMessageOf,
  type ProfileUserLike,
} from "../ui/profile/profileIdentity";
import { getProfileHtml } from "../ui/templates/profileTemplate";

/** The command's id. */
export const PROFILE_COMMAND = "datalayer.profile.open";

/** The panel's view type. */
export const PROFILE_VIEW_TYPE = "datalayer.profile";

/**
 * Registers `datalayer.profile.open`.
 *
 * @param context - Extension context for subscriptions.
 * @param authProvider - The sign-in, whose user the page shows.
 */
export function registerProfileCommands(
  context: vscode.ExtensionContext,
  authProvider: DatalayerAuthProvider,
): void {
  const profile = new ProfilePanel(context, authProvider);
  context.subscriptions.push(
    vscode.commands.registerCommand(PROFILE_COMMAND, async () => {
      if (!authProvider.isAuthenticated()) {
        const login = "Login";
        const choice = await vscode.window.showInformationMessage(
          PROFILE_WORDS.signedOut,
          login,
        );
        if (choice === login) {
          await vscode.commands.executeCommand("datalayer.login");
        }
        return;
      }
      profile.show();
    }),
    profile,
  );
}

/** The one Profile panel: opened, or revealed when open. */
class ProfilePanel implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private disposables: vscode.Disposable[] = [];

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly authProvider: DatalayerAuthProvider,
  ) {}

  /** Opens the panel, or reveals it and redraws the user when open. */
  show(): void {
    if (this.panel) {
      this.panel.reveal();
      this.postProfile();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      PROFILE_VIEW_TYPE,
      PROFILE_WORDS.title,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.context.extensionUri, "dist"),
        ],
      },
    );
    this.panel = panel;
    panel.iconPath = new vscode.ThemeIcon("account");
    panel.webview.html = getProfileHtml(
      panel.webview,
      this.context.extensionUri,
    );
    this.disposables.push(
      vscode.window.onDidChangeActiveColorTheme(() => this.postTheme()),
      // Signed out: nothing is left to show. Another user: drawn again.
      this.authProvider.onAuthStateChanged((state) => {
        if (!state.isAuthenticated || !state.user) {
          this.dispose();
        } else {
          this.postProfile();
        }
      }),
      panel.webview.onDidReceiveMessage((raw) => this.onMessage(raw)),
      panel.onDidDispose(() => this.closed()),
    );
  }

  /** Closes the panel, when it is open. */
  dispose(): void {
    this.panel?.dispose();
  }

  /** The panel closed: its listeners let go. */
  private closed(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
    this.panel = undefined;
  }

  /**
   * Posts a message to the page, when the panel is open.
   *
   * @param message - What the page is told.
   */
  private post(message: ProfileHostMessage): void {
    void this.panel?.webview.postMessage(message);
  }

  /** Tells the page the signed-in user, read as its identity. */
  private postProfile(): void {
    const user = this.authProvider.getAuthState().user;
    if (user) {
      this.post({
        type: "profile",
        body: identityOf(user as unknown as ProfileUserLike),
      });
    }
  }

  /** Tells the page whether VS Code's theme is light or dark. */
  private postTheme(): void {
    const kind = vscode.window.activeColorTheme.kind;
    this.post({
      type: "theme-changed",
      theme:
        kind === vscode.ColorThemeKind.Dark ||
        kind === vscode.ColorThemeKind.HighContrast
          ? "dark"
          : "light",
    });
  }

  /**
   * Answers the page: its first paint, its *Edit on Datalayer*.
   *
   * @param raw - The page's message, before it is read.
   */
  private async onMessage(raw: unknown): Promise<void> {
    const message = profilePageMessageOf(raw);
    if (!message) {
      return;
    }
    switch (message.type) {
      case "ready":
        this.postTheme();
        this.postProfile();
        return;
      case "edit":
        await vscode.env.openExternal(vscode.Uri.parse(PROFILE_EDIT_URL));
        return;
    }
  }
}
