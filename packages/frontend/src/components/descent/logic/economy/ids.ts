/**
 * Locale-free id ordering. `localeCompare` depends on the runtime's ICU data,
 * so two machines could break ties differently and desync a replay.
 */

/**
 * Orders two ids by UTF-16 code units.
 * @param left - First id
 * @param right - Second id
 * @returns A negative number when `left` sorts first, positive when `right` does, 0 when equal
 */
export function compareIds(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
