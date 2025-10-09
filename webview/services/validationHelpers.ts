/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * @module validationHelpers
 *
 * Unified validation utilities for kernel and session managers.
 *
 * Provides consistent validation and error messages across all
 * manager implementations (Mock, Pyodide, Local, Remote).
 *
 * @example
 * ```typescript
 * // Validate kernel exists before operation
 * ValidationHelpers.validateKernel(this._activeKernel, id);
 * await this._activeKernel.shutdown();
 *
 * // Validate session exists before operation
 * ValidationHelpers.validateSession(this._activeSession, id);
 * await this._activeSession.shutdown();
 * ```
 */

import { Kernel, Session } from "@jupyterlab/services";

/**
 * Validation helper utilities for kernel and session managers.
 *
 * Centralizes validation logic to ensure consistent error messages
 * and behavior across all manager types.
 */
export class ValidationHelpers {
  /**
   * Validate that a kernel connection exists and matches the given ID.
   *
   * @param kernel - Kernel connection to validate (may be null)
   * @param id - Expected kernel identifier
   * @param managerType - Type of manager for better error messages
   *
   * @throws {Error} If no active kernel or ID doesn't match
   *
   * @example
   * ```typescript
   * ValidationHelpers.validateKernel(this._activeKernel, id, 'pyodide');
   * // Now safe to use this._activeKernel
   * ```
   */
  static validateKernel(
    kernel: Kernel.IKernelConnection | null,
    id: string,
    managerType?: string,
  ): asserts kernel is Kernel.IKernelConnection {
    const prefix = managerType ? `[${managerType}KernelManager]` : "";

    if (!kernel) {
      throw new Error(`${prefix} No active kernel found`.trim());
    }

    if (kernel.id !== id) {
      throw new Error(
        `${prefix} Kernel ${id} not found (active kernel is ${kernel.id})`.trim(),
      );
    }
  }

  /**
   * Validate that a session connection exists and matches the given ID.
   *
   * @param session - Session connection to validate (may be null)
   * @param id - Expected session identifier
   * @param managerType - Type of manager for better error messages
   *
   * @throws {Error} If no active session or ID doesn't match
   *
   * @example
   * ```typescript
   * ValidationHelpers.validateSession(this._activeSession, id, 'local');
   * // Now safe to use this._activeSession
   * ```
   */
  static validateSession(
    session: Session.ISessionConnection | null,
    id: string,
    managerType?: string,
  ): asserts session is Session.ISessionConnection {
    const prefix = managerType ? `[${managerType}SessionManager]` : "";

    if (!session) {
      throw new Error(`${prefix} No active session found`.trim());
    }

    if (session.id !== id) {
      throw new Error(
        `${prefix} Session ${id} not found (active session is ${session.id})`.trim(),
      );
    }
  }

  /**
   * Validate that a session connection exists and matches the given path.
   *
   * @param session - Session connection to validate (may be null)
   * @param path - Expected session path (notebook path)
   * @param managerType - Type of manager for better error messages
   *
   * @throws {Error} If no active session or path doesn't match
   *
   * @example
   * ```typescript
   * ValidationHelpers.validateSessionPath(this._activeSession, '/notebooks/test.ipynb', 'remote');
   * // Now safe to use this._activeSession
   * ```
   */
  static validateSessionPath(
    session: Session.ISessionConnection | null,
    path: string,
    managerType?: string,
  ): asserts session is Session.ISessionConnection {
    const prefix = managerType ? `[${managerType}SessionManager]` : "";

    if (!session) {
      throw new Error(`${prefix} No active session found`.trim());
    }

    if (session.path !== path) {
      throw new Error(
        `${prefix} Session with path ${path} not found (active session path is ${session.path})`.trim(),
      );
    }
  }

  /**
   * Validate that an ID is a non-empty string.
   *
   * @param id - Identifier to validate
   * @param label - Label for the ID (e.g., "kernel", "session")
   *
   * @throws {Error} If ID is empty or not a string
   *
   * @example
   * ```typescript
   * ValidationHelpers.validateId(kernelId, 'kernel');
   * // kernelId is now guaranteed to be a non-empty string
   * ```
   */
  static validateId(id: string, label = "identifier"): asserts id is string {
    if (typeof id !== "string" || id.trim() === "") {
      throw new Error(`Invalid ${label}: must be a non-empty string`);
    }
  }

  /**
   * Validate that a path is a non-empty string.
   *
   * @param path - Path to validate
   * @param label - Label for the path (e.g., "notebook path")
   *
   * @throws {Error} If path is empty or not a string
   *
   * @example
   * ```typescript
   * ValidationHelpers.validatePath(notebookPath, 'notebook path');
   * // notebookPath is now guaranteed to be a non-empty string
   * ```
   */
  static validatePath(path: string, label = "path"): asserts path is string {
    if (typeof path !== "string" || path.trim() === "") {
      throw new Error(`Invalid ${label}: must be a non-empty string`);
    }
  }

  /**
   * Check if an object appears to be disposed.
   *
   * @param obj - Object to check
   * @returns True if object appears disposed
   *
   * @example
   * ```typescript
   * if (ValidationHelpers.isDisposed(kernel)) {
   *   console.warn('Kernel already disposed');
   *   return;
   * }
   * ```
   */
  static isDisposed(obj: { isDisposed?: boolean } | null | undefined): boolean {
    return obj?.isDisposed === true;
  }

  /**
   * Throw error if object is disposed.
   *
   * @param obj - Object to check
   * @param label - Label for the object in error message
   *
   * @throws {Error} If object is disposed
   *
   * @example
   * ```typescript
   * ValidationHelpers.throwIfDisposed(this._activeKernel, 'kernel');
   * // Safe to use kernel now
   * ```
   */
  static throwIfDisposed(
    obj: { isDisposed?: boolean } | null | undefined,
    label = "object",
  ): void {
    if (ValidationHelpers.isDisposed(obj)) {
      throw new Error(`Cannot operate on disposed ${label}`);
    }
  }
}
