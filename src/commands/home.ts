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
 * The sidebar's *Home* view, first in the Datalayer container, is an empty
 * tree whose welcome content is one *Open Datalayer* button.
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
  context.subscriptions.push(
    vscode.commands.registerCommand(HOME_COMMAND, () => home.show()),
    // The button's view: one row, *Open Datalayer* — a row is the least
    // height a sidebar view takes (a welcome button takes a block).
    vscode.window.registerTreeDataProvider<vscode.TreeItem>(HOME_BUTTON_VIEW, {
      getChildren: () => [homeButtonItem()],
      getTreeItem: (element) => element,
    }),
    home,
  );
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

  dispose(): void {
    this.panel?.dispose();
  }

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

  private post(message: HomeHostMessage): void {
    void this.panel?.webview.postMessage(message);
  }

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

  /** A provider's change, read once its burst is over. */
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
