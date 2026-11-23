import { afterEach, describe, expect, it } from "bun:test";
import {
  DESCENT_CAMPAIGN_MISSIONS,
  DESCENT_GAME_ID,
  DESCENT_PLAYER_COLORS,
  type DescentRoomState,
  type DescentTickPayload,
  type GameRoomCommandResult,
  type GameRoomState,
} from "@resync-game-framework/api";
import type { GameRoomStore } from "src/game-room/game-room.store";
import type { RedisService } from "src/infra/redis/redis.service";
import { MockRedisService } from "../../infra/redis/__tests__/mockRedis.module";
import { DescentService } from "../descent.service";

function createFakeStore(initialRoom: GameRoomState) {
  let room = structuredClone(initialRoom);
  const socketToPlayer = new Map<string, string>(
    initialRoom.players.map((player, index) => [
      `sock-${index + 1}`,
      player.id,
    ]),
  );

  const store = {
    async findMember(roomId: string, gameId: string, socketId: string) {
      if (roomId.trim().toUpperCase() !== room.id || gameId !== room.gameId) {
        return null;
      }
      const playerId = socketToPlayer.get(socketId);
      if (!playerId) return null;
      const member = room.players.find((player) => player.id === playerId);
      if (!member) return null;
      return { member: { ...member, socketId }, roomId: room.id };
    },
    async hasConnectedMembers(roomId: string, gameId: string) {
      return (
        room.id === roomId && room.gameId === gameId && room.players.length > 0
      );
    },
    async mutateServerRoom<T>(
      roomId: string,
      gameId: string,
      socketId: string,
      apply: (
        current: GameRoomState,
        playerId: string,
      ) => Promise<
        | { gameState: unknown; ok: true; value: T }
        | { code: string; message: string; ok: false }
      >,
    ) {
      const found = await store.findMember(roomId, gameId, socketId);
      if (!found) {
        return {
          result: {
            error: { code: "NOT_A_MEMBER", message: "Not a member" },
            ok: false,
          },
        };
      }
      const decision = await apply(structuredClone(room), found.member.id);
      if (!decision.ok) {
        return {
          result: {
            error: { code: decision.code, message: decision.message },
            ok: false,
          },
        };
      }
      room = {
        ...room,
        gameState: decision.gameState as GameRoomState["gameState"],
        revision: room.revision + 1,
      };
      return {
        result: { ok: true, room: structuredClone(room) },
        value: decision.value,
      };
    },
  };

  return Object.assign(store as unknown as GameRoomStore, {
    addPlayer(playerId: string, socketId: string) {
      room.players.push({
        id: playerId,
        joinedAt: new Date().toISOString(),
        name: playerId,
      });
      socketToPlayer.set(socketId, playerId);
    },
    /** Removes current membership without changing the match's locked roster. */
    removePlayer(playerId: string): void {
      room.players = room.players.filter((player) => player.id !== playerId);
    },
    /** Returns an isolated snapshot for verifying rejected mutations. */
    snapshot(): GameRoomState {
      return structuredClone(room);
    },
  });
}

describe("DescentService", () => {
  const services: DescentService[] = [];

  afterEach(async () => {
    for (const service of services.splice(0, services.length)) {
      await service.onModuleDestroy();
    }
  });

  function makeRoom(playerCount: number): GameRoomState {
    const now = new Date().toISOString();
    const players = Array.from({ length: playerCount }, (_, index) => ({
      id: `player-${index + 1}`,
      joinedAt: now,
      name: `Commander ${index + 1}`,
    }));
    return {
      createdAt: now,
      gameId: DESCENT_GAME_ID,
      gameState: {
        mapId: "ashen_crucible",
        matchId: null,
        phase: "lobby",
        roster: [],
        seed: null,
        startedAt: null,
      },
      hostPlayerId: players[0]?.id ?? "player-1",
      id: "ABC234",
      maxPlayers: 4,
      players,
      revision: 0,
      updatedAt: now,
    };
  }

  it("assigns up to 4 distinct player colors and starts a match only for the host", async () => {
    const store = createFakeStore(makeRoom(4));
    const service = new DescentService(
      store,
      new MockRedisService() as unknown as RedisService,
    );
    services.push(service);

    const nonHostAttempt = await service.startMatch(
      { roomId: "ABC234" },
      "sock-2",
    );
    expect(nonHostAttempt.ok).toBe(false);

    const started = await service.startMatch({ roomId: "ABC234" }, "sock-1");
    expect(started.ok).toBe(true);
    if (!started.ok || !started.room) return;

    const state = started.room.gameState as unknown as DescentRoomState;
    expect(state.phase).toBe("playing");
    expect(state.mapId).toBe("ashen_crucible");
    expect(typeof state.seed).toBe("number");
    expect(state.roster).toHaveLength(4);
    expect(state.roster.map((player) => player.color)).toEqual([
      ...DESCENT_PLAYER_COLORS,
    ]);
  });

  it("stamps commands with the socket's playerId and replays them in sync", async () => {
    const store = createFakeStore(makeRoom(2));
    const service = new DescentService(
      store,
      new MockRedisService() as unknown as RedisService,
    );
    services.push(service);
    const ticks: DescentTickPayload[] = [];
    service.setBroadcaster((payload) => ticks.push(payload));

    const started = await service.startMatch({ roomId: "ABC234" }, "sock-1");
    expect(started.ok).toBe(true);
    const matchId = started.ok
      ? (started.room?.gameState as DescentRoomState | undefined)?.matchId
      : null;
    if (!matchId) return;

    const ack = await service.enqueueCommand(
      {
        command: { type: "order_move", unitIds: ["u-1"], x: 40, y: 50 },
        matchId,
        roomId: "ABC234",
      },
      "sock-2",
    );
    expect(ack.ok).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 140));
    expect(ticks.length > 0).toBe(true);

    const sync = await service.sync(
      { fromTick: 0, matchId, roomId: "ABC234" },
      "sock-1",
    );
    expect(sync.ok).toBe(true);
    expect(sync.targetTick > 0).toBe(true);
    expect(sync.commands).toHaveLength(1);
    expect(sync.commands[0]?.playerId).toBe("player-2");

    const paused = await service.setPaused(
      { matchId, paused: true, roomId: "ABC234" },
      "sock-1",
    );
    expect(paused.ok).toBe(true);
    const speed = await service.setSpeed(
      { matchId, roomId: "ABC234", speed: 2 },
      "sock-2",
    );
    expect(speed.ok).toBe(true);
  });

  it("admits and replays cultivator commands while rejecting invalid payloads", async () => {
    const store = createFakeStore(makeRoom(2));
    const service = new DescentService(
      store,
      new MockRedisService() as unknown as RedisService,
    );
    services.push(service);
    const started = await service.startMatch({ roomId: "ABC234" }, "sock-1");
    expect(started.ok).toBe(true);
    const matchId = started.ok
      ? (started.room?.gameState as DescentRoomState | undefined)?.matchId
      : null;
    expect(matchId).toBeTruthy();
    if (!matchId) return;

    const commands = [
      { type: "toggle_meditate", unitIds: ["unit-1"] },
      { type: "cast_qi_art", unitIds: ["unit-1"] },
      ...["cultivator", "sword_sage", "formation_master"].map((classId) => ({
        buildingId: "sanctum-1",
        classId,
        type: "train_unit",
      })),
    ];
    for (const command of commands) {
      const result = await service.enqueueCommand(
        { command, matchId, roomId: "ABC234" },
        "sock-2",
      );
      expect(result.ok).toBe(true);
    }
    const invalid = await service.enqueueCommand(
      {
        command: { extra: true, type: "cast_qi_art", unitIds: ["unit-1"] },
        matchId,
        roomId: "ABC234",
      },
      "sock-2",
    );
    expect(invalid.ok).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 140));
    const sync = await service.sync(
      { fromTick: 0, matchId, roomId: "ABC234" },
      "sock-1",
    );
    expect(sync.ok).toBe(true);
    expect(sync.commands.map((entry) => entry.command)).toEqual(commands);
    expect(sync.commands.every((entry) => entry.playerId === "player-2")).toBe(
      true,
    );
  });

  it("rejects malformed commands and stale match traffic", async () => {
    const store = createFakeStore(makeRoom(2));
    const service = new DescentService(
      store,
      new MockRedisService() as unknown as RedisService,
    );
    services.push(service);
    const started = await service.startMatch({ roomId: "ABC234" }, "sock-1");
    const matchId = started.ok
      ? (started.room?.gameState as DescentRoomState | undefined)?.matchId
      : null;
    if (!matchId) return;

    const malformed = await service.enqueueCommand(
      {
        command: { type: "order_move", unitIds: "u-1", x: 40, y: 50 },
        matchId,
        roomId: "ABC234",
      },
      "sock-2",
    );
    expect(malformed.ok).toBe(false);

    const stale = await service.enqueueCommand(
      {
        command: { type: "order_move", unitIds: ["u-1"], x: 40, y: 50 },
        matchId: "previous-match",
        roomId: "ABC234",
      },
      "sock-2",
    );
    expect(stale.ok).toBe(false);

    const invalidClass = await service.enqueueCommand(
      {
        command: {
          buildingId: "camp-1",
          classId: "not-a-unit",
          type: "train_unit",
        },
        matchId,
        roomId: "ABC234",
      },
      "sock-2",
    );
    expect(invalidClass.ok).toBe(false);

    const invalidSync = await service.sync(
      { fromTick: Number.NaN, matchId, roomId: "ABC234" },
      "sock-1",
    );
    expect(invalidSync.ok).toBe(false);

    const inheritedSchema = await service.enqueueCommand(
      { command: { type: "constructor" }, matchId, roomId: "ABC234" },
      "sock-1",
    );
    expect(inheritedSchema.ok).toBe(false);
  });

  it("allows late joiners to spectate but not control the match", async () => {
    const store = createFakeStore(makeRoom(1));
    const service = new DescentService(
      store,
      new MockRedisService() as unknown as RedisService,
    );
    services.push(service);
    const started = await service.startMatch({ roomId: "ABC234" }, "sock-1");
    const matchId = started.ok
      ? (started.room?.gameState as DescentRoomState | undefined)?.matchId
      : null;
    if (!matchId) return;
    store.addPlayer("late-player", "sock-late");

    const command = await service.enqueueCommand(
      {
        command: { type: "order_move", unitIds: ["u-1"], x: 40, y: 50 },
        matchId,
        roomId: "ABC234",
      },
      "sock-late",
    );
    expect(command.ok).toBe(false);
    const paused = await service.setPaused(
      { matchId, paused: true, roomId: "ABC234" },
      "sock-late",
    );
    expect(paused.ok).toBe(false);

    const sync = await service.sync(
      { fromTick: 0, matchId, roomId: "ABC234" },
      "sock-late",
    );
    expect(sync.ok).toBe(true);
    expect(sync.matchId).toBe(matchId);
  });

  it("recovers a persisted match on a fresh service after shutdown", async () => {
    const redis = new MockRedisService();
    const first = new DescentService(
      createFakeStore(makeRoom(2)),
      redis as unknown as RedisService,
    );
    services.push(first);
    const started = await first.startMatch({ roomId: "ABC234" }, "sock-1");
    const matchId = started.ok
      ? (started.room?.gameState as DescentRoomState | undefined)?.matchId
      : null;
    if (!matchId) return;
    await first.enqueueCommand(
      {
        command: { type: "order_move", unitIds: ["u-1"], x: 40, y: 50 },
        matchId,
        roomId: "ABC234",
      },
      "sock-2",
    );
    await new Promise((resolve) => setTimeout(resolve, 140));
    const before = await first.sync(
      { fromTick: 0, matchId, roomId: "ABC234" },
      "sock-1",
    );
    await first.onModuleDestroy();

    const second = new DescentService(
      createFakeStore(makeRoom(2)),
      redis as unknown as RedisService,
    );
    services.push(second);
    const recovered = await second.sync(
      { fromTick: 0, matchId, roomId: "ABC234" },
      "sock-2",
    );
    expect(recovered.ok).toBe(true);
    expect(recovered.matchId).toBe(matchId);
    expect(recovered.commands).toHaveLength(1);
    expect(recovered.targetTick).toBe(before.targetTick);

    const ticks: DescentTickPayload[] = [];
    second.setBroadcaster((payload) => ticks.push(payload));
    await new Promise((resolve) => setTimeout(resolve, 140));
    const lastTick = ticks[ticks.length - 1]?.targetTick;
    expect(lastTick !== undefined && lastTick > before.targetTick).toBe(true);
  });

  it("admits commands on another replica without advancing two clocks", async () => {
    const redis = new MockRedisService();
    const first = new DescentService(
      createFakeStore(makeRoom(2)),
      redis as unknown as RedisService,
    );
    const second = new DescentService(
      createFakeStore(makeRoom(2)),
      redis as unknown as RedisService,
    );
    services.push(first, second);
    const targets: number[] = [];
    first.setBroadcaster((payload) => targets.push(payload.targetTick));
    second.setBroadcaster((payload) => targets.push(payload.targetTick));

    const started = await first.startMatch({ roomId: "ABC234" }, "sock-1");
    const matchId = started.ok
      ? (started.room?.gameState as DescentRoomState | undefined)?.matchId
      : null;
    if (!matchId) return;
    await new Promise((resolve) => setTimeout(resolve, 120));

    const acknowledged = await second.enqueueCommand(
      {
        command: { type: "order_move", unitIds: ["u-2"], x: 60, y: 70 },
        matchId,
        roomId: "ABC234",
      },
      "sock-2",
    );
    expect(acknowledged.ok).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 200));

    const synced = await second.sync(
      { fromTick: 0, matchId, roomId: "ABC234" },
      "sock-2",
    );
    expect(synced.commands).toHaveLength(1);
    expect(synced.commands[0]?.playerId).toBe("player-2");
    expect(targets.length > 1).toBe(true);
    for (let index = 1; index < targets.length; index += 1) {
      const target = targets[index];
      const previous = targets[index - 1];
      expect(
        target !== undefined && previous !== undefined && target > previous,
      ).toBe(true);
    }
  });

  it("takes over a match after the previous owner lease expires", async () => {
    const redis = new MockRedisService();
    const first = new DescentService(
      createFakeStore(makeRoom(2)),
      redis as unknown as RedisService,
    );
    services.push(first);
    const started = await first.startMatch({ roomId: "ABC234" }, "sock-1");
    const matchId = started.ok
      ? (started.room?.gameState as DescentRoomState | undefined)?.matchId
      : null;
    if (!matchId) return;
    await new Promise((resolve) => setTimeout(resolve, 120));
    const before = await first.sync(
      { fromTick: 0, matchId, roomId: "ABC234" },
      "sock-1",
    );

    await redis.set(
      "descent:owner:ABC234",
      JSON.stringify({
        expiresAt: Date.now() - 1,
        matchId,
        ownerId: "crashed-owner",
      }),
    );
    const second = new DescentService(
      createFakeStore(makeRoom(2)),
      redis as unknown as RedisService,
    );
    services.push(second);
    const ticks: DescentTickPayload[] = [];
    second.setBroadcaster((payload) => ticks.push(payload));
    await second.sync({ fromTick: 0, matchId, roomId: "ABC234" }, "sock-2");
    await new Promise((resolve) => setTimeout(resolve, 160));

    const lastTick = ticks[ticks.length - 1]?.targetTick;
    expect(lastTick !== undefined && lastTick > before.targetTick).toBe(true);
  });

  it("starts a co-op tutorial match when mapId is ashen_crucible_tutorial and rejects unknown maps", async () => {
    const redis = new MockRedisService();
    const service = new DescentService(
      createFakeStore(makeRoom(2)),
      redis as unknown as RedisService,
    );
    services.push(service);

    const rejected = await service.startMatch(
      { mapId: "unknown_map" as never, roomId: "ABC234" },
      "sock-1",
    );
    expect(rejected.ok).toBe(false);

    const started = await service.startMatch(
      { mapId: "ashen_crucible_tutorial", roomId: "ABC234" },
      "sock-1",
    );
    expect(started.ok).toBe(true);
    const state = started.ok
      ? (started.room?.gameState as DescentRoomState | undefined)
      : undefined;
    expect(state?.mapId).toBe("ashen_crucible_tutorial");
    expect(state?.phase).toBe("playing");
  });

  /** Creates a campaign test service using the shared in-memory room fixture. */
  function campaignFixture(playerCount = 2) {
    const store = createFakeStore(makeRoom(playerCount));
    const service = new DescentService(
      store,
      new MockRedisService() as unknown as RedisService,
    );
    services.push(service);
    return { service, store };
  }

  /** Requires a successful mutation and returns its non-null active match state. */
  function campaignState(
    result: GameRoomCommandResult,
  ): DescentRoomState & { matchId: string } {
    expect(result.ok).toBe(true);
    if (!result.ok || !result.room) throw new Error("Expected updated room");
    const state = result.room.gameState as unknown as DescentRoomState;
    expect(typeof state.matchId).toBe("string");
    if (!state.matchId) throw new Error("Expected active match id");
    return { ...state, matchId: state.matchId };
  }

  it("requires explicit campaign starts, validates replacement ids, and prevents ordinary-start bypasses", async () => {
    const { service, store } = campaignFixture();
    for (const mission of DESCENT_CAMPAIGN_MISSIONS) {
      expect(
        (
          await service.startMatch(
            { mapId: mission.id, roomId: "ABC234" },
            "sock-1",
          )
        ).ok,
      ).toBe(false);
    }
    for (const campaignAction of ["retry", "advance"] as const) {
      expect(
        (
          await service.startMatch(
            { campaignAction, roomId: "ABC234" },
            "sock-1",
          )
        ).ok,
      ).toBe(false);
    }
    const ordinary = campaignState(
      await service.startMatch({ roomId: "ABC234" }, "sock-1"),
    );
    const before = store.snapshot();
    for (const matchId of [undefined, "stale-match"]) {
      expect(
        (
          await service.startMatch(
            { campaignAction: "start", matchId, roomId: "ABC234" },
            "sock-1",
          )
        ).ok,
      ).toBe(false);
      expect(store.snapshot()).toEqual(before);
    }
    const started = campaignState(
      await service.startMatch(
        {
          campaignAction: "start",
          matchId: ordinary.matchId,
          roomId: "ABC234",
        },
        "sock-1",
      ),
    );
    expect(started.matchId).not.toBe(ordinary.matchId);
    expect(started.mapId).toBe("ashen_campaign_1");
    expect(started.campaign).toEqual({
      completedMissionIds: [],
      missionIndex: 0,
      outcomes: {},
      status: "active",
    });
    const campaignBefore = store.snapshot();
    for (const mapId of [
      undefined,
      "ashen_crucible",
      "ashen_crucible_tutorial",
      "ashen_campaign_2",
    ] as const) {
      expect(
        (
          await service.startMatch(
            { mapId, matchId: started.matchId, roomId: "ABC234" },
            "sock-1",
          )
        ).ok,
      ).toBe(false);
    }
    expect(
      (
        await service.startMatch(
          {
            campaignAction: "start",
            matchId: started.matchId,
            roomId: "ABC234",
          },
          "sock-1",
        )
      ).ok,
    ).toBe(false);
    expect(store.snapshot()).toEqual(campaignBefore);
  });

  it("permits campaign transitions only for the host and only from their required terminal status", async () => {
    const { service, store } = campaignFixture();
    expect(
      (
        await service.startMatch(
          { campaignAction: "start", roomId: "ABC234" },
          "sock-2",
        )
      ).ok,
    ).toBe(false);
    const started = campaignState(
      await service.startMatch(
        { campaignAction: "start", roomId: "ABC234" },
        "sock-1",
      ),
    );
    const active = store.snapshot();
    for (const campaignAction of ["retry", "advance"] as const) {
      expect(
        (
          await service.startMatch(
            { campaignAction, matchId: started.matchId, roomId: "ABC234" },
            "sock-1",
          )
        ).ok,
      ).toBe(false);
    }
    expect(store.snapshot()).toEqual(active);
    const defeated = campaignState(
      await service.reportOutcome(
        { matchId: started.matchId, outcome: "defeat", roomId: "ABC234" },
        "sock-2",
      ),
    );
    expect(defeated.campaign?.status).toBe("defeat");
    expect(defeated.campaign?.outcomes).toEqual({ "player-2": "defeat" });
    expect(
      (
        await service.startMatch(
          {
            campaignAction: "retry",
            matchId: started.matchId,
            roomId: "ABC234",
          },
          "sock-2",
        )
      ).ok,
    ).toBe(false);
    expect(
      (
        await service.startMatch(
          {
            campaignAction: "advance",
            matchId: started.matchId,
            roomId: "ABC234",
          },
          "sock-1",
        )
      ).ok,
    ).toBe(false);
    const retried = campaignState(
      await service.startMatch(
        { campaignAction: "retry", matchId: started.matchId, roomId: "ABC234" },
        "sock-1",
      ),
    );
    for (const socketId of ["sock-1", "sock-2"]) {
      campaignState(
        await service.reportOutcome(
          { matchId: retried.matchId, outcome: "victory", roomId: "ABC234" },
          socketId,
        ),
      );
    }
    expect(
      (
        await service.startMatch(
          {
            campaignAction: "advance",
            matchId: retried.matchId,
            roomId: "ABC234",
          },
          "sock-2",
        )
      ).ok,
    ).toBe(false);
    expect(
      (
        await service.startMatch(
          {
            campaignAction: "retry",
            matchId: retried.matchId,
            roomId: "ABC234",
          },
          "sock-1",
        )
      ).ok,
    ).toBe(false);
  });

  it("accepts only current campaign outcomes from locked participants and preserves immutable reports", async () => {
    const { service, store } = campaignFixture();
    const ordinary = campaignState(
      await service.startMatch({ roomId: "ABC234" }, "sock-1"),
    );
    expect(
      (
        await service.reportOutcome(
          { matchId: ordinary.matchId, outcome: "victory", roomId: "ABC234" },
          "sock-1",
        )
      ).ok,
    ).toBe(false);
    const started = campaignState(
      await service.startMatch(
        {
          campaignAction: "start",
          matchId: ordinary.matchId,
          roomId: "ABC234",
        },
        "sock-1",
      ),
    );
    store.addPlayer("spectator", "sock-late");
    const before = store.snapshot();
    for (const [matchId, socketId] of [
      [ordinary.matchId, "sock-1"],
      [started.matchId, "sock-late"],
      [started.matchId, "unknown-socket"],
    ] as const) {
      expect(
        (
          await service.reportOutcome(
            { matchId, outcome: "victory", roomId: "ABC234" },
            socketId,
          )
        ).ok,
      ).toBe(false);
    }
    expect(
      (
        await service.reportOutcome(
          {
            matchId: started.matchId,
            outcome: "draw" as never,
            roomId: "ABC234",
          },
          "sock-1",
        )
      ).ok,
    ).toBe(false);
    expect(store.snapshot()).toEqual(before);
    const first = campaignState(
      await service.reportOutcome(
        { matchId: started.matchId, outcome: "victory", roomId: "ABC234" },
        "sock-1",
      ),
    );
    expect(first.campaign).toEqual({
      completedMissionIds: [],
      missionIndex: 0,
      outcomes: { "player-1": "victory" },
      status: "active",
    });
    const duplicate = campaignState(
      await service.reportOutcome(
        { matchId: started.matchId, outcome: "victory", roomId: "ABC234" },
        "sock-1",
      ),
    );
    expect(duplicate.campaign).toEqual(first.campaign);
    const reported = store.snapshot();
    expect(
      (
        await service.reportOutcome(
          { matchId: started.matchId, outcome: "defeat", roomId: "ABC234" },
          "sock-1",
        )
      ).ok,
    ).toBe(false);
    expect(store.snapshot()).toEqual(reported);
    const defeated = campaignState(
      await service.reportOutcome(
        { matchId: started.matchId, outcome: "defeat", roomId: "ABC234" },
        "sock-2",
      ),
    );
    expect(defeated.campaign?.status).toBe("defeat");
    expect(defeated.campaign?.completedMissionIds).toEqual([]);
    expect(defeated.campaign?.outcomes).toEqual({
      "player-1": "victory",
      "player-2": "defeat",
    });
    expect(
      (
        await service.reportOutcome(
          { matchId: started.matchId, outcome: "victory", roomId: "ABC234" },
          "sock-2",
        )
      ).ok,
    ).toBe(false);
    expect(
      campaignState(
        await service.reportOutcome(
          { matchId: started.matchId, outcome: "defeat", roomId: "ABC234" },
          "sock-2",
        ),
      ).campaign,
    ).toEqual(defeated.campaign);
  });

  it("requires unanimity from the locked roster even after a participant leaves", async () => {
    const { service, store } = campaignFixture();
    const started = campaignState(
      await service.startMatch(
        { campaignAction: "start", roomId: "ABC234" },
        "sock-1",
      ),
    );
    store.removePlayer("player-2");
    const partial = campaignState(
      await service.reportOutcome(
        { matchId: started.matchId, outcome: "victory", roomId: "ABC234" },
        "sock-1",
      ),
    );
    expect(partial.campaign?.status).toBe("active");
    expect(partial.campaign?.completedMissionIds).toEqual([]);
    expect(
      (
        await service.startMatch(
          {
            campaignAction: "advance",
            matchId: started.matchId,
            roomId: "ABC234",
          },
          "sock-1",
        )
      ).ok,
    ).toBe(false);
    store.addPlayer("player-2", "sock-reconnected");
    const won = campaignState(
      await service.reportOutcome(
        { matchId: started.matchId, outcome: "victory", roomId: "ABC234" },
        "sock-reconnected",
      ),
    );
    expect(won.campaign?.status).toBe("victory");
    expect(won.campaign?.completedMissionIds).toEqual(["ashen_campaign_1"]);
  });

  it("retries defeat without losing progress, refreshes the roster, and rejects stale transition and outcome traffic", async () => {
    const { service, store } = campaignFixture(1);
    let state = campaignState(
      await service.startMatch(
        { campaignAction: "start", roomId: "ABC234" },
        "sock-1",
      ),
    );
    campaignState(
      await service.reportOutcome(
        { matchId: state.matchId, outcome: "victory", roomId: "ABC234" },
        "sock-1",
      ),
    );
    state = campaignState(
      await service.startMatch(
        { campaignAction: "advance", matchId: state.matchId, roomId: "ABC234" },
        "sock-1",
      ),
    );
    store.addPlayer("player-2", "sock-2");
    expect(state.roster.map((player) => player.id)).toEqual(["player-1"]);
    campaignState(
      await service.reportOutcome(
        { matchId: state.matchId, outcome: "defeat", roomId: "ABC234" },
        "sock-1",
      ),
    );
    const defeated = store.snapshot();
    for (const matchId of [undefined, "stale-match"]) {
      expect(
        (
          await service.startMatch(
            { campaignAction: "retry", matchId, roomId: "ABC234" },
            "sock-1",
          )
        ).ok,
      ).toBe(false);
    }
    expect(
      (
        await service.startMatch(
          {
            campaignAction: "retry",
            mapId: "ashen_campaign_3",
            matchId: state.matchId,
            roomId: "ABC234",
          },
          "sock-1",
        )
      ).ok,
    ).toBe(false);
    expect(store.snapshot()).toEqual(defeated);
    const retried = campaignState(
      await service.startMatch(
        { campaignAction: "retry", matchId: state.matchId, roomId: "ABC234" },
        "sock-1",
      ),
    );
    expect(retried.matchId).not.toBe(state.matchId);
    expect(retried.mapId).toBe("ashen_campaign_2");
    expect(retried.campaign).toEqual({
      completedMissionIds: ["ashen_campaign_1"],
      missionIndex: 1,
      outcomes: {},
      status: "active",
    });
    expect(retried.roster.map((player) => player.id)).toEqual([
      "player-1",
      "player-2",
    ]);
    const beforeStale = store.snapshot();
    expect(
      (
        await service.reportOutcome(
          { matchId: state.matchId, outcome: "victory", roomId: "ABC234" },
          "sock-1",
        )
      ).ok,
    ).toBe(false);
    expect(store.snapshot()).toEqual(beforeStale);
    const partial = campaignState(
      await service.reportOutcome(
        { matchId: retried.matchId, outcome: "victory", roomId: "ABC234" },
        "sock-1",
      ),
    );
    expect(partial.campaign?.status).toBe("active");
    const won = campaignState(
      await service.reportOutcome(
        { matchId: retried.matchId, outcome: "victory", roomId: "ABC234" },
        "sock-2",
      ),
    );
    expect(won.campaign?.status).toBe("victory");
    expect(won.campaign?.completedMissionIds).toEqual([
      "ashen_campaign_1",
      "ashen_campaign_2",
    ]);
  });

  it("plays the entire campaign in catalog order, resets reports, and cannot advance or restart after completion", async () => {
    const { service, store } = campaignFixture();
    let state = campaignState(
      await service.startMatch(
        { campaignAction: "start", roomId: "ABC234" },
        "sock-1",
      ),
    );
    const matchIds = new Set<string>();
    for (const [index, mission] of DESCENT_CAMPAIGN_MISSIONS.entries()) {
      matchIds.add(state.matchId);
      expect(state.mapId).toBe(mission.id);
      expect(state.campaign).toEqual({
        completedMissionIds: DESCENT_CAMPAIGN_MISSIONS.slice(0, index).map(
          (entry) => entry.id,
        ),
        missionIndex: index,
        outcomes: {},
        status: "active",
      });
      const partial = campaignState(
        await service.reportOutcome(
          { matchId: state.matchId, outcome: "victory", roomId: "ABC234" },
          "sock-2",
        ),
      );
      expect(partial.campaign?.status).toBe("active");
      expect(
        (
          await service.startMatch(
            {
              campaignAction: "advance",
              matchId: state.matchId,
              roomId: "ABC234",
            },
            "sock-1",
          )
        ).ok,
      ).toBe(false);
      const won = campaignState(
        await service.reportOutcome(
          { matchId: state.matchId, outcome: "victory", roomId: "ABC234" },
          "sock-1",
        ),
      );
      const final = index === DESCENT_CAMPAIGN_MISSIONS.length - 1;
      expect(won.campaign?.status).toBe(final ? "completed" : "victory");
      expect(won.campaign?.completedMissionIds).toEqual(
        DESCENT_CAMPAIGN_MISSIONS.slice(0, index + 1).map((entry) => entry.id),
      );
      const duplicate = campaignState(
        await service.reportOutcome(
          { matchId: state.matchId, outcome: "victory", roomId: "ABC234" },
          "sock-2",
        ),
      );
      expect(duplicate.campaign).toEqual(won.campaign);
      if (final) continue;
      const before = store.snapshot();
      for (const matchId of [undefined, "stale-match"]) {
        expect(
          (
            await service.startMatch(
              { campaignAction: "advance", matchId, roomId: "ABC234" },
              "sock-1",
            )
          ).ok,
        ).toBe(false);
      }
      expect(store.snapshot()).toEqual(before);
      state = campaignState(
        await service.startMatch(
          {
            campaignAction: "advance",
            matchId: state.matchId,
            roomId: "ABC234",
          },
          "sock-1",
        ),
      );
    }
    expect(matchIds.size).toBe(DESCENT_CAMPAIGN_MISSIONS.length);
    const completed = store.snapshot();
    for (const campaignAction of [
      undefined,
      "start",
      "retry",
      "advance",
    ] as const) {
      expect(
        (
          await service.startMatch(
            { campaignAction, matchId: state.matchId, roomId: "ABC234" },
            "sock-1",
          )
        ).ok,
      ).toBe(false);
    }
    expect(store.snapshot()).toEqual(completed);
  });

  it("locks current membership on advance and keeps defeat terminal when another player reports victory", async () => {
    const { service, store } = campaignFixture();
    const started = campaignState(
      await service.startMatch(
        { campaignAction: "start", roomId: "ABC234" },
        "sock-1",
      ),
    );
    for (const socketId of ["sock-1", "sock-2"]) {
      campaignState(
        await service.reportOutcome(
          { matchId: started.matchId, outcome: "victory", roomId: "ABC234" },
          socketId,
        ),
      );
    }
    store.removePlayer("player-2");
    store.addPlayer("player-3", "sock-3");
    const advanced = campaignState(
      await service.startMatch(
        {
          campaignAction: "advance",
          matchId: started.matchId,
          roomId: "ABC234",
        },
        "sock-1",
      ),
    );
    expect(advanced.roster.map((player) => player.id)).toEqual([
      "player-1",
      "player-3",
    ]);
    expect(advanced.campaign?.outcomes).toEqual({});
    store.addPlayer("player-2", "sock-2");
    expect(
      (
        await service.reportOutcome(
          { matchId: advanced.matchId, outcome: "victory", roomId: "ABC234" },
          "sock-2",
        )
      ).ok,
    ).toBe(false);
    const defeated = campaignState(
      await service.reportOutcome(
        { matchId: advanced.matchId, outcome: "defeat", roomId: "ABC234" },
        "sock-3",
      ),
    );
    expect(defeated.campaign?.status).toBe("defeat");
    const stillDefeated = campaignState(
      await service.reportOutcome(
        { matchId: advanced.matchId, outcome: "victory", roomId: "ABC234" },
        "sock-1",
      ),
    );
    expect(stillDefeated.campaign).toEqual({
      completedMissionIds: ["ashen_campaign_1"],
      missionIndex: 1,
      outcomes: { "player-1": "victory", "player-3": "defeat" },
      status: "defeat",
    });
  });

  it("preserves campaign progress and immutable reports across service replacement", async () => {
    const store = createFakeStore(makeRoom(1));
    const redis = new MockRedisService();
    const first = new DescentService(store, redis as unknown as RedisService);
    services.push(first);
    const initial = campaignState(
      await first.startMatch(
        { campaignAction: "start", roomId: "ABC234" },
        "sock-1",
      ),
    );
    campaignState(
      await first.reportOutcome(
        { matchId: initial.matchId, outcome: "victory", roomId: "ABC234" },
        "sock-1",
      ),
    );
    const advanced = campaignState(
      await first.startMatch(
        {
          campaignAction: "advance",
          matchId: initial.matchId,
          roomId: "ABC234",
        },
        "sock-1",
      ),
    );
    const defeated = campaignState(
      await first.reportOutcome(
        { matchId: advanced.matchId, outcome: "defeat", roomId: "ABC234" },
        "sock-1",
      ),
    );
    await first.onModuleDestroy();

    const recovered = new DescentService(
      store,
      redis as unknown as RedisService,
    );
    services.push(recovered);
    const duplicate = campaignState(
      await recovered.reportOutcome(
        { matchId: advanced.matchId, outcome: "defeat", roomId: "ABC234" },
        "sock-1",
      ),
    );
    expect(duplicate.campaign).toEqual(defeated.campaign);
    const beforeConflict = store.snapshot();
    expect(
      (
        await recovered.reportOutcome(
          { matchId: advanced.matchId, outcome: "victory", roomId: "ABC234" },
          "sock-1",
        )
      ).ok,
    ).toBe(false);
    expect(store.snapshot()).toEqual(beforeConflict);
    const retried = campaignState(
      await recovered.startMatch(
        {
          campaignAction: "retry",
          matchId: advanced.matchId,
          roomId: "ABC234",
        },
        "sock-1",
      ),
    );
    expect(retried.matchId).not.toBe(advanced.matchId);
    expect(retried.mapId).toBe("ashen_campaign_2");
    expect(retried.campaign).toEqual({
      completedMissionIds: ["ashen_campaign_1"],
      missionIndex: 1,
      outcomes: {},
      status: "active",
    });
    const beforeStale = store.snapshot();
    expect(
      (
        await recovered.reportOutcome(
          { matchId: advanced.matchId, outcome: "defeat", roomId: "ABC234" },
          "sock-1",
        )
      ).ok,
    ).toBe(false);
    expect(store.snapshot()).toEqual(beforeStale);
    const won = campaignState(
      await recovered.reportOutcome(
        { matchId: retried.matchId, outcome: "victory", roomId: "ABC234" },
        "sock-1",
      ),
    );
    expect(won.campaign?.completedMissionIds).toEqual([
      "ashen_campaign_1",
      "ashen_campaign_2",
    ]);
    expect(won.campaign?.status).toBe("victory");
  });

  it("drops departed participants on retry and requires newly locked participants for victory", async () => {
    const { service, store } = campaignFixture();
    const started = campaignState(
      await service.startMatch(
        { campaignAction: "start", roomId: "ABC234" },
        "sock-1",
      ),
    );
    const defeated = campaignState(
      await service.reportOutcome(
        { matchId: started.matchId, outcome: "defeat", roomId: "ABC234" },
        "sock-2",
      ),
    );
    expect(defeated.campaign?.status).toBe("defeat");
    store.removePlayer("player-2");
    store.addPlayer("player-3", "sock-3");
    const retried = campaignState(
      await service.startMatch(
        { campaignAction: "retry", matchId: started.matchId, roomId: "ABC234" },
        "sock-1",
      ),
    );
    expect(retried.roster.map((player) => player.id)).toEqual([
      "player-1",
      "player-3",
    ]);
    expect(retried.campaign?.outcomes).toEqual({});
    store.addPlayer("player-2", "sock-2");
    const beforeSpectator = store.snapshot();
    expect(
      (
        await service.reportOutcome(
          { matchId: retried.matchId, outcome: "victory", roomId: "ABC234" },
          "sock-2",
        )
      ).ok,
    ).toBe(false);
    expect(store.snapshot()).toEqual(beforeSpectator);
    const partial = campaignState(
      await service.reportOutcome(
        { matchId: retried.matchId, outcome: "victory", roomId: "ABC234" },
        "sock-1",
      ),
    );
    expect(partial.campaign?.status).toBe("active");
    const won = campaignState(
      await service.reportOutcome(
        { matchId: retried.matchId, outcome: "victory", roomId: "ABC234" },
        "sock-3",
      ),
    );
    expect(won.campaign?.status).toBe("victory");
    expect(won.campaign?.completedMissionIds).toEqual(["ashen_campaign_1"]);
  });

  for (const playerId of ["constructor", "toString", "__proto__"]) {
    it(`records immutable outcomes for accepted player id ${playerId}`, async () => {
      const room = makeRoom(2);
      const participant = room.players[1];
      if (!participant) throw new Error("Expected second participant");
      participant.id = playerId;
      const store = createFakeStore(room);
      const service = new DescentService(
        store,
        new MockRedisService() as unknown as RedisService,
      );
      services.push(service);
      const started = campaignState(
        await service.startMatch(
          { campaignAction: "start", roomId: "ABC234" },
          "sock-1",
        ),
      );
      const payload = {
        matchId: started.matchId,
        outcome: "victory" as const,
        roomId: "ABC234",
      };
      const reported = campaignState(
        await service.reportOutcome(payload, "sock-2"),
      );
      expect(reported.campaign?.status).toBe("active");
      expect(reported.campaign?.completedMissionIds).toEqual([]);
      expect(reported.campaign?.outcomes).toEqual({ [playerId]: "victory" });
      expect(Object.keys(reported.campaign?.outcomes ?? {})).toEqual([
        playerId,
      ]);
      const duplicate = campaignState(
        await service.reportOutcome(payload, "sock-2"),
      );
      expect(duplicate.campaign).toEqual(reported.campaign);
      const beforeConflict = store.snapshot();
      expect(
        (
          await service.reportOutcome(
            { ...payload, outcome: "defeat" },
            "sock-2",
          )
        ).ok,
      ).toBe(false);
      expect(store.snapshot()).toEqual(beforeConflict);
      const won = campaignState(await service.reportOutcome(payload, "sock-1"));
      expect(won.campaign?.status).toBe("victory");
      expect(won.campaign?.completedMissionIds).toEqual(["ashen_campaign_1"]);
      expect(won.campaign?.outcomes).toEqual({
        [playerId]: "victory",
        "player-1": "victory",
      });
    });
  }
});
