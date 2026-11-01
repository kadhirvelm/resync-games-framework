"use client";

import { useEffect, useRef, useState } from "react";

/** Browser storage keys. Bump a key's suffix when its shape breaks. */
export const STORAGE_KEYS = {
  profile: "towers-of-coreborn.profile.v1",
  /** Ids of the climbs saved on the server, mirrored for the game selector */
  savedClimbIds: "towers-of-coreborn.saved-climbs.v1",
  settings: "towers-of-coreborn.settings.v1",
} as const;

/**
 * @param key - Storage key
 * @returns The parsed JSON value, or `undefined` when missing, unreadable,
 * or storage is unavailable
 */
function readStored(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/**
 * Writes a JSON value. Failures, such as a full or blocked storage, are
 * ignored: the game keeps running and simply does not persist.
 * @param key - Storage key
 * @param value - Value to store
 */
export function writeStored(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Persistence is best effort.
  }
}

/**
 * State that loads from local storage once and writes back on every change.
 * Only use under `ClientGate`, which renders on the client alone.
 * @param key - Storage key
 * @param parse - Turns the stored value, or `undefined`, into usable state
 * @returns The state and its setter, like `useState`
 */
export function useStoredState<T>(
  key: string,
  parse: (raw: unknown) => T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => parse(readStored(key)));
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    writeStored(key, value);
  }, [key, value]);

  return [value, setValue];
}
