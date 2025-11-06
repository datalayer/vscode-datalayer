/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Date formatting utilities for snapshots and runtime displays.
 *
 * @module utils/dateFormatter
 */

/**
 * Formats a date for use in snapshot names.
 * Returns format: YYYY-MM-DD_HH-MM-SS
 *
 * @param date - The date to format
 * @returns Formatted string like "2025-11-06_14-30-45"
 *
 * @example
 * ```typescript
 * const name = formatDateForName(new Date());
 * // Returns: "2025-11-06_14-30-45"
 * ```
 */
export function formatDateForName(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}

/**
 * Formats a date as a relative time string (e.g., "2 hours ago", "3 days ago").
 * Provides human-readable relative time descriptions.
 *
 * @param date - The date to format relative to now
 * @returns Formatted string like "just now", "5 minutes ago", "2 days ago"
 *
 * @example
 * ```typescript
 * const timeAgo = formatRelativeTime(new Date(Date.now() - 3600000));
 * // Returns: "1 hour ago"
 * ```
 */
export function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const timestamp = date.getTime();
  const diffMs = now - timestamp;

  // Handle future dates
  if (diffMs < 0) {
    return "just now";
  }

  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffSeconds < 60) {
    return "just now";
  } else if (diffMinutes < 60) {
    return diffMinutes === 1 ? "1 minute ago" : `${diffMinutes} minutes ago`;
  } else if (diffHours < 24) {
    return diffHours === 1 ? "1 hour ago" : `${diffHours} hours ago`;
  } else if (diffDays < 7) {
    return diffDays === 1 ? "1 day ago" : `${diffDays} days ago`;
  } else if (diffWeeks < 4) {
    return diffWeeks === 1 ? "1 week ago" : `${diffWeeks} weeks ago`;
  } else if (diffMonths < 12) {
    return diffMonths === 1 ? "1 month ago" : `${diffMonths} months ago`;
  } else {
    return diffYears === 1 ? "1 year ago" : `${diffYears} years ago`;
  }
}
