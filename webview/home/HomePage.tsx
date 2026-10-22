/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * The *Datalayer* home page: the sidebar's blocks — Outline, Spaces,
 * Sessions, Agents, Settings — as sections of one page. The items are the
 * sidebar trees' own, read by the extension host (`ui/home/homeSnapshot`);
 * a click runs the item's own command on the host, as the tree does.
 *
 * @module webview/home/HomePage
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActionList,
  Button,
  CounterLabel,
  Flash,
  Heading,
  IconButton,
  Text,
} from "@primer/react";
import { Box } from "@datalayer/primer-addons";
import {
  AlertIcon,
  ArchiveIcon,
  BookIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleSlashIcon,
  CloudIcon,
  CodeIcon,
  CommentDiscussionIcon,
  CpuIcon,
  DatabaseIcon,
  DeviceDesktopIcon,
  DotFillIcon,
  DotIcon,
  FileCodeIcon,
  FileDirectoryIcon,
  FileIcon,
  FileMediaIcon,
  GearIcon,
  HomeIcon,
  InfoIcon,
  KeyIcon,
  ListUnorderedIcon,
  MarkdownIcon,
  OrganizationIcon,
  PackageIcon,
  PauseIcon,
  PersonIcon,
  PlayIcon,
  ProjectIcon,
  QuestionIcon,
  ServerIcon,
  SignInIcon,
  SyncIcon,
  TableIcon,
  ThreeBarsIcon,
  XCircleIcon,
  type Icon,
} from "@primer/octicons-react";
import { CenteredSpinner } from "@datalayer/core/lib/components/display/CenteredSpinner";
import { BusyDots } from "@datalayer/core/lib/components/display/BusyDots";
import {
  StatusLabel,
  type StatusLabelTone,
} from "@datalayer/core/lib/components/labels/StatusLabels";
import {
  SESSION_STATE_WORDS,
  type SessionState,
} from "@datalayer/agent-runtimes/lib/portable/activity";
import {
  sessionStateOf,
  type HomeNode,
  type HomePageMessage,
  type HomeSection,
  type HomeState,
} from "../../src/ui/home/homeSnapshot";
import { PrimerVSCodeTheme } from "../theme/PrimerVSCodeTheme";

declare function acquireVsCodeApi(): {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
};

const vscode = acquireVsCodeApi();

function post(message: HomePageMessage): void {
  vscode.postMessage(message);
}

/** The tree items' codicons, drawn as the nearest octicon. */
const ICONS: Record<string, Icon> = {
  "list-tree": ListUnorderedIcon,
  cloud: CloudIcon,
  "comment-discussion": CommentDiscussionIcon,
  vm: ServerIcon,
  "vm-running": CpuIcon,
  "settings-gear": GearIcon,
  notebook: BookIcon,
  library: BookIcon,
  folder: FileDirectoryIcon,
  file: FileIcon,
  "file-text": FileIcon,
  "file-code": FileCodeIcon,
  "file-media": FileMediaIcon,
  "file-pdf": FileIcon,
  json: CodeIcon,
  code: CodeIcon,
  markdown: MarkdownIcon,
  table: TableIcon,
  project: ProjectIcon,
  menu: ThreeBarsIcon,
  play: PlayIcon,
  person: PersonIcon,
  organization: OrganizationIcon,
  "device-desktop": DeviceDesktopIcon,
  package: PackageIcon,
  archive: ArchiveIcon,
  key: KeyIcon,
  database: DatabaseIcon,
  error: XCircleIcon,
  warning: AlertIcon,
  info: InfoIcon,
  question: QuestionIcon,
  "circle-filled": DotFillIcon,
  "circle-slash": CircleSlashIcon,
  "debug-pause": PauseIcon,
  "sync~spin": SyncIcon,
  "loading~spin": SyncIcon,
};

function iconOf(id: string | undefined): Icon {
  return (id && ICONS[id]) || DotIcon;
}

/** A session state's tone on core's status label. */
const STATE_TONES: Record<SessionState, StatusLabelTone> = {
  open: "success",
  paused: "attention",
  ended: "neutral",
};

/** What an empty section says. */
const EMPTY: Record<string, string> = {
  datalayerOutline:
    "Open a notebook or a Datalayer document to see its outline here.",
  datalayerRuntimes: "No runtime or snapshot.",
};

/** One visible row: a node at its depth. */
interface Row {
  node: HomeNode;
  depth: number;
  open: boolean;
}

function visibleRows(
  nodes: HomeNode[],
  isOpen: (node: HomeNode) => boolean,
  depth = 0,
  rows: Row[] = [],
): Row[] {
  for (const node of nodes) {
    const open = node.children.length > 0 && isOpen(node);
    rows.push({ node, depth, open });
    if (open) {
      visibleRows(node.children, isOpen, depth + 1, rows);
    }
  }
  return rows;
}

/**
 * Where a section sits on the page's six-column grid (wide windows): Sessions
 * and Agents share the first row, Spaces, Outline and Settings the second.
 * Narrow, one section per row.
 */
const GRID_SPAN: Record<string, string> = {
  datalayerSessions: "span 3",
  datalayerRuntimes: "span 3",
};

/** One line, cut with an ellipsis: the whole text is the row's tooltip. */
const ONE_LINE = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  minWidth: 0,
} as const;

function SectionCard({
  section,
  refreshing,
  onRefresh,
}: {
  section: HomeSection;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const isOpen = useCallback(
    (node: HomeNode) => toggled[node.key] ?? node.expanded,
    [toggled],
  );
  const rows = useMemo(
    () => visibleRows(section.nodes, isOpen),
    [section.nodes, isOpen],
  );
  const SectionIcon = iconOf(section.icon);

  return (
    <Box
      as="section"
      aria-labelledby={`${section.id}-title`}
      sx={{
        border: "1px solid",
        borderColor: "border.default",
        borderRadius: 2,
        bg: "canvas.subtle",
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        gridColumn: ["auto", "auto", GRID_SPAN[section.id] ?? "span 2"],
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          px: 3,
          py: 2,
          borderBottom: "1px solid",
          borderColor: "border.default",
        }}
      >
        <SectionIcon />
        <Heading
          as="h2"
          id={`${section.id}-title`}
          sx={{ fontSize: 2, flex: 1, display: "flex", alignItems: "center" }}
        >
          {section.title}
          {refreshing && <BusyDots ariaLabel={`Refreshing ${section.title}`} />}
        </Heading>
        <CounterLabel>{section.nodes.length}</CounterLabel>
        <IconButton
          icon={SyncIcon}
          size="small"
          variant="invisible"
          aria-label={`Refresh ${section.title}`}
          onClick={onRefresh}
        />
      </Box>
      {section.error ? (
        <Flash variant="danger" sx={{ m: 2 }}>
          {section.error}
        </Flash>
      ) : rows.length === 0 ? (
        <Text as="p" sx={{ px: 3, py: 2, color: "fg.muted", m: 0 }}>
          {EMPTY[section.id] ?? "Nothing to show."}
        </Text>
      ) : (
        <ActionList
          sx={{ maxHeight: 420, overflowY: "auto", overflowX: "hidden" }}
        >
          {rows.map(({ node, depth, open }) => {
            const NodeIcon = iconOf(node.icon);
            const state = sessionStateOf(node.contextValue);
            const expandable = node.children.length > 0;
            return (
              <ActionList.Item
                key={node.key}
                title={
                  node.tooltip ??
                  [node.label, node.description].filter(Boolean).join(" — ")
                }
                sx={{
                  pl: 2 + depth * 3,
                  // The label and its description on one line, cut to fit:
                  // every flex box of the row may shrink below its text.
                  "& span, & div": { minWidth: 0 },
                }}
                onSelect={() => {
                  if (node.command) {
                    post({ type: "run", key: node.key });
                  } else if (expandable) {
                    setToggled((was) => ({ ...was, [node.key]: !open }));
                  }
                }}
              >
                <ActionList.LeadingVisual>
                  {expandable ? (
                    <Box
                      as="span"
                      role="button"
                      aria-label={open ? "Collapse" : "Expand"}
                      sx={{ display: "inline-flex", cursor: "pointer" }}
                      onClick={(event: React.MouseEvent) => {
                        event.stopPropagation();
                        setToggled((was) => ({ ...was, [node.key]: !open }));
                      }}
                    >
                      {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
                    </Box>
                  ) : (
                    <NodeIcon />
                  )}
                </ActionList.LeadingVisual>
                <Box as="span" sx={{ ...ONE_LINE, display: "block" }}>
                  {node.label}
                  {node.description && (
                    <Text sx={{ color: "fg.muted", fontSize: 0, ml: 2 }}>
                      {node.description}
                    </Text>
                  )}
                </Box>
                {state && (
                  <ActionList.TrailingVisual>
                    <StatusLabel tone={STATE_TONES[state]}>
                      {SESSION_STATE_WORDS[state]}
                    </StatusLabel>
                  </ActionList.TrailingVisual>
                )}
              </ActionList.Item>
            );
          })}
        </ActionList>
      )}
    </Box>
  );
}

/** Props for the HomePage component. */
export interface HomePageProps {
  colorMode: "light" | "dark";
}

/** The *Datalayer* page: the sidebar's blocks, one section each. */
export function HomePage({ colorMode }: HomePageProps) {
  const [state, setState] = useState<HomeState | undefined>();
  const [refreshing, setRefreshing] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message?.type === "home-state") {
        setState(message.body as HomeState);
        setRefreshing({});
      } else if (message?.type === "home-section") {
        const section = message.body as HomeSection;
        setState((was) =>
          was
            ? {
                ...was,
                sections: was.sections.map((candidate) =>
                  candidate.id === section.id ? section : candidate,
                ),
              }
            : was,
        );
        setRefreshing((was) => ({ ...was, [section.id]: false }));
      }
    };
    window.addEventListener("message", onMessage);
    post({ type: "ready" });
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <PrimerVSCodeTheme colorMode={colorMode}>
      <Box
        sx={{
          maxWidth: 1400,
          margin: "0 auto",
          p: 4,
          bg: "canvas.default",
          color: "fg.default",
          minHeight: "100vh",
          boxSizing: "border-box",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 1 }}>
          <HomeIcon size={24} />
          <Heading as="h1" sx={{ fontSize: 4 }}>
            Datalayer
          </Heading>
        </Box>
        <Text as="p" sx={{ color: "fg.muted", mt: 0, mb: 3 }}>
          {state?.signedIn && state.user ? `Signed in as ${state.user}. ` : ""}
          Your sessions, agents, spaces, outline and settings, as the sidebar
          shows them.
        </Text>
        {state && !state.signedIn && (
          <Flash
            variant="warning"
            sx={{ mb: 3, display: "flex", alignItems: "center", gap: 3 }}
          >
            <Text sx={{ flex: 1 }}>
              You are signed out of Datalayer: sign in to see your spaces,
              sessions, agents and settings.
            </Text>
            <Button
              variant="primary"
              leadingVisual={SignInIcon}
              onClick={() => post({ type: "login" })}
            >
              Sign in
            </Button>
          </Flash>
        )}
        {!state ? (
          <CenteredSpinner message="Reading the sidebar…" />
        ) : (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: [
                "minmax(0, 1fr)",
                "minmax(0, 1fr)",
                "repeat(6, minmax(0, 1fr))",
              ],
              gap: 3,
              alignItems: "start",
            }}
          >
            {state.sections.map((section) => (
              <SectionCard
                key={section.id}
                section={section}
                refreshing={!!refreshing[section.id]}
                onRefresh={() => {
                  setRefreshing((was) => ({ ...was, [section.id]: true }));
                  post({ type: "refresh", section: section.id });
                }}
              />
            ))}
          </Box>
        )}
      </Box>
    </PrimerVSCodeTheme>
  );
}
