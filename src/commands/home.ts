/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * *Datalayer: Home* (`datalayer.home`): the sidebar's blocks — Outline,
 * Spaces, Sessions, Agents, Settings — as one page in an editor tab. The
 * page reads the sidebar's own tree providers (`ui/home/homeSnapshot`), runs
 * an item's own command on a click, refreshes a block through its provider,
 * and reads again when a provider says its tree changed.
 *
 * The sidebar's *Home* view, first in the Datalayer container, is a tree of
 * one *Open Datalayer* row, and under it, while signed in, a *Profile* row
 * opening the Profile page (`commands/profile`); it is read again on each
 * sign-in and sign-out.
 *
 * @module commands/home
 */

import * as vscode from "vscode";

import type { DatalayerAuthProvider } from "../services/core/authProvider";
import {
  DEFAULT_SNAPSHOT_OPTIONS,
  type HomeHostMessage,
  type HomeSection,
  type KeptCommand,
  keyedBySection,
  pageMessageOf,
  snapshotTree,
  type TreeProviderLike,
} from "../ui/home/homeSnapshot";
import { getHomeHtml } from "../ui/templates/homeTemplate";
import { PROFILE_COMMAND } from "./profile";

/** The command's id. */
export const HOME_COMMAND = "datalayer.home";

/** The panel's view type. */
export const HOME_VIEW_TYPE = "datalayer.home";

/** The sidebar's *Home* view (the button). */
export const HOME_BUTTON_VIEW = "datalayerHome";

/** A sidebar block the page shows. */
export interface HomeSectionSource {
  /** The sidebar view's id. */
  id: string;
  title: string;
  /** A codicon id. */
  icon: string;
  provider: TreeProviderLike<unknown> & {
    onDidChangeTreeData?: vscode.Event<unknown>;
  };
  /** What the block's refresh does in the sidebar. */
  refresh: () => void;
}

/** What the page reads. */
export interface HomeServices {
  authProvider: DatalayerAuthProvider;
  /** The blocks, in the sidebar's order. */
  sections: HomeSectionSource[];
}

/**
 * Registers `datalayer.home` and the sidebar's *Home* view.
 *
 * @param context - Extension context for subscriptions.
 * @param services - The sign-in and the sidebar's blocks.
 */
export function registerHomeCommands(
  context: vscode.ExtensionContext,
  services: HomeServices,
): void {
  const home = new HomePanel(context, services);
  // The rows change with the sign-in: *Profile* only while signed in.
  const rowsChanged = new vscode.EventEmitter<void>();
  context.subscriptions.push(
    vscode.commands.registerCommand(HOME_COMMAND, () => home.show()),
    // The button's view: *Open Datalayer*, then *Profile* when signed in —
    // a row is the least height a sidebar view takes (a welcome button
    // takes a block).
    vscode.window.registerTreeDataProvider<vscode.TreeItem>(HOME_BUTTON_VIEW, {
      getChildren: () => homeRowItems(services.authProvider.isAuthenticated()),
      getTreeItem: (element) => element,
      onDidChangeTreeData: rowsChanged.event,
    }),
    services.authProvider.onAuthStateChanged(() => rowsChanged.fire()),
    rowsChanged,
    home,
  );
}

/**
 * The sidebar's Home view rows: *Open Datalayer*, then *Profile* while
 * signed in, *Sign In with Datalayer* while not.
 *
 * @param signedIn - Whether someone is signed in.
 *
 * @returns The rows, in order.
 */
export function homeRowItems(signedIn: boolean): vscode.TreeItem[] {
  return [homeButtonItem(), signedIn ? profileItem() : signInItem()];
}

/**
 * The sidebar's row that signs in (`datalayer.login`), while nobody is.
 *
 * @returns The row.
 */
export function signInItem(): vscode.TreeItem {
  const item = new vscode.TreeItem("Sign In with Datalayer");
  item.iconPath = new vscode.ThemeIcon("sign-in");
  item.tooltip = "Sign in to Datalayer";
  item.command = {
    command: "datalayer.login",
    title: "Sign In with Datalayer",
  };
  return item;
}

/**
 * The sidebar's row that opens the Profile page.
 *
 * @returns The row.
 */
export function profileItem(): vscode.TreeItem {
  const item = new vscode.TreeItem("Profile");
  item.iconPath = new vscode.ThemeIcon("account");
  item.tooltip = "Your Datalayer profile";
  item.command = { command: PROFILE_COMMAND, title: "Profile" };
  return item;
}

/**
 * The sidebar's one row that opens the page.
 *
 * @returns The row.
 */
export function homeButtonItem(): vscode.TreeItem {
  const item = new vscode.TreeItem("Open Datalayer");
  // The Datalayer mark, as the sidebar wears it (the contributed glyph).
  item.iconPath = new vscode.ThemeIcon("datalayer-logo");
  item.tooltip =
    "Datalayer: Home — your outline, spaces, sessions, agents and settings on one page";
  item.command = { command: HOME_COMMAND, title: "Open Datalayer" };
  return item;
}

/** The one *Datalayer* panel: opened, or revealed when open. */
class HomePanel implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private panelDisposables: vscode.Disposable[] = [];
  private commands = new Map<string, KeptCommand>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Sections changed while the panel was hidden: read when it shows again. */
  private readonly stale = new Set<string>();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly services: HomeServices,
  ) {}

  /** Opens the panel, or reveals it when it is open. */
  show(): void {
    if (this.panel) {
      this.panel.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      HOME_VIEW_TYPE,
      "Datalayer",
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
    panel.iconPath = vscode.Uri.joinPath(
      this.context.extensionUri,
      "images",
      "datalayer-logo.png",
    );
    panel.webview.html = getHomeHtml(panel.webview, this.context.extensionUri);

    const { authProvider, sections } = this.services;
    this.panelDisposables.push(
      vscode.window.onDidChangeActiveColorTheme(() => this.postTheme()),
      authProvider.onAuthStateChanged(() => void this.postAll()),
      panel.onDidChangeViewState(() => {
        if (panel.visible && this.stale.size > 0) {
          const ids = [...this.stale];
          this.stale.clear();
          for (const id of ids) {
            this.schedule(id);
          }
        }
      }),
      panel.webview.onDidReceiveMessage((raw) => this.onMessage(raw)),
      panel.onDidDispose(() => this.closed()),
    );
    for (const section of sections) {
      if (section.provider.onDidChangeTreeData) {
        this.panelDisposables.push(
          section.provider.onDidChangeTreeData(() => this.schedule(section.id)),
        );
      }
    }
  }

  /** Closes the panel, when it is open. */
  dispose(): void {
    this.panel?.dispose();
  }

  /** The panel closed: its listeners, timers and kept commands let go. */
  private closed(): void {
    for (const disposable of this.panelDisposables) {
      disposable.dispose();
    }
    this.panelDisposables = [];
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.stale.clear();
    this.commands.clear();
    this.panel = undefined;
  }

  /**
   * Posts a message to the page, when the panel is open.
   *
   * @param message - What the page is told.
   */
  private post(message: HomeHostMessage): void {
    void this.panel?.webview.postMessage(message);
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
   * Answers the page: its first paint, a sign-in, a section's refresh, a
   * row's click.
   *
   * @param raw - The page's message, before it is read.
   */
  private async onMessage(raw: unknown): Promise<void> {
    const message = pageMessageOf(raw);
    if (!message) {
      return;
    }
    switch (message.type) {
      case "ready":
        this.postTheme();
        await this.postAll();
        return;
      case "login":
        await vscode.commands.executeCommand("datalayer.login");
        return;
      case "refresh": {
        const section = this.services.sections.find(
          (candidate) => candidate.id === message.section,
        );
        // The provider's change event reads the section again.
        section?.refresh();
        return;
      }
      case "run": {
        const command = this.commands.get(message.key);
        if (command) {
          await vscode.commands.executeCommand(
            command.command,
            ...command.arguments,
          );
        }
        return;
      }
    }
  }

  /**
   * A provider's change, read once its burst is over.
   *
   * @param id - The section whose provider changed.
   */
  private schedule(id: string): void {
    if (!this.panel) {
      return;
    }
    if (!this.panel.visible) {
      this.stale.add(id);
      return;
    }
    const pending = this.timers.get(id);
    if (pending) {
      clearTimeout(pending);
    }
    this.timers.set(
      id,
      setTimeout(() => {
        this.timers.delete(id);
        void this.readSection(id).then((section) => {
          if (section) {
            this.post({ type: "home-section", body: section });
          }
        });
      }, 300),
    );
  }

  /** Posts the sign-in and every section, read again. */
  private async postAll(): Promise<void> {
    const { authProvider, sections } = this.services;
    const state = authProvider.getAuthState();
    const user = state.user
      ? state.user.displayName || state.user.email || undefined
      : undefined;
    const read = await Promise.all(
      sections.map((section) => this.readSection(section.id)),
    );
    this.post({
      type: "home-state",
      body: {
        signedIn: authProvider.isAuthenticated(),
        user,
        sections: read.filter((section): section is HomeSection => !!section),
      },
    });
  }

  /**
   * Reads a section's tree, keeping the commands its rows run.
   *
   * @param id - The section's sidebar view id.
   *
   * @returns The section, its error said in it when the tree could not be
   *   read; nothing when no section has the id.
   */
  private async readSection(id: string): Promise<HomeSection | undefined> {
    const source = this.services.sections.find(
      (candidate) => candidate.id === id,
    );
    if (!source) {
      return undefined;
    }
    const section: HomeSection = {
      id: source.id,
      title: source.title,
      icon: source.icon,
      nodes: [],
    };
    try {
      const snapshot = keyedBySection(
        source.id,
        await snapshotTree(source.provider, DEFAULT_SNAPSHOT_OPTIONS),
      );
      // Forget the section's old commands, keep the new ones.
      for (const key of [...this.commands.keys()]) {
        if (key.startsWith(`${source.id}:`)) {
          this.commands.delete(key);
        }
      }
      for (const [key, command] of snapshot.commands) {
        this.commands.set(key, command);
      }
      section.nodes = snapshot.nodes;
    } catch (error) {
      section.error = error instanceof Error ? error.message : String(error);
    }
    return section;
  }
}
