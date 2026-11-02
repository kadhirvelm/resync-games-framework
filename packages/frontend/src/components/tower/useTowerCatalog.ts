"use client";

import { isServiceError, type ServiceError } from "@resync-game-framework/api";
import { useEffect, useState } from "react";
import { convertErrorToString } from "@/lib/convertErrorToString";
import { useClientServiceCallers } from "@/services/clientServiceCallers";
import {
  EMPTY_TOWER_CATALOG,
  type TowerCatalog,
} from "./logic/buildTowerContent";

/** Loading state of the Blueprint Workshop's stored assets. */
export interface TowerCatalogState {
  catalog: TowerCatalog;
  isLoading: boolean;
  /** One line for each list that could not be read */
  warnings: string[];
}

/**
 * Reads every dungeon package and stored asset the tower can be built from.
 * A list that fails is treated as empty, so the built-in tower always works.
 * @returns The catalog, whether it is still loading, and any read failures
 */
export function useTowerCatalog(): TowerCatalogState {
  const { clientServiceCallers } = useClientServiceCallers();
  const [state, setState] = useState<TowerCatalogState>({
    catalog: EMPTY_TOWER_CATALOG,
    isLoading: true,
    warnings: [],
  });

  useEffect(() => {
    let cancelled = false;
    const warnings: string[] = [];

    /**
     * @param label - What the list holds, for the warning line
     * @param request - Service call
     * @param pick - Reads the list out of a successful response
     * @returns The list, or an empty list when the call failed
     */
    async function readList<Response, Item>(
      label: string,
      request: () => Promise<Response | ServiceError>,
      pick: (response: Response) => Item[],
    ): Promise<Item[]> {
      try {
        const response = await request();
        if (isServiceError(response)) {
          warnings.push(`${label}: ${response.message}`);
          return [];
        }
        return pick(response);
      } catch (error) {
        warnings.push(`${label}: ${convertErrorToString(error)}`);
        return [];
      }
    }

    void (async () => {
      const [
        dungeons,
        characters,
        cards,
        enemies,
        backgrounds,
        spriteSheets,
        audio,
      ] = await Promise.all([
        readList(
          "Dungeons",
          () => clientServiceCallers.dungeon.list(),
          (response) => response.dungeons,
        ),
        readList(
          "Characters",
          () => clientServiceCallers.cardCharacter.list(),
          (response) => response.sets,
        ),
        readList(
          "Cards",
          () => clientServiceCallers.playableCard.list(),
          (response) => response.cards,
        ),
        readList(
          "Enemies",
          () => clientServiceCallers.enemy.list(),
          (response) => response.enemies,
        ),
        readList(
          "Rooms",
          () => clientServiceCallers.battleBackground.list(),
          (response) => response.backgrounds,
        ),
        readList(
          "Sprites",
          () => clientServiceCallers.spriteSheet.list(),
          (response) => response.spriteSheets,
        ),
        readList(
          "Audio",
          () => clientServiceCallers.audio.list(),
          (response) => response.clips,
        ),
      ]);
      if (cancelled) {
        return;
      }
      setState({
        catalog: {
          audio,
          backgrounds,
          cards,
          characters,
          dungeons,
          enemies,
          spriteSheets,
        },
        isLoading: false,
        warnings,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [clientServiceCallers]);

  return state;
}
