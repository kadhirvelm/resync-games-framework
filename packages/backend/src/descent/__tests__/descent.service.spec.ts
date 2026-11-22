import { afterEach, describe, expect, it } from "bun:test";
import {
  DESCENT_GAME_ID,
  DESCENT_PLAYER_COLORS,
  type DescentRoomState,
  type DescentTickPayload,
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
});
