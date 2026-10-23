/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * A snapshot's details page, the pure part: what is read of a snapshot's
 * data (size, format, language, plain metadata, files in their several
 * shapes), sizes as people read them, and the page's messages checked.
 */

import type { CodeSandboxSnapshotData } from "@datalayer/agent-runtimes/lib/models/CodeSandboxSnapshotDTO";
import { describe, expect, it } from "vitest";

import {
  formatBytes,
  snapshotDetailsOf,
  snapshotPageMessageOf,
} from "../../ui/snapshot/snapshotDetails";

const minimal: CodeSandboxSnapshotData = {
  uid: "snap-1",
  name: "before-refactor",
  environment: "ai-agents-env",
  updated_at: "2026-10-20T08:30:00Z",
};

describe("snapshotDetailsOf", () => {
  it("reads a snapshot with only what is required", () => {
    expect(snapshotDetailsOf(minimal)).toEqual({
      uid: "snap-1",
      name: "before-refactor",
      description: "",
      environment: "ai-agents-env",
      updatedAt: "2026-10-20T08:30:00Z",
      metadata: [],
      files: [],
    });
  });

  it("reads its size, status, format, language, plain metadata and files", () => {
    const details = snapshotDetailsOf({
      ...minimal,
      description: "Saved before the refactor",
      size: 1536,
      status: "ready",
      format: "zip",
      format_version: "2",
      metadata: {
        version: "1.0",
        language_info: { name: "python", version: "3.11" },
        pinned: true,
        nested: { ignored: 1 },
      },
      files: [
        "notebook.ipynb",
        { path: "data/sales.csv", size: "2048" },
        { name: "model.pkl", size: 10 },
        { filename: "README.md" },
        { other: "no name" },
        "",
        null,
      ],
    });
    expect(details).toEqual({
      uid: "snap-1",
      name: "before-refactor",
      description: "Saved before the refactor",
      environment: "ai-agents-env",
      updatedAt: "2026-10-20T08:30:00Z",
      size: 1536,
      status: "ready",
      format: "zip",
      formatVersion: "2",
      language: "python 3.11",
      metadata: [
        { key: "pinned", value: "true" },
        { key: "version", value: "1.0" },
      ],
      files: [
        { name: "notebook.ipynb" },
        { name: "data/sales.csv", size: 2048 },
        { name: "model.pkl", size: 10 },
        { name: "README.md" },
      ],
    });
  });

  it("names a language without its version", () => {
    expect(
      snapshotDetailsOf({
        ...minimal,
        metadata: { language_info: { name: "r" } },
      }).language,
    ).toBe("r");
  });
});

describe("formatBytes", () => {
  it.each([
    [0, "0 B"],
    [512, "512 B"],
    [1536, "1.5 KB"],
    [20 * 1024, "20 KB"],
    [5 * 1024 * 1024 * 1024, "5 GB"],
    [-1, ""],
  ])("%d bytes read as %s", (bytes, shown) => {
    expect(formatBytes(bytes)).toBe(shown);
  });
});

describe("snapshotPageMessageOf", () => {
  it("accepts the page's three messages", () => {
    expect(snapshotPageMessageOf({ type: "ready" })).toEqual({
      type: "ready",
    });
    expect(snapshotPageMessageOf({ type: "restore", extra: 1 })).toEqual({
      type: "restore",
    });
    expect(snapshotPageMessageOf({ type: "delete" })).toEqual({
      type: "delete",
    });
  });

  it("refuses anything else", () => {
    expect(snapshotPageMessageOf(null)).toBeUndefined();
    expect(snapshotPageMessageOf("delete")).toBeUndefined();
    expect(snapshotPageMessageOf({ type: "run" })).toBeUndefined();
  });
});
