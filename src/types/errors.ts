/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Custom error types for the Datalayer VS Code extension.
 * Provides structured error information for better error handling.
 *
 * @module types/errors
 */

/**
 * Base error class for all Datalayer extension errors.
 * Includes error code, cause, and context information.
 */
export class DatalayerError extends Error {
  /**
   * Creates a new DatalayerError.
   *
   * @param message - Human-readable error message
   * @param code - Error code for categorization
   * @param cause - Original error that caused this error
   * @param context - Additional context information
   */
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "DatalayerError";

    // Maintain proper stack trace for V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DatalayerError);
    }
  }
}

/**
 * Error thrown when authentication fails or is required.
 */
export class AuthenticationError extends DatalayerError {
  constructor(
    message: string,
    cause?: Error,
    context?: Record<string, unknown>,
  ) {
    super(message, "AUTH_ERROR", cause, context);
    this.name = "AuthenticationError";
  }
}

/**
 * Error thrown when network operations fail.
 */
export class NetworkError extends DatalayerError {
  constructor(
    message: string,
    cause?: Error,
    context?: Record<string, unknown>,
  ) {
    super(message, "NETWORK_ERROR", cause, context);
    this.name = "NetworkError";
  }
}

/**
 * Error thrown when notebook operations fail.
 */
export class NotebookError extends DatalayerError {
  constructor(
    message: string,
    cause?: Error,
    notebookId?: string,
    context?: Record<string, unknown>,
  ) {
    super(message, "NOTEBOOK_ERROR", cause, {
      ...context,
      notebookId,
    });
    this.name = "NotebookError";
  }
}

/**
 * Error thrown when runtime operations fail.
 */
export class RuntimeError extends DatalayerError {
  constructor(
    message: string,
    cause?: Error,
    runtimeId?: string,
    context?: Record<string, unknown>,
  ) {
    super(message, "RUNTIME_ERROR", cause, {
      ...context,
      runtimeId,
    });
    this.name = "RuntimeError";
  }
}

/**
 * Error thrown when document operations fail.
 */
export class DocumentError extends DatalayerError {
  constructor(
    message: string,
    cause?: Error,
    documentId?: string,
    context?: Record<string, unknown>,
  ) {
    super(message, "DOCUMENT_ERROR", cause, {
      ...context,
      documentId,
    });
    this.name = "DocumentError";
  }
}

/**
 * Information extracted from an error for logging and display.
 */
export interface ErrorInfo {
  /** Error code for categorization and identification */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Original error that caused this error (if available) */
  cause?: Error;
  /** Additional context information about the error */
  context?: Record<string, unknown>;
}

/**
 * Extracts structured information from any error object.
 *
 * @param error - The error to extract information from
 * @returns Structured error information
 */
export function extractErrorInfo(error: Error): ErrorInfo {
  if (error instanceof DatalayerError) {
    return {
      code: error.code,
      message: error.message,
      cause: error.cause,
      context: error.context,
    };
  }

  // Handle common error patterns
  if (
    error.message.includes("fetch") ||
    error.message.includes("Failed to fetch")
  ) {
    return {
      code: "NETWORK_ERROR",
      message: "Network request failed",
      cause: error,
    };
  }

  if (
    error.message.includes("401") ||
    error.message.includes("Unauthorized") ||
    error.message.includes("authentication")
  ) {
    return {
      code: "AUTH_ERROR",
      message: "Authentication required",
      cause: error,
    };
  }

  if (error.message.includes("403") || error.message.includes("Forbidden")) {
    return {
      code: "AUTH_ERROR",
      message: "Access denied",
      cause: error,
    };
  }

  if (error.message.includes("404") || error.message.includes("Not Found")) {
    return {
      code: "NOT_FOUND",
      message: "Resource not found",
      cause: error,
    };
  }

  if (error.message.includes("timeout")) {
    return {
      code: "TIMEOUT_ERROR",
      message: "Operation timed out",
      cause: error,
    };
  }

  return {
    code: "UNKNOWN_ERROR",
    message: error.message,
    cause: error,
  };
}
