/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * A snapshot's details page (`datalayer.snapshots.viewDetails`): its name,
 * description, environment, date, size, format, language, metadata and
 * files, read by the extension host (`ui/snapshot/snapshotDetails`), with
 * its Restore and Delete — the snapshot's own commands, run on the host.
 *
 * @module webview/snapshot/SnapshotPage
 */

import React, { useEffect, useState } from "react";
import { Button, Heading, Label, Text } from "@primer/react";
import { Box } from "@datalayer/primer-addons";
import {
  ArchiveIcon,
  FileIcon,
  HistoryIcon,
  TrashIcon,
} from "@primer/octicons-react";
import { CenteredSpinner } from "@datalayer/core/lib/components/display/CenteredSpinner";
import {
  formatBytes,
  SNAPSHOT_WORDS,
  type SnapshotDetails,
  type SnapshotHostMessage,
  type SnapshotPageMessage,
} from "../../src/ui/snapshot/snapshotDetails";
import { PrimerVSCodeTheme } from "../theme/PrimerVSCodeTheme";

declare function acquireVsCodeApi(): {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
};

const vscode = acquireVsCodeApi();

/**
 * Asks the extension host.
 *
 * @param message - What the page asks.
 */
function post(message: SnapshotPageMessage): void {
  vscode.postMessage(message);
}

/**
 * A date as the person's locale writes it, or as given when it is not one.
 *
 * @param value - The date, as the service gives it.
 *
 * @returns The date to show.
 */
function dateOf(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

/** Props of the page. */
export interface SnapshotPageProps {
  /** VS Code's color mode. */
  colorMode: "light" | "dark";
}

/**
 * The snapshot details page.
 *
 * @param props - The page's props.
 *
 * @returns React element.
 */
export function SnapshotPage({
  colorMode,
}: SnapshotPageProps): React.JSX.Element {
  const [details, setDetails] = useState<SnapshotDetails | null>(null);

  useEffect(() => {
    const onMessage = (event: MessageEvent<SnapshotHostMessage>) => {
      if (event.data?.type === "snapshot-details") {
        setDetails(event.data.body);
      }
    };
    window.addEventListener("message", onMessage);
    // Listening: the host posts the snapshot.
    post({ type: "ready" });
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <PrimerVSCodeTheme colorMode={colorMode}>
      <Box sx={{ p: 4, maxWidth: 880 }}>
        {details ? (
          <Details details={details} />
        ) : (
          <CenteredSpinner message="Reading the snapshot…" />
        )}
      </Box>
    </PrimerVSCodeTheme>
  );
}

/**
 * A row of the details: its term and value.
 *
 * @param props - The row.
 * @param props.term - What it is.
 * @param props.children - Its value.
 *
 * @returns React element.
 */
function Row({
  term,
  children,
}: {
  term: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <>
      <Text as="dt" sx={{ color: "fg.muted" }}>
        {term}
      </Text>
      <Text as="dd" sx={{ m: 0, wordBreak: "break-all" }}>
        {children}
      </Text>
    </>
  );
}

/**
 * The snapshot's details, its actions, and its files.
 *
 * @param props - The details.
 * @param props.details - The snapshot's details.
 *
 * @returns React element.
 */
function Details({ details }: { details: SnapshotDetails }): React.JSX.Element {
  return (
    <>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
        <ArchiveIcon size={24} />
        <Heading as="h1" sx={{ fontSize: 4, flex: 1, minWidth: 0 }}>
          {details.name}
        </Heading>
        {details.status ? <Label>{details.status}</Label> : null}
      </Box>
      <Text as="p" sx={{ color: "fg.muted", mt: 0, mb: 3 }}>
        {details.description || SNAPSHOT_WORDS.noDescription}
      </Text>
      <Box sx={{ display: "flex", gap: 2, mb: 4 }}>
        <Button
          variant="primary"
          leadingVisual={HistoryIcon}
          onClick={() => post({ type: "restore" })}
        >
          {SNAPSHOT_WORDS.restore}
        </Button>
        <Button
          variant="danger"
          leadingVisual={TrashIcon}
          onClick={() => post({ type: "delete" })}
        >
          {SNAPSHOT_WORDS.delete}
        </Button>
      </Box>
      <Box
        as="dl"
        sx={{
          display: "grid",
          gridTemplateColumns: "max-content 1fr",
          columnGap: 4,
          rowGap: 2,
          m: 0,
          mb: 4,
        }}
      >
        <Row term="Environment">{details.environment}</Row>
        <Row term="Created">{dateOf(details.updatedAt)}</Row>
        {details.size !== undefined ? (
          <Row term="Size">{formatBytes(details.size)}</Row>
        ) : null}
        {details.format ? (
          <Row term="Format">
            {details.formatVersion
              ? `${details.format} ${details.formatVersion}`
              : details.format}
          </Row>
        ) : null}
        {details.language ? (
          <Row term="Language">{details.language}</Row>
        ) : null}
        {details.metadata.map(({ key, value }) => (
          <Row key={key} term={key}>
            {value}
          </Row>
        ))}
        <Row term="ID">
          <Text sx={{ fontFamily: "mono" }}>{details.uid}</Text>
        </Row>
      </Box>
      <Heading as="h2" sx={{ fontSize: 2, mb: 2 }}>
        Files ({details.files.length})
      </Heading>
      {details.files.length === 0 ? (
        <Text as="p" sx={{ color: "fg.muted" }}>
          {SNAPSHOT_WORDS.noFiles}
        </Text>
      ) : (
        <Box
          as="ul"
          sx={{
            listStyle: "none",
            p: 0,
            m: 0,
            border: "1px solid",
            borderColor: "border.default",
            borderRadius: 2,
          }}
        >
          {details.files.map((file, index) => (
            <Box
              as="li"
              key={`${file.name}-${index}`}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 2,
                px: 3,
                py: 2,
                borderTop: index === 0 ? "none" : "1px solid",
                borderColor: "border.default",
              }}
            >
              <FileIcon />
              <Text sx={{ flex: 1, minWidth: 0, wordBreak: "break-all" }}>
                {file.name}
              </Text>
              {file.size !== undefined ? (
                <Text sx={{ color: "fg.muted" }}>{formatBytes(file.size)}</Text>
              ) : null}
            </Box>
          ))}
        </Box>
      )}
    </>
  );
}
