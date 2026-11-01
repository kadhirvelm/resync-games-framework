export interface WebsocketEvent {
  /**
   * The payload for the event.
   */
  payload: unknown;
  /**
   * Optional acknowledgement returned to the client that emitted the event.
   */
  response?: unknown;
}

export interface WebsocketResponse {
  /**
   * The payload for the response.
   */
  response: unknown;
}

/**
 * Client-to-server events.
 */
export interface WebsocketClientToServerEvents {
  [key: string]: WebsocketEvent;
}

/**
 * Server-to-client events.
 */
export interface WebsocketServerToClientEvents {
  [key: string]: WebsocketResponse;
}

/**
 * WebSocket event definition with client-to-server and server-to-client events.
 */
export interface WebsocketEvents {
  clientToServer: WebsocketClientToServerEvents;
  serverToClient: WebsocketServerToClientEvents;
}

/**
 * The events definition for WebSocket events, mapping event names to their string values.
 * Similar to ServiceDefinition for REST endpoints.
 */
export type WebsocketEventsDefinition<E extends WebsocketEvents> = {
  /**
   * Client-to-server event name mappings.
   */
  clientToServer: {
    [Key in keyof E["clientToServer"]]: Key;
  };
  /**
   * Server-to-client event name mappings.
   */
  serverToClient: {
    [Key in keyof E["serverToClient"]]: Key;
  };
};
