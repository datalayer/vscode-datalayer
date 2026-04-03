/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Utility functions for theme color manipulation.
 *
 * @module theme/utils
 */

/**
 * Gets a CSS variable value from the document root element.
 * @param name - CSS variable name (with or without -- prefix).
 * @param fallback - Fallback value if the variable is not found.
 *
 * @returns The resolved CSS variable value or the fallback string.
 *
 */
export function getCSSVariable(name: string, fallback: string = ""): string {
  if (typeof document === "undefined") {
    return fallback;
  }

  // Ensure name starts with --
  const varName = name.startsWith("--") ? name : `--${name}`;

  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim();

  return value || fallback;
}

/**
 * Converts an RGB/RGBA color string to hex format.
 * @param color - Color string in rgb, rgba, or hex format.
 *
 * @returns Hex color string with optional alpha channel.
 *
 */
export function rgbaToHex(color: string): string {
  // If already hex, return as-is
  if (color.startsWith("#")) {
    return color;
  }

  // Parse RGB/RGBA
  const match = color.match(
    /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/,
  );
  if (!match) {
    return color;
  }

  const [, r, g, b, a] = match;
  const red = parseInt(r, 10);
  const green = parseInt(g, 10);
  const blue = parseInt(b, 10);

  let hex =
    "#" +
    [red, green, blue].map((x) => x.toString(16).padStart(2, "0")).join("");

  // Add alpha channel if present
  if (a !== undefined) {
    const alpha = Math.round(parseFloat(a) * 255);
    hex += alpha.toString(16).padStart(2, "0");
  }

  return hex;
}

/**
 * Adds opacity to a color value by appending an alpha channel.
 * @param color - Base color in hex or rgb format.
 * @param opacity - Opacity value between 0 and 1.
 *
 * @returns Hex color string with the opacity alpha channel appended.
 *
 */
export function withOpacity(color: string, opacity: number): string {
  const hex = rgbaToHex(color);

  // If already has alpha, strip it
  const baseHex = hex.length > 7 ? hex.slice(0, 7) : hex;

  // Add new alpha
  const alpha = Math.round(opacity * 255)
    .toString(16)
    .padStart(2, "0");

  return `${baseHex}${alpha}`;
}

/**
 * Reads a VS Code CSS variable and converts it to hex format.
 * @param varName - CSS variable name to read.
 * @param fallback - Fallback hex color if variable is not defined.
 *
 * @returns Hex color string from the CSS variable or the fallback.
 *
 */
export function getVSCodeColorAsHex(varName: string, fallback: string): string {
  const value = getCSSVariable(varName, fallback);
  return rgbaToHex(value);
}
