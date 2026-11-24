import { describe, expect, test } from "bun:test";
import type { AshenCruciblePlayer } from "../../data/layers/ashen_crucible";
import { readPresentation } from "../../views/presentation";
import {
  ASHEN_GATE_SLICE_MODULE_ID,
  createAshenGateSim,
  createMultiplayerDescentSim,
} from "../ashenGateSlice";
import {
  asUnit,
  buildingDef,
  createBuildingRecord,
  type EconomyMeta,
} from "../economy";
import type { DescentSim } from "../sim/descentSim";
import type { SimWorldState } from "../sim/world";
import { disbandHoldUnits } from "../slice/sliceDisband";
import type { AshenGateSliceState } from "../slice/sliceState";
import { RESOURCE_IDS, type SimSnapshot } from "../types";

const TWO_PLAYERS: readonly AshenCruciblePlayer[] = [
  { color: "#f2c14e", id: "p1", name: "Aria", slotIndex: 0 },
  { color: "#4db8ff", id: "p2", name: "Bram", slotIndex: 1 },
];

/**
 * Reads the published population used by the HUD.
 * @param snapshot - Current sim snapshot
 * @returns Used population
 */
function populationUsed(snapshot: SimSnapshot): number {
  return readPresentation(snapshot.meta).pop?.used ?? 0;
}

/**
 * Returns an editable serialized world for arranging a focused scenario.
 * @param sim - Sim to serialize
 * @returns Save envelope whose state can be changed and loaded again
 */
function editableWorld(sim: DescentSim): { state: SimWorldState } {
  return JSON.parse(sim.serialize()) as { state: SimWorldState };
}

/**
 * Reads integration state from a snapshot.
 * @param snapshot - Current sim snapshot
 * @returns Ashen Gate integration state
 */
function integration(snapshot: SimSnapshot): AshenGateSliceState {
  return snapshot.meta[ASHEN_GATE_SLICE_MODULE_ID] as AshenGateSliceState;
}

/**
 * Adds one unfinished Housing site and reloads the sim.
 * @param sim - Sim receiving the site
 * @param ownerId - Optional co-op owner
 */
function addUnfinishedHousing(sim: DescentSim, ownerId?: string): void {
  const saved = editableWorld(sim);
  saved.state.buildings.push(
    createBuildingRecord({
      buildingType: "housing",
      id: "unfinished-housing",
      ...(ownerId === undefined ? {} : { ownerId }),
      x: 2,
      y: 2,
    }),
  );
  sim.load(JSON.stringify(saved));
}

describe("construction cancellation", () => {
  test("removes the site, refunds its full cost, and releases its builders", () => {
    const sim = createAshenGateSim({ seed: 31, waterways: false });
    addUnfinishedHousing(sim);
    const builder = sim
      .snapshot()
      .units.find((unit) => unit.classId === "villager");
    const cost = buildingDef("housing")?.cost;
    if (builder === undefined || cost === undefined) {
      throw new Error("Missing construction fixture");
    }
    sim.enqueue({
      buildingId: "unfinished-housing",
      type: "assign_build",
      unitIds: [builder.id],
    });
    sim.step(1);
    expect(
      asUnit(
        sim.snapshot().units.find((unit) => unit.id === builder.id) ?? builder,
      ).task,
    ).toMatchObject({
      buildingId: "unfinished-housing",
      kind: "build",
    });

    const before = sim.snapshot().resources;
    sim.enqueue({
      buildingId: "unfinished-housing",
      type: "cancel_construction",
    });
    sim.step(1);

    const after = sim.snapshot();
    expect(
      after.buildings.some((building) => building.id === "unfinished-housing"),
    ).toBe(false);
    for (const resourceId of RESOURCE_IDS) {
      expect(after.resources[resourceId]).toBe(
        before[resourceId] + (cost[resourceId] ?? 0),
      );
    }
    const releasedBuilder = after.units.find((unit) => unit.id === builder.id);
    expect(releasedBuilder).toBeDefined();
    if (releasedBuilder === undefined) return;
    expect(asUnit(releasedBuilder).task).toBeNull();
    expect(
      readPresentation(after.meta).notices.some((notice) =>
        notice.text.includes("Cost refunded"),
      ),
    ).toBe(true);
  });

  test("does not remove or refund a completed building", () => {
    const sim = createAshenGateSim({ seed: 32, waterways: false });
    const camp = sim
      .snapshot()
      .buildings.find((building) => building.buildingType === "camp");
    if (camp === undefined) throw new Error("Missing Camp");
    const before = sim.snapshot().resources;
    sim.enqueue({ buildingId: camp.id, type: "cancel_construction" });
    sim.step(1);
    expect(
      sim.snapshot().buildings.some((building) => building.id === camp.id),
    ).toBe(true);
    expect(sim.snapshot().resources).toEqual(before);
  });

  test("enforces site ownership in co-op", () => {
    const sim = createMultiplayerDescentSim({
      players: TWO_PLAYERS,
      seed: 33,
    });
    addUnfinishedHousing(sim, "p2");
    const before = sim.snapshot().resources;
    sim.enqueue({
      actorId: "p1",
      buildingId: "unfinished-housing",
      type: "cancel_construction",
    });
    sim.step(1);
    expect(
      sim
        .snapshot()
        .buildings.some((building) => building.id === "unfinished-housing"),
    ).toBe(true);
    expect(sim.snapshot().resources).toEqual(before);

    sim.enqueue({
      actorId: "p2",
      buildingId: "unfinished-housing",
      type: "cancel_construction",
    });
    sim.step(1);
    expect(
      sim
        .snapshot()
        .buildings.some((building) => building.id === "unfinished-housing"),
    ).toBe(false);
  });
});

describe("unit disbanding", () => {
  test("removes the selected units and frees their weighted population", () => {
    const sim = createAshenGateSim({ seed: 41, waterways: false });
    const before = sim.snapshot();
    const rider = before.units.find((unit) => unit.classId === "rider");
    const villager = before.units.find((unit) => unit.classId === "villager");
    if (rider === undefined || villager === undefined) {
      throw new Error("Missing disband fixture");
    }
    const lostBefore = integration(before).stats.lost;
    sim.enqueue({
      type: "disband_units",
      unitIds: [rider.id, villager.id, "missing-unit"],
    });
    sim.step(1);

    const after = sim.snapshot();
    expect(after.units.some((unit) => unit.id === rider.id)).toBe(false);
    expect(after.units.some((unit) => unit.id === villager.id)).toBe(false);
    expect(populationUsed(after)).toBe(populationUsed(before) - 3);
    expect(after.resources).toEqual(before.resources);
    expect(integration(after).stats.lost).toBe(lostBefore);
    expect(
      integration(after).cultivation.units.some(
        (unit) => unit.unitId === rider.id,
      ),
    ).toBe(false);
  });

  test("releases an active breakthrough reservation when its unit is disbanded", () => {
    const sim = createAshenGateSim({ seed: 42, waterways: false });
    const saved = editableWorld(sim);
    const captain = saved.state.units.find(
      (unit) => unit.classId === "cultivator",
    );
    const cultivation = saved.state.meta[
      ASHEN_GATE_SLICE_MODULE_ID
    ] as AshenGateSliceState;
    const record = cultivation.cultivation.units.find(
      (unit) => unit.unitId === captain?.id,
    );
    if (captain === undefined || record === undefined) {
      throw new Error("Missing cultivation fixture");
    }
    asUnit(captain).realmId = "foundation";
    record.rank = "Sworn";
    record.activeBreakthrough = {
      kind: "channel",
      remainingSeconds: 10,
      reservedPopulation: 1,
      sourceRank: "Sworn",
      successChance: 1,
      targetRank: "Veteran",
    };
    (saved.state.meta.economy as EconomyMeta).popReserved = 1;
    sim.load(JSON.stringify(saved));
    const before = sim.snapshot();

    sim.enqueue({ type: "disband_units", unitIds: [captain.id] });
    sim.step(1);

    const after = sim.snapshot();
    expect(after.units.some((unit) => unit.id === captain.id)).toBe(false);
    expect(populationUsed(after)).toBe(populationUsed(before) - 2);
    expect((after.meta.economy as EconomyMeta).popReserved).toBe(0);
    expect(integration(after).injuries[captain.id]).toBeUndefined();
  });

  test("keeps co-op owner attribution for lingering combat effects", () => {
    const sim = createMultiplayerDescentSim({
      players: TWO_PLAYERS,
      seed: 44,
    });
    const saved = editableWorld(sim);
    const captain = saved.state.units.find(
      (unit) => unit.ownerId === "p1" && unit.classId === "cultivator",
    );
    if (captain === undefined) throw new Error("Missing co-op captain");
    const state = saved.state.meta[
      ASHEN_GATE_SLICE_MODULE_ID
    ] as AshenGateSliceState;
    state.combat.owners = { [captain.id]: "p1" };

    expect(disbandHoldUnits(saved.state, [captain.id])).toBe(1);
    expect(state.combat.owners?.[captain.id]).toBe("p1");
  });

  test("only disbands the issuing player's units in co-op", () => {
    const sim = createMultiplayerDescentSim({
      players: TWO_PLAYERS,
      seed: 43,
    });
    const before = sim.snapshot();
    const p1Rider = before.units.find(
      (unit) => unit.ownerId === "p1" && unit.classId === "rider",
    );
    const p2Rider = before.units.find(
      (unit) => unit.ownerId === "p2" && unit.classId === "rider",
    );
    if (p1Rider === undefined || p2Rider === undefined) {
      throw new Error("Missing co-op disband fixture");
    }
    sim.enqueue({
      actorId: "p1",
      type: "disband_units",
      unitIds: [p1Rider.id, p2Rider.id],
    });
    sim.step(1);

    const after = sim.snapshot();
    expect(after.units.some((unit) => unit.id === p1Rider.id)).toBe(false);
    expect(after.units.some((unit) => unit.id === p2Rider.id)).toBe(true);
    expect(populationUsed(after)).toBe(populationUsed(before) - 2);
  });
});
