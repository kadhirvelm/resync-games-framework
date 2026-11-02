import { Injectable } from "@nestjs/common";
import { ConnectedSocket, MessageBody } from "@nestjs/websockets";
import {
  type CreateGameRoomPayload,
  type GameRoomCommandResult,
  type GameRoomState,
  type JoinGameRoomPayload,
  type LeaveGameRoomPayload,
  RoomEventsDefinition,
  type RoomWebsocketEvents,
  type UpdateGameRoomStatePayload,
} from "@resync-game-framework/api";
import {
  getSocketDecorator,
  SocketGatewayHandler,
} from "src/websockets/socket";
import { SocketGateway } from "src/websockets/socket.gateway";
import { type TypedSocketClient } from "src/websockets/types";
import { GameRoomStore } from "./game-room.store";

/**
 * Reusable multiplayer gateway for room membership and shared game snapshots.
 */
@Injectable()
export class GameRoomGateway
  extends SocketGateway<RoomWebsocketEvents>
  implements SocketGatewayHandler<RoomWebsocketEvents>
{
  /**
   * Creates the room gateway around the authoritative store.
   * @param gameRoomStore - Distributed room lifecycle and state store
   */
  public constructor(private readonly gameRoomStore: GameRoomStore) {
    super(RoomEventsDefinition);
  }

  /**
   * Creates a room, joins its Socket.IO channel, and publishes the initial
   * authoritative snapshot.
   * @param payload - Initial room configuration and host identity
   * @param client - Socket creating the room
   * @returns Command acknowledgement containing the new room
   */
  @getSocketDecorator(RoomEventsDefinition.clientToServer.createRoom)
  public async createRoom(
    @MessageBody() payload: CreateGameRoomPayload,
    @ConnectedSocket() client: TypedSocketClient,
  ): Promise<GameRoomCommandResult> {
    const result = await this.gameRoomStore.createRoom(payload, client.id);
    if (!result.ok || !result.room) {
      return result;
    }

    await client.join(result.room.id);
    this.broadcastRoom(result.room);
    return result;
  }

  /**
   * Joins an existing room and broadcasts its updated player list.
   * @param payload - Room code, game id, and joining player
   * @param client - Socket joining the room
   * @returns Command acknowledgement containing the joined room
   */
  @getSocketDecorator(RoomEventsDefinition.clientToServer.joinRoom)
  public async joinRoom(
    @MessageBody() payload: JoinGameRoomPayload,
    @ConnectedSocket() client: TypedSocketClient,
  ): Promise<GameRoomCommandResult> {
    const result = await this.gameRoomStore.joinRoom(payload, client.id);
    if (!result.ok || !result.room) {
      return result;
    }

    await client.join(result.room.id);
    this.broadcastRoom(result.room);
    return result;
  }

  /**
   * Leaves a room, deletes it when empty, and broadcasts host or membership
   * changes to the remaining players.
   * @param payload - Room code to leave
   * @param client - Socket leaving the room
   * @returns Command acknowledgement with the remaining room, if any
   */
  @getSocketDecorator(RoomEventsDefinition.clientToServer.leaveRoom)
  public async leaveRoom(
    @MessageBody() payload: LeaveGameRoomPayload,
    @ConnectedSocket() client: TypedSocketClient,
  ): Promise<GameRoomCommandResult> {
    const result = await this.gameRoomStore.leaveRoom(
      payload.roomId,
      client.id,
    );
    if (!result.ok) {
      return result;
    }

    await client.leave(payload.roomId.trim().toUpperCase());
    if (result.room) {
      this.broadcastRoom(result.room);
    }
    return result;
  }

  /**
   * Commits a complete game state snapshot with optimistic revision checking.
   * @param payload - Room, next state, and revision rendered by the caller
   * @param client - Socket committing the state
   * @returns Updated room or a recoverable revision conflict
   */
  @getSocketDecorator(RoomEventsDefinition.clientToServer.updateRoomState)
  public async updateRoomState(
    @MessageBody() payload: UpdateGameRoomStatePayload,
    @ConnectedSocket() client: TypedSocketClient,
  ): Promise<GameRoomCommandResult> {
    const result = await this.gameRoomStore.updateRoomState(
      payload.roomId,
      payload.gameState,
      payload.expectedRevision,
      client.id,
    );
    if (result.ok && result.room) {
      this.broadcastRoom(result.room);
    }
    return result;
  }

  /**
   * Cleans every membership owned by a disconnected socket and notifies the
   * players who remain in those rooms.
   * @param client - Socket that disconnected
   * @returns Completion after all room snapshots are updated
   */
  public override async handleDisconnect(
    client: TypedSocketClient,
  ): Promise<void> {
    super.handleDisconnect(client);
    const changedRooms = await this.gameRoomStore.disconnect(client.id);
    for (const room of changedRooms) {
      this.broadcastRoom(room);
    }
  }

  /**
   * Broadcasts one authoritative snapshot when the Socket.IO server is ready.
   * @param room - Public room snapshot to publish
   * @returns Nothing after the broadcast is queued
   */
  private broadcastRoom(room: GameRoomState): void {
    if (!this.isServerReady) {
      return;
    }
    this.getServerEmitter(room.id).roomStateChanged(room);
  }
}
