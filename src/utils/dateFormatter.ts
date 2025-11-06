/**
 * Formats a date for display in snapshot/runtime names.
 * Returns a string in YYYYMMDD format (e.g., "20251106").
 *
 * @param date - The date to format (defaults to current date)
 * @returns Formatted date string
 */
export function formatDateForName(date: Date = new Date()): string {
  return date.toISOString().split("T")[0].replace(/-/g, "");
}

/**
 * Formats a date as a relative time string (e.g., "2 days ago", "5 hours ago").
 *
 * @param date - The date to format
 * @returns Human-readable relative time string
 */
export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  // Calculate time differences
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  // Return appropriate format
  if (diffMonths > 0) {
    return `${diffMonths} month${diffMonths > 1 ? "s" : ""} ago`;
  } else if (diffWeeks > 0) {
    return `${diffWeeks} week${diffWeeks > 1 ? "s" : ""} ago`;
  } else if (diffDays > 0) {
    return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
  } else if (diffHours > 0) {
    return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  } else if (diffMinutes > 0) {
    return `${diffMinutes} minute${diffMinutes > 1 ? "s" : ""} ago`;
  } else {
    return "just now";
  }
}
