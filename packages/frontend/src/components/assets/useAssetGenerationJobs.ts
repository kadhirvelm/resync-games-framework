"use client";

import {
  DUNGEON_ASSET_CLASS_ID,
  DUNGEON_SLOT_ASSET_CLASS_ID,
  type DungeonSlot,
  isServiceError,
} from "@resync-game-framework/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { convertErrorToString } from "@/lib/convertErrorToString";
import { useClientServiceCallers } from "@/services/clientServiceCallers";
import type { AssetClassDefinition } from "./assetClasses/assetClassDefinition";
import { ASSET_CLASSES } from "./assetClasses/assetClassRegistry";
import {
  applyGenerationResult,
  createAssetGenerationJobState,
  dismissAssetGenerationJob,
  dungeonSlotJobs,
  failAssetGenerationJob,
  jobsForAssetClass,
  markAssetGenerationJobStopping,
  reconcileInFlightJobs,
  refreshAssetClasses,
  refreshKeyForAssetClass,
  resultsForAssetClass,
  startAssetGenerationJob,
} from "./assetGenerationJobs";
import type { PendingJob } from "./PendingJobCard";

/** How often a refreshed page checks Redis for slot runs that finished. */
const IN_FLIGHT_POLL_MS = 2000;

/**
 * Tracks generation requests across every asset class. Several jobs can run
 * at once; each finished job bumps its class's refresh key so the gallery refetches.
 * @returns Job lists, refresh keys, retained results, and actions to start, stop, or dismiss a job
 */
export function useAssetGenerationJobs() {
  const { clientServiceCallers } = useClientServiceCallers();
  const [state, setState] = useState(createAssetGenerationJobState);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    let cancelled = false;

    const syncInFlight = async () => {
      const result = await clientServiceCallers.dungeon.inflight();
      if (cancelled || isServiceError(result)) {
        return;
      }
      setState((previous) => reconcileInFlightJobs(previous, result.jobs));
    };

    void syncInFlight();
    const timer = setInterval(() => {
      void syncInFlight();
    }, IN_FLIGHT_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [clientServiceCallers]);

  const dismissJob = useCallback((id: string) => {
    setState((previous) => dismissAssetGenerationJob(previous, id));
  }, []);

  const startJob = useCallback(
    (assetClass: AssetClassDefinition, prompt: string) => {
      const id = crypto.randomUUID();
      setState((previous) =>
        startAssetGenerationJob(previous, {
          assetClassId: assetClass.id,
          id,
          prompt,
        }),
      );

      assetClass
        .generate(clientServiceCallers, prompt, id)
        .then((result) => {
          setState((previous) =>
            applyGenerationResult(previous, {
              errorMessage: convertErrorToString,
              jobId: id,
              refreshClassIds: assetClass.refreshClassIds,
              rememberResult: assetClass.remembersResults,
              result,
            }),
          );
        })
        .catch((error: unknown) => {
          setState((previous) => {
            const job = previous.jobs.find((entry) => entry.id === id);
            if (job?.stopping === true) {
              return dismissAssetGenerationJob(previous, id);
            }
            return failAssetGenerationJob(
              previous,
              id,
              convertErrorToString(error),
            );
          });
        });
    },
    [clientServiceCallers],
  );

  const startDungeonSlot = useCallback(
    (dungeonId: string, slot: DungeonSlot) => {
      if (slot.status === "ready" || slot.status === "generating") {
        return;
      }
      const running = stateRef.current.jobs.some(
        (job) => job.slotId === slot.id && job.error === null,
      );
      if (running) {
        return;
      }

      const assetClassId = DUNGEON_SLOT_ASSET_CLASS_ID[slot.kind];
      const id = crypto.randomUUID();
      setState((previous) =>
        startAssetGenerationJob(previous, {
          assetClassId,
          awaitingServer: true,
          dungeonId,
          id,
          prompt: slot.prompt,
          slotId: slot.id,
        }),
      );

      clientServiceCallers.dungeon
        .generateSlot({ dungeonId, generationId: id, slotId: slot.id })
        .then((result) => {
          setState((previous) =>
            applyGenerationResult(previous, {
              errorMessage: convertErrorToString,
              jobId: id,
              refreshClassIds: [DUNGEON_ASSET_CLASS_ID],
              result,
            }),
          );
        })
        .catch((error: unknown) => {
          setState((previous) => {
            const job = previous.jobs.find((entry) => entry.id === id);
            if (job?.stopping === true) {
              return refreshAssetClasses(
                dismissAssetGenerationJob(previous, id),
                [DUNGEON_ASSET_CLASS_ID],
              );
            }
            return refreshAssetClasses(
              failAssetGenerationJob(previous, id, convertErrorToString(error)),
              [DUNGEON_ASSET_CLASS_ID],
            );
          });
        });
    },
    [clientServiceCallers],
  );

  const associateDungeonSlot = useCallback(
    async (dungeonId: string, slotId: string, assetId: string) => {
      const result = await clientServiceCallers.dungeon.associate({
        assetId,
        dungeonId,
        slotId,
      });
      if (isServiceError(result)) {
        return convertErrorToString(result);
      }
      setState((previous) =>
        refreshAssetClasses(previous, [DUNGEON_ASSET_CLASS_ID]),
      );
      return null;
    },
    [clientServiceCallers],
  );

  const stopJob = useCallback(
    (assetClass: AssetClassDefinition, jobId: string) => {
      setState((previous) => markAssetGenerationJobStopping(previous, jobId));
      assetClass.cancel(clientServiceCallers, jobId).then((result) => {
        if (!isServiceError(result)) {
          return;
        }
        setState((previous) =>
          failAssetGenerationJob(previous, jobId, convertErrorToString(result)),
        );
      });
    },
    [clientServiceCallers],
  );

  const stopDungeonSlot = useCallback(
    (generationId: string, assetClassId: string) => {
      const assetClass = ASSET_CLASSES.find(
        (entry) => entry.id === assetClassId,
      );
      if (assetClass === undefined) {
        return;
      }
      stopJob(assetClass, generationId);
    },
    [stopJob],
  );

  /**
   * @param assetClassId - Asset class to filter by
   * @returns That class's running and failed jobs
   */
  const getJobsForClass = (assetClassId: string): PendingJob[] =>
    jobsForAssetClass(state, assetClassId);

  /**
   * @param assetClassId - Asset class to look up
   * @returns How many times that class's gallery should have refetched
   */
  const getRefreshKey = (assetClassId: string): number =>
    refreshKeyForAssetClass(state, assetClassId);

  /**
   * @param assetClassId - Asset class to look up
   * @returns Successful results kept for that class during this session
   */
  const getResultsForClass = (assetClassId: string): readonly unknown[] =>
    resultsForAssetClass(state, assetClassId);

  const getDungeonSlotJobs = (): PendingJob[] => dungeonSlotJobs(state);

  return {
    associateDungeonSlot,
    dismissJob,
    getDungeonSlotJobs,
    getJobsForClass,
    getRefreshKey,
    getResultsForClass,
    startDungeonSlot,
    startJob,
    stopDungeonSlot,
    stopJob,
  };
}
