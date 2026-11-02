import { Injectable, Logger, UseFilters } from "@nestjs/common";
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import {
  type WebsocketEvents,
  type WebsocketEventsDefinition,
} from "@resync-game-framework/api";
import { Server, Socket } from "socket.io";
import { getSocketEmitter, SocketEmitter } from "./socket";
import { CustomWsExceptionFilter } from "./WsExceptions.filter";

/**
 * The base class for all socket gateways.
 */
@Injectable()
@UseFilters(CustomWsExceptionFilter)
@WebSocketGateway({
  cors: {
    credentials: true,
    origin: process.env.FRONTEND_URL ?? "http://localhost:3000",
  },
  namespace: "/",
})
export class SocketGateway<Events extends WebsocketEvents>
  implements OnGatewayConnection, OnGatewayDisconnect
{
  /**
   * The logger for the socket gateway.
   */
  private socketLogger = new Logger("Socket");
  /**
   * The map of clients connected to the socket gateway.
   */
  public clients: Map<string, Socket> = new Map();
  /**
   * The server for the socket gateway.
   */
  @WebSocketServer() server?: Server;

  public constructor(
    private readonly eventsDefinition: WebsocketEventsDefinition<Events>,
  ) {}

  /**
   * After the socket gateway is initialized.
   */
  afterInit() {
    this.socketLogger.log("WebSocket Gateway initialized");
  }

  /**
   * After a client connects to the socket gateway.
   *
   * Be careful with this one, there can be weird race conditions with each of the gateways
   * that extend this.
   */
  handleConnection(client: Socket) {
    this.socketLogger.log(`Client connected: ${client.id}`);
    this.clients.set(client.id, client);
  }

  /**
   * After a client disconnects from the socket gateway.
   *
   * Be careful with this one, there can be weird race conditions with each of the gateways
   * that extend this.
   */
  handleDisconnect(client: Socket) {
    this.socketLogger.log(`Client disconnected: ${client.id}`);
    this.clients.delete(client.id);
  }

  /**
   * Returns true once the WebSocket server has been injected by NestJS.
   * Use this to guard @OnEvent handlers that may fire before the server is ready.
   */
  protected get isServerReady(): boolean {
    return this.server != null;
  }

  /**
   * Pushes an event from the server to the given room (the clients).
   *
   * @param roomName The room name to get the emitter for.
   * @returns A strongly typed socket emitter for the given room.
   */
  public getServerEmitter(
    roomName: string,
  ): SocketEmitter<Events["serverToClient"]> {
    if (!this.server) {
      throw new Error("Server not initialized");
    }

    return getSocketEmitter(this.eventsDefinition, this.server, roomName);
  }
}
