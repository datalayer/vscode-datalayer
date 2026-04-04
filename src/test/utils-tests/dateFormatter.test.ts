/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import * as assert from "assert";

import {
  formatDateForName,
  formatRelativeTime,
} from "../../utils/dateFormatter";

suite("Date Formatter Tests", () => {
  suite("formatDateForName", () => {
    test("formats a specific date correctly", () => {
      const date = new Date(2025, 10, 6, 14, 30, 45); // Nov 6, 2025 14:30:45

      assert.strictEqual(formatDateForName(date), "2025-11-06_14-30-45");
    });

    test("pads single-digit month with zero", () => {
      const date = new Date(2025, 0, 15, 10, 20, 30); // Jan 15

      assert.strictEqual(formatDateForName(date), "2025-01-15_10-20-30");
    });

    test("pads single-digit day with zero", () => {
      const date = new Date(2025, 5, 3, 10, 20, 30); // Jun 3

      assert.strictEqual(formatDateForName(date), "2025-06-03_10-20-30");
    });

    test("pads single-digit hours with zero", () => {
      const date = new Date(2025, 5, 15, 9, 20, 30);

      assert.strictEqual(formatDateForName(date), "2025-06-15_09-20-30");
    });

    test("pads single-digit minutes with zero", () => {
      const date = new Date(2025, 5, 15, 10, 5, 30);

      assert.strictEqual(formatDateForName(date), "2025-06-15_10-05-30");
    });

    test("pads single-digit seconds with zero", () => {
      const date = new Date(2025, 5, 15, 10, 20, 7);

      assert.strictEqual(formatDateForName(date), "2025-06-15_10-20-07");
    });

    test("handles midnight correctly", () => {
      const date = new Date(2025, 0, 1, 0, 0, 0); // Jan 1, midnight

      assert.strictEqual(formatDateForName(date), "2025-01-01_00-00-00");
    });

    test("handles end of day correctly", () => {
      const date = new Date(2025, 11, 31, 23, 59, 59); // Dec 31, 23:59:59

      assert.strictEqual(formatDateForName(date), "2025-12-31_23-59-59");
    });

    test("handles December (month index 11) correctly", () => {
      const date = new Date(2025, 11, 25, 12, 0, 0);

      assert.strictEqual(formatDateForName(date), "2025-12-25_12-00-00");
    });

    test("does not pad double-digit values", () => {
      const date = new Date(2025, 10, 15, 14, 30, 45);

      assert.strictEqual(formatDateForName(date), "2025-11-15_14-30-45");
    });

    test("returns string in expected format pattern", () => {
      const date = new Date();
      const result = formatDateForName(date);
      const pattern = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/;

      assert.ok(
        pattern.test(result),
        `Result "${result}" does not match YYYY-MM-DD_HH-MM-SS pattern`,
      );
    });
  });

  suite("formatRelativeTime", () => {
    test("returns 'just now' for current time", () => {
      const now = new Date();

      assert.strictEqual(formatRelativeTime(now), "just now");
    });

    test("returns 'just now' for future dates", () => {
      const future = new Date(Date.now() + 60000);

      assert.strictEqual(formatRelativeTime(future), "just now");
    });

    test("returns 'just now' for 30 seconds ago", () => {
      const date = new Date(Date.now() - 30 * 1000);

      assert.strictEqual(formatRelativeTime(date), "just now");
    });

    test("returns 'just now' for 59 seconds ago", () => {
      const date = new Date(Date.now() - 59 * 1000);

      assert.strictEqual(formatRelativeTime(date), "just now");
    });

    test("returns '1 minute ago' for 60 seconds ago", () => {
      const date = new Date(Date.now() - 60 * 1000);

      assert.strictEqual(formatRelativeTime(date), "1 minute ago");
    });

    test("returns '1 minute ago' for 90 seconds ago", () => {
      const date = new Date(Date.now() - 90 * 1000);

      assert.strictEqual(formatRelativeTime(date), "1 minute ago");
    });

    test("returns plural minutes for 5 minutes ago", () => {
      const date = new Date(Date.now() - 5 * 60 * 1000);

      assert.strictEqual(formatRelativeTime(date), "5 minutes ago");
    });

    test("returns '59 minutes ago' near the hour boundary", () => {
      const date = new Date(Date.now() - 59 * 60 * 1000);

      assert.strictEqual(formatRelativeTime(date), "59 minutes ago");
    });

    test("returns '1 hour ago' for 60 minutes ago", () => {
      const date = new Date(Date.now() - 60 * 60 * 1000);

      assert.strictEqual(formatRelativeTime(date), "1 hour ago");
    });

    test("returns plural hours for 3 hours ago", () => {
      const date = new Date(Date.now() - 3 * 60 * 60 * 1000);

      assert.strictEqual(formatRelativeTime(date), "3 hours ago");
    });

    test("returns '23 hours ago' near the day boundary", () => {
      const date = new Date(Date.now() - 23 * 60 * 60 * 1000);

      assert.strictEqual(formatRelativeTime(date), "23 hours ago");
    });

    test("returns '1 day ago' for 24 hours ago", () => {
      const date = new Date(Date.now() - 24 * 60 * 60 * 1000);

      assert.strictEqual(formatRelativeTime(date), "1 day ago");
    });

    test("returns plural days for 5 days ago", () => {
      const date = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);

      assert.strictEqual(formatRelativeTime(date), "5 days ago");
    });

    test("returns '6 days ago' near the week boundary", () => {
      const date = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);

      assert.strictEqual(formatRelativeTime(date), "6 days ago");
    });

    test("returns '1 week ago' for 7 days ago", () => {
      const date = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      assert.strictEqual(formatRelativeTime(date), "1 week ago");
    });

    test("returns plural weeks for 2 weeks ago", () => {
      const date = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

      assert.strictEqual(formatRelativeTime(date), "2 weeks ago");
    });

    test("returns '3 weeks ago' for 21 days ago", () => {
      const date = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000);

      assert.strictEqual(formatRelativeTime(date), "3 weeks ago");
    });

    test("returns '1 month ago' for 30 days ago", () => {
      const date = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      assert.strictEqual(formatRelativeTime(date), "1 month ago");
    });

    test("returns plural months for 3 months ago", () => {
      const date = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

      assert.strictEqual(formatRelativeTime(date), "3 months ago");
    });

    test("returns months for 11 months ago", () => {
      const date = new Date(Date.now() - 330 * 24 * 60 * 60 * 1000);

      assert.strictEqual(formatRelativeTime(date), "11 months ago");
    });

    test("returns '1 year ago' for 365 days ago", () => {
      const date = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

      assert.strictEqual(formatRelativeTime(date), "1 year ago");
    });

    test("returns plural years for 2 years ago", () => {
      const date = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000);

      assert.strictEqual(formatRelativeTime(date), "2 years ago");
    });

    test("returns plural years for 5 years ago", () => {
      const date = new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000);

      assert.strictEqual(formatRelativeTime(date), "5 years ago");
    });

    test("returns 'just now' for a far future date", () => {
      const future = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

      assert.strictEqual(formatRelativeTime(future), "just now");
    });

    test("returns a string type", () => {
      const result = formatRelativeTime(new Date());

      assert.strictEqual(typeof result, "string");
    });
  });
});
