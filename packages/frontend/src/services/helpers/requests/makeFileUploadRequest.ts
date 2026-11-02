import { ServiceError } from "@resync-game-framework/api";
import { convertErrorToString } from "@/lib/convertErrorToString";
import { constructHeaders } from "../constructHeaders";
import { isServiceError, retryWithTokenRefresh } from "./retryWithTokenRefresh";

/**
 * Creates a file upload request function.
 * Automatically retries once on 401 with a refreshed token before redirecting to login.
 *
 * @param resolvedSlug - The full URL for the endpoint
 * @param getAccessToken - Function to get the current access token
 * @param onUnauthenticated - Callback when user is not authenticated (after retry)
 * @param onForbidden - Callback when user is forbidden from accessing a resource
 * @param onRefreshAccessToken - Function to force-refresh the access token on 401
 * @param fieldName - The form field name for the file
 * @param additionalHeaders - Optional additional headers to include in requests
 * @returns Function that uploads a single file with optional payload
 */
export function makeFileUploadRequest(
  resolvedSlug: string,
  getAccessToken: () => Promise<string>,
  onUnauthenticated: () => void,
  onForbidden: () => void,
  onRefreshAccessToken: () => Promise<string | null>,
  fieldName: string,
  additionalHeaders?: Record<string, string>,
): (file: File, payload?: unknown) => Promise<unknown | ServiceError> {
  return async (
    file: File,
    payload?: unknown,
  ): Promise<unknown | ServiceError> => {
    try {
      const makeRequest = async (tokenOverride?: string) => {
        const formData = new FormData();
        formData.append(fieldName, file);

        // If payload is provided, add it as a JSON string to the form data
        if (payload != null) {
          formData.append("payload", JSON.stringify(payload));
        }

        const headers = await constructHeaders(
          getAccessToken,
          additionalHeaders,
          tokenOverride,
        );
        delete (headers as Record<string, string>)["Content-Type"];

        return fetch(resolvedSlug, {
          body: formData,
          headers,
          method: "POST",
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
