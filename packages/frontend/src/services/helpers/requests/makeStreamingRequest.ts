import {
  ServiceError,
  StreamEventType,
  StreamingEvent,
} from "@resync-game-framework/api";
import { convertErrorToString } from "@/lib/convertErrorToString";
import { cleanPayload } from "../cleanPayload";
import { constructHeaders } from "../constructHeaders";
import { StreamingRequestClient } from "../types";
import { isServiceError, retryWithTokenRefresh } from "./retryWithTokenRefresh";

/**
 * Creates a streaming request function for Server-Sent Events.
 * Automatically retries once on 401 with a refreshed token before redirecting to login.
 *
 * @param resolvedSlug - The full URL for the endpoint
 * @param getAccessToken - Function to get the current access token
 * @param onUnauthenticated - Callback when user is not authenticated (after retry)
 * @param onForbidden - Callback when user is forbidden from accessing a resource
 * @param onRefreshAccessToken - Function to force-refresh the access token on 401
 * @param additionalHeaders - Optional additional headers to include in requests
 * @returns Function that makes the streaming request with event handlers
 */
export function makeStreamingRequest<Chunk, ReturnValue>(
  resolvedSlug: string,
  getAccessToken: () => Promise<string>,
  onUnauthenticated: () => void,
  onForbidden: () => void,
  onRefreshAccessToken: () => Promise<string | null>,
  additionalHeaders?: Record<string, string>,
): (
  eventHandlers: StreamingRequestClient<Chunk>,
  payload?: unknown,
) => Promise<ReturnValue | ServiceError> {
  return async (
    eventHandlers: StreamingRequestClient<Chunk>,
    payload?: unknown,
  ): Promise<ReturnValue | ServiceError> => {
    try {
      const makeRequest = async (tokenOverride?: string) => {
        const headers = await constructHeaders(
          getAccessToken,
          additionalHeaders,
          tokenOverride,
        );

        return fetch(`${resolvedSlug}?${cleanPayload(payload)}`, {
          headers: {
            ...headers,
            "Content-Type": "text/event-stream",
          },
          method: "GET",
        });
      };

      const result = await retryWithTokenRefresh(
        makeRequest,
        onRefreshAccessToken,
        onUnauthenticated,
        resolvedSlug,
      );

      if (isServiceError(result)) {
        return result;
      }

      const { response } = result;

      if (response.status === 403) {
        onForbidden();

        return {
          code: 403,
          message: "Forbidden - you are not authorized to access this resource",
          path: resolvedSlug,
          type: "error",
        };
      }

      const reader = response.body?.getReader();
      if (reader == null) {
        return {
          code: 500,
          message: "Error reading response body. Reader is null.",
          path: resolvedSlug,
          type: "error",
        };
      }

      const decoder = new TextDecoder();
      let finalValue: ReturnValue = null as ReturnValue;

      let currentBuffer = "";

      while (finalValue === null) {
        const { value } = await reader.read();

        // Convert the binary data to a string
        const text = decoder.decode(value, { stream: true });
        // If the text is super long, we may only get a partial event, so we need to buffer it
        currentBuffer += text;

        // If the buffer doesn't end with a double newline, we have a partial event and we need to wait for the rest of it
        if (!currentBuffer.endsWith("\n\n")) {
          continue;
        }

        // Sometimes the events from the server come batched if they're too close together
        const allEvents = currentBuffer.trim().split(/\n{2,}(?=event:)/);

        // Iterate over each event
        for (const event of allEvents) {
          const [eventType, rawId, rawData] = event.trim().split("\n");

          // Sanitize the event type, id, and data
          const sanitizedEventType = eventType?.replace("event: ", "");
          const sanitizedId = rawId?.replace("id: ", "");
          const sanitizedData = (() => {
            const finalValue = rawData?.replace("data: ", "").trim();
            if (finalValue === undefined || finalValue === "") {
              return "{}";
            }

            return finalValue;
          })();

          // Parse the data
          const parsedData = JSON.parse(sanitizedData);

          // Create the stream event
          const streamEvent: StreamingEvent<Chunk, ReturnValue> = {
            data: parsedData,
            id: sanitizedId ?? "unknown",
            type: sanitizedEventType as StreamEventType,
          };

          // Handle all the different types of events

          if (streamEvent.type === "error") {
            return {
              code: 500,
              message: streamEvent.data.message,
              path: resolvedSlug,
              type: "error",
            };
          }

          if (streamEvent.type === "loading") {
            eventHandlers?.onLoading?.(streamEvent);
            continue;
          }

          if (streamEvent.type === "chunk") {
            eventHandlers?.onLoadChunk?.(streamEvent);
            continue;
          }

          if (streamEvent.type === "finish") {
            finalValue = streamEvent.data;
            break;
          }
        }

        currentBuffer = "";
      }

      return finalValue;
    } catch (error) {
      return {
        code: 500,
        message: `Error captured in the browser: ${convertErrorToString(error)}`,
        path: resolvedSlug,
        type: "error",
      };
    }
  };
}
