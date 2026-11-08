import { Injectable } from "@nestjs/common";
import { ConnectedSocket, MessageBody } from "@nestjs/websockets";
import {
  type CrosswordCryptChooseRelicPayload,
  type CrosswordCryptCommandResult,
  CrosswordCryptEventsDefinition,
  type CrosswordCryptFillCellsPayload,
  type CrosswordCryptGuessPayload,
  type CrosswordCryptRoomCommand,
  type CrosswordCryptSyncPayload,
  type CrosswordCryptUseRelicPayload,
  type CrosswordCryptWebsocketEvents,
  RoomEventsDefinition,
} from "@resync-game-framework/api";
import {
  getSocketDecorator,
  SocketGatewayHandler,
} from "src/websockets/socket";
import { SocketGateway } from "src/websockets/socket.gateway";
import type { TypedSocketClient } from "src/websockets/types";
import { CrosswordCryptStore } from "./crossword-crypt.store";

type StoreResult = CrosswordCryptCommandResult & {
  deliveries?: Record<string, unknown>;
};

/** Authoritative hidden-information command gateway for Crossword Crypt. */
@Injectable()
export class CrosswordCryptGateway
  extends SocketGateway<CrosswordCryptWebsocketEvents>
  implements SocketGatewayHandler<CrosswordCryptWebsocketEvents>
{
  /** @param store - Locked run and private-slice store */
  public constructor(private readonly store: CrosswordCryptStore) {
    super(CrosswordCryptEventsDefinition);
  }

  /** Synchronizes difficulty and current private ownership. */
  @getSocketDecorator(
    CrosswordCryptEventsDefinition.clientToServer.crosswordCryptSync,
  )
  public async crosswordCryptSync(
    @MessageBody() payload: CrosswordCryptSyncPayload,
    @ConnectedSocket() client: TypedSocketClient,
  ): Promise<CrosswordCryptCommandResult> {
    return this.publish(await this.store.sync(payload, client.id));
  }

  /** Starts a fresh run when called by the host. */
  @getSocketDecorator(
    CrosswordCryptEventsDefinition.clientToServer.crosswordCryptStart,
  )
  public async crosswordCryptStart(
    @MessageBody() payload: CrosswordCryptRoomCommand,
    @ConnectedSocket() client: TypedSocketClient,
  ): Promise<CrosswordCryptCommandResult> {
    return this.publish(await this.store.start(payload, client.id));
  }

  /** Applies one explicit answer submission. */
  /**
   * Types or clears squares on the shared crossword.
   * @param payload - Room, room token, and squares
   * @param client - Socket of the typing player
   * @returns Acknowledgement with the updated room
   */
  @getSocketDecorator(
    CrosswordCryptEventsDefinition.clientToServer.crosswordCryptFillCells,
  )
  public async crosswordCryptFillCells(
    @MessageBody() payload: CrosswordCryptFillCellsPayload,
    @ConnectedSocket() client: TypedSocketClient,
  ) {
    return this.publish(await this.store.fillCells(payload, client.id));
  }

  @getSocketDecorator(
    CrosswordCryptEventsDefinition.clientToServer.crosswordCryptGuess,
  )
  public async crosswordCryptGuess(
    @MessageBody() payload: CrosswordCryptGuessPayload,
    @ConnectedSocket() client: TypedSocketClient,
  ): Promise<CrosswordCryptCommandResult> {
    return this.publish(await this.store.guess(payload, client.id));
  }

  /** Reveals one table letter from the shared hint pool. */
  @getSocketDecorator(
    CrosswordCryptEventsDefinition.clientToServer.crosswordCryptHint,
  )
  public async crosswordCryptHint(
    @MessageBody() payload: CrosswordCryptRoomCommand,
    @ConnectedSocket() client: TypedSocketClient,
  ): Promise<CrosswordCryptCommandResult> {
    return this.publish(await this.store.hint(payload, client.id));
  }

  /** Confirms a relic reward and advances the chain. */
  @getSocketDecorator(
    CrosswordCryptEventsDefinition.clientToServer.crosswordCryptChooseRelic,
  )
  public async crosswordCryptChooseRelic(
    @MessageBody() payload: CrosswordCryptChooseRelicPayload,
    @ConnectedSocket() client: TypedSocketClient,
  ): Promise<CrosswordCryptCommandResult> {
    return this.publish(await this.store.chooseRelic(payload, client.id));
  }

  /** Spends one held relic through the server. */
  @getSocketDecorator(
    CrosswordCryptEventsDefinition.clientToServer.crosswordCryptUseRelic,
  )
  public async crosswordCryptUseRelic(
    @MessageBody() payload: CrosswordCryptUseRelicPayload,
    @ConnectedSocket() client: TypedSocketClient,
  ): Promise<CrosswordCryptCommandResult> {
    return this.publish(await this.store.useRelic(payload, client.id));
  }

  /** Broadcasts only the public room and targets each private slice by socket. */
  private publish(result: StoreResult): CrosswordCryptCommandResult {
    if (!result.ok || !this.server) return result;
    this.server
      .to(result.room.id)
      .emit(RoomEventsDefinition.serverToClient.roomStateChanged, result.room);
    for (const [socketId, slice] of Object.entries(result.deliveries ?? {})) {
      this.server
        .to(socketId)
        .emit(
          CrosswordCryptEventsDefinition.serverToClient.crosswordCryptSlice,
          slice,
        );
    }
    const { deliveries: _deliveries, ...publicResult } = result;
    return publicResult;
  }
}
