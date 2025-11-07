/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Type definitions for VS Code Jupyter Extension API.
 *
 * Based on: https://github.com/microsoft/vscode-jupyter/blob/main/src/api.d.ts
 *
 * @module types/jupyter.api
 */

import type { CancellationToken, Event, Uri } from "vscode";

/**
 * Main Jupyter extension API.
 */
export interface Jupyter {
  /**
   * Access to the Jupyter Kernels API.
   */
  readonly kernels: Kernels;
}

/**
 * Status of a Jupyter kernel.
 */
export type KernelStatus =
  | "unknown"
  | "starting"
  | "idle"
  | "busy"
  | "terminating"
  | "restarting"
  | "autorestarting"
  | "dead";

/**
 * Represents output from kernel execution.
 */
export interface Output {
  /**
   * The output items of this output.
   */
  items: OutputItem[];
  /**
   * Arbitrary metadata for this cell output.
   */
  metadata?: { [key: string]: unknown };
}

/**
 * A single output item with mime type and data.
 */
export interface OutputItem {
  /**
   * The mime type of the output.
   * Examples: `text/plain`, `application/json`, `text/html`, etc.
   *
   * Special mime types:
   * - `application/x.notebook.stream.stdout`: stdout stream
   * - `application/x.notebook.stream.stderr`: stderr stream
   * - `application/vnd.code.notebook.error`: error output
   */
  mime: string;
  /**
   * The data of this output item.
   */
  data: Uint8Array;
}

/**
 * Represents a Jupyter Kernel.
 */
export interface Kernel {
  /**
   * An event emitted when the kernel status changes.
   */
  onDidChangeStatus: Event<KernelStatus>;
  /**
   * The current status of the kernel.
   */
  readonly status: KernelStatus;
  /**
   * Language of the kernel (e.g., python, r, julia).
   */
  readonly language: string;
  /**
   * Executes code in the kernel without affecting the execution count & execution history.
   *
   * @param code Code to be executed.
   * @param token Triggers the cancellation of the execution.
   * @returns Async iterable of outputs, that completes when the execution is complete.
   */
  executeCode(code: string, token: CancellationToken): AsyncIterable<Output>;
}

/**
 * API for interacting with Jupyter kernels.
 */
export interface Kernels {
  /**
   * Gets the kernel associated with a given resource.
   *
   * For instance, if the resource is a notebook URI, returns the kernel
   * associated with that notebook.
   *
   * Only kernels which have already been started by the user and belonging
   * to Notebooks that are currently opened will be returned.
   *
   * @param uri URI of the resource (notebook document)
   * @returns The kernel instance, or undefined if no kernel is associated
   */
  getKernel(uri: Uri): Thenable<Kernel | undefined>;
}
