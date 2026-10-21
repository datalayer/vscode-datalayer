/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * The Sessions view (VS-04, VS-12): the person's sessions on Datalayer (the
 * record, through ai-agents, with the token the extension host holds) and
 * on this machine (each local runtime's `GET /api/v1/apps/sessions`) in one
 * tree, grouped by place then application, each row as `loop sessions list`
 * prints it; a *Teams* group with the person's team runs and their seats;
 * a filter by application, state and title; the archived hidden; refreshed
 * on open, on a session's change and by the title's button — never polled.
 * An unreachable place says so in one row. A row opens the session in the
 * Datalayer Chat (`datalayer.sessions.open`).
 *
 * @module providers/sessionsTreeProvider
 */

import type { SessionRow } from "@datalayer/agent-runtimes/lib/portable/activity";
import * as vscode from "vscode";

import {
  attentionRowsOf,
  contextValueOf,
  datalayerSessionsUrl,
  executionsUrl,
  filterSaid,
  filterSessions,
  groupByApplication,
  type ListedSession,
  listedSessionsOf,
  LOCAL_SESSIONS_PATH,
  NO_FILTER,
  NO_LOCAL_RUNTIME_SENTENCE,
  NO_TEAM_RUN,
  NOTHING_LISTED,
  placeKey,
  placeLabel,
  placeProblemSentence,
  rowDescription,
  rowLabel,
  type SessionApplication,
  type SessionFilter,
  type SessionPlace,
  SIGNED_OUT_SENTENCE,
  stateIconOf,
  type TeamRun,
  teamRunDescription,
  teamRunLabel,
  teamRunsOf,
  type TeamSeat,
  teamSeatDescription,
  teamsProblemSentence,
} from "../chat/sessions";
import { getValidatedSettingsGroup } from "../services/config/settingsValidator";
import type { VSCodeAuthState } from "../services/interfaces/IAuthProvider";
import type { LocalRuntimeService } from "../services/localRuntime/localRuntimeService";
import { ServiceLoggers } from "../services/logging/loggers";
import { SESSIONS_ATTENTION_COMMAND } from "../services/ui/sessionStatusBar";

/** What the tree reads: each place's sessions, the team runs. */
export interface SessionSources {
  /** Whether the person is signed in. */
  signedIn(): boolean;
  /** The sessions on Datalayer, for the person signed in. */
  datalayer(): Promise<ListedSession[]>;
  /** The local runtimes running, each with its sessions. */
  local(): Array<{ place: SessionPlace; list(): Promise<ListedSession[]> }>;
  /** The person's team runs. */
  teams(): Promise<TeamRun[]>;
  /** Fires when a place appears or goes (a local runtime started or stopped). */
  onDidChange?: vscode.Event<void>;
}

/** The *Teams* group's place. */
export type TreePlace = SessionPlace | { kind: "teams" };

/** A place's row. */
export class PlaceItem extends vscode.TreeItem {
  readonly kind = "place" as const;

  /**
   * @param place - Datalayer, a folder's local runtime, or the Teams group.
   */
  constructor(public readonly place: TreePlace) {
    super(
      place.kind === "teams" ? "Teams" : placeLabel(place),
      vscode.TreeItemCollapsibleState.Expanded,
    );
    this.contextValue = `place-${place.kind}`;
    this.iconPath = new vscode.ThemeIcon(
      place.kind === "datalayer"
        ? "cloud"
        : place.kind === "local"
          ? "device-desktop"
          : "organization",
    );
    this.id = `place:${place.kind === "teams" ? "teams" : placeKey(place)}`;
  }
}

/** An application's row under a place. */
export class ApplicationItem extends vscode.TreeItem {
  readonly kind = "application" as const;

  /**
   * @param place - Where the sessions run.
   * @param application - Which application the sessions belong to.
   * @param sessions - Its sessions kept by the filter.
   */
  constructor(
    public readonly place: SessionPlace,
    public readonly application: SessionApplication,
    public readonly sessions: ListedSession[],
  ) {
    super(application.name, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = application.key ? "application" : "application-unnamed";
    this.description = `${sessions.length} session${sessions.length === 1 ? "" : "s"}`;
    this.iconPath = new vscode.ThemeIcon("package");
    this.id = `application:${placeKey(place)}:${application.key || application.name}`;
    this.tooltip =
      application.key && application.key !== application.name
        ? `${application.name} (${application.key})`
        : application.name;
  }
}

/** A session's row: what the verbs act on. */
export class SessionItem extends vscode.TreeItem {
  readonly kind = "session" as const;

  /**
   * @param place - Where the session runs.
   * @param listed - The session with its application.
   */
  constructor(
    public readonly place: SessionPlace,
    public readonly listed: ListedSession,
  ) {
    super(rowLabel(listed.row), vscode.TreeItemCollapsibleState.None);
    const row = listed.row;
    this.description = rowDescription(row);
    this.contextValue = contextValueOf(row, place);
    this.iconPath = new vscode.ThemeIcon(stateIconOf(row));
    this.id = `session:${placeKey(place)}:${row.uid}`;
    this.tooltip = new vscode.MarkdownString(
      [
        `**${rowLabel(row)}** — ${row.uid}`,
        rowDescription(row),
        row.startedAt ? `Started ${row.startedAt}` : "",
        row.runsOn?.kind === "runtime"
          ? `On runtime ${row.runsOn.uid}`
          : row.runsOn?.kind === "team_run"
            ? `Seat ${row.runsOn.seat} of team run ${row.runsOn.executionId}`
            : "On no runtime now",
      ]
        .filter(Boolean)
        .join("\n\n"),
    );
    this.command = {
      command: "datalayer.sessions.open",
      title: "Open the session",
      arguments: [this],
    };
  }

  /** The session as listed, for the verbs. */
  get row(): SessionRow {
    return this.listed.row;
  }
}

/** One sentence under a place: a problem, nothing listed, signed out. */
export class NoteItem extends vscode.TreeItem {
  readonly kind = "note" as const;

  /**
   * @param sentence - What the row says.
   * @param problem - Whether it says a place did not answer.
   */
  constructor(sentence: string, problem = false) {
    super(sentence, vscode.TreeItemCollapsibleState.None);
    this.contextValue = problem ? "note-problem" : "note";
    this.iconPath = new vscode.ThemeIcon(problem ? "warning" : "info");
    this.tooltip = sentence;
  }
}

/** A team run's row. */
export class TeamRunItem extends vscode.TreeItem {
  readonly kind = "team" as const;

  /**
   * @param run - The team run as listed.
   */
  constructor(public readonly run: TeamRun) {
    super(teamRunLabel(run), vscode.TreeItemCollapsibleState.Collapsed);
    this.description = teamRunDescription(run);
    this.contextValue = `team-${run.state}`;
    this.iconPath = new vscode.ThemeIcon(
      stateIconOf({
        state: run.state,
        turn:
          run.status === "running"
            ? "running"
            : run.status === "waiting"
              ? "waiting"
              : "",
      }),
    );
    this.id = `team:${run.executionId}`;
    this.tooltip = `${run.team} · ${run.executionId} · ${run.status}\n\n${run.goal}`;
  }
}

/** A seat's row under a team run: its session opens by its uid. */
export class SeatItem extends vscode.TreeItem {
  readonly kind = "seat" as const;

  /**
   * @param run - The team run the seat belongs to.
   * @param seat - The seat as listed under it.
   */
  constructor(
    public readonly run: TeamRun,
    public readonly seat: TeamSeat,
  ) {
    super(seat.seat, vscode.TreeItemCollapsibleState.None);
    this.description = teamSeatDescription(seat);
    this.contextValue = seat.sessionUid ? "seat-session" : "seat";
    this.iconPath = new vscode.ThemeIcon("person");
    this.id = `seat:${run.executionId}:${seat.executionId}`;
    if (seat.sessionUid) {
      this.command = {
        command: "datalayer.sessions.open",
        title: "Open the seat's session",
        arguments: [this],
      };
    }
  }
}

/** Every row of the tree. */
export type SessionsTreeItem =
  PlaceItem | ApplicationItem | SessionItem | NoteItem | TeamRunItem | SeatItem;

/**
 * The tree data provider of the Sessions view.
 */
export class SessionsTreeProvider
  implements vscode.TreeDataProvider<SessionsTreeItem>, vscode.Disposable
{
  private readonly changed = new vscode.EventEmitter<
    SessionsTreeItem | undefined | void
  >();
  readonly onDidChangeTreeData: vscode.Event<
    SessionsTreeItem | undefined | void
  > = this.changed.event;

  private filter: SessionFilter = NO_FILTER;
  private readonly cache = new Map<string, Promise<SessionsTreeItem[]>>();
  private readonly subscriptions: vscode.Disposable[] = [];
  private view: vscode.TreeView<SessionsTreeItem> | undefined;

  /**
   * @param sources - What the tree reads.
   * @param onAuthStateChanged - The sign-in's event: a change refreshes.
   */
  constructor(
    private readonly sources: SessionSources,
    onAuthStateChanged?: vscode.Event<VSCodeAuthState>,
  ) {
    if (onAuthStateChanged) {
      this.subscriptions.push(onAuthStateChanged(() => this.refresh()));
    }
    if (sources.onDidChange) {
      this.subscriptions.push(sources.onDidChange(() => this.refresh()));
    }
  }

  /**
   * The view, once created: its description says the filter.
   *
   * @param view - The Sessions view as VS Code created it.
   */
  attach(view: vscode.TreeView<SessionsTreeItem>): void {
    this.view = view;
    this.subscriptions.push(view);
    this.sayFilter();
  }

  /** Forgets what was read and redraws: the title's button, a session's change, a sign-in. */
  refresh(): void {
    this.cache.clear();
    this.changed.fire();
  }

  /**
   * Narrows the tree.
   *
   * @param filter - By application, state and title; `NO_FILTER` for all.
   */
  setFilter(filter: SessionFilter): void {
    this.filter = filter;
    this.sayFilter();
    this.changed.fire();
  }

  /**
   * The filter in force.
   *
   * @returns What narrows the tree now.
   */
  getFilter(): SessionFilter {
    return this.filter;
  }

  /** @inheritdoc */
  getTreeItem(element: SessionsTreeItem): vscode.TreeItem {
    return element;
  }

  /** @inheritdoc */
  async getChildren(element?: SessionsTreeItem): Promise<SessionsTreeItem[]> {
    if (!element) {
      const places: SessionsTreeItem[] = [new PlaceItem({ kind: "datalayer" })];
      for (const local of this.sources.local()) {
        places.push(new PlaceItem(local.place));
      }
      if (this.sources.local().length === 0) {
        places.push(
          new PlaceItem({
            kind: "local",
            folder: "",
            folderName: "no runtime",
            url: "",
          }),
        );
      }
      places.push(new PlaceItem({ kind: "teams" }));
      return places;
    }
    if (element.kind === "place") {
      return this.childrenOfPlace(element.place);
    }
    if (element.kind === "application") {
      return element.sessions.map(
        (listed) => new SessionItem(element.place, listed),
      );
    }
    if (element.kind === "team") {
      return element.run.seats.map((seat) => new SeatItem(element.run, seat));
    }
    return [];
  }

  /** @inheritdoc */
  dispose(): void {
    for (const subscription of this.subscriptions) {
      subscription.dispose();
    }
    this.changed.dispose();
  }

  /**
   * A place's rows, read once and kept until the next refresh.
   *
   * @param place - Which place.
   *
   * @returns Its rows, as read or being read.
   */
  private childrenOfPlace(place: TreePlace): Promise<SessionsTreeItem[]> {
    const key = place.kind === "teams" ? "teams" : placeKey(place);
    let pending = this.cache.get(key);
    if (!pending) {
      pending = this.readPlace(place);
      this.cache.set(key, pending);
    }
    return pending;
  }

  /**
   * Reads a place: its sessions grouped by application, or one row saying why not.
   *
   * @param place - Which place.
   *
   * @returns The rows under it.
   */
  private async readPlace(place: TreePlace): Promise<SessionsTreeItem[]> {
    if (place.kind === "teams") {
      if (!this.sources.signedIn()) {
        return [new NoteItem(SIGNED_OUT_SENTENCE)];
      }
      try {
        const runs = await this.sources.teams();
        return runs.length
          ? runs.map((run) => new TeamRunItem(run))
          : [new NoteItem(NO_TEAM_RUN)];
      } catch (error) {
        return [new NoteItem(teamsProblemSentence(message(error)), true)];
      }
    }
    if (place.kind === "datalayer" && !this.sources.signedIn()) {
      return [new NoteItem(SIGNED_OUT_SENTENCE)];
    }
    if (place.kind === "local" && !place.url) {
      return [new NoteItem(NO_LOCAL_RUNTIME_SENTENCE)];
    }
    try {
      const listed =
        place.kind === "datalayer"
          ? await this.sources.datalayer()
          : await (this.sources
              .local()
              .find((local) => placeKey(local.place) === placeKey(place))
              ?.list() ?? Promise.reject(new Error("the runtime is gone")));
      // The place's sessions as the status bar watches them (VS-10): every
      // one listed, unfiltered, through the internal command.
      void vscode.commands
        .executeCommand(
          SESSIONS_ATTENTION_COMMAND,
          attentionRowsOf(listed),
          placeKey(place),
        )
        .then(undefined, () => undefined);
      const kept = filterSessions(listed, this.filter);
      if (kept.length === 0) {
        return [new NoteItem(NOTHING_LISTED)];
      }
      return groupByApplication(kept).map(
        (group) =>
          new ApplicationItem(place, group.application, group.sessions),
      );
    } catch (error) {
      ServiceLoggers.main.warn("[Sessions] a place did not answer", {
        place: placeKey(place),
        message: message(error),
      });
      return [new NoteItem(placeProblemSentence(place, message(error)), true)];
    }
  }

  /** Writes the filter's words in the view's description. */
  private sayFilter(): void {
    if (this.view) {
      this.view.description = filterSaid(this.filter);
    }
  }
}

/**
 * What went wrong, in words.
 *
 * @param error - What was thrown.
 *
 * @returns Its message, or the value as a string.
 */
function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The sign-in the sources read from. */
export interface SessionSourcesAuth {
  isAuthenticated(): boolean;
  getToken(): string;
  getAuthState(): VSCodeAuthState;
}

/**
 * The real sources: ai-agents with the token for Datalayer and the teams,
 * each running local runtime for this machine.
 *
 * @param auth - The sign-in, for the token and the person's uid.
 * @param localRuntimes - The local runtimes running on this machine.
 *
 * @returns What the tree reads.
 */
export function sessionSourcesOf(
  auth: SessionSourcesAuth,
  localRuntimes: LocalRuntimeService,
): SessionSources {
  const signed = async (url: string): Promise<unknown> => {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${auth.getToken()}` },
    });
    if (!response.ok) {
      let detail = "";
      try {
        const body = (await response.json()) as { detail?: unknown };
        detail = typeof body.detail === "string" ? body.detail : "";
      } catch {
        // The status says it.
      }
      throw new Error(detail || `ai-agents answered ${response.status}.`);
    }
    return response.json();
  };
  return {
    signedIn: () => auth.isAuthenticated(),
    datalayer: async () => {
      const uid = auth.getAuthState().user?.uid ?? "";
      if (!uid) {
        throw new Error("the person signed in has no uid.");
      }
      const aiAgentsUrl = getValidatedSettingsGroup("services").aiAgentsUrl;
      return listedSessionsOf(
        await signed(datalayerSessionsUrl(aiAgentsUrl, uid)),
      );
    },
    local: () =>
      localRuntimes.list().map((runtime) => ({
        place: {
          kind: "local" as const,
          folder: runtime.folder.uri.fsPath,
          folderName: runtime.folder.name,
          url: runtime.url,
        },
        list: async () => {
          const response = await fetch(
            `${runtime.url}${LOCAL_SESSIONS_PATH}?limit=200`,
          );
          if (!response.ok) {
            throw new Error(`the runtime answered ${response.status}.`);
          }
          return listedSessionsOf(await response.json());
        },
      })),
    teams: async () => {
      const aiAgentsUrl = getValidatedSettingsGroup("services").aiAgentsUrl;
      const body = (await signed(executionsUrl(aiAgentsUrl))) as {
        executions?: unknown;
      };
      return teamRunsOf(Array.isArray(body.executions) ? body.executions : []);
    },
    onDidChange: localRuntimes.onDidChange,
  };
}
