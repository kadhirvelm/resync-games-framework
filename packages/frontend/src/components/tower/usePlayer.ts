"use client";

import {
  type CultivatorArtPart,
  type CultivatorFields,
  type CultivatorRecord,
  isServiceError,
  type ServiceError,
} from "@towers-of-coreborn/api";
import { useCallback, useEffect, useMemo, useState } from "react";
import { convertErrorToString } from "@/lib/convertErrorToString";
import { useClientServiceCallers } from "@/services/clientServiceCallers";
import { createClimbSyncQueue } from "./logic/climbSyncQueue";
import { isCultivatorPainting } from "./logic/cultivators";
import {
  filterClimbs,
  isClimbOver,
  readClimbRecords,
  removeClimb,
  type SavedClimb,
  type SaveSlots,
  storeClimb,
  toSaveClimbPayload,
} from "./logic/saveGame";
import { STORAGE_KEYS, writeStored } from "./persistence";

/** How often cultivators are re-read while one is being painted. */
const PAINTING_POLL_MS = 4000;

/** What a cultivator change resolves to: the cultivator, or why it failed. */
export type CultivatorResult =
  | { cultivator: CultivatorRecord; ok: true }
  | { error: string; ok: false };

/** The player's cultivators and saved climbs, kept on the server. */
export interface PlayerData {
  climbs: SaveSlots;
  createCultivator: (fields: CultivatorFields) => Promise<CultivatorResult>;
  /** Oldest first */
  cultivators: CultivatorRecord[];
  deleteCultivator: (cultivatorId: string) => Promise<string | undefined>;
  /** Removes every cultivator and climb on the server */
  eraseAll: () => Promise<void>;
  /** Why the player could not be loaded */
  loadError?: string;
  paintCultivator: (
    cultivatorId: string,
    parts?: CultivatorArtPart[],
  ) => Promise<CultivatorResult>;
  reload: () => void;
  /** Drops a saved climb here and on the server */
  removeClimb: (climbId: string) => void;
  /** Why the last climb save failed, until one succeeds */
  saveError?: string;
  status: "loading" | "ready" | "error";
  stopPainting: (cultivatorId: string) => Promise<CultivatorResult>;
  /** Saves a climb here and on the server; a finished climb is dropped */
  storeClimb: (climb: SavedClimb) => void;
  updateCultivator: (
    cultivatorId: string,
    changes: Partial<CultivatorFields>,
  ) => Promise<CultivatorResult>;
}

/**
 * @param response - Service result
 * @returns The value, or the error text when the call failed
 */
function toResult(response: CultivatorRecord | ServiceError): CultivatorResult {
  if (isServiceError(response)) {
    return { error: response.message, ok: false };
  }
  return { cultivator: response, ok: true };
}

/**
 * @param list - Current cultivators
 * @param cultivator - Cultivator to add or replace
 * @returns The list with that cultivator in place, or appended when new
 */
function upsertCultivator(
  list: CultivatorRecord[],
  cultivator: CultivatorRecord,
): CultivatorRecord[] {
  const index = list.findIndex((entry) => entry.id === cultivator.id);
  if (index === -1) {
    return [...list, cultivator];
  }
  return list.map((entry) => (entry.id === cultivator.id ? cultivator : entry));
}

/**
 * Loads the browser's cultivators and saved climbs from the server and keeps
 * them in step. Climb saves update at once here and reach the server through
 * a queue; cultivators are re-read while one is being painted.
 * @returns The player's data and the ways to change it
 */
export function usePlayer(): PlayerData {
  const { clientServiceCallers } = useClientServiceCallers();
  const player = clientServiceCallers.player;
  const [status, setStatus] = useState<PlayerData["status"]>("loading");
  const [loadError, setLoadError] = useState<string>();
  const [saveError, setSaveError] = useState<string>();
  const [cultivators, setCultivators] = useState<CultivatorRecord[]>([]);
  const [climbs, setClimbs] = useState<SaveSlots>({});
  const [reloadKey, setReloadKey] = useState(0);

  const queue = useMemo(
    () =>
      createClimbSyncQueue(async (operation) => {
        const response =
          operation.kind === "save"
            ? await player.saveClimb(operation.payload)
            : await player.deleteClimb({ climbId: operation.climbId });
        return isServiceError(response) ? response.message : undefined;
      }, setSaveError),
    [player],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey re-reads the player on request.
  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    void (async () => {
      try {
        const response = await player.state();
        if (cancelled) {
          return;
        }
        if (isServiceError(response)) {
          setLoadError(response.message);
          setStatus("error");
          return;
        }
        setCultivators(response.cultivators);
        setClimbs(readClimbRecords(response.climbs));
        setLoadError(undefined);
        setStatus("ready");
      } catch (error) {
        if (!cancelled) {
          setLoadError(convertErrorToString(error));
          setStatus("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [player, reloadKey]);

  const anyPainting = cultivators.some(isCultivatorPainting);
  useEffect(() => {
    if (!anyPainting) {
      return;
    }
    const timer = window.setInterval(async () => {
      const response = await player.state();
      if (!isServiceError(response)) {
        setCultivators(response.cultivators);
      }
    }, PAINTING_POLL_MS);
    return () => window.clearInterval(timer);
  }, [anyPainting, player]);

  // The game selector reads this to offer Continue without a server call.
  useEffect(() => {
    if (status === "ready") {
      writeStored(STORAGE_KEYS.savedClimbIds, Object.keys(climbs));
    }
  }, [climbs, status]);

  /**
   * Applies a cultivator response to the roster.
   * @param request - Service call
   * @returns The call's result
   */
  const applyCultivator = useCallback(
    async (
      request: Promise<CultivatorRecord | ServiceError>,
    ): Promise<CultivatorResult> => {
      try {
        const result = toResult(await request);
        if (result.ok) {
          setCultivators((current) =>
            upsertCultivator(current, result.cultivator),
          );
        }
        return result;
      } catch (error) {
        return { error: convertErrorToString(error), ok: false };
      }
    },
    [],
  );

  const deleteCultivator = useCallback(
    async (cultivatorId: string) => {
      await queue.settled();
      const response = await player.deleteCultivator({ cultivatorId });
      if (isServiceError(response)) {
        return response.message;
      }
      setCultivators((current) =>
        current.filter((entry) => entry.id !== cultivatorId),
      );
      setClimbs((current) =>
        filterClimbs(current, (climb) => climb.cultivatorId !== cultivatorId),
      );
      return undefined;
    },
    [player, queue],
  );

  const eraseAll = useCallback(async () => {
    await queue.settled();
    const response = await player.erase();
    if (isServiceError(response)) {
      setLoadError(response.message);
      return;
    }
    setCultivators([]);
    setClimbs({});
  }, [player, queue]);

  const removeSavedClimb = useCallback(
    (climbId: string) => {
      setClimbs((current) => removeClimb(current, climbId));
      queue.push({ climbId, kind: "delete" });
    },
    [queue],
  );

  const storeSavedClimb = useCallback(
    (climb: SavedClimb) => {
      setClimbs((current) => storeClimb(current, climb));
      queue.push(
        isClimbOver(climb.run)
          ? { climbId: climb.id, kind: "delete" }
          : { kind: "save", payload: toSaveClimbPayload(climb) },
      );
    },
    [queue],
  );

  const cultivatorActions = useMemo(
    () => ({
      createCultivator: (fields: CultivatorFields) =>
        applyCultivator(player.createCultivator(fields)),
      paintCultivator: (cultivatorId: string, parts?: CultivatorArtPart[]) =>
        applyCultivator(player.paintCultivator({ cultivatorId, parts })),
      stopPainting: (cultivatorId: string) =>
        applyCultivator(player.stopPainting({ cultivatorId })),
      updateCultivator: (
        cultivatorId: string,
        changes: Partial<CultivatorFields>,
      ) =>
        applyCultivator(player.updateCultivator({ ...changes, cultivatorId })),
    }),
    [applyCultivator, player],
  );

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  return {
    ...cultivatorActions,
    climbs,
    cultivators,
    deleteCultivator,
    eraseAll,
    loadError,
    reload,
    removeClimb: removeSavedClimb,
    saveError,
    status,
    storeClimb: storeSavedClimb,
  };
}
