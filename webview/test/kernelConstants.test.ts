/// <reference types="vitest/globals" />

/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import {
  isLocalKernelUrl,
  LOCAL_KERNEL_URL_PREFIX,
} from "../../src/constants/kernelConstants";

describe("kernelConstants", () => {
  describe("LOCAL_KERNEL_URL_PREFIX", () => {
    it("has the expected value", () => {
      expect(LOCAL_KERNEL_URL_PREFIX).toBe("local-kernel-");
    });
  });

  describe("isLocalKernelUrl", () => {
    it("returns true for a valid local kernel URL", () => {
      expect(
        isLocalKernelUrl("http://local-kernel-abc123.localhost:8888/api"),
      ).toBe(true);
    });

    it("returns true for ws local kernel URL", () => {
      expect(isLocalKernelUrl("ws://local-kernel-xyz.localhost/ws")).toBe(true);
    });

    it("returns false for a remote URL", () => {
      expect(isLocalKernelUrl("http://example.com/api")).toBe(false);
    });

    it("returns false for URL with prefix but no .localhost", () => {
      expect(isLocalKernelUrl("http://local-kernel-abc.example.com/api")).toBe(
        false,
      );
    });

    it("returns false for URL with .localhost but no prefix", () => {
      expect(isLocalKernelUrl("http://something.localhost/api")).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(isLocalKernelUrl("")).toBe(false);
    });

    it("returns false for URL with only prefix", () => {
      expect(isLocalKernelUrl("local-kernel-")).toBe(false);
    });

    it("returns true when both markers are present in any position", () => {
      expect(
        isLocalKernelUrl("https://foo.local-kernel-bar.localhost:9999/path"),
      ).toBe(true);
    });
  });
});
