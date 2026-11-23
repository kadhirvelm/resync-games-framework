/**
 * Economy sim module.
 *
 * Register `economyModule` in `logic/sim/extensionPoints.ts` (`DESCENT_SIM_MODULES`).
 * That file belongs to the sim chunk, so this module stays opt-in: pass it to
 * `createDescentSim({ modules: [economyModule] })`.
 *
 * Commands owned here: place_building, assign_build, assign_gather, market_trade,
 * issue_rations, brew_pill, upgrade_hold, recall_villagers, release_villagers. Training payment is `payTraining`, which combat calls from
 * its own train_unit handler. Dig, tier upgrade, damage, and layer reset are
 * methods on `EconomySession` so other chunks can call them inside a tick.
 */

import type { CommandHandlerMap, SimModule } from "../sim/modules";
import type { SimWorldState } from "../sim/world";
import {
  issueRations,
  placeBuilding,
  startBrew,
  trade,
  upgradeHold,
} from "./actions";
import { economyHost } from "./records";
import { runEconomyTick } from "./tick";
import {
  orderVillagersBuild,
  orderVillagersBuildAcrossSites,
  orderVillagersGather,
  recallVillagers,
  releaseVillagers,
  type VillagerPolicy,
} from "./villagers";

/** Stable module id. Meta is stored at `world.meta.economy`. */
export const ECONOMY_MODULE_ID = "economy";

/** Options for `createEconomyModule`. */
export interface EconomyModuleOptions {
  /**
   * Sim ticks per economy step. Economy tables (build, gather, brew, ration
   * windows, villager walking) are authored in economy steps, so a game at
   * 20 ticks per second uses 10 to step the Hold twice a second. Default 1.
   */
  stepEveryTicks?: number;
  /**
   * When true, villagers only work what the player ordered (RTS controls).
   * When false (default), idle villagers choose their own jobs.
   */
  manualVillagers?: boolean;
}

/**
 * Creates the economy module.
 * @param options - Step cadence
 * @returns A sim module that runs the Hold
 */
export function createEconomyModule(
  options: EconomyModuleOptions = {},
): SimModule {
  const every = Math.max(1, Math.floor(options.stepEveryTicks ?? 1));
  const policy: VillagerPolicy = { manual: options.manualVillagers === true };
  /**
   * @param world - Sim world
   * @returns A host whose clock counts economy steps
   */
  const host = (world: SimWorldState) => economyHost(world, every);
  const ownedUnitIds = (
    world: SimWorldState,
    unitIds: readonly string[],
    actorId: string | undefined,
  ): string[] => {
    if (actorId === undefined) return [...unitIds];
    return unitIds.filter((unitId) => {
      const unit = world.units.find((entry) => entry.id === unitId);
      return unit !== undefined && unit.ownerId === actorId;
    });
  };
  const ownsBuilding = (
    world: SimWorldState,
    buildingId: string,
    actorId: string | undefined,
  ): boolean => {
    if (actorId === undefined) return true;
    return world.buildings.some(
      (building) => building.id === buildingId && building.ownerId === actorId,
    );
  };
  const commands: CommandHandlerMap = {
    assign_build(command, context) {
      const unitIds = ownedUnitIds(
        context.world,
        command.unitIds,
        command.actorId,
      );
      if (unitIds.length === 0) return;
      orderVillagersBuild(host(context.world), unitIds, command.buildingId);
    },
    assign_gather(command, context) {
      const unitIds = ownedUnitIds(
        context.world,
        command.unitIds,
        command.actorId,
      );
      if (unitIds.length === 0) return;
      orderVillagersGather(host(context.world), unitIds, command.nodeId);
    },
    brew_pill(command, context) {
      if (!ownsBuilding(context.world, command.furnaceId, command.actorId)) {
        return;
      }
      startBrew(host(context.world), command.furnaceId, command.pillId);
    },
    issue_rations(command, context) {
      if (!ownsBuilding(context.world, command.messHallId, command.actorId)) {
        return;
      }
      const unitIds = ownedUnitIds(
        context.world,
        command.unitIds,
        command.actorId,
      );
      if (unitIds.length === 0) return;
      issueRations(host(context.world), command.messHallId, unitIds);
    },
    market_trade(command, context) {
      trade(host(context.world), command.sell, command.buy, command.amount);
    },
    place_building(command, context) {
      const economy = host(context.world);
      const id = context.nextEntityId("building");
      const rejection = placeBuilding(
        economy,
        {
          buildingType: command.buildingType,
          ownerId: command.actorId,
          x: command.x,
          y: command.y,
        },
        id,
      );
      economy.economy.rejection = rejection;
      if (rejection !== null || command.builderIds === undefined) return;
      const builders = ownedUnitIds(
        context.world,
        command.builderIds,
        command.actorId,
      );
      if (builders.length === 0) return;
      if (command.queue === true) {
        orderVillagersBuildAcrossSites(economy, builders, id);
        return;
      }
      orderVillagersBuild(economy, builders, id);
    },
    recall_villagers(command, context) {
      recallVillagers(host(context.world), command.actorId);
    },
    release_villagers(command, context) {
      releaseVillagers(host(context.world), command.actorId);
    },
    upgrade_hold(command, context) {
      upgradeHold(host(context.world), command.actorId);
    },
  };
  return {
    commands,
    id: ECONOMY_MODULE_ID,
    /**
     * Seeds an empty economy bag. Buildings and nodes come from the scenario.
     * @param world - Fresh world, before tick 0
     */
    init(world) {
      host(world);
    },
    processors: [
      {
        id: "economy-tick",
        phase: "economy",
        /**
         * Runs gathering, construction, deep works, and placement flags on
         * every `stepEveryTicks`-th tick.
         * @param context - Tick being processed
         */
        run(context) {
          if ((context.tick + 1) % every !== 0) return;
          runEconomyTick(host(context.world), policy);
        },
      },
    ],
  };
}

/** Economy module stepping once per sim tick (headless tests and tools). */
export const economyModule: SimModule = createEconomyModule();
