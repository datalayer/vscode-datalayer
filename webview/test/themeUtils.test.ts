/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import {
  getCSSVariable,
  getVSCodeColorAsHex,
  rgbaToHex,
  withOpacity,
} from "../theme/utils";

describe("getCSSVariable", () => {
  afterEach(() => {
    document.documentElement.style.removeProperty("--test-color");
    document.documentElement.style.removeProperty("--another-var");
  });

  it("returns fallback when CSS variable is not set", () => {
    expect(getCSSVariable("--nonexistent", "#000")).toBe("#000");
  });

  it("returns fallback with empty string default when variable is not set", () => {
    expect(getCSSVariable("--nonexistent")).toBe("");
  });

  it("reads a CSS variable from document root", () => {
    document.documentElement.style.setProperty("--test-color", "red");
    expect(getCSSVariable("--test-color")).toBe("red");
  });

  it("auto-prepends -- when name does not start with --", () => {
    document.documentElement.style.setProperty("--another-var", "blue");
    expect(getCSSVariable("another-var")).toBe("blue");
  });
});

describe("rgbaToHex", () => {
  it("returns hex colors unchanged", () => {
    expect(rgbaToHex("#ff0000")).toBe("#ff0000");
    expect(rgbaToHex("#ABC")).toBe("#ABC");
  });

  it("converts rgb() to hex", () => {
    expect(rgbaToHex("rgb(255, 0, 0)")).toBe("#ff0000");
    expect(rgbaToHex("rgb(0, 255, 0)")).toBe("#00ff00");
    expect(rgbaToHex("rgb(0, 0, 255)")).toBe("#0000ff");
  });

  it("converts rgba() to hex with alpha channel", () => {
    expect(rgbaToHex("rgba(255, 0, 0, 1)")).toBe("#ff0000ff");
    expect(rgbaToHex("rgba(255, 0, 0, 0.5)")).toBe("#ff000080");
    expect(rgbaToHex("rgba(0, 0, 0, 0)")).toBe("#00000000");
  });

  it("returns non-matching strings as-is", () => {
    expect(rgbaToHex("not-a-color")).toBe("not-a-color");
    expect(rgbaToHex("")).toBe("");
  });
});

describe("withOpacity", () => {
  it("appends alpha to a hex color", () => {
    expect(withOpacity("#ff0000", 1)).toBe("#ff0000ff");
    expect(withOpacity("#ff0000", 0.5)).toBe("#ff000080");
    expect(withOpacity("#ff0000", 0)).toBe("#ff000000");
  });

  it("replaces existing alpha in hex color", () => {
    expect(withOpacity("#ff0000aa", 0.5)).toBe("#ff000080");
  });

  it("converts rgb input to hex then appends alpha", () => {
    expect(withOpacity("rgb(0, 0, 255)", 1)).toBe("#0000ffff");
  });
});

describe("getVSCodeColorAsHex", () => {
  afterEach(() => {
    document.documentElement.style.removeProperty("--vscode-editor-bg");
  });

  it("returns fallback when CSS variable is not set", () => {
    expect(getVSCodeColorAsHex("--vscode-editor-bg", "#1e1e1e")).toBe(
      "#1e1e1e",
    );
  });

  it("reads CSS variable and converts rgb to hex", () => {
    document.documentElement.style.setProperty(
      "--vscode-editor-bg",
      "rgb(30, 30, 30)",
    );
    expect(getVSCodeColorAsHex("--vscode-editor-bg", "#000")).toBe("#1e1e1e");
  });
});
