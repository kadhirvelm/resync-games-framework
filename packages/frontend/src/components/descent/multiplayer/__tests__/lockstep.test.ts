import { describe, expect, it } from "bun:test";
import type { DescentStampedCommand } from "@resync-game-framework/api";
import type { AshenCruciblePlayer } from "../../data/layers/ashen_crucible";
import { createDescentSim } from "../../logic/sim";
import type { SimModule } from "../../logic/sim/modules";
import {
  applyDescentLockstepBatch,
  createDescentLockstepSession,
} from "../lockstep";

const PLAYERS: AshenCruciblePlayer[] = [
  { color: "#f2c14e", id: "p1", name: "Aria", slotIndex: 0 },
  { color: "#4db8ff", id: "p2", name: "Bram", slotIndex: 1 },
];

/**
 * Creates a stamped move for the first unit owned by a player.
 * @param session - Session supplying initial unit ids
 * @param playerId - Owner whose unit should move
 * @param seq - Authoritative sequence number
 * @param tick - Authoritative execution tick
 * @returns Stamped multiplayer command
 */
function moveCommand(
  session: ReturnType<typeof createDescentLockstepSession>,
  playerId: string,
  seq: number,
  tick: number,
): DescentStampedCommand {
  const unit = session.sim
    .snapshot()
    .units.find((entry) => entry.ownerId === playerId);
  if (!unit) throw new Error(`No starting unit for ${playerId}`);
  return {
    command: {
      type: "order_move",
      unitIds: [unit.id],
      x: unit.x + 8,
      y: unit.y + 2,
    },
    playerId,
    seq,
    tick,
  };
}

describe("Descent lockstep replay", () => {
  it("produces identical snapshots with different network batching", () => {
    const first = createDescentLockstepSession({
      matchId: "match",
      players: PLAYERS,
      seed: 42,
    });
    const second = createDescentLockstepSession({
      matchId: "match",
      players: PLAYERS,
      seed: 42,
    });
    const firstCommand = moveCommand(first, "p1", 1, 1);
    const secondCommand = moveCommand(first, "p2", 2, 5);

    expect(
      applyDescentLockstepBatch(first, {
        commands: [firstCommand, secondCommand],
        paused: false,
        speed: 1,
        targetTick: 40,
      }),
    ).toBe("applied");

    expect(
      applyDescentLockstepBatch(second, {
        commands: [firstCommand],
        paused: false,
        speed: 1,
        targetTick: 3,
      }),
    ).toBe("applied");
    expect(
      applyDescentLockstepBatch(second, {
        commands: [secondCommand],
        paused: false,
        speed: 1,
        targetTick: 12,
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

    expect(second.sim.snapshot()).toEqual(first.sim.snapshot());
  });

  it("coalesces empty spans into one sim notification", () => {
    const session = createDescentLockstepSession({
      matchId: "match",
      players: PLAYERS,
      seed: 7,
    });
    let notifications = 0;
    session.sim.subscribe(() => {
      notifications += 1;
    });

    expect(
      applyDescentLockstepBatch(session, {
        commands: [],
        paused: false,
        speed: 1,
        targetTick: 8,
      }),
    ).toBe("applied");
    expect(session.sim.tick).toBe(8);
    expect(notifications).toBe(1);
  });

  it("rejects a late command instead of moving it to a client-specific tick", () => {
    const session = createDescentLockstepSession({
      matchId: "match",
      players: PLAYERS,
      seed: 9,
    });
    const command = moveCommand(session, "p1", 1, 2);
    applyDescentLockstepBatch(session, {
      commands: [],
      paused: false,
      speed: 1,
      targetTick: 4,
    });

    expect(
      applyDescentLockstepBatch(session, {
        commands: [command],
        paused: false,
        speed: 1,
        targetTick: 6,
      }),
    ).toBe("resync-required");

    const replayed = createDescentLockstepSession({
      matchId: "match",
      players: PLAYERS,
      seed: 9,
    });
    expect(
      applyDescentLockstepBatch(replayed, {
        commands: [command],
        paused: false,
        speed: 1,
        targetTick: 6,
      }),
    ).toBe("applied");
    expect(replayed.sim.tick).toBe(6);
  });

  it("catches up while paused and resumes only on an authoritative transition", () => {
    const session = createDescentLockstepSession({
      matchId: "match",
      players: PLAYERS,
      seed: 11,
    });
    applyDescentLockstepBatch(session, {
      commands: [],
      paused: true,
      speed: 1,
      targetTick: 4,
    });
    expect(session.sim.tick).toBe(4);
    expect(session.sim.paused).toBe(true);

    applyDescentLockstepBatch(session, {
      commands: [],
      paused: true,
      speed: 1,
      targetTick: 6,
    });
    expect(session.sim.tick).toBe(6);
    expect(session.sim.paused).toBe(true);

    applyDescentLockstepBatch(session, {
      commands: [],
      paused: false,
      speed: 1,
      targetTick: 6,
    });
    expect(session.sim.paused).toBe(false);
  });

  it("does not clear a terminal sim pause on later server ticks", () => {
    const haltingModule: SimModule = {
      id: "test-terminal-pause",
      processors: [
        {
          id: "terminal-pause",
          phase: "layers",
          run(context) {
            if (context.tick === 0) context.world.paused = true;
          },
        },
      ],
    };
    const session = createDescentLockstepSession({
      matchId: "match",
      players: PLAYERS,
      seed: 12,
      sim: createDescentSim({ modules: [haltingModule], seed: 12 }),
    });

    applyDescentLockstepBatch(session, {
      commands: [],
      paused: false,
      speed: 1,
      targetTick: 4,
    });
    expect(session.sim.tick).toBe(1);
    expect(session.halted).toBe(true);
    expect(session.sim.paused).toBe(true);

    applyDescentLockstepBatch(session, {
      commands: [],
      paused: false,
      speed: 1,
      targetTick: 8,
    });
    expect(session.sim.tick).toBe(1);
    expect(session.sim.paused).toBe(true);
  });

  it("preserves a terminal pause reached exactly on the batch boundary", () => {
    const haltingModule: SimModule = {
      id: "test-boundary-terminal-pause",
      processors: [
        {
          id: "boundary-terminal-pause",
          phase: "layers",
          run(context) {
            if (context.tick === 1) context.world.paused = true;
          },
        },
      ],
    };
    const createSession = () =>
      createDescentLockstepSession({
        matchId: "match",
        players: PLAYERS,
        seed: 13,
        sim: createDescentSim({ modules: [haltingModule], seed: 13 }),
      });
    const session = createSession();
    applyDescentLockstepBatch(session, {
      commands: [],
      paused: false,
      speed: 1,
      targetTick: 2,
    });
    expect(session.sim.tick).toBe(2);
    expect(session.halted).toBe(true);

    applyDescentLockstepBatch(session, {
      commands: [],
      paused: true,
      speed: 1,
      targetTick: 2,
    });
    applyDescentLockstepBatch(session, {
      commands: [],
      paused: false,
      speed: 1,
      targetTick: 2,
    });
    expect(session.sim.paused).toBe(true);
    expect(session.sim.tick).toBe(2);

    const replayed = createSession();
    applyDescentLockstepBatch(replayed, {
      commands: [],
      paused: false,
      speed: 1,
      targetTick: 4,
    });
    expect(replayed.sim.snapshot()).toEqual(session.sim.snapshot());
  });
});
