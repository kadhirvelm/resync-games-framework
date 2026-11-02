import { ServiceError } from "@resync-game-framework/api";
import { isEmpty } from "lodash-es";
import { convertErrorToString } from "@/lib/convertErrorToString";
import { cleanPayload } from "../cleanPayload";
import { constructHeaders } from "../constructHeaders";
import { isServiceError, retryWithTokenRefresh } from "./retryWithTokenRefresh";

/**
 * Creates a GET request function.
 * Automatically retries once on 401 with a refreshed token before redirecting to login.
 *
 * @param resolvedSlug - The full URL for the endpoint
 * @param getAccessToken - Function to get the current access token
 * @param onUnauthenticated - Callback when user is not authenticated (after retry)
 * @param onForbidden - Callback when user is forbidden from accessing a resource
 * @param onRefreshAccessToken - Function to force-refresh the access token on 401
 * @param additionalHeaders - Optional additional headers to include in requests
 * @returns Function that makes the GET request with optional query parameters
 */
export function makeGetRequest<ReturnValue>(
  resolvedSlug: string,
  getAccessToken: () => Promise<string>,
  onUnauthenticated: () => void,
  onForbidden: () => void,
  onRefreshAccessToken: () => Promise<string | null>,
  additionalHeaders?: Record<string, string>,
): (payload?: unknown) => Promise<ReturnValue | ServiceError> {
  return async (payload: unknown): Promise<ReturnValue | ServiceError> => {
    try {
      const url =
        payload == null || isEmpty(payload)
          ? resolvedSlug
          : `${resolvedSlug}?${cleanPayload(payload)}`;

      const makeRequest = async (tokenOverride?: string) => {
        return fetch(url, {
          headers: await constructHeaders(
            getAccessToken,
            additionalHeaders,
            tokenOverride,
          ),
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

      return response.json();
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
