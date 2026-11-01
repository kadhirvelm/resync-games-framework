/**
 * @param then - Earlier timestamp in milliseconds
 * @param now - Current timestamp in milliseconds
 * @returns A short relative time, such as "just now", "5 min ago", or "3 days ago"
 */
export function formatTimeAgo(then: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 45) {
    return "just now";
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  }
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

/** Roman numerals for ascension levels 0 through 5. */
const NUMERALS = ["0", "I", "II", "III", "IV", "V"];

/**
 * @param level - Ascension level
 * @returns The level as a Roman numeral, or the plain number past the table
 */
export function ascensionNumeral(level: number): string {
  return NUMERALS[level] ?? String(level);
}
