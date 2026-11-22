import { Injectable } from "@nestjs/common";
import { ConnectedSocket, MessageBody } from "@nestjs/websockets";
import {
  type DescentAckResult,
  type DescentCommandPayload,
  DescentEventsDefinition,
  type DescentReportOutcomePayload,
  type DescentSetPausedPayload,
  type DescentSetSpeedPayload,
  type DescentStartMatchPayload,
  type DescentSyncPayload,
  type DescentSyncResult,
  type DescentWebsocketEvents,
  type GameRoomCommandResult,
  RoomEventsDefinition,
} from "@resync-game-framework/api";
import {
  getSocketDecorator,
  SocketGatewayHandler,
} from "src/websockets/socket";
import { SocketGateway } from "src/websockets/socket.gateway";
import type { TypedSocketClient } from "src/websockets/types";
import { DescentService } from "./descent.service";

/** Authoritative lockstep command gateway for Descent co-op matches. */
@Injectable()
export class DescentGateway
  extends SocketGateway<DescentWebsocketEvents>
  implements SocketGatewayHandler<DescentWebsocketEvents>
{
  /**
   * Creates the gateway and connects the match service's tick broadcaster.
   * @param descentService - Authoritative Descent match coordinator
   */
  public constructor(private readonly descentService: DescentService) {
    super(DescentEventsDefinition);
    this.descentService.setBroadcaster((payload) => {
      if (!this.isServerReady) {
        return;
      }
      this.getServerEmitter(payload.roomId).descentTick(payload);
    });
  }

  /**
   * Starts a co-op Descent match from the room lobby (host only).
   * @param payload - Room code to start
   * @param client - Host socket
   * @returns Updated room snapshot or an error
   */
  @getSocketDecorator(DescentEventsDefinition.clientToServer.descentStartMatch)
  public async descentStartMatch(
    @MessageBody() payload: DescentStartMatchPayload,
    @ConnectedSocket() client: TypedSocketClient,
  ): Promise<GameRoomCommandResult> {
    const result = await this.descentService.startMatch(payload, client.id);
    if (result.ok && result.room && this.isServerReady && this.server) {
      this.server
        .to(result.room.id)
        .emit(
          RoomEventsDefinition.serverToClient.roomStateChanged,
          result.room,
        );
    }
    return result;
  }

  /**
   * Records a locked participant's peer-attested campaign outcome.
   * @param payload - Current match and outcome
   * @param client - Reporting socket
   * @returns Updated room progress or an error
   */
  @getSocketDecorator(
    DescentEventsDefinition.clientToServer.descentReportOutcome,
  )
  public async descentReportOutcome(
    @MessageBody() payload: DescentReportOutcomePayload,
    @ConnectedSocket() client: TypedSocketClient,
  ): Promise<GameRoomCommandResult> {
    const result = await this.descentService.reportOutcome(payload, client.id);
    if (result.ok && result.room && this.isServerReady && this.server) {
      this.server
        .to(result.room.id)
        .emit(
          RoomEventsDefinition.serverToClient.roomStateChanged,
          result.room,
        );
    }
    return result;
  }

  /**
   * Accepts one player command and queues it for the next authoritative tick.
   * @param payload - Room code and Descent command
   * @param client - Issuing player's socket
   * @returns Acknowledgement
   */
  @getSocketDecorator(DescentEventsDefinition.clientToServer.descentCommand)
  public async descentCommand(
    @MessageBody() payload: DescentCommandPayload,
    @ConnectedSocket() client: TypedSocketClient,
  ): Promise<DescentAckResult> {
    return this.descentService.enqueueCommand(payload, client.id);
  }

  /**
   * Pauses or resumes the shared match clock.
   * @param payload - Room code and desired pause state
   * @param client - Requesting player's socket
   * @returns Acknowledgement
   */
  @getSocketDecorator(DescentEventsDefinition.clientToServer.descentSetPaused)
  public async descentSetPaused(
    @MessageBody() payload: DescentSetPausedPayload,
    @ConnectedSocket() client: TypedSocketClient,
  ): Promise<DescentAckResult> {
    return this.descentService.setPaused(payload, client.id);
  }

  /**
   * Changes the shared match simulation speed.
   * @param payload - Room code and speed multiplier
   * @param client - Requesting player's socket
   * @returns Acknowledgement
   */
  @getSocketDecorator(DescentEventsDefinition.clientToServer.descentSetSpeed)
  public async descentSetSpeed(
    @MessageBody() payload: DescentSetSpeedPayload,
    @ConnectedSocket() client: TypedSocketClient,
  ): Promise<DescentAckResult> {
    return this.descentService.setSpeed(payload, client.id);
  }

  /**
   * Returns missed commands so a reconnecting or newly loaded client can catch up.
   * @param payload - Room code and starting tick
   * @param client - Requesting player's socket
   * @returns Catch-up command batch and clock metadata
   */
  @getSocketDecorator(DescentEventsDefinition.clientToServer.descentSync)
  public async descentSync(
    @MessageBody() payload: DescentSyncPayload,
    @ConnectedSocket() client: TypedSocketClient,
  ): Promise<DescentSyncResult> {
    return this.descentService.sync(payload, client.id);
  }
}
