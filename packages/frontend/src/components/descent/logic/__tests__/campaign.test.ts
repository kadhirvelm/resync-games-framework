import { describe, expect, it } from "bun:test";
import { DESCENT_CAMPAIGN_MISSIONS } from "@resync-game-framework/api";
import type { AshenCruciblePlayer } from "../../data/layers/ashen_crucible";
import {
  applyDescentLockstepBatch,
  createDescentLockstepSession,
} from "../../multiplayer/lockstep";
import { createMultiplayerDescentSim } from "../ashenGateSlice";
import { isWaveClockState } from "../waves/clock";

const PLAYERS: readonly AshenCruciblePlayer[] = [
  { color: "#f2c14e", id: "p1", name: "Aria", slotIndex: 0 },
  { color: "#4db8ff", id: "p2", name: "Bram", slotIndex: 1 },
];

describe("Descent co-op campaign scenarios", () => {
  for (const mission of DESCENT_CAMPAIGN_MISSIONS) {
    it(`${mission.id} uses its catalog tuning and fresh allied Holds`, () => {
      const sim = createMultiplayerDescentSim({
        mapId: mission.id,
        players: PLAYERS,
        seed: 42,
      });
      const standard = createMultiplayerDescentSim({
        players: PLAYERS,
        seed: 42,
      });
      const snapshot = sim.snapshot();
      const waves = snapshot.meta.waves;
      expect(isWaveClockState(waves)).toBe(true);
      if (!isWaveClockState(waves)) throw new Error("Missing wave state");
      expect(waves.waveStatScale).toBe(mission.waveStatScale);
      expect(waves.waveTimeScale).toBe(mission.waveTimeScale);
      expect(snapshot.resources).toEqual(standard.snapshot().resources);
      for (const player of PLAYERS) {
        expect(
          snapshot.buildings.some((building) => building.ownerId === player.id),
        ).toBe(true);
        expect(snapshot.units.some((unit) => unit.ownerId === player.id)).toBe(
          true,
        );
      }
    });

    it(`${mission.id} replays identically across network batches`, () => {
      const options = {
        mapId: mission.id,
        matchId: mission.id,
        players: PLAYERS,
        seed: 17,
      };
      const first = createDescentLockstepSession(options);
      const second = createDescentLockstepSession(options);
      const unit = first.sim
        .snapshot()
        .units.find((entry) => entry.ownerId === "p1");
      if (!unit) throw new Error("Missing starting unit");
      const command = {
        command: {
          type: "order_move",
          unitIds: [unit.id],
          x: unit.x + 3,
          y: unit.y + 2,
        },
        playerId: "p1",
        seq: 1,
        tick: 4,
      };
      expect(
        applyDescentLockstepBatch(first, {
          commands: [command],
          paused: false,
          speed: 1,
          targetTick: 40,
        }),
      ).toBe("applied");
      expect(
        applyDescentLockstepBatch(second, {
          commands: [command],
          paused: false,
          speed: 1,
          targetTick: 10,
        }),
      ).toBe("applied");
      expect(
        applyDescentLockstepBatch(second, {
          commands: [],
          paused: false,
          speed: 1,
          targetTick: 40,
        }),
      ).toBe("applied");
      expect(first.sim.snapshot()).toEqual(second.sim.snapshot());
    });
  }
});
