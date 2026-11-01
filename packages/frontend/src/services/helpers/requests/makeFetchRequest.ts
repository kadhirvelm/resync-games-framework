import { ServiceError } from "@towers-of-coreborn/api";
import { convertErrorToString } from "@/lib/convertErrorToString";
import { constructHeaders } from "../constructHeaders";
import { isServiceError, retryWithTokenRefresh } from "./retryWithTokenRefresh";

/**
 * Creates a fetch request function for POST/PUT/DELETE/PATCH operations.
 * Automatically retries once on 401 with a refreshed token before redirecting to login.
 *
 * @param resolvedSlug - The full URL for the endpoint
 * @param getAccessToken - Function to get the current access token
 * @param onUnauthenticated - Callback when user is not authenticated (after retry)
 * @param onForbidden - Callback when user is forbidden from accessing a resource
 * @param onRefreshAccessToken - Function to force-refresh the access token on 401
 * @param additionalHeaders - Optional additional headers to include in requests
 * @param method - HTTP method (defaults to POST)
 * @returns Function that makes the request with the given payload
 */
export function makeFetchRequest<ReturnValue>(
  resolvedSlug: string,
  getAccessToken: () => Promise<string>,
  onUnauthenticated: () => void,
  onForbidden: () => void,
  onRefreshAccessToken: () => Promise<string | null>,
  additionalHeaders?: Record<string, string>,
  method?: "POST" | "PUT" | "DELETE" | "PATCH",
): (payload?: unknown) => Promise<ReturnValue | ServiceError> {
  return async (payload: unknown): Promise<ReturnValue | ServiceError> => {
    try {
      const makeRequest = async (tokenOverride?: string) => {
        return fetch(resolvedSlug, {
          body: payload == null ? undefined : JSON.stringify(payload),
          credentials: "include",
          headers: await constructHeaders(
            getAccessToken,
            additionalHeaders,
            tokenOverride,
          ),
          method: method ?? "POST",
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

      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("json")) {
        return {
          code: response.status,
          message: response.ok
            ? "The server returned a response that was not JSON"
            : `Request failed (${response.status})`,
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
