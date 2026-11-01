import { STORAGE_KEYS } from "../tower/persistence";

/** Reads the OS and existing game motion preference without requiring storage access. */
export function readReducedMotionPreference(): boolean {
  const systemPreference = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  try {
    return (
      systemPreference ||
      JSON.parse(localStorage.getItem(STORAGE_KEYS.settings) ?? "null")
        ?.reducedMotion === true
    );
  } catch {
    return systemPreference;
  }
}
