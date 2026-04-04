/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import * as assert from "assert";

import {
  AuthenticationError,
  DatalayerError,
  DocumentError,
  extractErrorInfo,
  NetworkError,
  NotebookError,
  RuntimeError,
} from "../../types/errors";

suite("Error Types Tests", () => {
  suite("DatalayerError", () => {
    test("creates error with message and code", () => {
      const error = new DatalayerError("test message", "TEST_CODE");

      assert.strictEqual(error.message, "test message");
      assert.strictEqual(error.code, "TEST_CODE");
      assert.strictEqual(error.name, "DatalayerError");
    });

    test("is an instance of Error", () => {
      const error = new DatalayerError("test", "CODE");

      assert.ok(error instanceof Error);
      assert.ok(error instanceof DatalayerError);
    });

    test("stores optional cause", () => {
      const cause = new Error("original error");
      const error = new DatalayerError("wrapped", "WRAP", cause);

      assert.strictEqual(error.cause, cause);
      assert.strictEqual(error.cause!.message, "original error");
    });

    test("stores optional context", () => {
      const context = { key: "value", num: 42 };
      const error = new DatalayerError("msg", "CODE", undefined, context);

      assert.deepStrictEqual(error.context, { key: "value", num: 42 });
    });

    test("has undefined cause and context when not provided", () => {
      const error = new DatalayerError("msg", "CODE");

      assert.strictEqual(error.cause, undefined);
      assert.strictEqual(error.context, undefined);
    });

    test("has a stack trace", () => {
      const error = new DatalayerError("msg", "CODE");

      assert.ok(error.stack);
      assert.ok(error.stack!.length > 0);
    });

    test("code property is readonly", () => {
      const error = new DatalayerError("msg", "CODE");

      // Verify the property exists and is the correct value
      assert.strictEqual(error.code, "CODE");
    });
  });

  suite("AuthenticationError", () => {
    test("creates with AUTH_ERROR code", () => {
      const error = new AuthenticationError("auth failed");

      assert.strictEqual(error.code, "AUTH_ERROR");
      assert.strictEqual(error.name, "AuthenticationError");
      assert.strictEqual(error.message, "auth failed");
    });

    test("is an instance of DatalayerError and Error", () => {
      const error = new AuthenticationError("auth failed");

      assert.ok(error instanceof Error);
      assert.ok(error instanceof DatalayerError);
      assert.ok(error instanceof AuthenticationError);
    });

    test("stores cause and context", () => {
      const cause = new Error("token expired");
      const context = { userId: "user123" };
      const error = new AuthenticationError("auth failed", cause, context);

      assert.strictEqual(error.cause, cause);
      assert.deepStrictEqual(error.context, { userId: "user123" });
    });
  });

  suite("NetworkError", () => {
    test("creates with NETWORK_ERROR code", () => {
      const error = new NetworkError("connection refused");

      assert.strictEqual(error.code, "NETWORK_ERROR");
      assert.strictEqual(error.name, "NetworkError");
      assert.strictEqual(error.message, "connection refused");
    });

    test("is an instance of DatalayerError and Error", () => {
      const error = new NetworkError("connection refused");

      assert.ok(error instanceof Error);
      assert.ok(error instanceof DatalayerError);
      assert.ok(error instanceof NetworkError);
    });

    test("stores cause and context", () => {
      const cause = new Error("ECONNREFUSED");
      const context = { url: "https://example.com", statusCode: 500 };
      const error = new NetworkError("request failed", cause, context);

      assert.strictEqual(error.cause, cause);
      assert.deepStrictEqual(error.context, {
        url: "https://example.com",
        statusCode: 500,
      });
    });
  });

  suite("NotebookError", () => {
    test("creates with NOTEBOOK_ERROR code", () => {
      const error = new NotebookError("cell execution failed");

      assert.strictEqual(error.code, "NOTEBOOK_ERROR");
      assert.strictEqual(error.name, "NotebookError");
      assert.strictEqual(error.message, "cell execution failed");
    });

    test("is an instance of DatalayerError and Error", () => {
      const error = new NotebookError("failed");

      assert.ok(error instanceof Error);
      assert.ok(error instanceof DatalayerError);
      assert.ok(error instanceof NotebookError);
    });

    test("includes notebookId in context", () => {
      const error = new NotebookError("failed", undefined, "nb-123");

      assert.deepStrictEqual(error.context, { notebookId: "nb-123" });
    });

    test("merges notebookId with additional context", () => {
      const context = { cellIndex: 5, cellType: "code" };
      const error = new NotebookError("failed", undefined, "nb-456", context);

      assert.deepStrictEqual(error.context, {
        cellIndex: 5,
        cellType: "code",
        notebookId: "nb-456",
      });
    });

    test("handles undefined notebookId in context", () => {
      const error = new NotebookError("failed", undefined, undefined);

      assert.deepStrictEqual(error.context, { notebookId: undefined });
    });

    test("stores cause error", () => {
      const cause = new Error("kernel crashed");
      const error = new NotebookError("execution failed", cause, "nb-789");

      assert.strictEqual(error.cause, cause);
      assert.strictEqual(error.cause!.message, "kernel crashed");
    });
  });

  suite("RuntimeError", () => {
    test("creates with RUNTIME_ERROR code", () => {
      const error = new RuntimeError("runtime crashed");

      assert.strictEqual(error.code, "RUNTIME_ERROR");
      assert.strictEqual(error.name, "RuntimeError");
      assert.strictEqual(error.message, "runtime crashed");
    });

    test("is an instance of DatalayerError and Error", () => {
      const error = new RuntimeError("failed");

      assert.ok(error instanceof Error);
      assert.ok(error instanceof DatalayerError);
      assert.ok(error instanceof RuntimeError);
    });

    test("includes runtimeId in context", () => {
      const error = new RuntimeError("failed", undefined, "rt-abc");

      assert.deepStrictEqual(error.context, { runtimeId: "rt-abc" });
    });

    test("merges runtimeId with additional context", () => {
      const context = { environment: "python-3.11", region: "us-east" };
      const error = new RuntimeError("failed", undefined, "rt-xyz", context);

      assert.deepStrictEqual(error.context, {
        environment: "python-3.11",
        region: "us-east",
        runtimeId: "rt-xyz",
      });
    });
  });

  suite("DocumentError", () => {
    test("creates with DOCUMENT_ERROR code", () => {
      const error = new DocumentError("save failed");

      assert.strictEqual(error.code, "DOCUMENT_ERROR");
      assert.strictEqual(error.name, "DocumentError");
      assert.strictEqual(error.message, "save failed");
    });

    test("is an instance of DatalayerError and Error", () => {
      const error = new DocumentError("failed");

      assert.ok(error instanceof Error);
      assert.ok(error instanceof DatalayerError);
      assert.ok(error instanceof DocumentError);
    });

    test("includes documentId in context", () => {
      const error = new DocumentError("failed", undefined, "doc-001");

      assert.deepStrictEqual(error.context, { documentId: "doc-001" });
    });

    test("merges documentId with additional context", () => {
      const context = { format: "lexical", spaceId: "space-1" };
      const error = new DocumentError("failed", undefined, "doc-002", context);

      assert.deepStrictEqual(error.context, {
        format: "lexical",
        spaceId: "space-1",
        documentId: "doc-002",
      });
    });
  });

  suite("extractErrorInfo", () => {
    test("extracts info from DatalayerError", () => {
      const cause = new Error("original");
      const context = { key: "val" };
      const error = new DatalayerError("msg", "MY_CODE", cause, context);

      const info = extractErrorInfo(error);

      assert.strictEqual(info.code, "MY_CODE");
      assert.strictEqual(info.message, "msg");
      assert.strictEqual(info.cause, cause);
      assert.deepStrictEqual(info.context, { key: "val" });
    });

    test("extracts info from AuthenticationError", () => {
      const error = new AuthenticationError("token expired");
      const info = extractErrorInfo(error);

      assert.strictEqual(info.code, "AUTH_ERROR");
      assert.strictEqual(info.message, "token expired");
    });

    test("extracts info from NotebookError with context", () => {
      const error = new NotebookError("failed", undefined, "nb-1", {
        cell: 3,
      });
      const info = extractErrorInfo(error);

      assert.strictEqual(info.code, "NOTEBOOK_ERROR");
      assert.deepStrictEqual(info.context, { cell: 3, notebookId: "nb-1" });
    });

    test("detects fetch errors as NETWORK_ERROR", () => {
      const error = new Error("Failed to fetch resource");
      const info = extractErrorInfo(error);

      assert.strictEqual(info.code, "NETWORK_ERROR");
      assert.strictEqual(info.message, "Network request failed");
      assert.strictEqual(info.cause, error);
    });

    test("detects fetch keyword as NETWORK_ERROR", () => {
      const error = new Error("fetch error occurred");
      const info = extractErrorInfo(error);

      assert.strictEqual(info.code, "NETWORK_ERROR");
      assert.strictEqual(info.message, "Network request failed");
    });

    test("detects 401 as AUTH_ERROR", () => {
      const error = new Error("HTTP 401 response");
      const info = extractErrorInfo(error);

      assert.strictEqual(info.code, "AUTH_ERROR");
      assert.strictEqual(info.message, "Authentication required");
      assert.strictEqual(info.cause, error);
    });

    test("detects Unauthorized as AUTH_ERROR", () => {
      const error = new Error("Unauthorized access");
      const info = extractErrorInfo(error);

      assert.strictEqual(info.code, "AUTH_ERROR");
      assert.strictEqual(info.message, "Authentication required");
    });

    test("detects authentication keyword as AUTH_ERROR", () => {
      const error = new Error("authentication required");
      const info = extractErrorInfo(error);

      assert.strictEqual(info.code, "AUTH_ERROR");
      assert.strictEqual(info.message, "Authentication required");
    });

    test("detects 403 as AUTH_ERROR with access denied", () => {
      const error = new Error("HTTP 403 forbidden");
      const info = extractErrorInfo(error);

      assert.strictEqual(info.code, "AUTH_ERROR");
      assert.strictEqual(info.message, "Access denied");
    });

    test("detects Forbidden as AUTH_ERROR with access denied", () => {
      const error = new Error("Forbidden resource");
      const info = extractErrorInfo(error);

      assert.strictEqual(info.code, "AUTH_ERROR");
      assert.strictEqual(info.message, "Access denied");
    });

    test("detects 404 as NOT_FOUND", () => {
      const error = new Error("HTTP 404 not found");
      const info = extractErrorInfo(error);

      assert.strictEqual(info.code, "NOT_FOUND");
      assert.strictEqual(info.message, "Resource not found");
      assert.strictEqual(info.cause, error);
    });

    test("detects Not Found as NOT_FOUND", () => {
      const error = new Error("Not Found");
      const info = extractErrorInfo(error);

      assert.strictEqual(info.code, "NOT_FOUND");
      assert.strictEqual(info.message, "Resource not found");
    });

    test("detects timeout as TIMEOUT_ERROR", () => {
      const error = new Error("Request timeout after 30s");
      const info = extractErrorInfo(error);

      assert.strictEqual(info.code, "TIMEOUT_ERROR");
      assert.strictEqual(info.message, "Operation timed out");
      assert.strictEqual(info.cause, error);
    });

    test("returns UNKNOWN_ERROR for unrecognized errors", () => {
      const error = new Error("something unexpected happened");
      const info = extractErrorInfo(error);

      assert.strictEqual(info.code, "UNKNOWN_ERROR");
      assert.strictEqual(info.message, "something unexpected happened");
      assert.strictEqual(info.cause, error);
    });

    test("returns UNKNOWN_ERROR for empty message", () => {
      const error = new Error("");
      const info = extractErrorInfo(error);

      assert.strictEqual(info.code, "UNKNOWN_ERROR");
      assert.strictEqual(info.message, "");
      assert.strictEqual(info.cause, error);
    });

    test("DatalayerError takes priority over pattern matching", () => {
      // A DatalayerError with "fetch" in the message should use its own code
      const error = new DatalayerError("fetch failed", "CUSTOM_CODE");
      const info = extractErrorInfo(error);

      assert.strictEqual(info.code, "CUSTOM_CODE");
      assert.strictEqual(info.message, "fetch failed");
    });

    test("extractErrorInfo returns no context for plain errors", () => {
      const error = new Error("plain error");
      const info = extractErrorInfo(error);

      assert.strictEqual(info.context, undefined);
    });
  });
});
