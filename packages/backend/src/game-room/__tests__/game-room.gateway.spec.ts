import { describe, expect, test } from "bun:test";
import { RoomEventsDefinition } from "@towers-of-coreborn/api";
import type { Server } from "socket.io";
import { MockRedisService } from "../../infra/redis/__tests__/mockRedis.module";
import type { RedisService } from "../../infra/redis/redis.service";
import type { TypedSocketClient } from "../../websockets/types";
import { GameRoomGateway } from "../game-room.gateway";
import { GameRoomStore } from "../game-room.store";

interface EmittedRoomEvent {
  event: string;
  payload: unknown;
  roomId: string;
}

/**
 * Creates the Socket.IO methods used by gateway command tests.
 * @param socketId - Fake connection id
 * @returns Client double plus its joined and left room logs
 */
function createClient(socketId: string) {
  const joinedRooms: string[] = [];
  const leftRooms: string[] = [];
  const client = {
    id: socketId,
    join: async (roomId: string) => {
      joinedRooms.push(roomId);
    },
    leave: async (roomId: string) => {
      leftRooms.push(roomId);
    },
  } as unknown as TypedSocketClient;
  return { client, joinedRooms, leftRooms };
}

/**
 * Creates the room-targeted emitter used by SocketGateway.
 * @param events - Mutable broadcast log
 * @returns Minimal Socket.IO server double
 */
function createServer(events: EmittedRoomEvent[]): Server {
  return {
    to: (roomId: string) => ({
      emit: (event: string, payload: unknown) => {
        events.push({ event, payload, roomId });
      },
    }),
  } as unknown as Server;
}

describe("GameRoomGateway", () => {
  test("acknowledges commands and broadcasts authoritative snapshots", async () => {
    const redis = new MockRedisService();
    const store = new GameRoomStore(redis as unknown as RedisService);
    const gateway = new GameRoomGateway(store);
    const events: EmittedRoomEvent[] = [];
    gateway.server = createServer(events);
    const host = createClient("socket-host");
    const guest = createClient("socket-guest");

    const created = await gateway.createRoom(
      {
        gameId: "gateway-test",
        initialState: { score: 0 },
        maxPlayers: 2,
        player: { id: "host", name: "Host" },
      },
      host.client,
    );
    if (!created.ok || !created.room) {
      throw new Error("Expected gateway room creation to succeed");
    }

    expect(host.joinedRooms).toEqual([created.room.id]);
    expect(events[0]).toEqual({
      event: RoomEventsDefinition.serverToClient.roomStateChanged,
      payload: created.room,
      roomId: created.room.id,
    });

    const joined = await gateway.joinRoom(
      {
        gameId: created.room.gameId,
        player: { id: "guest", name: "Guest" },
        roomId: created.room.id,
      },
      guest.client,
    );
    if (!joined.ok || !joined.room) {
      throw new Error("Expected gateway room join to succeed");
    }

    const updated = await gateway.updateRoomState(
      {
        expectedRevision: joined.room.revision,
        gameState: { score: 1 },
        roomId: joined.room.id,
      },
      guest.client,
    );
    if (!updated.ok || !updated.room) {
      throw new Error("Expected gateway state update to succeed");
    }

    expect(guest.joinedRooms).toEqual([created.room.id]);
    expect(events[events.length - 1]).toEqual({
      event: RoomEventsDefinition.serverToClient.roomStateChanged,
      payload: updated.room,
      roomId: updated.room.id,
    });
  });
});
