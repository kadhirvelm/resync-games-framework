import { SubscribeMessage } from "@nestjs/websockets";
import {
  RemoveExtendsString,
  WebsocketEvents,
  WebsocketEventsDefinition,
  WebsocketServerToClientEvents,
} from "@resync-game-framework/api";
import { Socket } from "socket.io";

/**
 * Handles receiving messages from the client and sending messages to the client.
 */
export type SocketGatewayHandler<Message extends WebsocketEvents> = {
  [Key in keyof RemoveExtendsString<Message["clientToServer"]>]: (
    payload: Message["clientToServer"][Key]["payload"],
    client?: Socket,
  ) =>
    | Message["clientToServer"][Key]["response"]
    | Promise<Message["clientToServer"][Key]["response"]>;
};

/**
 * Ensures the endpoint is listening for the right message event.
 */
export function getSocketDecorator(endpoint: string) {
  return SubscribeMessage(endpoint);
}

interface EmitEvent {
  emit: (event: string, payload: unknown) => void;
  to: (room: string) => { emit: EmitEvent["emit"] };
}

/**
 * The type to wrap the socket in to emit types messages.
 */
export type SocketEmitter<Message extends WebsocketServerToClientEvents> = {
  [Key in keyof Message]: (response: Message[Key]["response"]) => void;
};

/**
 * Emits an event on the provided Socket.io target.
 * If `roomId` is provided, the event is emitted to that room via
 * `.to(roomId).emit(...)`; otherwise `emit` is called directly on the target.
 *
 * @param socket - The Socket.io server, namespace, room, or client used as the emit target
 * @param key - The event name to emit
 * @param payload - The event payload
 * @param roomId - Optional room id to pass to `.to(roomId)` before emitting
 */
function emitToSocket(
  socket: EmitEvent,
  key: string,
  payload: unknown,
  roomId?: string,
): void {
  if (roomId !== undefined) {
    socket.to(roomId).emit(key, payload);
    return;
  }
  socket.emit(key, payload);
}

/**
 * Creates a typed socket emitter tied to the API definition.
 * @param definition - The WebSocket events definition from the API package
 * @param socket - The Socket.io server or client instance
 * @param roomId - Optional room to target for all emissions
 * @returns A typed emitter whose methods correspond to server-to-client events
 */
export function getSocketEmitter<Events extends WebsocketEvents>(
  definition: WebsocketEventsDefinition<Events>,
  socket: EmitEvent,
  roomId?: string,
): SocketEmitter<Events["serverToClient"]> {
  const emitter = {} as SocketEmitter<Events["serverToClient"]>;

  for (const key in definition.serverToClient) {
    emitter[key as keyof Events["serverToClient"]] = (payload: unknown) => {
      emitToSocket(socket, key, payload, roomId);
    };
  }

  return emitter;
}
